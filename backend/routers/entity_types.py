import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, inspect, text

from backend.database import get_db
from backend.models.entity_type import EntityTypeDefinition
from backend.models.entities import get_entity_models, DynamicEntity, DynamicEntityEvent
from backend.models.field_registry import (
    EntityField,
    FIELD_TYPES,
)
from backend.models.workflow import WorkflowDefinition, GateInstance
from backend.models.forms import EntityForm
from backend.models.conditions import ConditionDefinition, ConditionVersion

router = APIRouter(prefix="/entity-types", tags=["Entity Types Management"])

VALID_FIELD_TYPES = FIELD_TYPES

# Reserved names: runtime columns on every entity record plus workflow/condition pseudo-fields.
RESERVED_FIELD_NAMES = {
    "id", "entity_type", "status", "workflow_version", "workflow_states",
    "version_label", "last_event_id", "created_at", "updated_at", "_workflow_status",
}

_FIELD_TYPE_PATTERN = "|".join(sorted(FIELD_TYPES))

class EntityFieldIn(BaseModel):
    field_name: str = Field(..., min_length=1, max_length=100)
    field_type: str = Field(..., pattern=f"^({_FIELD_TYPE_PATTERN})$")
    label: Optional[str] = None
    required: bool = False
    select_options: Optional[List[str]] = []
    option_list_key: Optional[str] = None
    reference_entity_type: Optional[str] = None
    autonumber_sequence: Optional[str] = None
    autonumber_level: Optional[str] = None

class CreateEntityTypeRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=50, description="Slug identifier, e.g. 'incident_report'")
    display_name: str = Field(..., min_length=2, max_length=100, description="Human-readable title, e.g. 'Incident Report'")
    description: Optional[str] = ""
    icon: Optional[str] = "Layers"
    fields: Optional[List[EntityFieldIn]] = None
    statuses: Optional[List[dict]] = None
    children: Optional[List[dict]] = None
    list_columns: Optional[List[dict]] = None
    """Optional field schemas defined at creation time. When omitted, baseline
    title and description fields (and matching form) are initialized."""

class UpdateEntityTypeRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    statuses: Optional[List[dict]] = None
    children: Optional[List[dict]] = None
    list_columns: Optional[List[dict]] = None


BUILTIN_LIST_COLUMNS = (
    "title",
    "id",
    "status",
    "workflow_stage",
    "workflow_version",
    "updated_at",
    "created_at",
)
EXCLUDED_LIST_FIELD_TYPES = {"file", "table"}


def _clean_list_columns(items: Optional[List[dict]], fields_by_name: dict) -> List[dict]:
    """Keep a column only when it is a built-in record value or a field on this entity."""
    cleaned = []
    seen = set()
    for item in items or []:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="A list column must name a built-in value or a field.")
        source = str(item.get("source") or "").strip()
        key = str(item.get("key") or "").strip()
        if source == "builtin":
            if key not in BUILTIN_LIST_COLUMNS:
                raise HTTPException(status_code=400, detail=f"'{key}' is not a record column.")
        elif source == "field":
            field_type = fields_by_name.get(key)
            if field_type is None:
                raise HTTPException(status_code=400, detail=f"'{key}' is not a field on this entity.")
            if field_type in EXCLUDED_LIST_FIELD_TYPES:
                raise HTTPException(status_code=400, detail=f"'{key}' cannot be shown as a list column.")
        else:
            raise HTTPException(status_code=400, detail="A list column must name a built-in value or a field.")
        token = (source, key)
        if token in seen:
            continue
        seen.add(token)
        cleaned.append({"source": source, "key": key})
    return cleaned


def _fields_by_name(db: Session, entity_type: str) -> dict:
    rows = db.query(EntityField).filter(EntityField.entity_type == entity_type).all()
    return {row.field_name: row.field_type for row in rows}


def _clean_children(items: Optional[List[dict]]) -> List[dict]:
    cleaned = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        child_type = str(item.get("entity_type") or "").strip().lower()
        link_field = str(item.get("link_field") or "").strip()
        if child_type and link_field:
            cleaned.append({"entity_type": child_type, "link_field": link_field})
    return cleaned

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

def _validate_field_input(req: EntityFieldIn, db: Session) -> EntityFieldIn:
    """Shared validation mirroring routers/fields.py, plus reserved/duplicate checks."""
    key = _field_slug(req.field_name)
    if len(key) < 2:
        raise HTTPException(status_code=400, detail=f"Field name '{req.field_name}' is invalid — use lowercase letters, numbers and underscores.")
    req.field_name = key
    if key in RESERVED_FIELD_NAMES:
        raise HTTPException(status_code=400, detail=f"Field name '{key}' is reserved by the platform and cannot be used.")

    if req.field_type == "entity_reference" and (req.reference_entity_type or "").strip():
        target = (req.reference_entity_type or "").strip().lower() or None
        exists = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == target).first()
        if not exists:
            raise HTTPException(status_code=400, detail=f"Reference entity type '{target}' does not exist")
        req.reference_entity_type = target

    req.option_list_key = (req.option_list_key or "").strip().lower() or None
    req.select_options = [str(o).strip() for o in (req.select_options or []) if str(o).strip()]

    req.label = (req.label or _humanize(key)).strip() or None
    from backend.routers.fields import _autonumber_binding
    req.autonumber_sequence, req.autonumber_level = _autonumber_binding(
        req.field_type, req.autonumber_sequence, req.autonumber_level
    )
    return req

def _default_form_layout(fields: List[EntityFieldIn]) -> List[dict]:
    """Builds a baseline grid layout from the wizard-defined field schemas so the
    runtime create form works immediately after entity creation."""
    layout: List[dict] = []
    y = 0
    for f in fields:
        name = f.field_name
        if name == "title":
            field_type, h, w = "text", 2, 12
        elif name == "description":
            field_type, h, w = "long_text", 3, 12
        else:
            field_type, h, w = _widget_for_field_type(f.field_type, f.option_list_key, f.select_options)
        layout.append({
            "i": f"field:{name}",
            "x": 0,
            "y": y,
            "w": w,
            "h": h,
            "fieldName": name,
            "fieldType": field_type,
            "required": bool(f.required),
            "label": f.label or _humanize(name),
            "options": f.select_options or [],
            "optionsList": f.option_list_key or None,
        })
        y += h
    return layout

def _widget_for_field_type(field_type: str, option_list_key: str, select_options: List[str]):
    """Maps a registry field type to the default form widget + grid size."""
    if field_type == "select" or field_type == "dropdown":
        return "dropdown", 1, 6
    if field_type == "selection":
        return "selection", 2, 6
    if field_type == "checkbox_group":
        return "checkbox_group", 2, 6
    if field_type == "boolean":
        return "boolean", 1, 6
    if field_type == "long_text":
        return "long_text", 3, 12
    if field_type == "number":
        return "number", 1, 6
    if field_type == "date":
        return "date", 1, 6
    if field_type == "datetime":
        return "datetime", 1, 6
    if field_type == "time":
        return "time", 1, 6
    if field_type == "email":
        return "email", 1, 6
    if field_type == "phone":
        return "phone", 1, 6
    if field_type == "url":
        return "url", 1, 6
    if field_type == "table":
        return "table", 3, 12
    if field_type == "checklist":
        return "checklist", 4, 12
    if field_type == "file":
        return "file", 2, 12
    if field_type == "asset":
        return "asset", 2, 12
    if field_type == "asset_table":
        return "asset_table", 3, 12
    if field_type == "safety_plan":
        return "safety_plan", 3, 12
    return "text", 1, 6

@router.get("")
def list_entity_types(db: Session = Depends(get_db)):
    """
    Returns all registered entity types along with live summary metrics
    (fields count, workflow count, forms, and live records count).
    """
    entity_types = db.query(EntityTypeDefinition).order_by(
        EntityTypeDefinition.display_name.asc()
    ).all()

    results = []
    for et in entity_types:
        item = et.to_dict()
        key = et.name.lower()

        # Count fields
        item["field_count"] = db.query(EntityField).filter(EntityField.entity_type == key).count()

        # Count workflows
        wfs = db.query(WorkflowDefinition).filter(WorkflowDefinition.entity_type == key).all()
        item["workflow_count"] = len(wfs)
        item["has_published_workflow"] = any(w.status == "published" for w in wfs)

        # Count conditions
        item["condition_count"] = db.query(ConditionDefinition).filter(ConditionDefinition.entity_type == key).count()

        # Form status
        form = db.query(EntityForm).filter(EntityForm.entity_type == key).first()
        item["has_form"] = bool(form and form.layout)
        item["form_count"] = len(form.layout) if (form and form.layout) else 0

        # Live record count
        try:
            item["record_count"] = db.query(DynamicEntity).filter(DynamicEntity.entity_type == key).count()
        except Exception:
            item["record_count"] = 0

        results.append(item)

    return results

@router.get("/{name}")
def get_entity_type(name: str, db: Session = Depends(get_db)):
    key = name.strip().lower()
    et = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == key).first()
    if not et:
        raise HTTPException(status_code=404, detail=f"Entity type '{name}' not found")
    
    item = et.to_dict()
    item["field_count"] = db.query(EntityField).filter(EntityField.entity_type == key).count()
    wfs = db.query(WorkflowDefinition).filter(WorkflowDefinition.entity_type == key).all()
    item["workflow_count"] = len(wfs)
    item["has_published_workflow"] = any(w.status == "published" for w in wfs)
    form = db.query(EntityForm).filter(EntityForm.entity_type == key).first()
    item["has_form"] = bool(form and form.layout)
    item["form_count"] = len(form.layout) if (form and form.layout) else 0

    try:
        item["record_count"] = db.query(DynamicEntity).filter(DynamicEntity.entity_type == key).count()
    except Exception:
        item["record_count"] = 0

    return item


@router.post("")
def create_entity_type(req: CreateEntityTypeRequest, db: Session = Depends(get_db)):
    key = _slugify(req.name)
    if not key or len(key) < 2:
        raise HTTPException(status_code=400, detail="Entity type identifier must contain at least 2 alphanumeric characters")

    existing = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == key).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"An entity type with identifier '{key}' already exists")

    statuses = req.statuses if req.statuses is not None else [
        {"id": "DRAFT", "label": "Draft", "category": "draft", "color": "gray"},
        {"id": "UNDER_REVIEW", "label": "Under Review", "category": "review", "color": "blue"},
        {"id": "APPROVED", "label": "Approved", "category": "approved", "color": "indigo"},
        {"id": "ACTIVE", "label": "Active / Live", "category": "in_progress", "color": "emerald"},
        {"id": "SUSPENDED", "label": "Suspended", "category": "pending", "color": "amber"},
        {"id": "COMPLETED", "label": "Completed", "category": "completed", "color": "blue"},
        {"id": "CLOSED", "label": "Closed", "category": "terminal", "color": "slate"},
        {"id": "EXPIRED", "label": "Expired", "category": "terminal", "color": "rose"},
        {"id": "CANCELLED", "label": "Cancelled", "category": "terminal", "color": "zinc"},
    ]

    new_et = EntityTypeDefinition(
        name=key,
        display_name=req.display_name.strip(),
        description=req.description.strip() if req.description else "",
        icon=req.icon or "Layers",
        statuses=statuses,
        children=_clean_children(req.children),
        is_system=False,
    )
    db.add(new_et)

    # Field schemas defined during the creation wizard (validation first, so a
    # failure aborts the whole transaction rather than leaving a partial entity).
    if req.fields is not None:
        validated: List[EntityFieldIn] = []
        seen = set()
        for f in req.fields:
            v = _validate_field_input(f, db)
            if v.field_name in seen:
                raise HTTPException(status_code=400, detail=f"Duplicate field name '{v.field_name}'")
            seen.add(v.field_name)
            validated.append(v)

        for v in validated:
            db.add(EntityField(
                entity_type=key,
                field_name=v.field_name,
                field_type=v.field_type,
                label=v.label,
                required=v.required,
                select_options=v.select_options,
                option_list_key=v.option_list_key,
                reference_entity_type=v.reference_entity_type,
                autonumber_sequence=v.autonumber_sequence,
                autonumber_level=v.autonumber_level,
            ))
        db.add(EntityForm(
            entity_type=key,
            cols=12,
            row_height=40,
            layout=_default_form_layout(validated),
            sections=[],
        ))
    else:
        # Legacy behavior: baseline title + description schema and matching form.
        title_field = EntityField(entity_type=key, field_name="title", field_type="text", required=True)
        desc_field = EntityField(entity_type=key, field_name="description", field_type="text", required=False)
        db.add(title_field)
        db.add(desc_field)
        db.add(EntityForm(
            entity_type=key,
            cols=12,
            row_height=40,
            layout=[
                {"i": "title", "x": 0, "y": 0, "w": 12, "h": 2, "label": "Title", "fieldType": "text", "required": True},
                {"i": "description", "x": 0, "y": 2, "w": 12, "h": 3, "label": "Description", "fieldType": "textarea", "required": False},
            ],
            sections=[],
        ))

    new_et.list_columns = _clean_list_columns(req.list_columns, _fields_by_name(db, key))

    from backend.models.entity_type import EntityTypeVersion
    from backend.models.base import generate_uuid, utc_now

    db.add(EntityTypeVersion(
        id=generate_uuid(),
        name=key,
        version_number=1,
        version_label="v1",
        display_name=new_et.display_name,
        description=new_et.description,
        icon=new_et.icon,
        fields_snapshot=[f.to_dict() for f in db.query(EntityField).filter(EntityField.entity_type == key).all()],
        statuses=statuses,
        created_at=utc_now(),
    ))

    db.commit()
    db.refresh(new_et)
    return new_et.to_dict()


@router.put("/{name}")
def update_entity_type(name: str, req: UpdateEntityTypeRequest, db: Session = Depends(get_db)):
    key = name.strip().lower()
    et = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == key).first()
    if not et:
        raise HTTPException(status_code=404, detail=f"Entity type '{name}' not found")

    new_display = req.display_name.strip() if req.display_name is not None and req.display_name.strip() else et.display_name
    new_desc = req.description.strip() if req.description is not None else et.description
    new_icon = req.icon.strip() if req.icon is not None else et.icon
    new_statuses = req.statuses if req.statuses is not None else et.statuses
    new_children = _clean_children(req.children) if req.children is not None else (et.children or [])
    new_columns = (
        _clean_list_columns(req.list_columns, _fields_by_name(db, key))
        if req.list_columns is not None
        else (et.list_columns or [])
    )

    has_changed = (
        et.display_name != new_display
        or (et.description or "").strip() != (new_desc or "").strip()
        or (et.icon or "").strip() != (new_icon or "").strip()
        or et.statuses != new_statuses
        or (et.children or []) != new_children
        or (et.list_columns or []) != new_columns
    )

    if has_changed:
        new_v = (et.version_number or 1) + 1
        et.version_number = new_v
        et.version_label = f"v{new_v}"
        et.display_name = new_display
        et.description = new_desc
        et.icon = new_icon
        et.statuses = new_statuses
        et.children = new_children
        et.list_columns = new_columns

        from backend.models.entity_type import EntityTypeVersion
        from backend.models.base import generate_uuid, utc_now
        db.add(EntityTypeVersion(
            id=generate_uuid(),
            name=key,
            version_number=new_v,
            version_label=f"v{new_v}",
            display_name=et.display_name,
            description=et.description,
            icon=et.icon,
            fields_snapshot=[f.to_dict() for f in db.query(EntityField).filter(EntityField.entity_type == key).all()],
            statuses=new_statuses,
            created_at=utc_now(),
        ))
        db.commit()
        db.refresh(et)
    return et.to_dict()


@router.get("/{name}/history")
def get_entity_type_history(name: str, db: Session = Depends(get_db)):
    key = name.strip().lower()
    from backend.models.entity_type import EntityTypeVersion
    versions = (
        db.query(EntityTypeVersion)
        .filter(EntityTypeVersion.name == key)
        .order_by(EntityTypeVersion.version_number.desc(), EntityTypeVersion.created_at.desc())
        .all()
    )
    return [v.to_dict() for v in versions]

@router.delete("/{name}")
def delete_entity_type(name: str, db: Session = Depends(get_db)):
    key = name.strip().lower()
    et = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == key).first()
    if not et:
        raise HTTPException(status_code=404, detail=f"Entity type '{name}' not found")

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
    return {"deleted": True, "name": key}
