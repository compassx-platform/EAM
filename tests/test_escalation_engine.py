from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from backend.models.person import Person
from backend.models.workflow_role import WorkflowRole
from backend.models.workflow import WorkflowDefinition
from backend.models.task_assignment import TaskAssignment
from backend.models.notification import InAppNotification
from backend.models.base import utc_now, generate_uuid
from backend.services.escalation_service import (
    resolve_escalation_target,
    escalate_single_task,
    check_and_escalate_overdue_tasks,
)


def test_resolve_escalation_target_delegate_and_supervisor(client: TestClient, test_db: Session):
    # 1. Create supervisor
    supervisor = Person(
        person_id="SUPERVISOR-1",
        display_name="Sarah Supervisor",
        primary_email="sarah@example.com",
        status="ACTIVE",
    )
    test_db.add(supervisor)

    # 2. Create delegate
    delegate = Person(
        person_id="DELEGATE-1",
        display_name="Dan Delegate",
        primary_email="dan@example.com",
        status="ACTIVE",
    )
    test_db.add(delegate)

    # 3. Create person with active delegate and supervisor
    worker_with_delegate = Person(
        person_id="WORKER-1",
        display_name="Will Worker",
        primary_email="will@example.com",
        supervisor_id="SUPERVISOR-1",
        workflow_delegate_id="DELEGATE-1",
        delegate_from=utc_now() - timedelta(days=1),
        delegate_to=utc_now() + timedelta(days=5),
        status="ACTIVE",
    )
    test_db.add(worker_with_delegate)

    # 4. Create person with supervisor only (no delegate)
    worker_supervisor_only = Person(
        person_id="WORKER-2",
        display_name="Wendy Worker",
        primary_email="wendy@example.com",
        supervisor_id="SUPERVISOR-1",
        status="ACTIVE",
    )
    test_db.add(worker_supervisor_only)
    test_db.commit()

    # Test resolution with active delegate
    res1 = resolve_escalation_target(test_db, "WORKER-1")
    assert res1["target_person_id"] == "DELEGATE-1"
    assert res1["is_delegation"] is True

    # Test resolution with supervisor
    res2 = resolve_escalation_target(test_db, "WORKER-2")
    assert res2["target_person_id"] == "SUPERVISOR-1"
    assert res2["is_delegation"] is False


def test_escalate_overdue_task_auto_and_manual(client: TestClient, test_db: Session):
    # Setup supervisor and worker
    sup = Person(person_id="SUP-TECH-1", display_name="Tech Lead", primary_email="lead@example.com", status="ACTIVE")
    tech = Person(person_id="TECH-1", display_name="Junior Tech", primary_email="tech@example.com", supervisor_id="SUP-TECH-1", status="ACTIVE")
    test_db.add_all([sup, tech])
    test_db.commit()

    # Create an overdue task assignment
    past_due = utc_now() - timedelta(hours=5)
    task = TaskAssignment(
        id=generate_uuid(),
        entity_type="workorder",
        entity_id="WO-ESC-100",
        state_name="Field Inspection",
        assigned_person_id="TECH-1",
        assigned_email="tech@example.com",
        status="ASSIGNED",
        instructions="Inspect pump seals and bearings",
        time_limit_hours=4,
        due_date=past_due,
        escalation_count=0,
        created_at=utc_now() - timedelta(hours=9),
    )
    test_db.add(task)
    test_db.commit()

    # Run check_and_escalate_overdue_tasks
    results = check_and_escalate_overdue_tasks(test_db)
    assert len(results) >= 1
    escalated_res = next(r for r in results if r["task_id"] == task.id)
    assert escalated_res["success"] is True
    assert escalated_res["status"] == "ESCALATED"
    assert escalated_res["escalated_to_person_id"] == "SUP-TECH-1"

    # Verify task state in db
    test_db.refresh(task)
    assert task.status == "ESCALATED"
    assert task.escalation_count == 1
    assert task.escalated_to_person_id == "SUP-TECH-1"

    # Verify new assignment created for supervisor
    new_task = test_db.query(TaskAssignment).filter(
        TaskAssignment.entity_id == "WO-ESC-100",
        TaskAssignment.assigned_person_id == "SUP-TECH-1",
        TaskAssignment.status == "ASSIGNED",
    ).first()
    assert new_task is not None
    assert "[ESCALATED from Junior Tech]" in new_task.instructions

    # Verify in-app notifications generated for supervisor and worker
    sup_notif = test_db.query(InAppNotification).filter(
        InAppNotification.recipient_id == "SUP-TECH-1",
        InAppNotification.entity_id == "WO-ESC-100",
    ).first()
    assert sup_notif is not None
    assert "Task Escalated: Field Inspection" in sup_notif.title

    worker_notif = test_db.query(InAppNotification).filter(
        InAppNotification.recipient_id == "TECH-1",
        InAppNotification.entity_id == "WO-ESC-100",
    ).first()
    assert worker_notif is not None
    assert "Task Escalated: Field Inspection" in worker_notif.title


def test_escalation_api_endpoints(client: TestClient, test_db: Session):
    # Setup test persons
    sup = Person(person_id="SUP-API-1", display_name="API Supervisor", primary_email="apisup@example.com", status="ACTIVE")
    worker = Person(person_id="WRK-API-1", display_name="API Worker", primary_email="apiwrk@example.com", supervisor_id="SUP-API-1", status="ACTIVE")
    alt_sup = Person(person_id="ALT-SUP-1", display_name="Alternate Supervisor", primary_email="altsup@example.com", status="ACTIVE")
    test_db.add_all([sup, worker, alt_sup])
    test_db.commit()

    # Create task
    task = TaskAssignment(
        id=generate_uuid(),
        entity_type="permit",
        entity_id="PM-API-200",
        state_name="Permit Validation",
        assigned_person_id="WRK-API-1",
        status="ASSIGNED",
        instructions="Validate gas measurements",
        time_limit_hours=2,
        due_date=utc_now() - timedelta(minutes=30),
        escalation_count=0,
    )
    test_db.add(task)
    test_db.commit()

    # 1. Test POST /api/tasks/escalations/check
    res = client.post("/api/tasks/escalations/check")
    assert res.status_code == 200
    data = res.json()
    assert data["checked"] >= 1
    assert data["escalated_count"] >= 1

    # 2. Test manual escalation endpoint POST /api/tasks/assignments/{task_id}/escalate
    task2 = TaskAssignment(
        id=generate_uuid(),
        entity_type="workorder",
        entity_id="WO-API-300",
        state_name="Final Signoff",
        assigned_person_id="WRK-API-1",
        status="ASSIGNED",
        instructions="Signoff completed overhaul",
        time_limit_hours=8,
        due_date=utc_now() + timedelta(hours=5),
        escalation_count=0,
    )
    test_db.add(task2)
    test_db.commit()

    res = client.post(
        f"/api/tasks/assignments/{task2.id}/escalate",
        json={
            "target_person_id": "ALT-SUP-1",
            "reason": "Expedited urgent critical line outage",
        },
    )
    assert res.status_code == 200, res.text
    res_data = res.json()
    assert res_data["success"] is True
    assert res_data["escalated_to_person_id"] == "ALT-SUP-1"
    assert res_data["escalation_reason"] == "Expedited urgent critical line outage"

    # Verify task in DB
    test_db.refresh(task2)
    assert task2.status == "ESCALATED"
    assert task2.escalated_to_person_id == "ALT-SUP-1"
