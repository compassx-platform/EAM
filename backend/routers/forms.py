from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.forms import EntityForm
from backend.models.field_registry import EntityField

router = APIRouter(prefix="/forms", tags=["Entity Form Builder"])

GENERIC_FIELD_TYPES = [
    "text",
    "long_text",
    "number",
    "email",
    "phone",
    "url",
    "date",
    "datetime",
    "time",
    "selection",
    "checkbox_group",
    "dropdown",
    "boolean",
]
LEGACY_FIELD_TYPES = ["number", "date", "select", "entity_reference"]
ALLOWED_FIELD_TYPES = GENERIC_FIELD_TYPES + [t for t in LEGACY_FIELD_TYPES if t not in GENERIC_FIELD_TYPES]
OPTION_REQUIRED_TYPES = ("selection", "checkbox_group", "dropdown")

class FormItem(BaseModel):
    i: str
    x: int = 0
    y: int = 0
    w: int = 6
    h: int = 1
    isHeader: bool = False
    label: Optional[str] = None
    fieldName: Optional[str] = None
    fieldType: Optional[str] = None
    required: Optional[bool] = None
    options: Optional[List[str]] = None
    placeholder: Optional[str] = None

class EntityFormRequest(BaseModel):
    entity_type: str
    layout: List[FormItem] = []
    cols: int = 12
    row_height: int = 40

@router.get("")
def list_forms(db: Session = Depends(get_db)):
    """List saved form layouts (summary without field registry)."""
    forms = db.query(EntityForm).order_by(EntityForm.entity_type).all()
    return [
        {
            "entity_type": f.entity_type,
            "cols": f.cols,
            "row_height": f.row_height,
            "item_count": len(f.layout or []),
            "updated_at": f.updated_at.isoformat() if f.updated_at else None,
        }
        for f in forms
    ]

@router.get("/{entity_type}")
def get_form(entity_type: str, db: Session = Depends(get_db)):
    """Returns saved layout merged with the field registry for the entity type."""
    et = entity_type.lower()
    form = db.query(EntityForm).filter(EntityForm.entity_type == et).first()
    fields = (
        db.query(EntityField).filter(EntityField.entity_type == et).order_by(EntityField.field_name).all()
    )
    with_fields = [f.to_dict() for f in fields]

    if not form:
        return {
            "entity_type": et,
            "layout": [],
            "sections": [],
            "cols": 12,
            "row_height": 40,
            "updated_at": None,
            "fields": with_fields,
        }

    result = form.to_dict()
    result["fields"] = with_fields
    return result

@router.post("")
def create_or_update_form(req: EntityFormRequest, db: Session = Depends(get_db)):
    et = req.entity_type.lower().strip()
    if not et:
        raise HTTPException(status_code=400, detail="entity_type is required")

    known = {
        f.field_name for f in db.query(EntityField).filter(EntityField.entity_type == et).all()
    }

    seen: Dict[str, Any] = {}
    cleaned = []
    for item in req.layout:
        i = item.i.strip()
        if not i or i in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate or empty layout item id '{i}'")
        seen[i] = True

        w = max(1, min(item.w, req.cols))
        h = max(1, item.h)

        if item.isHeader:
            cleaned.append({
                "i": i,
                "x": max(0, item.x),
                "y": max(0, item.y),
                "w": w,
                "h": h,
                "isHeader": True,
                "label": (item.label or i.replace("header:", "").replace("_", " ")).strip() or "Section",
            })
            continue

        # Generic field item: carries its own inline definition (no registry lookup needed).
        if item.fieldType:
            ft = item.fieldType
            if ft not in ALLOWED_FIELD_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid field_type '{ft}'. Allowed types: {ALLOWED_FIELD_TYPES}"
                )
            name = (item.fieldName or i).strip()
            if not name:
                raise HTTPException(
                    status_code=400,
                    detail=f"Field item '{i}' is missing a field name"
                )

            options = []
            for o in item.options or []:
                s = str(o).strip()
                if s and s not in options:
                    options.append(s)
            if ft in OPTION_REQUIRED_TYPES and not options:
                raise HTTPException(
                    status_code=400,
                    detail=f"Field '{name}' requires at least one option"
                )

            cleaned.append({
                "i": i,
                "x": max(0, item.x),
                "y": max(0, item.y),
                "w": w,
                "h": h,
                "isHeader": False,
                "label": (item.label or name).strip(),
                "fieldName": name,
                "fieldType": ft,
                "required": bool(item.required),
                "options": options,
                "placeholder": (item.placeholder or "").strip() or None,
            })
            continue

        # Legacy field item: references a field registered in the field registry.
        if i not in known:
            raise HTTPException(
                status_code=400,
                detail=f"Field '{i}' is not registered for entity type '{et}'. Register it via POST /api/fields first.",
            )
        cleaned.append({
            "i": i,
            "x": max(0, item.x),
            "y": max(0, item.y),
            "w": w,
            "h": h,
            "isHeader": False,
            "label": None,
        })

    form = db.query(EntityForm).filter(EntityForm.entity_type == et).first()
    if form:
        form.layout = cleaned
        form.cols = req.cols
        form.row_height = req.row_height
    else:
        form = EntityForm(
            entity_type=et,
            layout=cleaned,
            cols=req.cols,
            row_height=req.row_height,
        )
        db.add(form)

    db.commit()
    db.refresh(form)
    return form.to_dict()

@router.delete("/{entity_type}")
def delete_form(entity_type: str, db: Session = Depends(get_db)):
    et = entity_type.lower()
    form = db.query(EntityForm).filter(EntityForm.entity_type == et).first()
    if not form:
        raise HTTPException(status_code=404, detail=f"No form layout for entity type '{et}'")
    db.delete(form)
    db.commit()
    return {"deleted": True, "entity_type": et}