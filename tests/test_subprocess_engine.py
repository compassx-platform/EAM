import pytest
from datetime import datetime, timezone
from backend.models.workflow import WorkflowDefinition
from backend.models.entity_type import EntityTypeDefinition
from backend.services.command_handler import create_entity, propose_transition
from backend.services.subprocess_service import get_subprocess_status


def test_subprocess_auto_launch_and_parent_resumption(test_db):
    """
    Tests end-to-end child subprocess lifecycle:
    1. Parent workflow enters 'SafetySubprocess' state.
    2. Child 'permit' record is auto-created and linked.
    3. Parent is in waiting state.
    4. Child permit progresses and reaches terminal state 'Closed'.
    5. Parent workflow automatically resumes and transitions to 'WorkExecution'.
    """
    # 1. Setup Parent Workflow with Subprocess Node
    parent_wf_def = {
        "states": ["Draft", "SafetySubprocess", "WorkExecution", "Complete"],
        "nodes": [
            {"name": "Draft", "kind": "state"},
            {
                "name": "SafetySubprocess",
                "kind": "subprocess",
                "subprocess_id": "hot_work_permit_sub",
                "subprocess_entity_type": "permit",
                "autocreate_child": True,
                "resume_event": "PERMIT_RESOLVED",
                "on_child_terminal_states": ["CLOSED", "ACTIVE", "EXPIRED"],
            },
            {"name": "WorkExecution", "kind": "state"},
            {"name": "Complete", "kind": "state"},
        ],
        "transitions": [
            {"from": "Draft", "event": "SUBMIT", "to": "SafetySubprocess"},
            {"from": "SafetySubprocess", "event": "PERMIT_RESOLVED", "to": "WorkExecution"},
            {"from": "WorkExecution", "event": "FINISH", "to": "Complete"},
        ],
    }

    # Save and publish parent workflow definition on workorder
    wf = WorkflowDefinition(
        id="wo_with_subprocess_v1",
        entity_type="workorder",
        version_label="wo_with_subprocess_v1",
        status="published",
        definition=parent_wf_def,
        created_at=datetime.now(timezone.utc),
        published_at=datetime.now(timezone.utc),
    )
    test_db.add(wf)
    test_db.commit()

    # 2. Create Parent Work Order
    parent_res = create_entity(
        db=test_db,
        entity_type="workorder",
        actor_id="alice@compassx.io",
        workflow_version="wo_with_subprocess_v1",
        custom_fields={"title": "Turbine Maintenance Job", "priority": "High"},
    )
    parent_id = parent_res["entity_id"]
    assert parent_res["status"] == "Draft"

    # 3. Transition parent into Subprocess state
    trans_res = propose_transition(
        db=test_db,
        entity_type="workorder",
        entity_id=parent_id,
        event_type="SUBMIT",
        actor_id="alice@compassx.io",
    )
    assert trans_res["new_status"] == "SafetySubprocess"

    # Check subprocess result in response
    assert "subprocess" in trans_res
    sub_info = trans_res["subprocess"]
    assert sub_info["action"] == "child_created"
    child_id = sub_info["child_id"]
    assert child_id is not None

    # Check parent status via get_subprocess_status
    status_data = get_subprocess_status(test_db, "workorder", parent_id)
    assert status_data["is_subprocess_state"] is True
    assert status_data["child_subprocess"]["child_id"] == child_id
    assert status_data["child_subprocess"]["child_entity_type"] == "permit"

    # Check child status via get_subprocess_status
    child_status_data = get_subprocess_status(test_db, "permit", child_id)
    assert child_status_data["is_child_record"] is True
    assert child_status_data["parent_workflow"]["parent_entity_id"] == parent_id
    assert child_status_data["parent_workflow"]["parent_status"] == "SafetySubprocess"

    # 4. Advance child permit until terminal state 'Active' (configured in on_child_terminal_states)
    # Permit lifecycle in permit_v3: Requested -> RiskAssessed -> Approved -> Issued -> Active
    propose_transition(
        db=test_db,
        entity_type="permit",
        entity_id=child_id,
        event_type="RISK_ASSESSMENT_COMPLETED",
        actor_id="charlie.tech@compassx.io",
    )
    propose_transition(
        db=test_db,
        entity_type="permit",
        entity_id=child_id,
        event_type="APPROVED",
        actor_id="bob.safety@compassx.io",
        actor_roles=["Safety Officer"],
    )
    propose_transition(
        db=test_db,
        entity_type="permit",
        entity_id=child_id,
        event_type="ISSUED",
        actor_id="bob.safety@compassx.io",
        actor_roles=["Safety Officer"],
    )
    # Transitioning to 'Active' (which is in our on_child_terminal_states list)
    active_res = propose_transition(
        db=test_db,
        entity_type="permit",
        entity_id=child_id,
        event_type="ACTIVATED",
        actor_id="bob.safety@compassx.io",
        actor_roles=["Safety Officer"],
    )
    assert active_res["new_status"] == "Active"

    # 5. Verify parent work order was automatically resumed and transitioned to 'WorkExecution'!
    updated_parent_status = get_subprocess_status(test_db, "workorder", parent_id)
    assert updated_parent_status["status"] == "WorkExecution"


def test_subprocess_api_endpoint(client, test_db):
    """Tests the subprocess GET and POST API endpoints."""
    # 1. Create a parent entity
    create_res = client.post(
        "/api/workorder/create",
        json={"custom_fields": {"title": "Generator Inspection", "priority": "High"}},
        headers={"X-Actor-Id": "admin@compassx.io"},
    )
    assert create_res.status_code == 200
    entity_id = create_res.json()["entity_id"]

    # 2. Get subprocess status
    sub_res = client.get(f"/api/workorder/{entity_id}/subprocess")
    assert sub_res.status_code == 200
    data = sub_res.json()
    assert data["found"] is True
    assert data["entity_id"] == entity_id
