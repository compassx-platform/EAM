"""
Forms module MCP tools for CompassX EAM.

Provides tools for inspecting, designing, versioning, and configuring form layouts,
sections, groups, field controls, shared option lists, and stage-form visibility bindings.
"""

from typing import Dict, Any, Optional, List
from backend.mcp_server.context import get_db_session
from backend.models.forms import EntityForm, FormVersion
from backend.models.field_registry import EntityField
from backend.models.workflow import WorkflowDefinition
from backend.models.base import generate_uuid, utc_now
from backend.services import list_service


ALLOWED_FIELD_TYPES = [
    "text", "long_text", "number", "email", "phone", "url", "date",
    "datetime", "time", "selection", "checkbox_group", "dropdown",
    "boolean", "table", "checklist", "file", "file_attachment", "attachment",
    "select", "entity_reference",
]
OPTION_REQUIRED_TYPES = ("selection", "checkbox_group", "dropdown", "table")
LIST_REQUIRED_TYPES = ("checklist",)


def _published_workflow_states(db, entity_type: str):
    wf = (
        db.query(WorkflowDefinition)
        .filter(
            WorkflowDefinition.entity_type == entity_type.lower(),
            WorkflowDefinition.status == "published",
        )
        .order_by(WorkflowDefinition.created_at.desc(), WorkflowDefinition.version_label.desc())
        .first()
    )
    if not wf:
        return [], None

    definition = wf.definition or {}
    states = [s for s in definition.get("states", []) if isinstance(s, str) and s.strip()]
    initial_state = states[0] if states else None
    for t in definition.get("transitions", []):
        if t.get("from") in (None, "") or t.get("event") in ("CREATED", "CREATE"):
            to_state = t.get("to")
            if isinstance(to_state, str) and to_state.strip():
                initial_state = to_state
                break
    return states, initial_state


def forms_list() -> Dict[str, Any]:
    """
    List all saved entity form layouts with summary metadata.
    """
    with get_db_session() as db:
        forms = db.query(EntityForm).order_by(EntityForm.entity_type).all()
        return {
            "success": True,
            "count": len(forms),
            "forms": [
                {
                    "entity_type": f.entity_type,
                    "version_label": f.version_label,
                    "version_number": f.version_number,
                    "cols": f.cols,
                    "row_height": f.row_height,
                    "item_count": len(f.layout or []),
                    "updated_at": f.updated_at.isoformat() if f.updated_at else None,
                }
                for f in forms
            ],
        }


def forms_get(entity_type: str) -> Dict[str, Any]:
    """
    Retrieve form layout, registered fields, and workflow state bindings for an entity type.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder', 'permit')
    """
    with get_db_session() as db:
        et = entity_type.strip().lower()
        form = db.query(EntityForm).filter(EntityForm.entity_type == et).first()
        fields = (
            db.query(EntityField).filter(EntityField.entity_type == et).order_by(EntityField.field_name).all()
        )
        with_fields = [f.to_dict() for f in fields]
        workflow_states, initial_state = _published_workflow_states(db, et)

        if not form:
            result = {
                "entity_type": et,
                "has_form": False,
                "layout": [],
                "cols": 12,
                "row_height": 40,
                "fields": with_fields,
                "workflow_states": workflow_states,
                "initial_state": initial_state,
            }
            return {
                "success": True,
                "has_form": False,
                "entity_type": et,
                "form": result,
                "fields": with_fields,
                "workflow_states": workflow_states,
                "initial_state": initial_state,
            }

        result = form.to_dict()
        result["has_form"] = True
        result["fields"] = with_fields
        result["workflow_states"] = workflow_states
        result["initial_state"] = initial_state
        return {
            "success": True,
            "has_form": True,
            "entity_type": et,
            "form": result,
            "fields": with_fields,
            "workflow_states": workflow_states,
            "initial_state": initial_state,
        }


def forms_save(
    entity_type: str,
    layout: List[Dict[str, Any]],
    cols: int = 12,
    row_height: int = 40,
) -> Dict[str, Any]:
    """
    Save or update an entity form layout with automatic version snapshotting.

    Validates grid items, groups, headers, and ensures field items match registered
    fields for the entity type.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder')
        layout: List of form items (each with i, x, y, w, h, label, fieldName, fieldType, etc.)
        cols: Grid columns (default 12)
        row_height: Grid row height in pixels (default 40)
    """
    with get_db_session() as db:
        et = entity_type.strip().lower()
        if not et:
            return {"success": False, "error": "entity_type is required"}

        known = {
            f.field_name for f in db.query(EntityField).filter(EntityField.entity_type == et).all()
        }
        used = set()
        seen = set()
        cleaned = []

        for raw_item in layout:
            item = dict(raw_item)
            i = str(item.get("i", "")).strip()
            if not i or i in seen:
                return {"success": False, "error": f"Duplicate or empty layout item id '{i}'"}
            seen.add(i)

            w = max(1, min(int(item.get("w", 6)), cols))
            h = max(1, int(item.get("h", 1)))
            is_grp = bool(item.get("isGroup") or item.get("is_group") or i.startswith("group:"))
            is_hdr = bool(item.get("isHeader") or item.get("is_header") or i.startswith("header:"))
            group_id = (item.get("group_id") or item.get("groupId") or ("" if not is_grp else i)).strip() or None
            group_title = (item.get("group_title") or item.get("groupTitle") or (item.get("label") if is_grp else "") or "").strip() or None
            vis_cond = item.get("visibility_condition") or item.get("visibilityCondition") or None

            if is_hdr or is_grp:
                cleaned.append({
                    "i": i,
                    "x": max(0, int(item.get("x", 0))),
                    "y": max(0, int(item.get("y", 0))),
                    "w": w,
                    "h": h,
                    "isHeader": is_hdr,
                    "isGroup": is_grp,
                    "label": (item.get("label") or i.replace("header:", "").replace("group:", "").replace("_", " ")).strip() or ("Section" if is_hdr else "Group"),
                    "group_id": group_id,
                    "groupId": group_id,
                    "group_title": group_title,
                    "groupTitle": group_title,
                    "visibility_condition": vis_cond,
                    "visibilityCondition": vis_cond,
                })
                continue

            ft = item.get("fieldType") or item.get("field_type")
            if ft:
                if ft not in ALLOWED_FIELD_TYPES:
                    return {"success": False, "error": f"Invalid field_type '{ft}'. Allowed types: {ALLOWED_FIELD_TYPES}"}
                name = (item.get("fieldName") or item.get("field_name") or i).strip()
                if not name:
                    return {"success": False, "error": f"Field item '{i}' is missing a field name"}
                if name in used:
                    return {"success": False, "error": f"Field '{name}' can only be added to the form once"}
                used.add(name)
                if name not in known:
                    return {"success": False, "error": f"Field '{name}' is not registered for entity type '{et}'"}

                options = [str(o).strip() for o in item.get("options") or [] if str(o).strip()]
                options_list = (item.get("options_list") or item.get("optionsList") or "").strip().lower() or None

                cleaned.append({
                    "i": i,
                    "x": max(0, int(item.get("x", 0))),
                    "y": max(0, int(item.get("y", 0))),
                    "w": w,
                    "h": h,
                    "isHeader": False,
                    "isGroup": False,
                    "label": (item.get("label") or name).strip(),
                    "fieldName": name,
                    "fieldType": ft,
                    "required": bool(item.get("required")),
                    "options": options,
                    "options_list": options_list,
                    "optionsList": options_list,
                    "group_id": group_id,
                    "groupId": group_id,
                    "group_title": group_title,
                    "groupTitle": group_title,
                    "visibility_condition": vis_cond,
                    "visibilityCondition": vis_cond,
                    "placeholder": (item.get("placeholder") or "").strip() or None,
                })
                continue

            # Legacy item: references registered field directly
            if i not in known:
                return {"success": False, "error": f"Field '{i}' is not registered for entity type '{et}'"}

            cleaned.append({
                "i": i,
                "x": max(0, int(item.get("x", 0))),
                "y": max(0, int(item.get("y", 0))),
                "w": w,
                "h": h,
                "isHeader": False,
                "isGroup": False,
                "label": item.get("label"),
                "group_id": group_id,
                "groupId": group_id,
                "group_title": group_title,
                "groupTitle": group_title,
                "visibility_condition": vis_cond,
                "visibilityCondition": vis_cond,
            })

        form = db.query(EntityForm).filter(EntityForm.entity_type == et).first()
        if form:
            has_changed = form.layout != cleaned or form.cols != cols or form.row_height != row_height
            if has_changed:
                new_version = (form.version_number or 1) + 1
                form.version_number = new_version
                form.version_label = f"v{new_version}"
                form.layout = cleaned
                form.cols = cols
                form.row_height = row_height
                form.updated_at = utc_now()

                fv = FormVersion(
                    id=generate_uuid(),
                    entity_type=et,
                    version_number=new_version,
                    version_label=f"v{new_version}",
                    layout=cleaned,
                    sections=[],
                    cols=cols,
                    row_height=row_height,
                    created_at=utc_now(),
                )
                db.add(fv)
                db.commit()
                db.refresh(form)
        else:
            form = EntityForm(
                entity_type=et,
                version_number=1,
                version_label="v1",
                layout=cleaned,
                cols=cols,
                row_height=row_height,
            )
            db.add(form)
            fv = FormVersion(
                id=generate_uuid(),
                entity_type=et,
                version_number=1,
                version_label="v1",
                layout=cleaned,
                sections=[],
                cols=cols,
                row_height=row_height,
                created_at=utc_now(),
            )
            db.add(fv)
            db.commit()
            db.refresh(form)

        return {"success": True, "form": form.to_dict()}


def forms_get_history(entity_type: str) -> Dict[str, Any]:
    """
    Get version history of form layouts for an entity type.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder')
    """
    with get_db_session() as db:
        et = entity_type.strip().lower()
        versions = (
            db.query(FormVersion)
            .filter(FormVersion.entity_type == et)
            .order_by(FormVersion.version_number.desc(), FormVersion.created_at.desc())
            .all()
        )
        return {
            "success": True,
            "entity_type": et,
            "count": len(versions),
            "versions": [v.to_dict() for v in versions],
        }


def forms_delete(entity_type: str) -> Dict[str, Any]:
    """
    Delete form layout and version history for an entity type.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder')
    """
    with get_db_session() as db:
        et = entity_type.strip().lower()
        form = db.query(EntityForm).filter(EntityForm.entity_type == et).first()
        if not form:
            return {"success": False, "error": f"No form layout found for '{et}'"}

        db.query(FormVersion).filter(FormVersion.entity_type == et).delete(synchronize_session=False)
        db.delete(form)
        db.commit()
        return {"success": True, "deleted_entity_type": et}
