import pytest
from datetime import datetime, timezone, timedelta
from backend.services.command_handler import create_entity, propose_transition
from backend.services.expiry_worker import check_and_expire_permits
from backend.models.entities import Permit, PermitEvent

def test_permit_auto_expiry_system_actor(test_db):
    # Create permit with past expiry_date
    past_date = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    res = create_entity(
        db=test_db,
        entity_type="permit",
        actor_id="charlie.tech@compassx.io",
        workflow_version="permit_v1",
        custom_fields={
            "title": "Expired Test Permit",
            "permit_type": "Electrical Isolation",
            "location": "Switchgear Room",
            "hazards_identified": "High voltage",
            "expiry_date": past_date,
        }
    )
    p_id = res["entity_id"]

    # Progress to Active
    propose_transition(test_db, "permit", p_id, "RISK_ASSESSMENT_COMPLETED", "charlie.tech@compassx.io")
    propose_transition(test_db, "permit", p_id, "ISSUED", "alice.safety@compassx.io", actor_roles=["Safety Officer"])
    propose_transition(test_db, "permit", p_id, "ACTIVATED", "charlie.tech@compassx.io")

    # Verify permit is Active
    p = test_db.query(Permit).filter(Permit.id == p_id).first()
    assert p.status == "Active"

    # Run expiry checker
    expired_list = check_and_expire_permits(test_db)
    assert len(expired_list) >= 1
    assert any(item["permit_id"] == p_id for item in expired_list)

    # Verify status is now Expired
    test_db.refresh(p)
    assert p.status == "Expired"

    # Verify event row has actor_type='system' and actor_id='system:expiry-checker'
    event = (
        test_db.query(PermitEvent)
        .filter(PermitEvent.entity_id == p_id, PermitEvent.event_type == "EXPIRED")
        .first()
    )
    assert event is not None
    assert event.actor_type == "system"
    assert event.actor_id == "system:expiry-checker"
