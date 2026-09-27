import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from backend.models.task_assignment import TaskAssignment
from backend.models.person import Person, PersonGroup, PersonGroupMember
from backend.models.base import generate_uuid, utc_now
from backend.services.notification_service import dispatch_notification

logger = logging.getLogger("escalation_service")


def _normalize_dt(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def resolve_escalation_target(db: Session, person_id: Optional[str]) -> Dict[str, Any]:
    """
    Determines the delegation or supervisor target for an overdue task assigned to person_id.
    1. Active delegation: Person.workflow_delegate_id if within delegation window.
    2. Supervisor: Person.supervisor_id if supervisor is active.
    3. None: No escalation target found.
    """
    if not person_id:
        return {"target_person_id": None, "target_person": None, "reason": "No assigned person to escalate from", "is_delegation": False}

    person = db.query(Person).filter(Person.person_id == person_id.upper()).first()
    if not person:
        return {"target_person_id": None, "target_person": None, "reason": f"Person '{person_id}' not found", "is_delegation": False}

    now = utc_now()

    # 1. Check active workflow delegate
    if person.workflow_delegate_id:
        delegate_active = True
        del_from = _normalize_dt(person.delegate_from)
        del_to = _normalize_dt(person.delegate_to)
        if del_from and now < del_from:
            delegate_active = False
        if del_to and now > del_to:
            delegate_active = False
        if delegate_active:
            delegate = db.query(Person).filter(
                Person.person_id == person.workflow_delegate_id,
                Person.status == "ACTIVE",
            ).first()
            if delegate:
                return {
                    "target_person_id": delegate.person_id,
                    "target_person": delegate,
                    "reason": f"Delegated to active workflow delegate '{delegate.display_name}' ({delegate.person_id})",
                    "is_delegation": True,
                }

    # 2. Check supervisor
    if person.supervisor_id:
        supervisor = db.query(Person).filter(
            Person.person_id == person.supervisor_id,
            Person.status == "ACTIVE",
        ).first()
        if supervisor:
            return {
                "target_person_id": supervisor.person_id,
                "target_person": supervisor,
                "reason": f"Escalated to supervisor '{supervisor.display_name}' ({supervisor.person_id}) due to overdue task limit",
                "is_delegation": False,
            }

    return {
        "target_person_id": None,
        "target_person": None,
        "reason": f"No active delegate or supervisor configured for {person.display_name} ({person.person_id})",
        "is_delegation": False,
    }


def escalate_single_task(
    db: Session,
    task_id: str,
    target_person_id: Optional[str] = None,
    reason: Optional[str] = None,
    auto_commit: bool = True,
) -> Dict[str, Any]:
    """
    Escalates a single task assignment manually or automatically.
    """
    task = db.query(TaskAssignment).filter(TaskAssignment.id == task_id).first()
    if not task:
        return {"success": False, "error": f"Task assignment '{task_id}' not found"}

    if task.status not in ("ASSIGNED", "IN_PROGRESS"):
        return {"success": False, "error": f"Task assignment is in status '{task.status}' and cannot be escalated"}

    now = utc_now()

    if target_person_id:
        target_person = db.query(Person).filter(Person.person_id == target_person_id.upper()).first()
        if not target_person:
            return {"success": False, "error": f"Target person '{target_person_id}' not found"}
        escalation_info = {
            "target_person_id": target_person.person_id,
            "target_person": target_person,
            "reason": reason or f"Manually escalated to {target_person.display_name}",
            "is_delegation": False,
        }
    else:
        escalation_info = resolve_escalation_target(db, task.assigned_person_id)

    target_pid = escalation_info["target_person_id"]
    target_person = escalation_info["target_person"]
    escalation_reason = reason or escalation_info["reason"]
    is_delegation = escalation_info.get("is_delegation", False)

    # Update current assignment
    new_status = "DELEGATED" if is_delegation else "ESCALATED"
    task.status = new_status
    task.escalated_to_person_id = target_pid
    task.escalated_at = now
    task.escalation_count = (task.escalation_count or 0) + 1
    task.escalation_reason = escalation_reason

    created_new_assignment = None
    if target_person:
        new_due_date = now + timedelta(hours=task.time_limit_hours or 24)
        orig_name = task.person.display_name if task.person else task.assigned_person_id or "Previous Assignee"
        new_assignment = TaskAssignment(
            id=generate_uuid(),
            entity_type=task.entity_type,
            entity_id=task.entity_id,
            workflow_version=task.workflow_version,
            node_id=task.node_id,
            state_name=task.state_name,
            role_id=task.role_id,
            assigned_person_id=target_person.person_id,
            assigned_group_name=task.assigned_group_name,
            assigned_email=target_person.primary_email,
            status="ASSIGNED",
            instructions=f"[{'DELEGATED' if is_delegation else 'ESCALATED'} from {orig_name}] {task.instructions or ''}",
            time_limit_hours=task.time_limit_hours,
            due_date=new_due_date,
            resolution_trace={
                "escalated_from_task_id": task.id,
                "original_person_id": task.assigned_person_id,
                "reason": escalation_reason,
            },
            created_at=now,
        )
        db.add(new_assignment)
        created_new_assignment = new_assignment

        # Dispatch InAppNotification to new assignee
        try:
            dispatch_notification(
                db=db,
                recipient_id=target_person.person_id,
                title=f"Task {'Delegated' if is_delegation else 'Escalated'}: {task.state_name}",
                message=f"Task '{task.state_name}' on {task.entity_type.upper()} '{task.entity_id}' has been {'delegated' if is_delegation else 'escalated'} to you from {orig_name}. Reason: {escalation_reason}",
                category="task_assigned",
                entity_type=task.entity_type,
                entity_id=task.entity_id,
                link_url=f"/records/{task.entity_id}?type={task.entity_type}",
                sender_id="system:escalation-service",
                auto_commit=False,
            )
        except Exception:
            pass

    # Dispatch notification to original assignee if they exist
    if task.assigned_person_id:
        try:
            dispatch_notification(
                db=db,
                recipient_id=task.assigned_person_id,
                title=f"Task {'Delegated' if is_delegation else 'Escalated'}: {task.state_name}",
                message=f"Your task '{task.state_name}' on {task.entity_type.upper()} '{task.entity_id}' was {'delegated' if is_delegation else 'escalated'}{f' to {target_pid}' if target_pid else ''}. Reason: {escalation_reason}",
                category="system_alert",
                entity_type=task.entity_type,
                entity_id=task.entity_id,
                link_url=f"/records/{task.entity_id}?type={task.entity_type}",
                sender_id="system:escalation-service",
                auto_commit=False,
            )
        except Exception:
            pass

    if auto_commit:
        db.commit()
        db.refresh(task)
        if created_new_assignment:
            db.refresh(created_new_assignment)
    else:
        db.flush()

    return {
        "success": True,
        "task_id": task.id,
        "status": task.status,
        "escalated_to_person_id": target_pid,
        "escalation_reason": escalation_reason,
        "new_task_id": created_new_assignment.id if created_new_assignment else None,
    }


def check_and_escalate_overdue_tasks(db: Session, max_escalation_count: int = 2) -> List[Dict[str, Any]]:
    """
    Scans for active task assignments past their due_date and escalates them to supervisor/delegate.
    """
    now = utc_now()
    overdue_tasks = (
        db.query(TaskAssignment)
        .filter(
            TaskAssignment.status.in_(["ASSIGNED", "IN_PROGRESS"]),
            TaskAssignment.due_date != None,
            TaskAssignment.due_date < now,
            TaskAssignment.escalation_count < max_escalation_count,
        )
        .all()
    )

    results = []
    for task in overdue_tasks:
        try:
            res = escalate_single_task(db, task.id, auto_commit=True)
            results.append(res)
        except Exception as ex:
            logger.error(f"Error escalating overdue task '{task.id}': {str(ex)}")
            results.append({"success": False, "task_id": task.id, "error": str(ex)})

    return results
