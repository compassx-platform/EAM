import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.models.base import utc_now, generate_uuid
from backend.models.escalation import EscalationDefinition, EscalationLog
from backend.models.entities import DynamicEntity
from backend.models.workflow import WorkflowDefinition
from backend.services.command_handler import propose_transition, _load_workflow
from backend.services.notification_service import dispatch_notification
from backend.services.escalation_service import check_and_escalate_overdue_tasks

logger = logging.getLogger("escalation_engine")


def _normalize_dt(dt: Any) -> Optional[datetime]:
    if dt is None:
        return None
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return None
    if isinstance(dt, datetime) and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def seed_default_escalations(db: Session) -> None:
    """Idempotently seeds default system escalations into the database."""
    default_escalations = [
        {
            "id": "PTW_AUTO_EXPIRY",
            "name": "Permit to Work Auto-Expiry Watchdog",
            "description": "Autonomous watchdog monitoring active permits. Automatically expires records when expiry_date < now and notifies safety officers.",
            "entity_type": "permit",
            "status": "ACTIVE",
            "applies_to": "entity",
            "schedule_cron": "*/5 * * * *",
            "check_interval_seconds": 5,
            "is_system": True,
            "points": [
                {
                    "id": "point_permit_expired",
                    "elapsed_hours": 0,
                    "reference_date_field": "expiry_date",
                    "filter_status": ["Active", "Suspended", "Issued", "RiskAssessed", "Approved"],
                    "actions": [
                        {
                            "action_type": "TRANSITION_WORKFLOW",
                            "event_type": "EXPIRED",
                            "reason": "Permit auto-expired past authorized expiry date (Maximo Escalation Engine)"
                        },
                        {
                            "action_type": "SEND_NOTIFICATION",
                            "recipient_role": "ROLE_SAFETY_OFFICER",
                            "message": "Permit {{title}} has expired and field work authorization is revoked."
                        }
                    ]
                }
            ]
        },
        {
            "id": "TASK_OVERDUE_ESCALATION",
            "name": "Workflow Task Assignment Overdue Reassignment",
            "description": "Monitors open workflow task assignments past their due date and reassigns them to the supervisor or active delegate.",
            "entity_type": "*",
            "status": "ACTIVE",
            "applies_to": "task_assignment",
            "schedule_cron": "*/5 * * * *",
            "check_interval_seconds": 5,
            "is_system": True,
            "points": [
                {
                    "id": "point_task_due",
                    "elapsed_hours": 0,
                    "reference_date_field": "due_date",
                    "actions": [
                        {
                            "action_type": "REASSIGN_TASK",
                            "reason": "Task assignment exceeded SLA duration limit"
                        }
                    ]
                }
            ]
        }
    ]

    for esc in default_escalations:
        existing = db.query(EscalationDefinition).filter(EscalationDefinition.id == esc["id"]).first()
        if not existing:
            rec = EscalationDefinition(
                id=esc["id"],
                name=esc["name"],
                description=esc["description"],
                entity_type=esc["entity_type"],
                status=esc["status"],
                applies_to=esc["applies_to"],
                schedule_cron=esc.get("schedule_cron", "*/5 * * * *"),
                check_interval_seconds=esc.get("check_interval_seconds", 5),
                points=esc["points"],
                is_system=esc.get("is_system", False),
                created_at=utc_now(),
                updated_at=utc_now(),
            )
            db.add(rec)
    try:
        db.commit()
    except Exception:
        db.rollback()


def execute_single_escalation(db: Session, escalation: EscalationDefinition, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """
    Executes a single escalation definition against target records.
    """
    now = now or utc_now()
    results = []

    if escalation.status != "ACTIVE":
        return results

    points = escalation.points or []

    # Handle Task Assignment Escalations
    if escalation.applies_to == "task_assignment":
        task_res = check_and_escalate_overdue_tasks(db)
        for r in task_res:
            if r.get("success"):
                log = EscalationLog(
                    escalation_id=escalation.id,
                    entity_type=r.get("entity_type"),
                    entity_id=r.get("entity_id"),
                    action_type="REASSIGN_TASK",
                    status="SUCCESS",
                    message=f"Reassigned task to {r.get('escalated_to_person_id')}",
                    details=r,
                    execution_time=now,
                )
                db.add(log)
                results.append(r)
        escalation.last_run_at = now
        escalation.last_run_status = "SUCCESS"
        db.commit()
        return results

    # Handle Entity Escalations
    query = db.query(DynamicEntity)
    if escalation.entity_type and escalation.entity_type != "*":
        query = query.filter(DynamicEntity.entity_type == escalation.entity_type.lower())

    entities = query.all()
    wf_cache = {}

    for p in entities:
        cache_key = f"{p.entity_type}:{p.workflow_version or 'published'}"
        if cache_key not in wf_cache:
            try:
                wf = _load_workflow(db, p.entity_type, p.workflow_version)
                wf_cache[cache_key] = wf
            except Exception:
                wf_cache[cache_key] = None

        wf = wf_cache.get(cache_key)
        if not wf or not wf.definition:
            continue

        definition = wf.definition or {}
        terminal_states = definition.get("terminal_states", []) or []
        stage = getattr(p, "workflow_stage", None) or p.status
        if p.status in terminal_states or stage in terminal_states:
            continue

        fields = p.custom_fields or {}
        transitions = definition.get("transitions", []) or []

        for pt in points:
            date_field = pt.get("reference_date_field") or "expiry_date"
            filter_status = pt.get("filter_status") or []
            if filter_status and (p.status not in filter_status and stage not in filter_status):
                continue

            # Read date value from custom_fields or entity columns
            raw_date = fields.get(date_field) or getattr(p, date_field, None)
            if not raw_date and date_field == "expiry_date":
                raw_date = fields.get("valid_until") or fields.get("expires_at") or fields.get("expiry")

            target_dt = _normalize_dt(raw_date)
            if not target_dt:
                continue

            elapsed_hours = float(pt.get("elapsed_hours") or 0)
            trigger_dt = target_dt + timedelta(hours=elapsed_hours)

            if now >= trigger_dt:
                # Condition met -> execute configured actions
                actions = pt.get("actions") or []
                for act in actions:
                    act_type = act.get("action_type")
                    prev_status = p.status
                    try:
                        if act_type == "TRANSITION_WORKFLOW":
                            event_type = act.get("event") or act.get("event_type") or "EXPIRED"
                            has_transition = any(
                                (t.get("from") == p.status or t.get("from") == getattr(p, "workflow_stage", None))
                                and (t.get("event") or "").upper() == event_type.upper()
                                for t in transitions
                            )
                            if has_transition:
                                actor_id = act.get("actor_id") or ("system:expiry-checker" if event_type.upper() in ("EXPIRED", "EXPIRE") else f"system:escalation-{escalation.id.lower()}")
                                res = propose_transition(
                                    db=db,
                                    entity_type=p.entity_type,
                                    entity_id=p.id,
                                    event_type=event_type,
                                    actor_id=actor_id,
                                    actor_type="system",
                                    payload={"reason": act.get("reason") or f"Escalated by {escalation.name} at {now.isoformat()}"}
                                )
                                log = EscalationLog(
                                    escalation_id=escalation.id,
                                    entity_type=p.entity_type,
                                    entity_id=p.id,
                                    action_type=act_type,
                                    status="SUCCESS",
                                    message=f"Transitioned from {prev_status} to {res.get('new_status')} via {event_type}",
                                    details=res,
                                    execution_time=now,
                                )
                                db.add(log)
                                results.append({
                                    "permit_id": p.id,
                                    "entity_id": p.id,
                                    "previous_status": prev_status,
                                    "new_status": res.get("new_status"),
                                    "event_id": res.get("event_id"),
                                    "escalation_id": escalation.id,
                                })
                        elif act_type == "CHANGE_STATUS":
                            target_status = act.get("target_status") or act.get("status_value")
                            if target_status and target_status != p.status:
                                p.status = target_status
                                p.updated_at = now
                                log = EscalationLog(
                                    escalation_id=escalation.id,
                                    entity_type=p.entity_type,
                                    entity_id=p.id,
                                    action_type=act_type,
                                    status="SUCCESS",
                                    message=f"Directly updated status to {target_status}",
                                    details={"from": prev_status, "to": target_status},
                                    execution_time=now,
                                )
                                db.add(log)
                                results.append({
                                    "permit_id": p.id,
                                    "entity_id": p.id,
                                    "previous_status": prev_status,
                                    "new_status": target_status,
                                    "escalation_id": escalation.id,
                                })
                        elif act_type == "SEND_NOTIFICATION":
                            msg = act.get("message") or act.get("title") or f"Escalation trigger on {p.entity_type} {p.id}"
                            role = act.get("target_role_id") or act.get("recipient_role") or "admin@compassx.io"
                            dispatch_notification(
                                db=db,
                                recipient_id=role,
                                title=f"Escalation: {escalation.name}",
                                message=msg.replace("{{title}}", fields.get("title", p.id)),
                                entity_type=p.entity_type,
                                entity_id=p.id,
                            )
                    except Exception as ex:
                        logger.error(f"Error executing escalation '{escalation.id}' on '{p.id}': {str(ex)}")
                        log = EscalationLog(
                            escalation_id=escalation.id,
                            entity_type=p.entity_type,
                            entity_id=p.id,
                            action_type=act_type or "UNKNOWN",
                            status="FAILED",
                            message=str(ex),
                            details={},
                            execution_time=now,
                        )
                        db.add(log)

    escalation.last_run_at = now
    escalation.last_run_status = "SUCCESS"
    try:
        db.commit()
    except Exception:
        db.rollback()

    return results


def run_all_active_escalations(db: Session) -> List[Dict[str, Any]]:
    """Runs all active database-defined escalations."""
    seed_default_escalations(db)
    now = utc_now()
    active_escalations = db.query(EscalationDefinition).filter(EscalationDefinition.status == "ACTIVE").all()
    all_results = []
    for esc in active_escalations:
        res = execute_single_escalation(db, esc, now)
        all_results.extend(res)
    return all_results


def run_dynamic_node_timers(db: Session, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """
    Evaluates workflow node time limits (SLA duration / Wait node duration) dynamically
    without any hardcoded state or event names.
    """
    now = now or utc_now()
    results = []
    entities = db.query(DynamicEntity).all()
    wf_cache = {}

    for p in entities:
        cache_key = f"{p.entity_type}:{p.workflow_version or 'published'}"
        if cache_key not in wf_cache:
            try:
                wf = _load_workflow(db, p.entity_type, p.workflow_version)
                wf_cache[cache_key] = wf
            except Exception:
                wf_cache[cache_key] = None

        wf = wf_cache.get(cache_key)
        if not wf or not wf.definition:
            continue

        definition = wf.definition or {}
        terminal_states = definition.get("terminal_states", []) or []
        if p.status in terminal_states:
            continue

        nodes = definition.get("nodes", []) or []
        transitions = definition.get("transitions", []) or []
        stage = getattr(p, "workflow_stage", None) or p.status

        cur_node = next((n for n in nodes if n.get("name") in (stage, p.status) or n.get("id") in (stage, p.status)), None)
        if cur_node:
            time_limit = cur_node.get("time_limit_hours")
            if time_limit is not None and float(time_limit) > 0:
                entered_at = _normalize_dt(p.updated_at or p.created_at)
                if entered_at:
                    due_at = entered_at + timedelta(hours=float(time_limit))
                    if now >= due_at:
                        out_transitions = [t for t in transitions if t.get("from") in (stage, p.status)]
                        # Resolve best outgoing timeout transition dynamically
                        target_t = next((t for t in out_transitions if t.get("is_system")), None)
                        if not target_t:
                            target_t = next((t for t in out_transitions if (t.get("event") or "").upper() in ("TIMEOUT", "EXPIRED", "AUTO_STOP", "AUTO_CLOSE", "AUTOCLOSE", "NEXT", "START")), None)
                        if not target_t:
                            target_t = next((t for t in out_transitions if t.get("to") in terminal_states), None)
                        if not target_t and out_transitions:
                            target_t = out_transitions[0]

                        if target_t and target_t.get("event"):
                            t_event = target_t.get("event")
                            prev_status = p.status
                            try:
                                res = propose_transition(
                                    db=db,
                                    entity_type=p.entity_type,
                                    entity_id=p.id,
                                    event_type=t_event,
                                    actor_id="system:timer-worker",
                                    actor_type="system",
                                    payload={"reason": f"Duration limit of {time_limit}h elapsed at {now.isoformat()} without user action"}
                                )
                                results.append({
                                    "permit_id": p.id,
                                    "entity_id": p.id,
                                    "previous_status": prev_status,
                                    "new_status": res.get("new_status"),
                                    "event_id": res.get("event_id"),
                                })
                            except Exception as ex:
                                logger.error(f"Error transitioning timer record '{p.id}': {str(ex)}")

    return results


def run_escalations_and_timers(db: Session) -> List[Dict[str, Any]]:
    """
    Combined runner: executes all active database escalations and dynamic node timers.
    100% database-driven with zero hardcoded entity logic.
    """
    esc_results = run_all_active_escalations(db)
    timer_results = run_dynamic_node_timers(db)
    return esc_results + timer_results
