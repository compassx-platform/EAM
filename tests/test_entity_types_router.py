"""Tests for the entity-types router: field-driven creation wizard and delete-field guards."""

import pytest
from fastapi import HTTPException

from backend.models.field_registry import EntityField
from backend.models.forms import EntityForm
from backend.models.conditions import ConditionDefinition
from backend.routers.forms import get_form
from backend.routers.fields import list_fields, delete_field
from backend.routers.entity_types import (
    CreateEntityTypeRequest,
    EntityFieldIn,
    create_entity_type,
    get_entity_type,
)


def wizard_fields():
    return [
        EntityFieldIn(field_name="title", field_type="text", required=True, label="Title"),
        EntityFieldIn(field_name="description", field_type="text", label="Description"),
        EntityFieldIn(field_name="priority", field_type="select", required=True,
                      select_options=["Low", "Medium", "High"]),
        EntityFieldIn(field_name="severity", field_type="select",
                      option_list_key="permit_type"),
        EntityFieldIn(field_name="location", field_type="text"),
        EntityFieldIn(field_name="incident_date", field_type="date"),
        EntityFieldIn(field_name="reported_cost", field_type="number"),
        EntityFieldIn(field_name="linked_workorder", field_type="entity_reference",
                      reference_entity_type="workorder"),
    ]


def test_create_entity_with_fields_creates_registry_and_form(test_db):
    req = CreateEntityTypeRequest(
        name="incident_report",
        display_name="Incident Report",
        description="Field-driven incident tracking",
        fields=wizard_fields(),
    )
    result = create_entity_type(req, test_db)

    assert result["name"] == "incident_report"
    assert result["display_name"] == "Incident Report"
    assert result["is_system"] is False

    fields = {f["field_name"]: f for f in list_fields("incident_report", test_db)}
    assert set(fields) == {
        "title", "description", "priority", "severity",
        "location", "incident_date", "reported_cost", "linked_workorder",
    }
    # Labels carry through the registry
    assert fields["title"]["label"] == "Title"
    assert fields["linked_workorder"]["reference_entity_type"] == "workorder"
    # Published central list wired to the select (inline options cleared)
    assert fields["severity"]["option_list_key"] == "permit_type"
    assert fields["severity"]["select_options"] == []

    # Auto-generated form layout covers every field
    form = get_form("incident_report", test_db)
    layout_names = [
        (it.get("fieldName") or it.get("field_name") or it.get("i"))
        for it in form["layout"]
        if not it.get("isHeader") and not it.get("isGroup") and not it.get("is_group")
    ]
    assert set(layout_names) >= {"title", "description", "priority", "severity",
                                 "location", "incident_date", "reported_cost", "linked_workorder"}
    assert form["cols"] == 12

    # get_entity_type confirms the same metrics
    detail = get_entity_type("incident_report", test_db)
    assert detail["field_count"] == 8
    assert detail["has_form"] is True


def test_create_entity_without_fields_keeps_legacy_baseline(test_db):
    req = CreateEntityTypeRequest(name="legacy_entity", display_name="Legacy Entity")
    result = create_entity_type(req, test_db)
    assert get_entity_type("legacy_entity", test_db)["field_count"] == 2

    fields = {f["field_name"] for f in list_fields("legacy_entity", test_db)}
    assert fields == {"title", "description"}

    form = get_form("legacy_entity", test_db)
    shape = {it["i"]: it for it in form["layout"]}
    assert set(shape) == {"title", "description"}
    assert shape["title"]["required"] is True


def test_create_entity_duplicate_field_names_rejected(test_db):
    req = CreateEntityTypeRequest(
        name="dup_check",
        display_name="Dup Check",
        fields=[
            EntityFieldIn(field_name="priority", field_type="select",
                          select_options=["Low", "High"]),
            EntityFieldIn(field_name="priority", field_type="text"),
        ],
    )
    with pytest.raises(HTTPException) as exc:
        create_entity_type(req, test_db)
    assert exc.value.status_code == 400
    assert "Duplicate field name" in str(exc.value.detail)
    # Transaction aborted — no partial entity left behind
    with pytest.raises(HTTPException):
        get_entity_type("dup_check", test_db)


def test_create_entity_reserved_field_name_rejected(test_db):
    req = CreateEntityTypeRequest(
        name="reserved_check",
        display_name="Reserved Check",
        fields=[EntityFieldIn(field_name="status", field_type="text")],
    )
    with pytest.raises(HTTPException) as exc:
        create_entity_type(req, test_db)
    assert exc.value.status_code == 400
    assert "reserved" in str(exc.value.detail)


def test_create_entity_options_config_not_enforced_at_field_level(test_db):
    # Options / lists are configured in the form builder, so the field registry
    # accepts them without enforcing availability.
    req = CreateEntityTypeRequest(
        name="chk_check",
        display_name="Chk Check",
        fields=[EntityFieldIn(field_name="checks", field_type="select",
                              option_list_key="permit_safety_checklist")],
    )
    entity = create_entity_type(req, test_db)
    assert entity["name"] == "chk_check"

    # Nonexistent / unpublished list also accepted at field level
    req = CreateEntityTypeRequest(
        name="list_check",
        display_name="List Check",
        fields=[EntityFieldIn(field_name="pick", field_type="select",
                              option_list_key="ghost_list")],
    )
    entity = create_entity_type(req, test_db)
    assert entity["name"] == "list_check"

    # Inline select with zero options accepted at field level too
    req = CreateEntityTypeRequest(
        name="empty_opt",
        display_name="Empty Opt",
        fields=[EntityFieldIn(field_name="pick", field_type="select", select_options=[])],
    )
    entity = create_entity_type(req, test_db)
    assert entity["name"] == "empty_opt"


def test_create_entity_entity_reference_requires_existing_target(test_db):
    req = CreateEntityTypeRequest(
        name="ref_check",
        display_name="Ref Check",
        fields=[EntityFieldIn(field_name="ghost_link", field_type="entity_reference",
                              reference_entity_type="does_not_exist")],
    )
    with pytest.raises(HTTPException) as exc:
        create_entity_type(req, test_db)
    assert exc.value.status_code == 400
    assert "does not exist" in str(exc.value.detail)


def test_delete_field_blocked_by_auto_generated_form(test_db):
    create_entity_type(CreateEntityTypeRequest(
        name="asset_check",
        display_name="Asset Check",
        fields=[EntityFieldIn(field_name="location", field_type="text")],
    ), test_db)

    with pytest.raises(HTTPException) as exc:
        delete_field("asset_check", "location", test_db)
    assert exc.value.status_code == 400
    assert "referenced by: Form layout" in str(exc.value.detail)

    # After the layout reference is removed, deletion succeeds
    form = test_db.query(EntityForm).filter(EntityForm.entity_type == "asset_check").first()
    form.layout = []
    test_db.commit()

    delete_field("asset_check", "location", test_db)
    assert list_fields("asset_check", test_db) == []


def test_delete_field_blocked_by_condition_definition_reference(test_db):
    create_entity_type(CreateEntityTypeRequest(
        name="incident_report",
        display_name="Incident Report",
        fields=wizard_fields(),
    ), test_db)

    # A live condition references the 'location' field -> must block deletion
    test_db.add(ConditionDefinition(
        id="cond_location_required",
        entity_type="incident_report",
        label="Location Required",
        type="structured",
        definition={
            "logic": "AND",
            "rules": [{"type": "attribute", "field": "location", "operator": "is_not_empty"}],
        },
        current_version=1,
        failure_policy="block",
    ))
    test_db.commit()

    with pytest.raises(HTTPException) as exc:
        delete_field("incident_report", "location", test_db)
    assert exc.value.status_code == 400
    assert "Condition 'Location Required'" in str(exc.value.detail)


def test_delete_field_blocked_by_workflow_definition_reference(test_db):
    from backend.models.workflow import WorkflowDefinition
    from backend.models.base import generate_uuid

    create_entity_type(CreateEntityTypeRequest(
        name="incident_report",
        display_name="Incident Report",
        fields=wizard_fields(),
    ), test_db)

    test_db.add(WorkflowDefinition(
        id=generate_uuid(),
        entity_type="incident_report",
        version_label="v1",
        status="draft",
        definition={
            "states": ["Open", "Closed"],
            "transitions": [
                {"from": "Open", "event": "CLOSE", "to": "Closed", "conditions": []}
            ],
            "auto_transitions": [
                {"from": "Open", "event": "ESCALATE",
                 "when": [{"type": "attribute", "field": "reported_cost",
                           "operator": "gt", "value": 1000}]}
            ],
        },
    ))
    test_db.commit()

    with pytest.raises(HTTPException) as exc:
        delete_field("incident_report", "reported_cost", test_db)
    assert exc.value.status_code == 400
    assert "Workflow 'v1'" in str(exc.value.detail)


def test_list_fields_returns_blockers_for_referenced_fields(test_db):
    create_entity_type(CreateEntityTypeRequest(
        name="blocker_test",
        display_name="Blocker Test",
        fields=[
            EntityFieldIn(field_name="checklist1", field_type="text", label="Checklist1"),
            EntityFieldIn(field_name="custom_note", field_type="text", label="Custom Note"),
        ],
    ), test_db)

    # Both fields exist in auto-generated form layout
    fields = {f["field_name"]: f for f in list_fields("blocker_test", test_db)}
    assert "checklist1" in fields
    assert any("Form layout item" in b for b in fields["checklist1"].get("blockers", []))

    # Remove custom_note from form layout
    form = test_db.query(EntityForm).filter(EntityForm.entity_type == "blocker_test").first()
    form.layout = [it for it in form.layout if (it.get("fieldName") or it.get("field_name") or it.get("i")) != "checklist1:custom_note" and it.get("fieldName") != "custom_note" and it.get("i") != "field:custom_note"]
    test_db.commit()

    fields_after = {f["field_name"]: f for f in list_fields("blocker_test", test_db)}
    assert fields_after["custom_note"].get("blockers") == []
    assert any("Form layout item" in b for b in fields_after["checklist1"].get("blockers", []))


def test_dynamic_entity_records_crud(client, test_db):
    from backend.models.workflow import WorkflowDefinition
    from backend.models.base import generate_uuid

    # 1. Create dynamic entity type
    res_type = client.post("/api/entity-types", json={
        "name": "pttt",
        "display_name": "PTTT Custom",
        "description": "Custom entity type test",
    })
    assert res_type.status_code == 200

    # 2. Add published workflow for pttt
    test_db.add(WorkflowDefinition(
        id=generate_uuid(),
        entity_type="pttt",
        version_label="v1",
        status="published",
        definition={
            "states": ["Draft", "Active", "Closed"],
            "terminal_states": ["Closed"],
            "transitions": [
                {"from": "Draft", "event": "ACTIVATE", "to": "Active", "conditions": []},
                {"from": "Active", "event": "CLOSE", "to": "Closed", "conditions": []},
            ],
            "auto_transitions": [],
        },
    ))
    test_db.commit()

    # 3. List records before creating any
    res_list_empty = client.get("/api/pttt")
    assert res_list_empty.status_code == 200
    assert res_list_empty.json()["total"] == 0
    assert res_list_empty.json()["items"] == []

    # 4. Create record
    res_create = client.post("/api/pttt/create", json={
        "custom_fields": {"title": "PTTT Sample Record", "description": "Testing CRUD"},
    })
    assert res_create.status_code == 200
    rec_id = res_create.json()["entity_id"]
    assert res_create.json()["status"] == "Draft"

    # 5. List records after creation
    res_list = client.get("/api/pttt")
    assert res_list.status_code == 200
    assert res_list.json()["total"] == 1
    assert res_list.json()["items"][0]["id"] == rec_id

    # 6. Get detail
    res_detail = client.get(f"/api/pttt/{rec_id}")
    assert res_detail.status_code == 200
    assert res_detail.json()["entity"]["id"] == rec_id
    assert len(res_detail.json()["events"]) >= 1

    # 7. Valid transitions
    res_trans = client.get(f"/api/pttt/{rec_id}/valid-transitions")
    assert res_trans.status_code == 200
    assert len(res_trans.json()["valid_transitions"]) == 1
    assert res_trans.json()["valid_transitions"][0]["event_type"] == "ACTIVATE"

    # 8. Transition
    res_act = client.post("/api/pttt/transition", json={
        "entity_id": rec_id,
        "event_type": "ACTIVATE",
    })
    assert res_act.status_code == 200
    assert res_act.json()["new_status"] == "Active"


def test_delete_dynamic_entity_type_cascade(client, test_db):
    from backend.models.workflow import WorkflowDefinition, GateInstance
    from backend.models.conditions import ConditionDefinition, ConditionVersion
    from backend.models.base import generate_uuid

    # 1. Create dynamic entity type
    client.post("/api/entity-types", json={
        "name": "pttt_del",
        "display_name": "PTTT Delete Test",
        "description": "Custom entity type to delete",
    })

    # 2. Add workflow, condition with version, and gate
    test_db.add(WorkflowDefinition(
        id=generate_uuid(),
        entity_type="pttt_del",
        version_label="v1",
        status="published",
        definition={"states": ["Draft", "Active"], "transitions": []},
    ))
    c = ConditionDefinition(
        id="cond_pttt_test",
        entity_type="pttt_del",
        label="Test Condition",
        type="simple",
        definition={"logic": "AND", "rules": []},
    )
    test_db.add(c)
    test_db.commit()

    test_db.add(ConditionVersion(
        id=generate_uuid(),
        condition_id="cond_pttt_test",
        version=1,
        label="Test Condition v1",
        definition={"logic": "AND", "rules": []},
    ))
    test_db.add(GateInstance(
        id="gate_pttt_test",
        entity_type="pttt_del",
        gate_type="role_check",
        label="Gate Test",
        params={},
    ))
    test_db.commit()

    # 3. Create a record and trigger an event
    res_create = client.post("/api/pttt_del/create", json={
        "custom_fields": {"title": "Delete Record", "description": "Temp"},
    })
    assert res_create.status_code == 200

    # 4. Call DELETE /api/entity-types/pttt_del
    res_del = client.delete("/api/entity-types/pttt_del")
    assert res_del.status_code == 200
    assert res_del.json()["deleted"] is True
    assert res_del.json()["name"] == "pttt_del"

    # 5. Confirm 404 on get
    res_get = client.get("/api/entity-types/pttt_del")
    assert res_get.status_code == 404


def test_delete_all_entity_types_remains_empty(client, test_db):
    # Fetch all existing entity types and delete every one
    res_list = client.get("/api/entity-types")
    assert res_list.status_code == 200
    for et in res_list.json():
        res_del = client.delete(f"/api/entity-types/{et['name']}")
        assert res_del.status_code == 200

    # Query list again - it should be completely empty and NOT recreate defaults
    res_after = client.get("/api/entity-types")
    assert res_after.status_code == 200
    assert res_after.json() == []