"""Tests for the generic (self-contained) form builder endpoints."""

import pytest
from fastapi import HTTPException

from backend.routers.forms import (
    EntityFormRequest,
    FormItem,
    create_or_update_form,
    get_form,
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


def save(db, entity_type, layout):
    return create_or_update_form(
        EntityFormRequest(entity_type=entity_type, layout=[FormItem(**it) for it in layout]),
        db,
    )


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
    layout[3]["fieldType"] = "checkbox"
    with pytest.raises(HTTPException) as exc:
        save(test_db, "training", layout)
    assert exc.value.status_code == 400
    assert "Invalid field_type" in str(exc.value.detail)


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
        save(test_db, "workorder", layout)
    assert exc.value.status_code == 400
    assert "not registered" in str(exc.value.detail)