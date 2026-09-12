from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.field_registry import EntityField
from backend.services import list_service

router = APIRouter(prefix="/fields", tags=["Entity Fields Registry"])

class EntityFieldRequest(BaseModel):
    entity_type: str
    field_name: str
    field_type: str  # 'text' | 'number' | 'date' | 'select' | 'entity_reference'
    required: bool = False
    select_options: Optional[List[str]] = []
    option_list_key: Optional[str] = None
    reference_entity_type: Optional[str] = None

@router.get("")
def list_fields(entity_type: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = db.query(EntityField)
    if entity_type:
        query = query.filter(EntityField.entity_type == entity_type.lower())
    fields = query.order_by(EntityField.entity_type, EntityField.field_name).all()
    return [f.to_dict() for f in fields]

@router.post("")
def create_or_update_field(req: EntityFieldRequest, db: Session = Depends(get_db)):
    valid_types = ["text", "number", "date", "select", "entity_reference"]
    if req.field_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid field_type '{req.field_type}'. Allowed types: {valid_types}"
        )
        
    if req.field_type == "entity_reference" and not req.reference_entity_type:
        raise HTTPException(
            status_code=400,
            detail="reference_entity_type is required when field_type is 'entity_reference'"
        )

    option_list_key = (req.option_list_key or "").strip().lower() or None
    if option_list_key:
        if req.field_type != "select":
            raise HTTPException(
                status_code=400,
                detail="option_list_key is only supported for field_type 'select'"
            )
        published = list_service.get_latest_published(db, option_list_key)
        if not published:
            raise HTTPException(
                status_code=400,
                detail=f"List '{option_list_key}' has no published version — publish it before referencing it"
            )
        if published.kind != "options":
            raise HTTPException(
                status_code=400,
                detail=f"List '{option_list_key}' is kind '{published.kind}'; a select field needs an 'options' list"
            )

    entity_type = req.entity_type.lower()
    field = db.query(EntityField).filter(
        EntityField.entity_type == entity_type,
        EntityField.field_name == req.field_name
    ).first()

    if field:
        field.field_type = req.field_type
        field.required = req.required
        field.select_options = req.select_options if not option_list_key else None
        field.option_list_key = option_list_key
        field.reference_entity_type = req.reference_entity_type
    else:
        field = EntityField(
            entity_type=entity_type,
            field_name=req.field_name,
            field_type=req.field_type,
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
    field = db.query(EntityField).filter(
        EntityField.entity_type == entity_type.lower(),
        EntityField.field_name == field_name
    ).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")

    db.delete(field)
    db.commit()
    return {"deleted": True, "entity_type": entity_type, "field_name": field_name}
