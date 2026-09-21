import re
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.workflow_role import WorkflowRole
from backend.models.person import Person, PersonGroup
from backend.services.role_resolver import resolve_workflow_role, resolve_role_definition

ROLE_ID_RE = re.compile(r"^[A-Z0-9][A-Z0-9._\-]{0,49}$")
ALLOWED_ROLE_TYPES = {"PERSON", "PERSON_GROUP", "DATASET_ATTRIBUTE", "EMAIL_ADDRESS"}
ALLOWED_STRATEGIES = {"broadcast", "sequence_first_available", "default_member"}

router = APIRouter(prefix="/roles", tags=["Roles & Task Routing"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RoleCreate(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    role_type: str  # 'PERSON' | 'PERSON_GROUP' | 'DATASET_ATTRIBUTE' | 'EMAIL_ADDRESS'
    person_id: Optional[str] = None
    group_name: Optional[str] = None
    field_name: Optional[str] = None
    email_address: Optional[str] = None
    resolution_strategy: Optional[str] = "broadcast"


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    role_type: Optional[str] = None
    person_id: Optional[str] = None
    group_name: Optional[str] = None
    field_name: Optional[str] = None
    email_address: Optional[str] = None
    resolution_strategy: Optional[str] = None


class RoleResolveRequest(BaseModel):
    custom_fields: Optional[Dict[str, Any]] = None
    entity_data: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_role_id(raw_id: Optional[str], name: str) -> str:
    if raw_id and raw_id.strip():
        candidate = raw_id.strip().upper()
    else:
        slug = re.sub(r"[^A-Z0-9]+", "_", name.strip().upper()).strip("_")
        candidate = f"ROLE_{slug}" if not slug.startswith("ROLE_") else slug
    if not candidate:
        candidate = "ROLE_UNNAMED"
    candidate = candidate[:50]
    if not ROLE_ID_RE.match(candidate):
        raise HTTPException(
            status_code=400,
            detail=f"Role ID '{candidate}' is invalid — use uppercase letters, numbers, '.', '_', '-', max 50 chars",
        )
    return candidate


def _validate_role_params(db: Session, role_type: str, person_id: Optional[str], group_name: Optional[str]):
    t = role_type.upper()
    if t not in ALLOWED_ROLE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role_type '{role_type}'. Allowed types: {sorted(ALLOWED_ROLE_TYPES)}",
        )
    if t == "PERSON" and person_id:
        p = db.query(Person).filter(Person.person_id == person_id.upper()).first()
        if not p:
            raise HTTPException(status_code=400, detail=f"Person '{person_id}' does not exist in People module")
    elif t == "PERSON_GROUP" and group_name:
        g = db.query(PersonGroup).filter(PersonGroup.group_name == group_name.upper()).first()
        if not g:
            raise HTTPException(status_code=400, detail=f"Person group '{group_name}' does not exist")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
def list_roles(
    search: Optional[str] = Query(None, description="Search by ID, name, or description"),
    role_type: Optional[str] = Query(None, description="Filter by role_type"),
    db: Session = Depends(get_db),
):
    query = db.query(WorkflowRole)
    if role_type:
        query = query.filter(WorkflowRole.role_type == role_type.upper())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (WorkflowRole.id.ilike(term))
            | (WorkflowRole.name.ilike(term))
            | (WorkflowRole.description.ilike(term))
            | (WorkflowRole.person_id.ilike(term))
            | (WorkflowRole.group_name.ilike(term))
        )
    roles = query.order_by(WorkflowRole.id.asc()).all()
    return {"items": [r.to_dict() for r in roles], "total": len(roles)}


@router.post("", status_code=201)
def create_role(payload: RoleCreate, db: Session = Depends(get_db)):
    role_id = _normalize_role_id(payload.id, payload.name)
    existing = db.query(WorkflowRole).filter(WorkflowRole.id == role_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Role with ID '{role_id}' already exists")

    role_type = payload.role_type.upper()
    person_id = payload.person_id.upper() if payload.person_id else None
    group_name = payload.group_name.upper() if payload.group_name else None
    strategy = payload.resolution_strategy or "broadcast"
    if strategy not in ALLOWED_STRATEGIES:
        strategy = "broadcast"

    _validate_role_params(db, role_type, person_id, group_name)

    role = WorkflowRole(
        id=role_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        role_type=role_type,
        person_id=person_id,
        group_name=group_name,
        field_name=payload.field_name.strip() if payload.field_name else None,
        email_address=payload.email_address.strip() if payload.email_address else None,
        resolution_strategy=strategy,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role.to_dict()


@router.get("/{role_id}")
def get_role(role_id: str, db: Session = Depends(get_db)):
    role = db.query(WorkflowRole).filter(WorkflowRole.id == role_id.upper()).first()
    if not role:
        raise HTTPException(status_code=404, detail=f"Role '{role_id}' not found")
    return role.to_dict()


@router.put("/{role_id}")
def update_role(role_id: str, payload: RoleUpdate, db: Session = Depends(get_db)):
    role = db.query(WorkflowRole).filter(WorkflowRole.id == role_id.upper()).first()
    if not role:
        raise HTTPException(status_code=404, detail=f"Role '{role_id}' not found")

    if payload.name is not None:
        role.name = payload.name.strip()
    if payload.description is not None:
        role.description = payload.description.strip() if payload.description else None
    if payload.role_type is not None:
        role.role_type = payload.role_type.upper()
    if payload.person_id is not None:
        role.person_id = payload.person_id.upper() if payload.person_id else None
    if payload.group_name is not None:
        role.group_name = payload.group_name.upper() if payload.group_name else None
    if payload.field_name is not None:
        role.field_name = payload.field_name.strip() if payload.field_name else None
    if payload.email_address is not None:
        role.email_address = payload.email_address.strip() if payload.email_address else None
    if payload.resolution_strategy is not None:
        if payload.resolution_strategy in ALLOWED_STRATEGIES:
            role.resolution_strategy = payload.resolution_strategy

    _validate_role_params(db, role.role_type, role.person_id, role.group_name)

    db.commit()
    db.refresh(role)
    return role.to_dict()


@router.delete("/{role_id}")
def delete_role(role_id: str, db: Session = Depends(get_db)):
    role = db.query(WorkflowRole).filter(WorkflowRole.id == role_id.upper()).first()
    if not role:
        raise HTTPException(status_code=404, detail=f"Role '{role_id}' not found")
    db.delete(role)
    db.commit()
    return {"deleted": True, "id": role_id.upper()}


@router.post("/{role_id}/resolve")
def resolve_role_endpoint(
    role_id: str,
    payload: Optional[RoleResolveRequest] = None,
    db: Session = Depends(get_db),
):
    """
    Tests dynamic resolution of a WorkflowRole with live check of Person availability and active delegates.
    """
    fields = payload.custom_fields if payload else {}
    entity = payload.entity_data if payload else {}
    result = resolve_workflow_role(
        db=db,
        role_id=role_id.upper(),
        custom_fields=fields,
        entity_data=entity,
    )
    return result


@router.post("/resolve-preview")
def preview_role_resolution(
    payload: RoleCreate,
    req_data: Optional[RoleResolveRequest] = None,
    db: Session = Depends(get_db),
):
    """
    Tests dynamic resolution of an in-memory role configuration before saving.
    """
    role = WorkflowRole(
        id=payload.id or "PREVIEW_ROLE",
        name=payload.name,
        description=payload.description,
        role_type=payload.role_type.upper(),
        person_id=payload.person_id.upper() if payload.person_id else None,
        group_name=payload.group_name.upper() if payload.group_name else None,
        field_name=payload.field_name,
        email_address=payload.email_address,
        resolution_strategy=payload.resolution_strategy or "broadcast",
    )
    fields = req_data.custom_fields if req_data else {}
    entity = req_data.entity_data if req_data else {}
    result = resolve_role_definition(
        db=db,
        role=role,
        custom_fields=fields,
        entity_data=entity,
    )
    return result
