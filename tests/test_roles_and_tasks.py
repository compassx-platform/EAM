from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.models.workflow_role import WorkflowRole
from backend.models.task_assignment import TaskAssignment
from backend.models.person import Person, PersonGroup, PersonGroupMember, PersonAvailability
from backend.models.workflow import WorkflowDefinition
from backend.models.base import utc_now


def test_role_crud(client: TestClient, test_db: Session):
    # Ensure person exists
    p = test_db.query(Person).filter(Person.person_id == "TECH_BOB").first()
    if not p:
        p = Person(
            person_id="TECH_BOB",
            display_name="Bob Technician",
            primary_email="bob.tech@example.com",
            status="ACTIVE",
        )
        test_db.add(p)
        test_db.commit()

    # 1. Create a PERSON role
    res = client.post(
        "/api/roles",
        json={
            "id": "ROLE_LEAD_TECH",
            "name": "Lead Technician",
            "description": "Lead technician on duty",
            "role_type": "PERSON",
            "person_id": "TECH_BOB",
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["id"] == "ROLE_LEAD_TECH"
    assert data["role_type"] == "PERSON"
    assert data["person_id"] == "TECH_BOB"
    assert data["person_name"] == "Bob Technician"

    # 2. Get role
    res = client.get("/api/roles/ROLE_LEAD_TECH")
    assert res.status_code == 200
    assert res.json()["name"] == "Lead Technician"

    # 3. Update role
    res = client.put(
        "/api/roles/ROLE_LEAD_TECH",
        json={"description": "Updated lead tech description"},
    )
    assert res.status_code == 200
    assert res.json()["description"] == "Updated lead tech description"

    # 4. List roles
    res = client.get("/api/roles?search=LEAD_TECH")
    assert res.status_code == 200
    items = res.json()["items"]
    assert any(r["id"] == "ROLE_LEAD_TECH" for r in items)

    # 5. Delete role
    res = client.delete("/api/roles/ROLE_LEAD_TECH")
    assert res.status_code == 200
    assert res.json()["deleted"] is True


def test_role_resolution_with_delegation_and_availability(client: TestClient, test_db: Session):
    now = utc_now()
    # Create Person A (Alice) and Person B (Charlie)
    alice = test_db.query(Person).filter(Person.person_id == "ALICE_SUP").first()
    if not alice:
        alice = Person(
            person_id="ALICE_SUP",
            display_name="Alice Supervisor",
            primary_email="alice.sup@example.com",
            status="ACTIVE",
        )
        test_db.add(alice)

    charlie = test_db.query(Person).filter(Person.person_id == "CHARLIE_DELEGATE").first()
    if not charlie:
        charlie = Person(
            person_id="CHARLIE_DELEGATE",
            display_name="Charlie Delegate",
            primary_email="charlie.del@example.com",
            status="ACTIVE",
        )
        test_db.add(charlie)
    test_db.commit()

    # Create role pointing to Alice
    role = test_db.query(WorkflowRole).filter(WorkflowRole.id == "ROLE_PLANT_SUPERVISOR").first()
    if not role:
        role = WorkflowRole(
            id="ROLE_PLANT_SUPERVISOR",
            name="Plant Supervisor",
            role_type="PERSON",
            person_id="ALICE_SUP",
        )
        test_db.add(role)
        test_db.commit()

    # Test resolution before delegation: resolves to Alice
    res = client.post("/api/roles/ROLE_PLANT_SUPERVISOR/resolve", json={})
    assert res.status_code == 200
    res_data = res.json()
    assert len(res_data["resolved_persons"]) == 1
    assert res_data["resolved_persons"][0]["person_id"] == "ALICE_SUP"
    assert res_data["resolved_persons"][0]["is_delegate"] is False

    # Now set Alice delegation to Charlie
    alice.workflow_delegate_id = "CHARLIE_DELEGATE"
    alice.delegate_from = now - timedelta(days=1)
    alice.delegate_to = now + timedelta(days=2)
    test_db.commit()

    # Test resolution after delegation: dynamically resolves to Charlie!
    res = client.post("/api/roles/ROLE_PLANT_SUPERVISOR/resolve", json={})
    assert res.status_code == 200
    res_data = res.json()
    assert len(res_data["resolved_persons"]) == 1
    assert res_data["resolved_persons"][0]["person_id"] == "CHARLIE_DELEGATE"
    assert res_data["resolved_persons"][0]["is_delegate"] is True
    assert res_data["resolved_persons"][0]["original_person_id"] == "ALICE_SUP"
    assert "alice.sup@example.com" not in res_data["resolved_emails"]
    assert "charlie.del@example.com" in res_data["resolved_emails"]


def test_person_group_and_dataset_attribute_roles(client: TestClient, test_db: Session):
    # 1. Create a Person Group Role
    g = test_db.query(PersonGroup).filter(PersonGroup.group_name == "SAFETY_COMMITTEE").first()
    if not g:
        g = PersonGroup(group_name="SAFETY_COMMITTEE", description="Site Safety Committee")
        test_db.add(g)
        test_db.commit()

    res = client.post(
        "/api/roles",
        json={
            "id": "ROLE_SAFETY_TEAM",
            "name": "Safety Team",
            "role_type": "PERSON_GROUP",
            "group_name": "SAFETY_COMMITTEE",
            "resolution_strategy": "sequence_first_available",
        },
    )
    assert res.status_code in (201, 409)

    # 2. Create a Dataset Attribute Role (e.g. reported_by on work order)
    res = client.post(
        "/api/roles",
        json={
            "id": "ROLE_REPORTED_BY",
            "name": "Reported By",
            "role_type": "DATASET_ATTRIBUTE",
            "field_name": "reported_by",
        },
    )
    assert res.status_code in (201, 409)

    # Ensure ALICE_SUP exists
    p = test_db.query(Person).filter(Person.person_id == "ALICE_SUP").first()
    if not p:
        p = Person(
            person_id="ALICE_SUP",
            display_name="Alice Supervisor",
            primary_email="alice.sup@example.com",
            status="ACTIVE",
        )
        test_db.add(p)
        test_db.commit()

    # Resolve Dataset Attribute role dynamically against custom_fields
    res = client.post(
        "/api/roles/ROLE_REPORTED_BY/resolve",
        json={"custom_fields": {"reported_by": "ALICE_SUP"}},
    )
    assert res.status_code == 200
    res_data = res.json()
    assert len(res_data["resolved_persons"]) >= 1


def test_task_assignment_on_workflow_execution(client: TestClient, test_db: Session):
    p = test_db.query(Person).filter(Person.person_id == "ALICE_SUP").first()
    if not p:
        p = Person(
            person_id="ALICE_SUP",
            display_name="Alice Supervisor",
            primary_email="alice.sup@example.com",
            status="ACTIVE",
        )
        test_db.add(p)
        test_db.commit()

    # Ensure role exists
    role = test_db.query(WorkflowRole).filter(WorkflowRole.id == "ROLE_SAFETY_AUDITOR").first()
    if not role:
        role = WorkflowRole(
            id="ROLE_SAFETY_AUDITOR",
            name="Safety Auditor",
            role_type="PERSON",
            person_id="ALICE_SUP",
        )
        test_db.add(role)
        test_db.commit()

    # Create a published workflow with a task node
    wf_def = {
        "states": ["Draft", "Safety Review", "Approved"],
        "transitions": [
            {"from": "Draft", "event": "SUBMIT", "to": "Safety Review", "conditions": []},
            {"from": "Safety Review", "event": "APPROVE", "to": "Approved", "conditions": []},
        ],
        "nodes": [
            {"name": "Draft", "kind": "state", "position": {"x": 100, "y": 100}},
            {
                "name": "Safety Review",
                "kind": "task",
                "role_id": "ROLE_SAFETY_AUDITOR",
                "task_instructions": "Review safety hazards and verify isolation",
                "time_limit_hours": 24,
                "position": {"x": 300, "y": 100},
            },
            {"name": "Approved", "kind": "state", "position": {"x": 500, "y": 100}},
        ],
    }

    # Save and publish workflow for workorder
    wf = WorkflowDefinition(
        entity_type="workorder",
        version_label="v_task_test",
        status="published",
        definition=wf_def,
        published_at=utc_now(),
    )
    test_db.add(wf)
    test_db.commit()

    # Create workorder in Draft
    res = client.post(
        "/api/workorder/create",
        json={
            "actor_id": "test.user@example.com",
            "custom_fields": {"title": "Fix Pump", "description": "Fix water pump", "priority": "High"},
            "workflow_version": "v_task_test",
        },
    )
    assert res.status_code == 200, res.text
    entity_id = res.json()["entity_id"]

    # Propose transition SUBMIT -> moves to 'Safety Review' (task node)
    res = client.post(
        "/api/workorder/transition",
        json={
            "entity_id": entity_id,
            "event_type": "SUBMIT",
            "actor_id": "test.user@example.com",
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["new_status"] == "Safety Review"

    # Query task assignments
    res = client.get(f"/api/tasks/assignments?entity_type=workorder&entity_id={entity_id}")
    assert res.status_code == 200
    tasks = res.json()["items"]
    assert len(tasks) >= 1
    review_task = next((t for t in tasks if t["state_name"] == "Safety Review"), None)
    assert review_task is not None
    assert review_task["status"] == "ASSIGNED"
    assert review_task["role_id"] == "ROLE_SAFETY_AUDITOR"
    assert review_task["instructions"] == "Review safety hazards and verify isolation"
    assert review_task["time_limit_hours"] == 24

    # Now transition APPROVE -> moves to 'Approved'
    res = client.post(
        "/api/workorder/transition",
        json={
            "entity_id": entity_id,
            "event_type": "APPROVE",
            "actor_id": "approver@example.com",
        },
    )
    assert res.status_code == 200
    assert res.json()["new_status"] == "Approved"

    # Verify previous task assignment is now COMPLETED
    res = client.get(f"/api/tasks/assignments?entity_type=workorder&entity_id={entity_id}")
    assert res.status_code == 200
    tasks = res.json()["items"]
    review_task = next((t for t in tasks if t["state_name"] == "Safety Review"), None)
    assert review_task is not None
    assert review_task["status"] == "COMPLETED"
    assert review_task["completed_by"] == "approver@example.com"
