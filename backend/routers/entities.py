from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel
from sqlalchemy import case
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.entities import get_entity_models, DynamicEntity, DynamicEntityEvent
from backend.models.entity_type import EntityTypeDefinition
from backend.models.workflow import WorkflowDefinition
from backend.services.command_handler import (
    create_entity,
    propose_transition,
    CommandError,
    StaleWriteError,
    InvalidTransitionError,
    ConditionFailedError,
)
from backend.services.field_validator import FieldValidationError
from backend.services.simulator import simulate_transition
from backend.services.projector import rebuild_entity_from_events
from backend.services.actor import resolve_actor_roles

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

def _verify_entity_type(db: Session, entity_type: str) -> str:
    key = (entity_type or "").strip().lower()
    if not key:
        raise HTTPException(status_code=404, detail="Entity type cannot be empty")
    exists = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == key).first()
    if not exists:
        raise HTTPException(status_code=404, detail=f"Unknown entity type '{entity_type}'")
    return key

def resolve_actor(
    explicit_actor_id: Optional[str],
    explicit_roles: Optional[List[str]],
    header_actor_id: Optional[str],
    header_role: Optional[str],
    db: Session
) -> tuple[str, list[str]]:
    actor_id = explicit_actor_id or header_actor_id or "admin@compassx.io"
    roles = list(resolve_actor_roles(db, actor_id, explicit_roles))

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
    key = _verify_entity_type(db, entity_type)
    try:
        actor_id, roles = resolve_actor(None, None, x_actor_id, x_actor_role, db)
        result = create_entity(
            db=db,
            entity_type=key,
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
    except FieldValidationError as fve:
        raise HTTPException(status_code=400, detail={"error_code": "field_validation_error", "message": fve.message, "field_name": fve.field_name})
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
    key = _verify_entity_type(db, entity_type)
    try:
        actor_id, roles = resolve_actor(req.actor_id, req.actor_roles, x_actor_id, x_actor_role, db)
        result = propose_transition(
            db=db,
            entity_type=key,
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
    except ConditionFailedError as gfe:
        raise HTTPException(status_code=422, detail={"error_code": "condition_failed", "message": gfe.message, "details": gfe.details})
    except InvalidTransitionError as ite:
        raise HTTPException(status_code=400, detail={"error_code": "invalid_transition", "message": ite.message, "details": ite.details})
    except CommandError as ce:
        raise HTTPException(status_code=400, detail={"error_code": ce.code, "message": ce.message, "details": ce.details})
    except FieldValidationError as fve:
        raise HTTPException(status_code=400, detail={"error_code": "field_validation_error", "message": fve.message, "field_name": fve.field_name})
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
    key = _verify_entity_type(db, entity_type)
    actor_id, roles = resolve_actor(req.actor_id, req.actor_roles, x_actor_id, x_actor_role, db)
    result = simulate_transition(
        db=db,
        entity_type=key,
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
    key = _verify_entity_type(db, entity_type)
    EntityModel, _ = get_entity_models(key)
    query = db.query(EntityModel)

    if EntityModel == DynamicEntity:
        query = query.filter(DynamicEntity.entity_type == key)

    if status:
        query = query.filter(EntityModel.status == status)

    total = query.count()
    entities = query.order_by(EntityModel.updated_at.desc()).offset(offset).limit(limit).all()

    return {
        "entity_type": key,
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
    key = _verify_entity_type(db, entity_type)
    EntityModel, EventModel = get_entity_models(key)
    
    query = db.query(EntityModel).filter(EntityModel.id == id)
    if EntityModel == DynamicEntity:
        query = query.filter(DynamicEntity.entity_type == key)
    entity = query.first()
    if not entity:
        raise HTTPException(status_code=404, detail=f"{key} '{id}' not found")

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
    key = _verify_entity_type(db, entity_type)
    EntityModel, _ = get_entity_models(key)
    query = db.query(EntityModel).filter(EntityModel.id == id)
    if EntityModel == DynamicEntity:
        query = query.filter(DynamicEntity.entity_type == key)
    entity = query.first()
    if not entity:
        raise HTTPException(status_code=404, detail=f"{key} '{id}' not found")

    wf = (
        db.query(WorkflowDefinition)
        .filter(
            WorkflowDefinition.entity_type == key,
            WorkflowDefinition.status == "published",
        )
        .order_by(
            WorkflowDefinition.published_at.desc(),
            WorkflowDefinition.created_at.desc(),
        )
        .first()
    )

    if not wf:
        return {
            "entity_id": id,
            "entity_type": key,
            "current_status": entity.status,
            "workflow_version": None,
            "valid_transitions": [],
            "auto_transitions_pending": [],
            "has_published_workflow": False,
            "message": f"No published workflow is available for '{key}'. Please publish a workflow in Workflow Studio.",
        }

    transitions = (wf.definition or {}).get("transitions", [])
    valid_transitions = []
    current_stage = getattr(entity, "workflow_stage", None) or entity.status

    for t in transitions:
        t_from = t.get("from")
        if t_from in (current_stage, entity.status):
            event_name = t.get("event") or t.get("label") or (f"TO_{t.get('to')}" if t.get("to") else "ACTION")
            is_sys = bool(
                t.get("is_system")
                or event_name in ["EXPIRED", "TRUE", "FALSE", "TIMEOUT", "AUTO"]
            )
            entry: Dict[str, Any] = {
                "event_type": event_name,
                "to_state": t.get("to"),
                "conditions": t.get("conditions", []) or [],
                "label": t.get("label") or t.get("button_label"),
                "button_label": t.get("button_label") or t.get("label"),
                "button_style": t.get("button_style") or t.get("style"),
                "is_system": is_sys,
                "description": t.get("description") or t.get("instructions"),
            }
            if t.get("choices"):
                entry["choices"] = t.get("choices")
            if t.get("on_after"):
                entry["on_after"] = t.get("on_after")
            valid_transitions.append(entry)

    auto_pending = []
    for a in (wf.definition or {}).get("auto_transitions", []) or []:
        if a.get("from") in (current_stage, entity.status):
            auto_pending.append(a)

    current_node = None
    for n in (wf.definition or {}).get("nodes", []) or []:
        if n.get("name") in (current_stage, entity.status):
            current_node = n
            break

    return {
        "entity_id": id,
        "entity_type": key,
        "current_status": entity.status,
        "workflow_stage": current_stage,
        "workflow_version": wf.version_label,
        "current_node": current_node,
        "valid_transitions": valid_transitions,
        "auto_transitions_pending": auto_pending,
        "has_published_workflow": True,
    }


@router.post("/api/{entity_type}/{id}/rebuild")
def rebuild_entity_cache(entity_type: str, id: str, db: Session = Depends(get_db)):
    """
    Rebuilds current-state materialized row by replaying its event log (Event Sourcing Principle 1).
    """
    key = _verify_entity_type(db, entity_type)
    try:
        rebuilt = rebuild_entity_from_events(db, key, id)
        return {"rebuilt": True, "entity": rebuilt}
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex))


@router.get("/api/{entity_type}/{id}/subprocess")
def get_entity_subprocess_endpoint(entity_type: str, id: str, db: Session = Depends(get_db)):
    """
    Returns the linked child subprocess or parent workflow relationship and status for this entity.
    """
    key = _verify_entity_type(db, entity_type)
    from backend.services.subprocess_service import get_subprocess_status
    status_data = get_subprocess_status(db, key, id)
    return status_data


@router.post("/api/{entity_type}/{id}/subprocess/launch")
def launch_entity_subprocess_endpoint(
    entity_type: str,
    id: str,
    target_entity_type: Optional[str] = None,
    subprocess_id: Optional[str] = None,
    x_actor_id: Optional[str] = Header(None, alias="X-Actor-Id"),
    db: Session = Depends(get_db),
):
    """
    Explicitly launches or re-links a child subprocess for this entity record at its current state.
    """
    key = _verify_entity_type(db, entity_type)
    from backend.services.subprocess_service import handle_subprocess_state_entry, _load_workflow
    from backend.models.entities import get_entity_models

    EntityModel, _ = get_entity_models(key)
    entity = db.query(EntityModel).filter(EntityModel.id == id).first()
    if not entity:
        raise HTTPException(status_code=404, detail=f"Entity '{id}' not found")

    try:
        wf = _load_workflow(db, key, entity.workflow_version)
        definition = wf.definition or {}
        custom_fields = dict(entity.custom_fields or {})
        # Force clear existing child link if re-launching
        custom_fields.pop("subprocess_child_id", None)

        sub_res = handle_subprocess_state_entry(
            db=db,
            entity_type=key,
            entity_id=id,
            state_name=entity.status,
            definition=definition,
            custom_fields=custom_fields,
            workflow_version=entity.workflow_version,
        )
        if not sub_res:
            raise HTTPException(status_code=400, detail="Current state is not a subprocess node or child launch failed")
        return {"success": True, "subprocess": sub_res}
    except Exception as ex:
        raise HTTPException(status_code=400, detail=str(ex))
