from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from backend.models.task_assignment import TaskAssignment
from backend.models.workflow_role import WorkflowRole
from backend.services.role_resolver import resolve_workflow_role
from backend.models.base import generate_uuid, utc_now


def create_task_assignments_for_state(
    db: Session,
    entity_type: str,
    entity_id: str,
    state_name: str,
    definition: Dict[str, Any],
    custom_fields: Dict[str, Any],
    workflow_version: Optional[str] = None,
) -> List[TaskAssignment]:
    """
    Inspects the workflow definition to determine if the target state is a Task node.
    If so, resolves its configured WorkflowRole and generates TaskAssignment rows.
    """
    nodes = definition.get("nodes", []) or []
    task_node = next((n for n in nodes if n.get("name") == state_name and n.get("kind") == "task"), None)
    if not task_node:
        return []

    role_id = task_node.get("role_id")
    instructions = task_node.get("task_instructions") or task_node.get("instructions") or task_node.get("description")
    time_limit_hours = task_node.get("time_limit_hours")

    now = utc_now()
    due_date = now + timedelta(hours=int(time_limit_hours)) if time_limit_hours else None

    created_assignments: List[TaskAssignment] = []

    if role_id:
        resolution = resolve_workflow_role(
            db=db,
            role_id=role_id,
            custom_fields=custom_fields,
        )
        resolved_persons = resolution.get("resolved_persons", [])
        resolved_emails = resolution.get("resolved_emails", [])

        if resolved_persons:
            for p in resolved_persons:
                assignment = TaskAssignment(
                    id=generate_uuid(),
                    entity_type=entity_type.lower(),
                    entity_id=str(entity_id),
                    workflow_version=workflow_version,
                    node_id=state_name,
                    state_name=state_name,
                    role_id=role_id,
                    assigned_person_id=p.get("person_id"),
                    assigned_email=p.get("primary_email"),
                    status="ASSIGNED",
                    instructions=instructions,
                    time_limit_hours=int(time_limit_hours) if time_limit_hours else None,
                    due_date=due_date,
                    resolution_trace=resolution,
                    created_at=now,
                )
                db.add(assignment)
                created_assignments.append(assignment)
        elif resolved_emails:
            for email in resolved_emails:
                assignment = TaskAssignment(
                    id=generate_uuid(),
                    entity_type=entity_type.lower(),
                    entity_id=str(entity_id),
                    workflow_version=workflow_version,
                    node_id=state_name,
                    state_name=state_name,
                    role_id=role_id,
                    assigned_person_id=None,
                    assigned_email=email,
                    status="ASSIGNED",
                    instructions=instructions,
                    time_limit_hours=int(time_limit_hours) if time_limit_hours else None,
                    due_date=due_date,
                    resolution_trace=resolution,
                    created_at=now,
                )
                db.add(assignment)
                created_assignments.append(assignment)
        else:
            # Role exists but resolved to 0 persons (e.g. empty group / missing attribute)
            assignment = TaskAssignment(
                id=generate_uuid(),
                entity_type=entity_type.lower(),
                entity_id=str(entity_id),
                workflow_version=workflow_version,
                node_id=state_name,
                state_name=state_name,
                role_id=role_id,
                assigned_person_id=None,
                assigned_email=None,
                status="ASSIGNED",
                instructions=instructions,
                time_limit_hours=int(time_limit_hours) if time_limit_hours else None,
                due_date=due_date,
                resolution_trace=resolution,
                created_at=now,
            )
            db.add(assignment)
            created_assignments.append(assignment)
    else:
        # Task node without explicit role link
        assignment = TaskAssignment(
            id=generate_uuid(),
            entity_type=entity_type.lower(),
            entity_id=str(entity_id),
            workflow_version=workflow_version,
            node_id=state_name,
            state_name=state_name,
            role_id=None,
            assigned_person_id=None,
            assigned_email=None,
            status="ASSIGNED",
            instructions=instructions,
            time_limit_hours=int(time_limit_hours) if time_limit_hours else None,
            due_date=due_date,
            resolution_trace={"note": "Task node without assigned role"},
            created_at=now,
        )
        db.add(assignment)
        created_assignments.append(assignment)

    db.flush()
    return created_assignments


def complete_task_assignments_for_state(
    db: Session,
    entity_type: str,
    entity_id: str,
    from_state: str,
    actor_id: str,
) -> int:
    """Marks existing active task assignments for from_state as COMPLETED."""
    active_assignments = (
        db.query(TaskAssignment)
        .filter(
            TaskAssignment.entity_type == entity_type.lower(),
            TaskAssignment.entity_id == str(entity_id),
            TaskAssignment.state_name == from_state,
            TaskAssignment.status.in_(["ASSIGNED", "IN_PROGRESS"]),
        )
        .all()
    )
    now = utc_now()
    count = 0
    for a in active_assignments:
        a.status = "COMPLETED"
        a.completed_by = actor_id
        a.completed_at = now
        count += 1
    db.flush()
    return count
