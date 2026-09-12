from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.entities import get_entity_models, ENTITY_REGISTRY
from backend.models.workflow import WorkflowDefinition
from backend.models.users import AppUser
from backend.services.command_handler import (
    create_entity,
    propose_transition,
    CommandError,
    StaleWriteError,
    InvalidTransitionError,
    GateFailedError,
)
from backend.services.simulator import simulate_transition
from backend.services.projector import rebuild_entity_from_events

router = APIRouter(tags=["Entities (Command & Query API)"])

# Request / Response Schemas
class CreateEntityRequest(BaseModel):
    custom_fields: Dict[str, Any] = {}
    payload: Optional[Dict[str, Any]] = None
    workflow_version: Optional[str] = None

class TransitionRequest(BaseModel):
    entity_id: str
    event_type: str
    actor_id: Optional[str] = None
    actor_type: str = "human"  # 'human' | 'system'
    actor_roles: Optional[List[str]] = None
    payload: Optional[Dict[str, Any]] = None
    custom_fields_delta: Optional[Dict[str, Any]] = None
    expected_last_event_id: Optional[str] = None

class SimulateRequest(BaseModel):
    entity_id: Optional[str] = None
    event_type: str
    actor_id: Optional[str] = None
    actor_type: str = "human"
    actor_roles: Optional[List[str]] = None
    custom_fields_override: Optional[Dict[str, Any]] = None
    current_status_override: Optional[str] = None
    workflow_version_override: Optional[str] = None

def resolve_actor(
    explicit_actor_id: Optional[str],
    explicit_roles: Optional[List[str]],
    header_actor_id: Optional[str],
    header_role: Optional[str],
    db: Session
) -> tuple[str, list[str]]:
    actor_id = explicit_actor_id or header_actor_id or "admin@compassx.io"
    roles = list(explicit_roles or [])
    
    if not roles:
        user = db.query(AppUser).filter((AppUser.email == actor_id) | (AppUser.id == actor_id)).first()
        if user:
            roles = [r.name for r in user.roles]
            
    if header_role and header_role not in roles:
        roles.append(header_role)
        
    return actor_id, roles

# COMMAND API (Section 5)

@router.post("/api/{entity_type}/create")
def create_entity_endpoint(
    entity_type: str,
    req: CreateEntityRequest,
    x_actor_id: Optional[str] = Header(None, alias="X-Actor-Id"),
    x_actor_role: Optional[str] = Header(None, alias="X-Actor-Role"),
    db: Session = Depends(get_db)
):
    try:
        actor_id, roles = resolve_actor(None, None, x_actor_id, x_actor_role, db)
        result = create_entity(
            db=db,
            entity_type=entity_type,
            actor_id=actor_id,
            actor_type="human",
            actor_roles=roles,
            custom_fields=req.custom_fields,
            payload=req.payload,
            workflow_version=req.workflow_version,
        )
        return result
    except CommandError as ce:
        raise HTTPException(status_code=400, detail={"error_code": ce.code, "message": ce.message, "details": ce.details})
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))


@router.post("/api/{entity_type}/transition")
def propose_transition_endpoint(
    entity_type: str,
    req: TransitionRequest,
    x_actor_id: Optional[str] = Header(None, alias="X-Actor-Id"),
    x_actor_role: Optional[str] = Header(None, alias="X-Actor-Role"),
    db: Session = Depends(get_db)
):
    try:
        actor_id, roles = resolve_actor(req.actor_id, req.actor_roles, x_actor_id, x_actor_role, db)
        result = propose_transition(
            db=db,
            entity_type=entity_type,
            entity_id=req.entity_id,
            event_type=req.event_type,
            actor_id=actor_id,
            actor_type=req.actor_type,
            actor_roles=roles,
            payload=req.payload,
            custom_fields_delta=req.custom_fields_delta,
            expected_last_event_id=req.expected_last_event_id,
        )
        return result
    except StaleWriteError as swe:
        raise HTTPException(status_code=409, detail={"error_code": "stale_write", "message": swe.message})
    except GateFailedError as gfe:
        raise HTTPException(status_code=422, detail={"error_code": "gate_failed", "message": gfe.message, "details": gfe.details})
    except InvalidTransitionError as ite:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_transition", "message": ite.message, "details": ite.details})
    except CommandError as ce:
        raise HTTPException(status_code=400, detail={"error_code": ce.code, "message": ce.message, "details": ce.details})
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))


@router.post("/api/{entity_type}/simulate")
def simulate_transition_endpoint(
    entity_type: str,
    req: SimulateRequest,
    x_actor_id: Optional[str] = Header(None, alias="X-Actor-Id"),
    x_actor_role: Optional[str] = Header(None, alias="X-Actor-Role"),
    db: Session = Depends(get_db)
):
    actor_id, roles = resolve_actor(req.actor_id, req.actor_roles, x_actor_id, x_actor_role, db)
    result = simulate_transition(
        db=db,
        entity_type=entity_type,
        entity_id=req.entity_id,
        event_type=req.event_type,
        actor_id=actor_id,
        actor_type=req.actor_type,
        actor_roles=roles,
        custom_fields_override=req.custom_fields_override,
        current_status_override=req.current_status_override,
        workflow_version_override=req.workflow_version_override,
    )
    return result


# QUERY API (Section 8)

@router.get("/api/{entity_type}")
def list_entities(
    entity_type: str,
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    List view against materialized current-state table (Section 8).
    """
    if entity_type.lower() not in ENTITY_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown entity type '{entity_type}'")
    EntityModel, _ = get_entity_models(entity_type)
    query = db.query(EntityModel)

    if status:
        query = query.filter(EntityModel.status == status)

    total = query.count()
    entities = query.order_by(EntityModel.updated_at.desc()).offset(offset).limit(limit).all()

    return {
        "entity_type": entity_type,
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [e.to_dict() for e in entities],
    }


@router.get("/api/{entity_type}/{id}")
def get_entity_detail(entity_type: str, id: str, db: Session = Depends(get_db)):
    """
    Returns current-state row + full event history / audit timeline (Section 8).
    """
    if entity_type.lower() not in ENTITY_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown entity type '{entity_type}'")
    EntityModel, EventModel = get_entity_models(entity_type)
    
    entity = db.query(EntityModel).filter(EntityModel.id == id).first()
    if not entity:
        raise HTTPException(status_code=404, detail=f"{entity_type} '{id}' not found")

    events = (
        db.query(EventModel)
        .filter(EventModel.entity_id == id)
        .order_by(EventModel.transaction_time.asc())
        .all()
    )

    return {
        "entity": entity.to_dict(),
        "events": [e.to_dict() for e in events],
    }


@router.get("/api/{entity_type}/{id}/valid-transitions")
def get_valid_transitions(entity_type: str, id: str, db: Session = Depends(get_db)):
    """
    Given current status and bound workflow_version, returns the list of event_types
    legally callable next to drive action buttons in the UI (Section 8).
    """
    if entity_type.lower() not in ENTITY_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown entity type '{entity_type}'")
    EntityModel, _ = get_entity_models(entity_type)
    entity = db.query(EntityModel).filter(EntityModel.id == id).first()
    if not entity:
        raise HTTPException(status_code=404, detail=f"{entity_type} '{id}' not found")

    wf = db.query(WorkflowDefinition).filter(
        WorkflowDefinition.entity_type == entity_type.lower(),
        WorkflowDefinition.version_label == entity.workflow_version
    ).first()

    if not wf:
        return {"current_status": entity.status, "valid_transitions": []}

    transitions = (wf.definition or {}).get("transitions", [])
    valid_transitions = []

    for t in transitions:
        if t.get("from") == entity.status:
            entry: Dict[str, Any] = {
                "event_type": t.get("event"),
                "to_state": t.get("to"),
                "gates": t.get("gates", []) or [],
            }
            if t.get("choices"):
                entry["choices"] = t.get("choices")
            if t.get("on_after"):
                entry["on_after"] = t.get("on_after")
            valid_transitions.append(entry)

    auto_pending = []
    for a in (wf.definition or {}).get("auto_transitions", []) or []:
        if a.get("from") == entity.status:
            auto_pending.append(a)

    return {
        "entity_id": id,
        "entity_type": entity_type,
        "current_status": entity.status,
        "workflow_version": entity.workflow_version,
        "valid_transitions": valid_transitions,
        "auto_transitions_pending": auto_pending,
    }


@router.post("/api/{entity_type}/{id}/rebuild")
def rebuild_entity_cache(entity_type: str, id: str, db: Session = Depends(get_db)):
    """
    Rebuilds current-state materialized row by replaying its event log (Event Sourcing Principle 1).
    """
    if entity_type.lower() not in ENTITY_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown entity type '{entity_type}'")
    try:
        rebuilt = rebuild_entity_from_events(db, entity_type, id)
        return {"rebuilt": True, "entity": rebuilt}
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))
