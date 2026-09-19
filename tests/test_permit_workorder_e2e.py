import pytest
from datetime import datetime, timezone, timedelta
from backend.services.command_handler import (
    create_entity,
    propose_transition,
    ConditionFailedError,
)

def test_full_spec_checkpoint_scenario(test_db):
    """
    Executes the comprehensive multi-entity scenario from Spec §13 Step 12:
    1. Create a Permit
    2. Complete risk assessment
    3. Issue it (conditioned on Safety Officer role)
    4. Activate it
    5. Create a linked WorkOrder
    6. Attempt to start the WorkOrder before the permit is Active (blocked, correct gate named)
    7. Activate the permit -> retry starting WorkOrder (succeeds)
    8. Complete and close the WorkOrder
    9. Hand back and close the Permit
    """
    # 1. Create a Permit
    res_permit = create_entity(
        db=test_db,
        entity_type="permit",
        actor_id="charlie.tech@compassx.io",
        workflow_version="permit_v1",
        custom_fields={
            "title": "Boiler Inspection Hot Work Permit",
            "permit_type": "Hot Work",
            "location": "Boiler House Level 2",
            "hazards_identified": "Combustible dust and radiant heat",
            "expiry_date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        }
    )
    permit_id = res_permit["entity_id"]
    assert res_permit["status"] == "Requested"

    # 2. Complete risk assessment
    res_ra = propose_transition(
        db=test_db,
        entity_type="permit",
        entity_id=permit_id,
        event_type="RISK_ASSESSMENT_COMPLETED",
        actor_id="charlie.tech@compassx.io",
    )
    assert res_ra["new_status"] == "RiskAssessed"

    # 3. Attempt to issue without Safety Officer role (e.g. Charlie as Technician) -> BLOCKED
    with pytest.raises(ConditionFailedError) as exc_info:
        propose_transition(
            db=test_db,
            entity_type="permit",
            entity_id=permit_id,
            event_type="ISSUED",
            actor_id="charlie.tech@compassx.io",
            actor_roles=["Technician"],
        )
    assert "Requires Safety Officer Role" in exc_info.value.message

    # Issue with Safety Officer role (Alice) -> SUCCEEDS
    res_issued = propose_transition(
        db=test_db,
        entity_type="permit",
        entity_id=permit_id,
        event_type="ISSUED",
        actor_id="alice.safety@compassx.io",
        actor_roles=["Safety Officer"],
    )
    assert res_issued["new_status"] == "Issued"

    # 4. Create a linked WorkOrder while Permit is still 'Issued' (NOT yet 'Active')
    res_wo = create_entity(
        db=test_db,
        entity_type="workorder",
        actor_id="charlie.tech@compassx.io",
        workflow_version="standard_v1",
        custom_fields={
            "title": "Repair Boiler Steam Pipe Flange",
            "priority": "High",
            "estimated_cost": 4500,
            "linked_permit_id": permit_id,
        }
    )
    wo_id = res_wo["entity_id"]
    assert res_wo["status"] == "Draft"

    # Submit WorkOrder -> Submitted
    propose_transition(test_db, "workorder", wo_id, "SUBMITTED", "charlie.tech@compassx.io")

    # Supervisor Approve WorkOrder -> SupervisorApproved
    propose_transition(
        test_db,
        "workorder",
        wo_id,
        "APPROVED",
        "bob.supervisor@compassx.io",
        actor_roles=["Supervisor"],
    )

    # 5. Attempt to start the WorkOrder BEFORE Permit is Active -> BLOCKED by cond_linked_permit_active
    with pytest.raises(ConditionFailedError) as exc_wo_gate:
        propose_transition(
            db=test_db,
            entity_type="workorder",
            entity_id=wo_id,
            event_type="STARTED",
            actor_id="charlie.tech@compassx.io",
        )
    assert "Linked Permit must be Active" in exc_wo_gate.value.message

    # 6. Activate Permit -> Active
    res_act = propose_transition(
        db=test_db,
        entity_type="permit",
        entity_id=permit_id,
        event_type="ACTIVATED",
        actor_id="charlie.tech@compassx.io",
    )
    assert res_act["new_status"] == "Active"

    # 7. Retry starting WorkOrder -> NOW SUCCEEDS into InProgress
    res_started = propose_transition(
        db=test_db,
        entity_type="workorder",
        entity_id=wo_id,
        event_type="STARTED",
        actor_id="charlie.tech@compassx.io",
    )
    assert res_started["new_status"] == "InProgress"

    # 8. Complete and close the WorkOrder
    res_comp = propose_transition(test_db, "workorder", wo_id, "COMPLETED", "charlie.tech@compassx.io")
    assert res_comp["new_status"] == "Completed"

    res_close_wo = propose_transition(test_db, "workorder", wo_id, "CLOSED", "bob.supervisor@compassx.io")
    assert res_close_wo["new_status"] == "Closed"

    # 9. Hand back and close the Permit
    res_hb = propose_transition(test_db, "permit", permit_id, "HANDED_BACK", "charlie.tech@compassx.io")
    assert res_hb["new_status"] == "HandedBack"

    res_close_p = propose_transition(test_db, "permit", permit_id, "CLOSED", "alice.safety@compassx.io")
    assert res_close_p["new_status"] == "Closed"
