import pytest
from backend.services.command_handler import (
    create_entity,
    propose_transition,
    StaleWriteError,
    InvalidTransitionError,
    GateFailedError,
)
from backend.services.projector import rebuild_entity_from_events
from backend.models.entities import WorkOrder, WorkOrderEvent

def test_create_and_transition_workorder(test_db):
    res_create = create_entity(
        db=test_db,
        entity_type="workorder",
        actor_id="tech@compassx.io",
        workflow_version="standard_v1",
        custom_fields={
            "title": "Fix Valve A1",
            "priority": "Medium",
            "estimated_cost": 2500,
        },
    )
    assert res_create["accepted"] is True
    wo_id = res_create["entity_id"]
    assert res_create["status"] == "Draft"
    assert res_create["workflow_version"] == "standard_v1"

    # Check database state
    wo = test_db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    assert wo is not None
    assert wo.status == "Draft"

    events = test_db.query(WorkOrderEvent).filter(WorkOrderEvent.entity_id == wo_id).all()
    assert len(events) == 1
    assert events[0].event_type == "CREATED"

    # Transition: Draft -> Submitted (event: SUBMITTED)
    res_trans = propose_transition(
        db=test_db,
        entity_type="workorder",
        entity_id=wo_id,
        event_type="SUBMITTED",
        actor_id="tech@compassx.io",
    )
    assert res_trans["accepted"] is True
    assert res_trans["new_status"] == "Submitted"

    events = test_db.query(WorkOrderEvent).filter(WorkOrderEvent.entity_id == wo_id).all()
    assert len(events) == 2
    assert events[1].event_type == "SUBMITTED"
    assert events[1].from_state == "Draft"
    assert events[1].to_state == "Submitted"

def test_optimistic_concurrency_stale_write(test_db):
    res_create = create_entity(
        db=test_db,
        entity_type="workorder",
        actor_id="tech@compassx.io",
        workflow_version="standard_v1",
        custom_fields={"title": "Test Concurrency", "priority": "Low"},
    )
    wo_id = res_create["entity_id"]
    original_event_id = res_create["event_id"]
    
    # Simulate a concurrent worker modifying the entity behind our back
    wo = test_db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    wo.last_event_id = "concurrently-altered-id"
    test_db.commit()

    # Attempt transition with stale state
    with pytest.raises(StaleWriteError):
        propose_transition(
            db=test_db,
            entity_type="workorder",
            entity_id=wo_id,
            event_type="SUBMITTED",
            actor_id="tech@compassx.io",
            expected_last_event_id=original_event_id,
        )

def test_projector_event_replay(test_db):
    res_create = create_entity(
        db=test_db,
        entity_type="workorder",
        actor_id="tech@compassx.io",
        workflow_version="standard_v1",
        custom_fields={"title": "Replay Test", "priority": "High"},
    )
    wo_id = res_create["entity_id"]
    propose_transition(test_db, "workorder", wo_id, "SUBMITTED", "tech@compassx.io")

    # Manually corrupt current status
    wo = test_db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    wo.status = "CorruptedState"
    test_db.commit()

    # Replay event log
    rebuilt = rebuild_entity_from_events(test_db, "workorder", wo_id)
    assert rebuilt["status"] == "Submitted"
