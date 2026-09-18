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