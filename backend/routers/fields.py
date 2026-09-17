import re
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.field_registry import (
    EntityField,
    FIELD_TYPES,
)
from backend.models.forms import EntityForm
from backend.models.workflow import WorkflowDefinition
from backend.models.conditions import ConditionDefinition

router = APIRouter(prefix="/fields", tags=["Entity Fields Registry"])

VALID_FIELD_TYPES = FIELD_TYPES

RESERVED_FIELD_NAMES = {
    "id", "entity_type", "status", "workflow_version", "workflow_states",
    "version_label", "last_event_id", "created_at", "updated_at", "_workflow_status",
}

class EntityFieldRequest(BaseModel):
    entity_type: str
    field_name: str
    field_type: str  # 'text' | 'number' | 'date' | 'select' | 'entity_reference'
    label: Optional[str] = None
    required: bool = False
    select_options: Optional[List[str]] = []
    option_list_key: Optional[str] = None
    reference_entity_type: Optional[str] = None

def _field_refs_in(obj: Any, field_name: str, refs: List[str], where: str) -> None:
    """Recursively finds explicit ``field`` references to ``field_name`` in a JSON tree."""
    if isinstance(obj, dict):
        if "field" in obj and str(obj["field"]) == field_name:
            label = str(obj.get("label") or obj.get("type") or "rule")
            refs.append(f"{where}: {label}")
        for v in obj.values():
            _field_refs_in(v, field_name, refs, where)
    elif isinstance(obj, list):
        for v in obj:
            _field_refs_in(v, field_name, refs, where)

def _delete_blockers(db: Session, entity_type: str, field_name: str) -> List[str]:
    blockers: List[str] = []

    form = db.query(EntityForm).filter(EntityForm.entity_type == entity_type).first()
    if form and form.layout:
        for it in form.layout:
            names = {
                str(it.get("id") or ""),
                str(it.get("i") or ""),
                str(it.get("fieldName") or it.get("field_name") or ""),
            }
            if field_name in names:
                label = it.get("label") or it.get("i") or it.get("id") or "form item"
                blockers.append(f"Form layout item '{label}'")
                break

    for wf in db.query(WorkflowDefinition).filter(WorkflowDefinition.entity_type == entity_type).all():
        refs: List[str] = []
        _field_refs_in(wf.definition or {}, field_name, refs, f"Workflow '{wf.version_label}'")
        blockers.extend(refs)

    for cond in db.query(ConditionDefinition).filter(ConditionDefinition.entity_type == entity_type).all():
        refs = []
        _field_refs_in(cond.definition or {}, field_name, refs, f"Condition '{cond.label}'")
        blockers.extend(refs)

    return blockers

@router.get("")
def list_fields(entity_type: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = db.query(EntityField)
    if entity_type:
        query = query.filter(EntityField.entity_type == entity_type.lower())
    fields = query.order_by(EntityField.entity_type, EntityField.field_name).all()
    return [f.to_dict() for f in fields]

@router.post("")
def create_or_update_field(req: EntityFieldRequest, db: Session = Depends(get_db)):
    if req.field_type not in VALID_FIELD_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid field_type '{req.field_type}'. Allowed types: {VALID_FIELD_TYPES}"
        )

    entity_type = req.entity_type.lower()
    field_name = req.field_name.strip().lower()
    if not field_name or not re.match(r'^[a-z][a-z0-9_]*$', field_name):
        raise HTTPException(
            status_code=400,
            detail="field_name must start with a letter and contain only lowercase letters, numbers and underscores"
        )
    if field_name in RESERVED_FIELD_NAMES:
        raise HTTPException(status_code=400, detail=f"Field name '{field_name}' is reserved by the platform and cannot be used.")

    option_list_key = (req.option_list_key or "").strip().lower() or None

    entity_type = req.entity_type.lower()
    req.field_name = field_name

    field = db.query(EntityField).filter(
        EntityField.entity_type == entity_type,
        EntityField.field_name == field_name
    ).first()

    label = (req.label or "").strip() or None
    if field and field.label and not label:
        label = field.label

    if field:
        field.field_type = req.field_type
        field.label = label
        field.required = req.required
        field.select_options = req.select_options if not option_list_key else None
        field.option_list_key = option_list_key
        field.reference_entity_type = req.reference_entity_type
    else:
        field = EntityField(
            entity_type=entity_type,
            field_name=field_name,
            field_type=req.field_type,
            label=label,
            required=req.required,
            select_options=req.select_options if not option_list_key else None,
            option_list_key=option_list_key,
            reference_entity_type=req.reference_entity_type,
        )
        db.add(field)

    db.commit()
    db.refresh(field)
    return field.to_dict()

@router.delete("/{entity_type}/{field_name}")
def delete_field(entity_type: str, field_name: str, db: Session = Depends(get_db)):
    key = entity_type.lower()
    fname = field_name.strip().lower()
    field = db.query(EntityField).filter(
        EntityField.entity_type == key,
        EntityField.field_name == fname
    ).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    blockers = _delete_blockers(db, key, fname)
    if blockers:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete field '{fname}' — it is referenced by: {', '.join(blockers[:8])}"
        )

    db.delete(field)
    db.commit()
    return {"deleted": True, "entity_type": key, "field_name": fname}
