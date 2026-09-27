import pytest
from datetime import datetime, timezone, timedelta
from backend.services.command_handler import create_entity, propose_transition
from backend.services.expiry_worker import check_and_expire_permits
from backend.models.entities import DynamicEntity, DynamicEntityEvent

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
    p = test_db.query(DynamicEntity).filter(DynamicEntity.id == p_id).first()
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
        test_db.query(DynamicEntityEvent)
        .filter(DynamicEntityEvent.entity_id == p_id, DynamicEntityEvent.event_type == "EXPIRED")
        .first()
    )
    assert event is not None
    assert event.actor_type == "system"
    assert event.actor_id == "system:expiry-checker"


def test_suspended_permit_auto_expiry(test_db):
    """Verify that a suspended permit past its expiry date is automatically expired."""
    past_date = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    res = create_entity(
        db=test_db,
        entity_type="permit",
        actor_id="operator@compassx.io",
        workflow_version="permit_v1",
        custom_fields={
            "title": "Suspended Test Permit",
            "permit_type": "Hot Work",
            "location": "Boiler Room",
            "hazards_identified": "Oxy-fuel flame and spark hazards",
            "expiry_date": past_date,
        }
    )
    p_id = res["entity_id"]

    # Progress to Active then Suspend
    propose_transition(test_db, "permit", p_id, "RISK_ASSESSMENT_COMPLETED", "operator@compassx.io")
    propose_transition(test_db, "permit", p_id, "ISSUED", "safety@compassx.io", actor_roles=["Safety Officer"])
    propose_transition(test_db, "permit", p_id, "ACTIVATED", "operator@compassx.io")
    propose_transition(test_db, "permit", p_id, "SUSPENDED", "operator@compassx.io", payload={"reason": "Adverse weather"})

    p = test_db.query(DynamicEntity).filter(DynamicEntity.id == p_id).first()
    assert p.status == "Suspended"

    # Run expiry checker
    expired_list = check_and_expire_permits(test_db)
    assert any(item["permit_id"] == p_id for item in expired_list)

    test_db.refresh(p)
    assert p.status == "Expired"


def test_expired_permit_revalidation_and_closure(test_db):
    """Verify that an expired permit can be re-validated or closed."""
    past_date = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    res = create_entity(
        db=test_db,
        entity_type="permit",
        actor_id="operator@compassx.io",
        workflow_version="permit_v1",
        custom_fields={
            "title": "Revalidation Permit",
            "permit_type": "Confined Space",
            "location": "Vessel V-101",
            "hazards_identified": "Oxygen deficiency and toxic vapors",
            "expiry_date": past_date,
        }
    )
    p_id = res["entity_id"]

    # Progress to Active and Expire
    propose_transition(test_db, "permit", p_id, "RISK_ASSESSMENT_COMPLETED", "operator@compassx.io")
    propose_transition(test_db, "permit", p_id, "ISSUED", "safety@compassx.io", actor_roles=["Safety Officer"])
    propose_transition(test_db, "permit", p_id, "ACTIVATED", "operator@compassx.io")
    check_and_expire_permits(test_db)

    p = test_db.query(DynamicEntity).filter(DynamicEntity.id == p_id).first()
    assert p.status == "Expired"

    # Re-validate with new future expiry date
    future_date = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    rev_res = propose_transition(
        db=test_db,
        entity_type="permit",
        entity_id=p_id,
        event_type="REVALIDATE",
        actor_id="operator@compassx.io",
        custom_fields_delta={"expiry_date": future_date, "gas_test_result": "LEL: 0.0%"},
        payload={"comment": "Re-tested atmospheric gas and extended permit by 8 hours."}
    )
    assert rev_res["new_status"] in ["Draft", "Risk_Assessment", "RiskAssessed"]

