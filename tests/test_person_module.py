import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.database import Base, get_db
from tests.fixtures import load_test_fixtures
from backend.models.person import Person, PersonGroup, PersonGroupMember, PersonAvailability
from backend.models.users import AppUser
from backend.services.field_validator import validate_custom_fields, FieldValidationError
from backend.services.condition_evaluator import evaluate_atom

def test_seed_persons_and_users(test_db):
    # Verify default persons exist
    for pid in ["ADMIN", "DIANA.MANAGER", "BOB.SUPERVISOR", "ALICE.SAFETY", "CHARLIE.TECH"]:
        p = test_db.query(Person).filter(Person.person_id == pid).first()
        assert p is not None, f"Person {pid} should be seeded"
        assert p.status == "ACTIVE"

    # Verify supervisor hierarchy
    charlie = test_db.query(Person).filter(Person.person_id == "CHARLIE.TECH").first()
    assert charlie.supervisor_id == "BOB.SUPERVISOR"
    bob = test_db.query(Person).filter(Person.person_id == "BOB.SUPERVISOR").first()
    assert bob.supervisor_id == "DIANA.MANAGER"

    # Verify user person_id linkage
    user = test_db.query(AppUser).filter(AppUser.email == "charlie.tech@compassx.io").first()
    assert user is not None
    assert user.person_id == "CHARLIE.TECH"

    # Verify seeded groups
    group_a = test_db.query(PersonGroup).filter(PersonGroup.group_name == "SHIFT_CREW_A").first()
    assert group_a is not None
    assert len(group_a.members) >= 2


def test_create_and_get_person(client):
    # Valid create
    res = client.post("/api/persons", json={
        "person_id": "TEST.ENGINEER",
        "display_name": "Test Engineer",
        "first_name": "Test",
        "last_name": "Engineer",
        "primary_email": "test.engineer@compassx.io",
        "phone": "+1-555-0199",
        "site": "HQ",
        "supervisor_id": "DIANA.MANAGER",
    })
    assert res.status_code == 201
    data = res.json()
    assert data["person_id"] == "TEST.ENGINEER"
    assert data["display_name"] == "Test Engineer"
    assert data["supervisor_id"] == "DIANA.MANAGER"
    assert data["status"] == "ACTIVE"

    # Get by person_id
    res_get = client.get("/api/persons/TEST.ENGINEER")
    assert res_get.status_code == 200
    assert res_get.json()["primary_email"] == "test.engineer@compassx.io"

    # Duplicate person_id rejection
    res_dup = client.post("/api/persons", json={
        "person_id": "TEST.ENGINEER",
        "display_name": "Duplicate Engineer",
    })
    assert res_dup.status_code == 400

    # Invalid supervisor rejection
    res_bad_sup = client.post("/api/persons", json={
        "person_id": "TEST.NOBODY",
        "display_name": "No Supervisor",
        "supervisor_id": "NON_EXISTENT",
    })
    assert res_bad_sup.status_code == 400


def test_update_person(client):
    # Create person
    client.post("/api/persons", json={
        "person_id": "DEV.USER",
        "display_name": "Dev User",
        "primary_email": "dev.user@compassx.io",
    })

    # Update
    res = client.put("/api/persons/DEV.USER", json={
        "display_name": "Senior Dev User",
        "phone": "555-1234",
        "supervisor_id": "DIANA.MANAGER",
        "primary_shift": "Night",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["display_name"] == "Senior Dev User"
    assert data["phone"] == "555-1234"
    assert data["supervisor_id"] == "DIANA.MANAGER"
    assert data["primary_shift"] == "Night"

    # Self supervisor rejection
    res_self = client.put("/api/persons/DEV.USER", json={
        "supervisor_id": "DEV.USER",
    })
    assert res_self.status_code == 400


def test_list_persons_filters(client):
    res_all = client.get("/api/persons")
    assert res_all.status_code == 200
    assert res_all.json()["total"] >= 5

    # Filter by search
    res_search = client.get("/api/persons?search=charlie")
    assert res_search.status_code == 200
    assert len(res_search.json()["items"]) == 1
    assert res_search.json()["items"][0]["person_id"] == "CHARLIE.TECH"

    # Filter by group
    res_group = client.get("/api/persons?group=SHIFT_CREW_A")
    assert res_group.status_code == 200
    pids = [p["person_id"] for p in res_group.json()["items"]]
    assert "CHARLIE.TECH" in pids
    assert "BOB.SUPERVISOR" in pids


def test_delete_person_unreferenced(client):
    # Standalone person with no references can be deleted
    client.post("/api/persons", json={
        "person_id": "TEMP.WORKER",
        "display_name": "Temporary Worker",
    })
    res_del = client.delete("/api/persons/TEMP.WORKER")
    assert res_del.status_code == 200
    assert res_del.json()["deleted"] is True

    # Person linked to app_user cannot be deleted (must inactivate)
    res_user_del = client.delete("/api/persons/ADMIN")
    assert res_user_del.status_code == 409
    assert "delete_blocked" in res_user_del.json()["detail"]["error_code"]


def test_inactivate_and_activate_person(client, test_db):
    # Create isolated person
    client.post("/api/persons", json={
        "person_id": "SOLO.OPERATOR",
        "display_name": "Solo Operator",
        "primary_email": "solo@compassx.io",
    })

    # Inactivate succeeds
    res_inact = client.post("/api/persons/SOLO.OPERATOR/inactivate")
    assert res_inact.status_code == 200
    assert res_inact.json()["inactivated"] is True

    # Person is now INACTIVE
    res_get = client.get("/api/persons/SOLO.OPERATOR")
    assert res_get.json()["status"] == "INACTIVE"

    # Reactivate
    res_act = client.post("/api/persons/SOLO.OPERATOR/activate")
    assert res_act.status_code == 200
    assert res_act.json()["activated"] is True

    # Inactivating person with open work order fails with blockers
    res_block = client.post("/api/persons/CHARLIE.TECH/inactivate")
    assert res_block.status_code == 422
    err_body = res_block.json()["detail"]
    assert err_body["error_code"] == "inactivate_blocked"
    assert len(err_body["blockers"]) > 0


def test_person_availability(client):
    now = datetime.now(timezone.utc)
    from_iso = (now + timedelta(days=1)).isoformat()
    to_iso = (now + timedelta(days=5)).isoformat()

    res = client.post("/api/persons/CHARLIE.TECH/availability", json={
        "reason": "Holiday",
        "available_from": from_iso,
        "available_to": to_iso,
    })
    assert res.status_code == 201
    assert res.json()["reason"] == "Holiday"

    # List availability
    res_list = client.get("/api/persons/CHARLIE.TECH/availability")
    assert res_list.status_code == 200
    assert len(res_list.json()["items"]) >= 1

    # Overlap rejection
    res_overlap = client.post("/api/persons/CHARLIE.TECH/availability", json={
        "reason": "Sick",
        "available_from": (now + timedelta(days=2)).isoformat(),
        "available_to": (now + timedelta(days=4)).isoformat(),
    })
    assert res_overlap.status_code == 409


def test_person_groups_crud(client):
    # Create group with initial member
    res = client.post("/api/person-groups", json={
        "group_name": "SAFETY_COMMITTEE",
        "description": "Safety & Compliance Committee",
        "is_crew_work_group": False,
        "members": [
            {"person_id": "ALICE.SAFETY", "sequence": 1, "is_group_default": True}
        ]
    })
    assert res.status_code == 201
    data = res.json()
    assert data["group_name"] == "SAFETY_COMMITTEE"
    assert len(data["members"]) == 1

    # Add second member
    res_add = client.post("/api/person-groups/SAFETY_COMMITTEE/members", json={
        "person_id": "BOB.SUPERVISOR",
        "sequence": 2,
    })
    assert res_add.status_code == 201
    assert len(res_add.json()["members"]) == 2

    # Update member sequence
    res_upd = client.put("/api/person-groups/SAFETY_COMMITTEE/members/BOB.SUPERVISOR", json={
        "sequence": 5,
        "is_site_default": True,
    })
    assert res_upd.status_code == 200

    # Remove member
    res_rm = client.delete("/api/person-groups/SAFETY_COMMITTEE/members/BOB.SUPERVISOR")
    assert res_rm.status_code == 200

    # Delete group
    res_del = client.delete("/api/person-groups/SAFETY_COMMITTEE")
    assert res_del.status_code == 200
    assert res_del.json()["deleted"] is True


def test_entity_reference_validation(test_db):
    # Valid active person passes
    cleaned = validate_custom_fields(test_db, "workorder", {
        "title": "Repair Generator",
        "priority": "High",
        "assigned_to": "CHARLIE.TECH",
    }, is_create=True)
    assert cleaned["assigned_to"] == "CHARLIE.TECH"

    # Non-existent person fails
    with pytest.raises(FieldValidationError) as exc:
        validate_custom_fields(test_db, "workorder", {
            "title": "Repair Generator",
            "priority": "High",
            "assigned_to": "GHOST.USER",
        }, is_create=True)
    assert "does not exist" in str(exc.value)

    # Inactive person fails
    test_db.query(Person).filter(Person.person_id == "ADMIN").update({"status": "INACTIVE"})
    test_db.commit()
    with pytest.raises(FieldValidationError) as exc:
        validate_custom_fields(test_db, "workorder", {
            "title": "Repair Generator",
            "priority": "High",
            "assigned_to": "ADMIN",
        }, is_create=True)
    assert "not ACTIVE" in str(exc.value)


def test_person_group_condition_atom(test_db):
    # Charlie is member of SHIFT_CREW_A
    atom = {
        "type": "person_group",
        "relationship_field": "assigned_to",
        "group": "SHIFT_CREW_A",
    }
    passed, reason = evaluate_atom(
        atom,
        test_db,
        {"assigned_to": "CHARLIE.TECH"},
        actor_id="admin@compassx.io",
        actor_type="human",
    )
    assert passed is True
    assert "is an active member" in reason

    # Diana is not member of SHIFT_CREW_A
    passed_no, reason_no = evaluate_atom(
        atom,
        test_db,
        {"assigned_to": "DIANA.MANAGER"},
        actor_id="admin@compassx.io",
        actor_type="human",
    )
    assert passed_no is False
    assert "is not an active member" in reason_no


def test_person_related_endpoint(client):
    res = client.get("/api/persons/CHARLIE.TECH/related")
    assert res.status_code == 200
    data = res.json()
    assert data["person_id"] == "CHARLIE.TECH"
    assert len(data["workorders"]) > 0
    assert "SHIFT_CREW_A" in data["groups"]
