from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.workflow import GateInstance
from backend.models.base import generate_uuid

router = APIRouter(prefix="/gates", tags=["Gate Instances"])

# Closed Gate Types Metadata (Section 3.5)
GATE_TYPES_CATALOG = [
    {
        "gate_type": "role_check",
        "name": "Role Check",
        "description": "Requires the actor executing the transition to possess a specific role (e.g. Safety Officer, Supervisor).",
        "parameters": [
            {"name": "role", "label": "Required Role", "type": "string", "required": True, "description": "Name of role required"}
        ]
    },
    {
        "gate_type": "numeric_threshold",
        "name": "Numeric Threshold",
        "description": "Compares an entity numeric custom field against a threshold value (e.g. estimated_cost ≤ 10000).",
        "parameters": [
            {"name": "field", "label": "Field Name", "type": "field_select", "field_type": "number", "required": True},
            {"name": "operator", "label": "Operator", "type": "select", "options": ["<=", "<", ">=", ">", "="], "required": True},
            {"name": "value", "label": "Threshold Value", "type": "number", "required": True}
        ]
    },
    {
        "gate_type": "field_not_empty",
        "name": "Field Not Empty",
        "description": "Verifies that a specified custom field has been filled and is non-empty.",
        "parameters": [
            {"name": "field", "label": "Field Name", "type": "field_select", "required": True}
        ]
    },
    {
        "gate_type": "date_check",
        "name": "Date Comparison",
        "description": "Compares an entity date field against another date or the current timestamp 'now'.",
        "parameters": [
            {"name": "field", "label": "Field Name", "type": "field_select", "field_type": "date", "required": True},
            {"name": "operator", "label": "Operator", "type": "select", "options": ["<", "<=", ">", ">=", "="], "required": True},
            {"name": "value", "label": "Compare Against", "type": "string", "default": "now", "required": True}
        ]
    },
    {
        "gate_type": "related_entity_status_check",
        "name": "Related Entity Status Check",
        "description": "Follows an entity_reference custom field to the target entity and validates its status (e.g. Linked Permit must be Active).",
        "parameters": [
            {"name": "relationship_field", "label": "Relationship Field (on this entity)", "type": "field_select", "field_type": "entity_reference", "required": True},
            {"name": "target_entity_type", "label": "Target Entity Type", "type": "string", "required": True},
            {"name": "required_status", "label": "Required Target Status", "type": "string", "required": True}
        ]
    },
]

class GateInstanceRequest(BaseModel):
    id: Optional[str] = None
    entity_type: str
    gate_type: str
    label: str
    params: Dict[str, Any] = {}
    failure_policy: str = "block"  # 'block' | 'allow'

@router.get("/types")
def get_gate_types():
    """Returns the closed fixed registry of gate types (Section 3.5)"""
    return GATE_TYPES_CATALOG

@router.get("")
def list_gates(entity_type: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = db.query(GateInstance)
    if entity_type:
        query = query.filter(GateInstance.entity_type == entity_type.lower())
    gates = query.order_by(GateInstance.entity_type, GateInstance.label).all()
    return [g.to_dict() for g in gates]

@router.get("/{id}")
def get_gate(id: str, db: Session = Depends(get_db)):
    gate = db.query(GateInstance).filter(GateInstance.id == id).first()
    if not gate:
        raise HTTPException(status_code=404, detail="Gate instance not found")
    return gate.to_dict()

@router.post("")
def create_or_update_gate(req: GateInstanceRequest, db: Session = Depends(get_db)):
    valid_types = {gt["gate_type"] for gt in GATE_TYPES_CATALOG}
    if req.gate_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown gate_type '{req.gate_type}'. Fixed registry includes: {list(valid_types)}"
        )

    gate_id = req.id or f"gate_{req.entity_type}_{req.gate_type}_{generate_uuid()[:6]}"
    
    gate = db.query(GateInstance).filter(GateInstance.id == gate_id).first()
    if gate:
        gate.entity_type = req.entity_type.lower()
        gate.gate_type = req.gate_type
        gate.label = req.label
        gate.params = req.params
        gate.failure_policy = req.failure_policy
    else:
        gate = GateInstance(
            id=gate_id,
            entity_type=req.entity_type.lower(),
            gate_type=req.gate_type,
            label=req.label,
            params=req.params,
            failure_policy=req.failure_policy,
        )
        db.add(gate)

    db.commit()
    db.refresh(gate)
    return gate.to_dict()

@router.delete("/{id}")
def delete_gate(id: str, db: Session = Depends(get_db)):
    gate = db.query(GateInstance).filter(GateInstance.id == id).first()
    if not gate:
        raise HTTPException(status_code=404, detail="Gate instance not found")
    db.delete(gate)
    db.commit()
    return {"deleted": True, "id": id}
