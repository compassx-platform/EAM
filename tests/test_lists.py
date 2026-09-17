"""Tests for the central versioned option/checklist list module."""

import pytest
from fastapi import HTTPException

from backend.models.lists import ListDefinition
from backend.models.field_registry import EntityField
from backend.routers.lists import (
    delete_list,
    get_list,
    list_lists,
    list_versions,
    publish_list,
    resolve_lists,
    save_draft,
    ListDraftRequest,
)
from backend.routers.fields import create_or_update_field, EntityFieldRequest
from backend.routers.forms import EntityFormRequest, FormItem, create_or_update_form
from backend.services.field_validator import validate_custom_fields, FieldValidationError


def save(db, list_key="priority", kind="options", items=("Low", "High"), description=""):
    return save_draft(ListDraftRequest(list_key=list_key, kind=kind, items=list(items), description=description), db)


def register_field(db, entity_type, field_name, field_type):
    """Register a form field so form saves only bind to the entity field registry."""
    if field_type == "dropdown":
        field_type = "select"
    exists = db.query(EntityField).filter(
        EntityField.entity_type == entity_type.lower(),
        EntityField.field_name == field_name,
    ).first()
    if not exists:
        db.add(EntityField(
            entity_type=entity_type.lower(),
            field_name=field_name,
            field_type=field_type,
            required=False,
            select_options=[],
        ))
        db.flush()
        db.commit()


def test_draft_save_and_fetch(test_db):
    saved = save(test_db)
    assert saved["status"] == "draft"
    assert saved["items"] == ["Low", "High"]
    assert saved["version_label"] == "draft"

    fetched = get_list("priority", test_db)
    assert fetched["id"] == saved["id"]
    assert fetched["items"] == ["Low", "High"]

    summaries = list_lists(test_db)
    by_key = {s["list_key"]: s for s in summaries}
    assert by_key["priority"]["has_draft"] is True
    assert by_key["priority"]["published_version"] is None


def test_publish_creates_immutable_snapshot(test_db):
    save(test_db)
    result = publish_list("priority", test_db)
    assert result["published"] is True
    published = result["list"]
    assert published["status"] == "published"
    assert published["version_label"] == "v1"
    assert published["published_at"] is not None

    # Editing the draft forks a new draft; the published snapshot is untouched.
    save(test_db, items=("Low", "Medium", "High"))
    draft = get_list("priority", test_db)
    assert draft["status"] == "draft"
    assert draft["items"] == ["Low", "Medium", "High"]

    old = test_db.query(ListDefinition).filter(ListDefinition.id == published["id"]).one()
    assert old.items == ["Low", "High"]


def test_publish_numbering_and_deprecation(test_db):
    save(test_db, items=("A",))
    publish_list("priority", test_db)
    save(test_db, items=("A", "B"))
    publish_list("priority", test_db)
    save(test_db, items=("A", "B", "C"))
    publish_list("priority", test_db)

    versions = list_versions("priority", test_db)
    assert [v["version_label"] for v in versions] == ["v3", "v2", "v1"]
    assert versions[0]["status"] == "published"
    assert versions[1]["status"] == "deprecated"
    assert versions[2]["status"] == "deprecated"


def test_resolve_returns_published_only(test_db):
    save(test_db)
    resolved = resolve_lists("priority,ghost", test_db)
    assert "priority" not in resolved["resolved"]  # not published yet

    publish_list("priority", test_db)
    resolved = resolve_lists("priority,ghost", test_db)
    assert resolved["resolved"]["priority"]["items"] == ["Low", "High"]
    assert resolved["resolved"]["priority"]["version_label"] == "v1"
    assert "ghost" not in resolved["resolved"]


def test_checklist_normalization(test_db):
    saved = save(test_db, kind="checklist", items=[
        {"label": "Fire watch", "required": True, "assigned_role": "Safety Officer"},
        {"label": "Signage up", "required": False},
        {"label": "Fire watch"},  # duplicate label dropped
    ])
    assert saved["items"] == [
        {"label": "Fire watch", "required": True, "assigned_role": "Safety Officer"},
        {"label": "Signage up", "required": False, "assigned_role": None},
    ]


def test_empty_list_rejected(test_db):
    with pytest.raises(HTTPException) as exc:
        save(test_db, items=[])
    assert exc.value.status_code == 400


def test_delete_blocked_while_referenced(test_db):
    save(test_db)
    publish_list("priority", test_db)

    create_or_update_field(
        EntityFieldRequest(
            entity_type="workorder",
            field_name="prio",
            field_type="select",
            required=False,
            select_options=[],
            option_list_key="priority",
        ),
        test_db,
    )

    with pytest.raises(HTTPException) as exc:
        delete_list("priority", test_db)
    assert exc.value.status_code == 400
    assert exc.value.detail["field_count"] == 1
    assert exc.value.detail["fields"][0]["field_name"] == "prio"

    # Removing the reference allows deletion.
    field = test_db.query(EntityField).filter(
        EntityField.entity_type == "workorder",
        EntityField.field_name == "prio",
    ).one()
    test_db.delete(field)
    test_db.commit()
    assert delete_list("priority", test_db)["deleted"] is True


def test_field_validation_resolves_from_published_list(test_db):
    save(test_db, items=("Low", "High"))
    publish_list("priority", test_db)

    create_or_update_field(
        EntityFieldRequest(
            entity_type="training",
            field_name="prio",
            field_type="select",
            required=True,
            select_options=["Old", "Inline"],
            option_list_key="priority",
        ),
        test_db,
    )

    cleaned = validate_custom_fields(test_db, "training", {"prio": "High"}, is_create=True)
    assert cleaned["prio"] == "High"

    with pytest.raises(FieldValidationError) as exc:
        validate_custom_fields(test_db, "training", {"prio": "Inline"}, is_create=True)
    assert "Invalid option" in exc.value.message

    # Inline options were dropped once a published list is referenced.
    field = test_db.query(EntityField).filter(EntityField.entity_type == "training", EntityField.field_name == "prio").one()
    assert field.select_options is None
    assert field.option_list_key == "priority"


def test_field_references_unpublished_list_accepted_at_field_level(test_db):
    # Unpublished list references are allowed in the registry — options/lists are
    # configured and enforced in the form builder instead.
    create_or_update_field(
        EntityFieldRequest(
            entity_type="workorder",
            field_name="prio",
            field_type="select",
            option_list_key="nope",
        ),
        test_db,
    )
    field = test_db.query(EntityField).filter(EntityField.entity_type == "workorder", EntityField.field_name == "prio").one()
    assert field.option_list_key == "nope"
    assert field.select_options is None


def test_checklist_form_item_requires_published_checklist(test_db):
    save(test_db, kind="checklist", items=[{"label": "A", "required": True}])
    publish_list("priority", test_db)
    register_field(test_db, "training", "safety_checks", "checklist")

    checklist_item = {
        "i": "field:clist", "x": 0, "y": 0, "w": 12, "h": 3,
        "fieldName": "safety_checks", "fieldType": "checklist",
        "required": True, "options": [], "options_list": "priority", "placeholder": None,
    }
    created = create_or_update_form(
        EntityFormRequest(entity_type="training", layout=[FormItem(**checklist_item)]),
        test_db,
    )
    stored = {it["i"]: it for it in created["layout"]}
    assert stored["field:clist"]["fieldType"] == "checklist"
    assert stored["field:clist"]["options_list"] == "priority"


def test_checklist_form_item_without_list_rejected(test_db):
    register_field(test_db, "training", "safety_checks", "checklist")
    item = {
        "i": "field:clist", "x": 0, "y": 0, "w": 12, "h": 3,
        "fieldName": "safety_checks", "fieldType": "checklist",
        "required": True, "options": [], "placeholder": None,
    }
    with pytest.raises(HTTPException) as exc:
        create_or_update_form(
            EntityFormRequest(entity_type="training", layout=[FormItem(**item)]),
            test_db,
        )
    assert exc.value.status_code == 400
    assert "checklist" in exc.value.detail


def test_dropdown_may_use_shared_list(test_db):
    save(test_db, items=("Low", "High"))
    publish_list("priority", test_db)
    register_field(test_db, "training", "prio", "dropdown")

    item = {
        "i": "field:prio", "x": 0, "y": 0, "w": 6, "h": 1,
        "fieldName": "prio", "fieldType": "dropdown",
        "required": True, "options": [], "options_list": "priority", "placeholder": None,
    }
    created = create_or_update_form(
        EntityFormRequest(entity_type="training", layout=[FormItem(**item)]),
        test_db,
    )
    stored = {it["i"]: it for it in created["layout"]}
    assert stored["field:prio"]["options_list"] == "priority"
    assert stored["field:prio"]["options"] == []


def test_options_kind_list_rejected_for_checklist_field(test_db):
    save(test_db, items=("Low", "High"))
    publish_list("priority", test_db)
    register_field(test_db, "training", "safety_checks", "checklist")

    item = {
        "i": "field:clist", "x": 0, "y": 0, "w": 12, "h": 3,
        "fieldName": "safety_checks", "fieldType": "checklist",
        "required": True, "options": [], "options_list": "priority", "placeholder": None,
    }
    with pytest.raises(HTTPException) as exc:
        create_or_update_form(
            EntityFormRequest(entity_type="training", layout=[FormItem(**item)]),
            test_db,
        )
    assert exc.value.status_code == 400
    assert "checklist field needs a 'checklist' list" in exc.value.detail


def test_checklist_kind_list_rejected_for_dropdown(test_db):
    save(test_db, kind="checklist", items=[{"label": "A", "required": True}])
    publish_list("priority", test_db)
    register_field(test_db, "training", "prio", "dropdown")

    item = {
        "i": "field:prio", "x": 0, "y": 0, "w": 6, "h": 1,
        "fieldName": "prio", "fieldType": "dropdown",
        "required": True, "options": [], "options_list": "priority", "placeholder": None,
    }
    with pytest.raises(HTTPException) as exc:
        create_or_update_form(
            EntityFormRequest(entity_type="training", layout=[FormItem(**item)]),
            test_db,
        )
    assert exc.value.status_code == 400
    assert "option fields need an 'options' list" in exc.value.detail