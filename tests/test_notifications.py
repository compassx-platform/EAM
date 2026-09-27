import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from backend.models.person import Person, PersonGroup, PersonGroupMember
from backend.models.workflow_role import WorkflowRole
from backend.models.workflow import WorkflowDefinition
from backend.models.notification import InAppNotification
from backend.models.base import utc_now


def test_notification_crud(client: TestClient, test_db: Session):
    # 1. Create a notification
    res = client.post(
        "/api/notifications",
        json={
            "recipient_id": "NOTIF-USER-1",
            "title": "Welcome to CompassX",
            "message": "Your user profile has been configured.",
            "category": "system_alert",
            "entity_type": "workorder",
            "entity_id": "WO-999",
            "link_url": "/records/WO-999?type=workorder",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    notif_id = data["id"]
    assert data["recipient_id"] == "NOTIF-USER-1"
    assert data["title"] == "Welcome to CompassX"
    assert data["is_read"] is False

    # 2. Check unread count
    res = client.get("/api/notifications/unread_count?recipient_id=NOTIF-USER-1")
    assert res.status_code == 200
    assert res.json()["unread_count"] >= 1

    # 3. List notifications
    res = client.get("/api/notifications?recipient_id=NOTIF-USER-1")
    assert res.status_code == 200
    list_data = res.json()
    assert list_data["total"] >= 1
    assert any(n["id"] == notif_id for n in list_data["items"])

    # 4. Mark single read
    res = client.patch(f"/api/notifications/{notif_id}/read", json={"is_read": True})
    assert res.status_code == 200
    assert res.json()["is_read"] is True
    assert res.json()["read_at"] is not None

    # 5. Create another unread notification and mark all read
    res = client.post(
        "/api/notifications",
        json={
            "recipient_id": "NOTIF-USER-1",
            "title": "Secondary Alert",
            "message": "Testing mark all as read.",
            "category": "workflow_action",
        },
    )
    assert res.status_code == 200
    second_id = res.json()["id"]

    res = client.post("/api/notifications/mark_all_read?recipient_id=NOTIF-USER-1")
    assert res.status_code == 200
    assert res.json()["marked_count"] >= 1

    # Verify unread count is 0
    res = client.get("/api/notifications/unread_count?recipient_id=NOTIF-USER-1")
    assert res.status_code == 200
    assert res.json()["unread_count"] == 0

    # 6. Delete notification
    res = client.delete(f"/api/notifications/{notif_id}")
    assert res.status_code == 200
    assert res.json()["deleted"] is True


def test_task_assignment_auto_notification(client: TestClient, test_db: Session):
    """Verify that when a task node is entered, an InAppNotification is generated for the assigned person."""
    # Create a test person and role
    person_id = "TASK-NOTIF-PERSON"
    if not test_db.query(Person).filter(Person.person_id == person_id).first():
        test_db.add(Person(person_id=person_id, display_name="Task Worker", primary_email="worker@example.com", status="ACTIVE"))
        test_db.commit()

    role_id = "ROLE-TASK-NOTIF"
    existing_role = test_db.query(WorkflowRole).filter(WorkflowRole.id == role_id).first()
    if not existing_role:
        test_db.add(WorkflowRole(
            id=role_id,
            name="Task Notification Worker Role",
            role_type="PERSON",
            person_id=person_id,
            resolution_strategy="default_member",
        ))
        test_db.commit()

    # Create a workflow with a task node
    wf_def = {
        "version": "1.0",
        "entity_type": "workorder",
        "initial_state": "Draft",
        "states": ["Draft", "Safety Review", "Approved"],
        "nodes": [
            {"name": "Draft", "kind": "state", "description": "Draft"},
            {
                "name": "Safety Review",
                "kind": "task",
                "description": "Safety Review Task",
                "role_id": role_id,
                "task_instructions": "Review safety checks carefully",
                "time_limit_hours": 4,
            },
            {"name": "Approved", "kind": "state", "description": "Approved"},
        ],
        "transitions": [
            {"from": "Draft", "to": "Safety Review", "event": "SUBMIT"},
            {"from": "Safety Review", "to": "Approved", "event": "APPROVE"},
        ],
    }

    wf = WorkflowDefinition(
        entity_type="workorder",
        version_label="v_notif_task_test",
        status="published",
        definition=wf_def,
        published_at=utc_now(),
    )
    test_db.add(wf)
    test_db.commit()

    # Create entity and transition to Safety Review
    res = client.post(
        "/api/workorder/create",
        json={
            "actor_id": "test.user@example.com",
            "custom_fields": {"title": "Check Valve A", "description": "Safety check", "priority": "High"},
            "workflow_version": "v_notif_task_test",
        },
    )
    assert res.status_code == 200, res.text
    entity_id = res.json()["entity_id"]

    # Propose transition to Safety Review
    res = client.post(
        "/api/workorder/transition",
        json={
            "entity_id": entity_id,
            "event_type": "SUBMIT",
            "actor_id": "test.user@example.com",
            "actor_type": "user",
        },
    )
    assert res.status_code == 200, res.text

    # Check that InAppNotification was dispatched to TASK-NOTIF-PERSON
    notifs = test_db.query(InAppNotification).filter(
        InAppNotification.recipient_id == person_id,
        InAppNotification.entity_id == entity_id,
    ).all()
    assert len(notifs) >= 1
    assert "Task Assigned: Safety Review" in notifs[0].title
    assert "Review safety checks carefully" in notifs[0].message
    assert notifs[0].category == "task_assigned"


def test_action_send_in_app_notification(client: TestClient, test_db: Session):
    """Verify that send_in_app_notification side effect dispatches notification with templating."""
    wf_def = {
        "version": "1.0",
        "entity_type": "workorder",
        "initial_state": "Open",
        "states": ["Open", "Closed"],
        "nodes": [
            {"name": "Open", "kind": "state"},
            {"name": "Closed", "kind": "state"},
        ],
        "transitions": [
            {
                "from": "Open",
                "to": "Closed",
                "event": "CLOSE",
                "on_after": [
                    {
                        "type": "send_in_app_notification",
                        "params": {
                            "recipient": "ENG-LEAD",
                            "title": "WO Closed: {{title}}",
                            "message": "Work order has been closed by supervisor.",
                            "category": "workflow_action",
                        },
                    }
                ],
            }
        ],
    }

    wf = WorkflowDefinition(
        entity_type="workorder",
        version_label="v_action_notif_test",
        status="published",
        definition=wf_def,
        published_at=utc_now(),
    )
    test_db.add(wf)
    test_db.commit()

    res = client.post(
        "/api/workorder/create",
        json={
            "actor_id": "TESTER",
            "custom_fields": {"title": "Pump Overhaul A1", "description": "WO Description", "priority": "Low"},
            "workflow_version": "v_action_notif_test",
        },
    )
    assert res.status_code == 200, res.text
    entity_id = res.json()["entity_id"]

    res = client.post(
        "/api/workorder/transition",
        json={
            "entity_id": entity_id,
            "event_type": "CLOSE",
            "actor_id": "TESTER",
            "actor_type": "user",
        },
    )
    assert res.status_code == 200, res.text

    # Check that notification was created for ENG-LEAD
    notifs = test_db.query(InAppNotification).filter(
        InAppNotification.recipient_id == "ENG-LEAD",
        InAppNotification.entity_id == entity_id,
    ).all()
    assert len(notifs) >= 1
    assert notifs[0].title == "WO Closed: Pump Overhaul A1"
    assert notifs[0].category == "workflow_action"
