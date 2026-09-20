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

class CreateEntityTypeRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=50, description="Slug identifier, e.g. 'incident_report'")
    display_name: str = Field(..., min_length=2, max_length=100, description="Human-readable title, e.g. 'Incident Report'")
    description: Optional[str] = ""
    icon: Optional[str] = "Layers"
    fields: Optional[List[EntityFieldIn]] = None
    """Optional field schemas defined at creation time. When omitted, baseline
    title and description fields (and matching form) are initialized."""

class UpdateEntityTypeRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None

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

    new_et = EntityTypeDefinition(
        name=key,
        display_name=req.display_name.strip(),
        description=req.description.strip() if req.description else "",
        icon=req.icon or "Layers",
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
