"""Tests for the generic (self-contained) form builder endpoints."""

import pytest
from fastapi import HTTPException

from backend.models.field_registry import EntityField
from backend.routers.forms import (
    EntityFormRequest,
    FormItem,
    create_or_update_form,
    get_form,
)


def _register(db, entity_type, layout):
    """Register the layout's fields so forms only bind to the entity field registry."""
    for it in layout:
        name = (it.get("fieldName") or it.get("field_name") or "").strip()
        if not name:
            continue
        ft = it.get("fieldType")
        if ft == "dropdown":
            ft = "select"
        exists = db.query(EntityField).filter(
            EntityField.entity_type == entity_type.lower(),
            EntityField.field_name == name,
        ).first()
        if not exists and ft:
            row = EntityField(
                entity_type=entity_type.lower(),
                field_name=name,
                field_type=ft,
                required=bool(it.get("required")),
                select_options=list(it.get("options") or []),
            )
            db.add(row)
            db.flush()
    db.commit()


def save(db, entity_type, layout):
    _register(db, entity_type, layout)
    return create_or_update_form(
        EntityFormRequest(entity_type=entity_type, layout=[FormItem(**it) for it in layout]),
        db,
    )


def make_layout():
    return [
        {
            "i": "header:test-1",
            "x": 0, "y": 0, "w": 12, "h": 1,
            "isHeader": True,
            "label": "General",
        },
        {
            "i": "field:test-2",
            "x": 0, "y": 1, "w": 6, "h": 1,
            "fieldName": "title",
            "fieldType": "text",
            "required": True,
            "label": "Title",
            "options": [],
            "placeholder": "Enter a title",
        },
        {
            "i": "field:test-3",
            "x": 0, "y": 2, "w": 6, "h": 2,
            "fieldName": "notes",
            "fieldType": "long_text",
            "required": False,
            "label": "Notes",
            "options": [],
            "placeholder": "Details…",
        },
        {
            "i": "field:test-4",
            "x": 0, "y": 3, "w": 6, "h": 1,
            "fieldName": "risk",
            "fieldType": "selection",
            "required": True,
            "label": "Risk",
            "options": ["Low", "High"],
            "placeholder": None,
        },
        {
            "i": "field:test-5",
            "x": 0, "y": 4, "w": 6, "h": 1,
            "fieldName": "priority",
            "fieldType": "dropdown",
            "required": True,
            "label": "Priority",
            "options": ["Low", "Medium", "High"],
            "placeholder": None,
        },
    ]


def test_save_and_get_generic_form(test_db):
    created = save(test_db, "training", make_layout())
    assert created["entity_type"] == "training"
    items = {it["i"]: it for it in created["layout"]}

    assert items["field:test-2"]["fieldName"] == "title"
    assert items["field:test-2"]["fieldType"] == "text"
    assert items["field:test-2"]["required"] is True
    assert items["field:test-2"]["placeholder"] == "Enter a title"

    assert items["field:test-3"]["fieldType"] == "long_text"
    assert items["field:test-4"]["fieldType"] == "selection"
    assert items["field:test-4"]["options"] == ["Low", "High"]
    assert items["field:test-5"]["fieldType"] == "dropdown"
    assert items["field:test-5"]["options"] == ["Low", "Medium", "High"]

    stored = get_form("training", test_db)
    stored_items = {it["i"]: it for it in stored["layout"]}
    assert stored_items["field:test-4"]["fieldType"] == "selection"


def test_selection_and_dropdown_require_options(test_db):
    layout = make_layout()
    layout[3]["options"] = []
    with pytest.raises(HTTPException) as exc:
        save(test_db, "training", layout)
    assert exc.value.status_code == 400
    assert "at least one option" in str(exc.value.detail)

    layout = make_layout()
    layout[4]["options"] = [""]
    with pytest.raises(HTTPException) as exc:
        save(test_db, "training", layout)
    assert exc.value.status_code == 400


def test_unknown_field_type_rejected(test_db):
    layout = make_layout()
    layout[3]["fieldType"] = "slider"
    with pytest.raises(HTTPException) as exc:
        save(test_db, "training", layout)
    assert exc.value.status_code == 400
    assert "Invalid field_type" in str(exc.value.detail)


def test_new_scalar_types_accepted(test_db):
    layout = make_layout()
    extra = [
        {"i": "field:test-6", "x": 0, "y": 5, "w": 6, "h": 1, "fieldName": "email", "fieldType": "email", "required": False, "options": [], "placeholder": None},
        {"i": "field:test-7", "x": 0, "y": 6, "w": 6, "h": 1, "fieldName": "phone", "fieldType": "phone", "placeholder": None},
        {"i": "field:test-8", "x": 0, "y": 7, "w": 6, "h": 1, "fieldName": "website", "fieldType": "url", "placeholder": None},
        {"i": "field:test-9", "x": 0, "y": 8, "w": 6, "h": 1, "fieldName": "due", "fieldType": "datetime", "placeholder": None},
        {"i": "field:test-10", "x": 0, "y": 9, "w": 6, "h": 1, "fieldName": "start", "fieldType": "time", "placeholder": None},
        {"i": "field:test-11", "x": 0, "y": 10, "w": 6, "h": 1, "fieldName": "cost", "fieldType": "number", "placeholder": None},
        {"i": "field:test-12", "x": 0, "y": 11, "w": 6, "h": 1, "fieldName": "enabled", "fieldType": "boolean", "placeholder": None},
    ]
    created = save(test_db, "training", layout + extra)
    stored = {it["i"]: it for it in created["layout"]}
    assert stored["field:test-12"]["fieldType"] == "boolean"
    assert get_form("training", test_db)["layout"][-1]["fieldType"] == "boolean"


def test_checkbox_group_requires_options_and_round_trips(test_db):
    layout = make_layout()
    layout.append(
        {"i": "field:test-13", "x": 0, "y": 5, "w": 6, "h": 2, "fieldName": "certifications", "fieldType": "checkbox_group", "required": False, "options": [], "placeholder": None}
    )
    with pytest.raises(HTTPException) as exc:
        save(test_db, "training", layout)
    assert exc.value.status_code == 400
    assert "at least one option" in str(exc.value.detail)

    layout[-1]["options"] = ["Safety", "Quality"]
    created = save(test_db, "training", layout)
    stored = {it["i"]: it for it in created["layout"]}
    assert stored["field:test-13"]["options"] == ["Safety", "Quality"]


def test_table_requires_columns_and_round_trips(test_db):
    layout = make_layout()
    layout.append(
        {"i": "field:test-14", "x": 0, "y": 5, "w": 12, "h": 3, "fieldName": "lototo_table", "fieldType": "table", "required": False, "options": [], "placeholder": None}
    )
    with pytest.raises(HTTPException) as exc:
        save(test_db, "training", layout)
    assert exc.value.status_code == 400
    assert "at least one option" in str(exc.value.detail)

    layout[-1]["options"] = ["Equipment", "Lock / Tag No.", "Key Holder", "Remarks"]
    created = save(test_db, "training", layout)
    stored = {it["i"]: it for it in created["layout"]}
    assert stored["field:test-14"]["fieldType"] == "table"
    assert stored["field:test-14"]["options"] == ["Equipment", "Lock / Tag No.", "Key Holder", "Remarks"]
    assert stored["field:test-14"]["w"] == 12


def test_duplicate_field_placement_rejected(test_db):
    layout = make_layout()
    dup = dict(layout[1])
    dup["i"] = "field:test-dup"
    dup["y"] = 9
    with pytest.raises(HTTPException) as exc:
        save(test_db, "training", layout + [dup])
    assert exc.value.status_code == 400
    assert "only be added to the form once" in str(exc.value.detail)


def test_missing_field_name_rejected(test_db):
    layout = make_layout()
    layout[1]["fieldName"] = "  "
    with pytest.raises(HTTPException) as exc:
        save(test_db, "training", layout)
    assert exc.value.status_code == 400
    assert "missing a field name" in str(exc.value.detail)


def test_legacy_registered_field_item_still_allowed(test_db):
    layout = [
        {"i": "title", "x": 0, "y": 0, "w": 6, "h": 1, "isHeader": False, "label": None}
    ]
    created = save(test_db, "workorder", layout)
    assert created["layout"][0]["i"] == "title"
    stored = get_form("workorder", test_db)
    assert stored["layout"][0]["i"] == "title"


def test_legacy_unregistered_field_item_rejected(test_db):
    layout = [
        {"i": "ghost_field", "x": 0, "y": 0, "w": 6, "h": 1, "isHeader": False, "label": None}
    ]
    with pytest.raises(HTTPException) as exc:
        create_or_update_form(
            EntityFormRequest(entity_type="workorder", layout=[FormItem(**it) for it in layout]),
            test_db,
        )
    assert exc.value.status_code == 400
    assert "not registered" in str(exc.value.detail)


def test_form_hidden_options_round_trips(test_db):
    from backend.services.list_service import save_draft, publish_draft
    draft = save_draft(test_db, "priority_list", "options", ["Low", "Medium", "High", "Critical"])
    publish_draft(test_db, draft)
    test_db.commit()

    layout = [
        {
            "i": "field:prio",
            "x": 0, "y": 0, "w": 6, "h": 1,
            "fieldName": "priority",
            "fieldType": "selection",
            "required": True,
            "label": "Priority",
            "options": [],
            "options_list": "priority_list",
            "hidden_options": ["Low", "Critical"],
        },
        {
            "i": "field:chk",
            "x": 0, "y": 1, "w": 6, "h": 2,
            "fieldName": "custom_checks",
            "fieldType": "checkbox_group",
            "required": False,
            "label": "Checks",
            "options": ["Opt1", "Opt2", "Opt3"],
            "hiddenOptions": ["Opt2"],
        }
    ]
    created = save(test_db, "workorder", layout)
    stored = {it["i"]: it for it in created["layout"]}
    assert stored["field:prio"]["options_list"] == "priority_list"
    assert stored["field:prio"]["hidden_options"] == ["Low", "Critical"]
    assert stored["field:chk"]["options"] == ["Opt1", "Opt2", "Opt3"]
    assert stored["field:chk"]["hidden_options"] == ["Opt2"]

    fetched = get_form("workorder", test_db)
    fetched_stored = {it["i"]: it for it in fetched["layout"]}
    assert fetched_stored["field:prio"]["hidden_options"] == ["Low", "Critical"]
    assert fetched_stored["field:chk"]["hidden_options"] == ["Opt2"]


def test_file_attachment_field_round_trip(test_db):
    layout = [
        {
            "i": "field:attach",
            "x": 0, "y": 0, "w": 6, "h": 2,
            "fieldName": "site_photo",
            "fieldType": "file",
            "required": True,
            "label": "Site Photo / Document",
            "accept": ".pdf,.png,.jpg",
            "maxFileSizeMb": 15,
            "allowMultiple": True,
            "maxFiles": 3,
        }
    ]
    created = save(test_db, "workorder", layout)
    stored = {it["i"]: it for it in created["layout"]}
    assert stored["field:attach"]["fieldType"] == "file"
    assert stored["field:attach"]["accept"] == ".pdf,.png,.jpg"
    assert stored["field:attach"]["max_file_size_mb"] == 15
    assert stored["field:attach"]["allow_multiple"] is True
    assert stored["field:attach"]["max_files"] == 3

    fetched = get_form("workorder", test_db)
    fetched_stored = {it["i"]: it for it in fetched["layout"]}
    assert fetched_stored["field:attach"]["accept"] == ".pdf,.png,.jpg"
    assert fetched_stored["field:attach"]["allow_multiple"] is True


def test_multi_condition_and_readonly_round_trip(test_db):
    layout = [
        {
            "i": "field:hazard_type",
            "x": 0, "y": 0, "w": 6, "h": 1,
            "fieldName": "hazard_type",
            "fieldType": "selection",
            "options": ["Chemical", "Electrical", "Mechanical"],
            "label": "Hazard Type",
        },
        {
            "i": "field:ppe_required",
            "x": 0, "y": 1, "w": 6, "h": 1,
            "fieldName": "ppe_required",
            "fieldType": "text",
            "label": "PPE Required",
            "visibility_condition": {
                "action": "readonly",
                "matchType": "all",
                "rules": [
                    {"field": "hazard_type", "operator": "equals", "value": "Chemical"},
                    {"field": "permit_type", "operator": "not_equals", "value": "Standard"}
                ]
            }
        },
        {
            "i": "group:high_risk",
            "x": 0, "y": 2, "w": 12, "h": 2,
            "isGroup": True,
            "label": "High Risk Safety Protocol",
            "visibilityCondition": {
                "action": "show",
                "matchType": "any",
                "rules": [
                    {"field": "hazard_type", "operator": "equals", "value": "Electrical"},
                    {"field": "hazard_type", "operator": "equals", "value": "Chemical"}
                ]
            }
        }
    ]
    created = save(test_db, "permit", layout)
    stored = {it["i"]: it for it in created["layout"]}
    cond_ppe = stored["field:ppe_required"]["visibility_condition"]
    assert cond_ppe["action"] == "readonly"
    assert cond_ppe["matchType"] == "all"
    assert len(cond_ppe["rules"]) == 2
    assert cond_ppe["rules"][0]["field"] == "hazard_type"
    assert cond_ppe["rules"][0]["operator"] == "equals"

    cond_group = stored["group:high_risk"]["visibility_condition"]
    assert cond_group["action"] == "show"
    assert cond_group["matchType"] == "any"
    assert len(cond_group["rules"]) == 2

    fetched = get_form("permit", test_db)
    fetched_stored = {it["i"]: it for it in fetched["layout"]}
    assert fetched_stored["field:ppe_required"]["visibility_condition"]["action"] == "readonly"
    assert fetched_stored["group:high_risk"]["visibility_condition"]["matchType"] == "any"


def test_form_aware_entity_field_validation(test_db):
    from backend.services.field_validator import validate_custom_fields, FieldValidationError
    # Layout with a custom dynamic form field not in field_registry
    layout = [
        {
            "i": "field:dynamic_custom",
            "x": 0, "y": 0, "w": 6, "h": 1,
            "fieldName": "safety_marshal_signoff",
            "fieldType": "text",
            "required": True,
            "label": "Safety Marshal Sign-off",
        }
    ]
    save(test_db, "workorder", layout)

    # Missing required form field raises FieldValidationError
    with pytest.raises(FieldValidationError) as exc:
        validate_custom_fields(
            db=test_db,
            entity_type="workorder",
            custom_fields={"title": "Test WO"},
            is_create=True,
        )
    assert "Safety Marshal Sign-off" in str(exc.value)

    # Validates cleanly because it's defined on the active form layout
    cleaned = validate_custom_fields(
        db=test_db,
        entity_type="workorder",
        custom_fields={"title": "Test WO", "safety_marshal_signoff": "Approved by Officer Alex"},
        is_create=True,
    )
    assert cleaned["safety_marshal_signoff"] == "Approved by Officer Alex"
