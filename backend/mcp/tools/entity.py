"""
Entity module MCP tools for CompassX EAM.

Provides tools for defining and managing entity types (metadata, display names,
icons, lifecycle metrics) and the custom field registry (data types, validation,
relationships, select options, delete-blocker safeguards).
"""

import re
from typing import Dict, Any, Optional, List
from backend.mcp.context import get_db_session
from backend.models.entity_type import EntityTypeDefinition, EntityTypeVersion
from backend.models.entities import DynamicEntity, DynamicEntityEvent
from backend.models.field_registry import EntityField, FIELD_TYPES
from backend.models.workflow import WorkflowDefinition, GateInstance
from backend.models.forms import EntityForm
from backend.models.conditions import ConditionDefinition, ConditionVersion
from backend.models.base import generate_uuid, utc_now

VALID_FIELD_TYPES = FIELD_TYPES
RESERVED_FIELD_NAMES = {
    "id", "entity_type", "status", "workflow_version", "workflow_states",
    "version_label", "last_event_id", "created_at", "updated_at", "_workflow_status",
}


def _slugify(name: str) -> str:
    cleaned = re.sub(r'[^a-zA-Z0-9_]+', '_', name.strip().lower())
    cleaned = re.sub(r'_+', '_', cleaned).strip('_')
    return cleaned


def _field_slug(name: str) -> str:
    cleaned = re.sub(r'[^a-z0-9_]+', '_', name.strip().lower())
    cleaned = re.sub(r'_+', '_', cleaned).strip('_')
    return cleaned


def _humanize(name: str) -> str:
    return " ".join(w.capitalize() for w in name.split("_") if w)


def _delete_field_blockers(db, entity_type: str, field_name: str) -> List[str]:
    blockers: List[str] = []
    fname_lower = field_name.strip().lower()

    form = db.query(EntityForm).filter(EntityForm.entity_type == entity_type.lower()).first()
    if form and form.layout:
        for it in form.layout:
            if it.get("isHeader") or it.get("isGroup") or it.get("is_header") or it.get("is_group"):
                continue
            names = {
                str(it.get("id") or "").strip().lower(),
                str(it.get("i") or "").strip().lower(),
                str(it.get("fieldName") or it.get("field_name") or "").strip().lower(),
            }
            i_val = str(it.get("i") or "").strip().lower()
            if i_val.startswith("field:"):
                names.add(i_val[6:])
            if fname_lower in names:
                label = it.get("label") or it.get("fieldName") or it.get("field_name") or it.get("i") or "form item"
                blockers.append(f"Form layout item '{label}'")
                break

    for wf in db.query(WorkflowDefinition).filter(WorkflowDefinition.entity_type == entity_type.lower()).all():
        defn_str = str(wf.definition or {})
        if f"'{fname_lower}'" in defn_str or f'"{fname_lower}"' in defn_str:
            blockers.append(f"Workflow '{wf.version_label}'")

    for cond in db.query(ConditionDefinition).filter(ConditionDefinition.entity_type == entity_type.lower()).all():
        cond_str = str(cond.definition or {})
        if f"'{fname_lower}'" in cond_str or f'"{fname_lower}"' in cond_str:
            blockers.append(f"Condition '{cond.label}'")

    return blockers


def entity_type_list() -> Dict[str, Any]:
    """
    List all registered entity types along with summary metrics
    (fields count, workflow count, form status, and live record count).
    """
    with get_db_session() as db:
        entity_types = db.query(EntityTypeDefinition).order_by(EntityTypeDefinition.display_name.asc()).all()
        results = []
        for et in entity_types:
            item = et.to_dict()
            key = et.name.lower()
            item["field_count"] = db.query(EntityField).filter(EntityField.entity_type == key).count()
            wfs = db.query(WorkflowDefinition).filter(WorkflowDefinition.entity_type == key).all()
            item["workflow_count"] = len(wfs)
            item["has_published_workflow"] = any(w.status == "published" for w in wfs)
            item["condition_count"] = db.query(ConditionDefinition).filter(ConditionDefinition.entity_type == key).count()
            form = db.query(EntityForm).filter(EntityForm.entity_type == key).first()
            item["has_form"] = bool(form and form.layout)
            try:
                item["record_count"] = db.query(DynamicEntity).filter(DynamicEntity.entity_type == key).count()
            except Exception:
                item["record_count"] = 0
            results.append(item)

        return {"success": True, "count": len(results), "entity_types": results}


def entity_type_get(name: str) -> Dict[str, Any]:
    """
    Get detailed definition and configuration of a specific entity type.

    Args:
        name: Slug or name of the entity type (e.g. 'workorder')
    """
    with get_db_session() as db:
        key = name.strip().lower()
        et = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == key).first()
        if not et:
            return {"success": False, "error": f"Entity type '{name}' not found"}

        item = et.to_dict()
        fields = db.query(EntityField).filter(EntityField.entity_type == key).order_by(EntityField.field_name).all()
        item["fields"] = [f.to_dict() for f in fields]
        item["field_count"] = len(fields)
        wfs = db.query(WorkflowDefinition).filter(WorkflowDefinition.entity_type == key).all()
        item["workflow_count"] = len(wfs)
        item["has_published_workflow"] = any(w.status == "published" for w in wfs)
        try:
            item["record_count"] = db.query(DynamicEntity).filter(DynamicEntity.entity_type == key).count()
        except Exception:
            item["record_count"] = 0

        return {"success": True, "entity_type": item}


def entity_type_create(
    name: str,
    display_name: str,
    description: Optional[str] = "",
    icon: Optional[str] = "Layers",
    fields: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Register a new entity type in the platform.

    Optionally initializes field schemas, default form layout, and version history.

    Args:
        name: Unique slug identifier (e.g. 'incident_report')
        display_name: Human readable label (e.g. 'Incident Report')
        description: Explanatory description
        icon: Lucide icon identifier (default 'Layers')
        fields: Optional list of field definitions (field_name, field_type, label, required, select_options)
    """
    with get_db_session() as db:
        key = _slugify(name)
        if not key or len(key) < 2:
            return {"success": False, "error": "Entity type identifier must contain at least 2 alphanumeric characters"}

        existing = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == key).first()
        if existing:
            return {"success": False, "error": f"Entity type '{key}' already exists"}

        new_et = EntityTypeDefinition(
            name=key,
            display_name=display_name.strip(),
            description=description.strip() if description else "",
            icon=icon or "Layers",
            is_system=False,
        )
        db.add(new_et)

        if fields:
            layout_items = []
            y = 0
            for f in fields:
                fname = _field_slug(f.get("field_name", ""))
                ftype = f.get("field_type", "text")
                flabel = f.get("label") or _humanize(fname)
                freq = bool(f.get("required"))
                foptions = [str(o).strip() for o in f.get("select_options", []) if str(o).strip()]

                db.add(EntityField(
                    entity_type=key,
                    field_name=fname,
                    field_type=ftype,
                    label=flabel,
                    required=freq,
                    select_options=foptions,
                    option_list_key=f.get("option_list_key"),
                    reference_entity_type=f.get("reference_entity_type"),
                ))
                layout_items.append({
                    "i": f"field:{fname}",
                    "x": 0,
                    "y": y,
                    "w": 6 if ftype not in ("long_text", "table", "checklist") else 12,
                    "h": 1 if ftype not in ("long_text", "table", "checklist") else 3,
                    "fieldName": fname,
                    "fieldType": ftype,
                    "required": freq,
                    "label": flabel,
                    "options": foptions,
                })
                y += 1

            db.add(EntityForm(
                entity_type=key,
                cols=12,
                row_height=40,
                layout=layout_items,
                sections=[],
            ))
        else:
            db.add(EntityField(entity_type=key, field_name="title", field_type="text", required=True))
            db.add(EntityField(entity_type=key, field_name="description", field_type="text", required=False))
            db.add(EntityForm(
                entity_type=key,
                cols=12,
                row_height=40,
                layout=[
                    {"i": "title", "x": 0, "y": 0, "w": 12, "h": 2, "label": "Title", "fieldType": "text", "required": True},
                    {"i": "description", "x": 0, "y": 2, "w": 12, "h": 3, "label": "Description", "fieldType": "long_text", "required": False},
                ],
                sections=[],
            ))

        db.add(EntityTypeVersion(
            id=generate_uuid(),
            name=key,
            version_number=1,
            version_label="v1",
            display_name=new_et.display_name,
            description=new_et.description,
            icon=new_et.icon,
            fields_snapshot=[f.to_dict() for f in db.query(EntityField).filter(EntityField.entity_type == key).all()],
            created_at=utc_now(),
        ))
        db.commit()
        db.refresh(new_et)

        return {"success": True, "entity_type": new_et.to_dict()}


def entity_type_update(
    name: str,
    display_name: Optional[str] = None,
    description: Optional[str] = None,
    icon: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update metadata (display name, description, icon) for an entity type.

    Args:
        name: Slug of the entity type (e.g. 'workorder')
        display_name: New display name
        description: New description
        icon: New icon identifier
    """
    with get_db_session() as db:
        key = name.strip().lower()
        et = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == key).first()
        if not et:
            return {"success": False, "error": f"Entity type '{name}' not found"}

        new_display = display_name.strip() if display_name is not None and display_name.strip() else et.display_name
        new_desc = description.strip() if description is not None else et.description
        new_icon = icon.strip() if icon is not None else et.icon

        has_changed = (
            et.display_name != new_display
            or (et.description or "").strip() != (new_desc or "").strip()
            or (et.icon or "").strip() != (new_icon or "").strip()
        )

        if has_changed:
            new_v = (et.version_number or 1) + 1
            et.version_number = new_v
            et.version_label = f"v{new_v}"
            et.display_name = new_display
            et.description = new_desc
            et.icon = new_icon

            db.add(EntityTypeVersion(
                id=generate_uuid(),
                name=key,
                version_number=new_v,
                version_label=f"v{new_v}",
                display_name=et.display_name,
                description=et.description,
                icon=et.icon,
                fields_snapshot=[f.to_dict() for f in db.query(EntityField).filter(EntityField.entity_type == key).all()],
                created_at=utc_now(),
            ))
            db.commit()
            db.refresh(et)

        return {"success": True, "entity_type": et.to_dict()}


def entity_type_delete(name: str) -> Dict[str, Any]:
    """
    Safely delete an entity type and cleanly cascade cleanup of associated records,
    events, conditions, workflows, forms, and fields.

    Args:
        name: Slug of the entity type
    """
    with get_db_session() as db:
        key = name.strip().lower()
        et = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == key).first()
        if not et:
            return {"success": False, "error": f"Entity type '{name}' not found"}

        # 1. Cleanup associated dynamic records and events
        entity_ids = [r[0] for r in db.query(DynamicEntity.id).filter(DynamicEntity.entity_type == key).all()]
        if entity_ids:
            db.query(DynamicEntityEvent).filter(DynamicEntityEvent.entity_id.in_(entity_ids)).delete(synchronize_session=False)
        db.query(DynamicEntity).filter(DynamicEntity.entity_type == key).delete(synchronize_session=False)

        # 2. Cleanup conditions & condition version history
        cond_ids = [c[0] for c in db.query(ConditionDefinition.id).filter(ConditionDefinition.entity_type == key).all()]
        if cond_ids:
            db.query(ConditionVersion).filter(ConditionVersion.condition_id.in_(cond_ids)).delete(synchronize_session=False)
        db.query(ConditionDefinition).filter(ConditionDefinition.entity_type == key).delete(synchronize_session=False)

        # 3. Cleanup gate instances, workflows, forms, and fields
        db.query(GateInstance).filter(GateInstance.entity_type == key).delete(synchronize_session=False)
        db.query(WorkflowDefinition).filter(WorkflowDefinition.entity_type == key).delete(synchronize_session=False)
        db.query(EntityForm).filter(EntityForm.entity_type == key).delete(synchronize_session=False)
        db.query(EntityField).filter(EntityField.entity_type == key).delete(synchronize_session=False)

        # 4. Delete the entity type definition
        db.delete(et)
        db.commit()

        return {"success": True, "deleted": key}


def entity_fields_list(entity_type: Optional[str] = None) -> Dict[str, Any]:
    """
    List registered custom fields (optionally filtered by entity type) with delete-blocker analysis.

    Args:
        entity_type: Optional entity type slug
    """
    with get_db_session() as db:
        query = db.query(EntityField)
        if entity_type:
            query = query.filter(EntityField.entity_type == entity_type.strip().lower())
        fields = query.order_by(EntityField.entity_type, EntityField.field_name).all()

        results = []
        for f in fields:
            d = f.to_dict()
            d["blockers"] = _delete_field_blockers(db, f.entity_type, f.field_name)
            results.append(d)

        return {"success": True, "count": len(results), "fields": results}


def entity_field_create(
    entity_type: str,
    field_name: str,
    field_type: str,
    label: Optional[str] = None,
    required: bool = False,
    select_options: Optional[List[str]] = None,
    option_list_key: Optional[str] = None,
    reference_entity_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Register a new custom field on an entity type.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder')
        field_name: Lowercase identifier (e.g. 'estimated_cost', 'priority')
        field_type: Data type ('text', 'number', 'date', 'select', 'entity_reference', etc.)
        label: Human readable label
        required: Whether the field is mandatory
        select_options: List of allowed values if field_type is select
        option_list_key: Central shared list identifier if using shared list
        reference_entity_type: Target entity type if field_type is entity_reference
    """
    with get_db_session() as db:
        key = entity_type.strip().lower()
        fname = _field_slug(field_name)

        if field_type not in VALID_FIELD_TYPES:
            return {"success": False, "error": f"Invalid field_type '{field_type}'. Allowed types: {sorted(list(VALID_FIELD_TYPES))}"}

        if fname in RESERVED_FIELD_NAMES:
            return {"success": False, "error": f"Field name '{fname}' is reserved by the platform"}

        existing = db.query(EntityField).filter(
            EntityField.entity_type == key,
            EntityField.field_name == fname,
        ).first()

        if existing:
            return {"success": False, "error": f"Field '{fname}' already exists for entity type '{key}'"}

        lbl = (label or _humanize(fname)).strip()
        opts = [str(o).strip() for o in (select_options or []) if str(o).strip()]

        field = EntityField(
            entity_type=key,
            field_name=fname,
            field_type=field_type,
            label=lbl,
            required=bool(required),
            select_options=opts if not option_list_key else None,
            option_list_key=option_list_key.strip().lower() if option_list_key else None,
            reference_entity_type=reference_entity_type.strip().lower() if reference_entity_type else None,
        )
        db.add(field)
        db.commit()
        db.refresh(field)

        return {"success": True, "field": field.to_dict()}


def entity_field_update(
    entity_type: str,
    field_name: str,
    field_type: Optional[str] = None,
    label: Optional[str] = None,
    required: Optional[bool] = None,
    select_options: Optional[List[str]] = None,
    option_list_key: Optional[str] = None,
    reference_entity_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update a registered custom field schema.

    Args:
        entity_type: Slug of the entity type
        field_name: Identifier of the field
        field_type: New field type
        label: New label
        required: New required flag
        select_options: New select options
        option_list_key: New shared list key
        reference_entity_type: New target entity reference
    """
    with get_db_session() as db:
        key = entity_type.strip().lower()
        fname = field_name.strip().lower()

        field = db.query(EntityField).filter(
            EntityField.entity_type == key,
            EntityField.field_name == fname,
        ).first()

        if not field:
            return {"success": False, "error": f"Field '{fname}' not found on '{key}'"}

        if field_type:
            if field_type not in VALID_FIELD_TYPES:
                return {"success": False, "error": f"Invalid field_type '{field_type}'"}
            field.field_type = field_type

        if label is not None:
            field.label = label.strip() or None
        if required is not None:
            field.required = bool(required)
        if select_options is not None:
            field.select_options = [str(o).strip() for o in select_options if str(o).strip()]
        if option_list_key is not None:
            field.option_list_key = option_list_key.strip().lower() or None
        if reference_entity_type is not None:
            field.reference_entity_type = reference_entity_type.strip().lower() or None

        db.commit()
        db.refresh(field)

        d = field.to_dict()
        d["blockers"] = _delete_field_blockers(db, key, fname)
        return {"success": True, "field": d}


def entity_field_delete(entity_type: str, field_name: str) -> Dict[str, Any]:
    """
    Safely delete a custom field. Blocks deletion if referenced in forms,
    workflows, or condition rules.

    Args:
        entity_type: Slug of the entity type
        field_name: Identifier of the field to delete
    """
    with get_db_session() as db:
        key = entity_type.strip().lower()
        fname = field_name.strip().lower()

        field = db.query(EntityField).filter(
            EntityField.entity_type == key,
            EntityField.field_name == fname,
        ).first()

        if not field:
            return {"success": False, "error": f"Field '{fname}' not found on '{key}'"}

        blockers = _delete_field_blockers(db, key, fname)
        if blockers:
            return {
                "success": False,
                "error": f"Cannot delete field '{fname}' — it is referenced by: {', '.join(blockers[:8])}",
                "blockers": blockers,
            }

        db.delete(field)
        db.commit()
        return {"success": True, "deleted_field": fname, "entity_type": key}
