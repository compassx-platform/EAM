import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import update
from backend.models.base import generate_uuid, utc_now
from backend.models.entities import get_entity_models
from backend.models.workflow import WorkflowDefinition
from backend.models.users import AppUser
from backend.services.field_validator import validate_custom_fields, FieldValidationError
from backend.services.gate_evaluator import evaluate_transition_gates

class CommandError(Exception):
    def __init__(self, code: str, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}

class StaleWriteError(CommandError):
    def __init__(self, message: str = "Stale write detected. State was modified concurrently."):
        super().__init__(code="stale_write", message=message)

class InvalidTransitionError(CommandError):
    def __init__(self, from_state: str, event_type: str):
        super().__init__(
            code="invalid_transition",
            message=f"No legal transition from state '{from_state}' on event '{event_type}'",
            details={"from_state": from_state, "event_type": event_type}
        )

class GateFailedError(CommandError):
    def __init__(self, gate_label: str, reason: str, trace: List[Dict[str, Any]]):
        super().__init__(
            code="gate_failed",
            message=f"Transition blocked by gate: {gate_label} - {reason}",
            details={"gate_failed": gate_label, "reason": reason, "gate_trace": trace}
        )

def create_entity(
    db: Session,
    entity_type: str,
    actor_id: str,
    actor_type: str = "human",
    actor_roles: Optional[List[str]] = None,
    custom_fields: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
    workflow_version: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Creates a new entity instance (Section 5: POST /api/{entity_type}/create).
    Implicitly fires CREATED (from_state=None), assigns new id, binds workflow_version.
    """
    EntityModel, EventModel = get_entity_models(entity_type)
    
    # 1. Validate custom fields against schema registry
    cleaned_fields = validate_custom_fields(
        db=db,
        entity_type=entity_type,
        custom_fields=custom_fields or {},
        is_create=True
    )
    
    # 2. Find active published workflow version
    if not workflow_version:
        wf = db.query(WorkflowDefinition).filter(
            WorkflowDefinition.entity_type == entity_type.lower(),
            WorkflowDefinition.status == "published"
        ).order_by(WorkflowDefinition.created_at.desc()).first()
        
        if not wf:
            raise CommandError("no_published_workflow", f"No published workflow definition found for '{entity_type}'")
        workflow_version = wf.version_label
        definition = wf.definition
    else:
        wf = db.query(WorkflowDefinition).filter(
            WorkflowDefinition.entity_type == entity_type.lower(),
            WorkflowDefinition.version_label == workflow_version
        ).first()
        if not wf:
            raise CommandError("workflow_not_found", f"Workflow version '{workflow_version}' not found for '{entity_type}'")
        definition = wf.definition

    # Determine initial state (first state in states list or target of CREATED transition)
    states = definition.get("states", [])
    if not states:
        raise CommandError("invalid_workflow", "Workflow definition contains no states")
    
    # Look for a CREATED transition or default to first state
    initial_state = states[0]
    for t in definition.get("transitions", []):
        if t.get("event") == "CREATED" or t.get("from") is None:
            initial_state = t.get("to", states[0])
            break

    # 3. Create IDs and timestamps
    entity_id = generate_uuid()
    new_event_id = generate_uuid()
    now = utc_now()

    # 4. Single atomic transaction: write entity + append event
    try:
        new_entity = EntityModel(
            id=entity_id,
            entity_type=entity_type.lower(),
            status=initial_state,
            workflow_version=workflow_version,
            last_event_id=new_event_id,
            custom_fields=cleaned_fields,
            created_at=now,
            updated_at=now,
        )
        db.add(new_entity)

        creation_event = EventModel(
            event_id=new_event_id,
            entity_id=entity_id,
            event_type="CREATED",
            actor_id=actor_id,
            actor_type=actor_type,
            transaction_time=now,
            from_state=None,
            to_state=initial_state,
            payload=payload or {"comment": f"Created {entity_type}"},
        )
        db.add(creation_event)

        db.commit()
        db.refresh(new_entity)

        return {
            "accepted": True,
            "entity_id": new_entity.id,
            "status": new_entity.status,
            "workflow_version": new_entity.workflow_version,
            "event_id": new_event_id,
            "entity": new_entity.to_dict(),
        }
    except Exception as ex:
        db.rollback()
        raise ex


def propose_transition(
    db: Session,
    entity_type: str,
    entity_id: str,
    event_type: str,
    actor_id: str,
    actor_type: str = "human",
    actor_roles: Optional[List[str]] = None,
    payload: Optional[Dict[str, Any]] = None,
    custom_fields_delta: Optional[Dict[str, Any]] = None,
    expected_last_event_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executes a transition through the single command path (Section 5: POST /api/{entity_type}/transition).
    Implements full 7-step sequence with closed gate validation & optimistic concurrency.
    """
    EntityModel, EventModel = get_entity_models(entity_type)
    
    # Step 1: Load <entity> row by entity_id
    entity = db.query(EntityModel).filter(EntityModel.id == entity_id).first()
    if not entity:
        raise CommandError("entity_not_found", f"{entity_type} with ID '{entity_id}' not found")
        
    current_status = entity.status
    workflow_version = entity.workflow_version
    current_last_event_id = entity.last_event_id
    current_custom_fields = dict(entity.custom_fields or {})

    # Check caller-provided expected_last_event_id
    if expected_last_event_id and expected_last_event_id != current_last_event_id:
        raise StaleWriteError(f"Conflict on entity '{entity_id}': expected last_event_id '{expected_last_event_id}', but found '{current_last_event_id}'")

    # If payload contains custom fields update, merge and validate
    if custom_fields_delta:
        current_custom_fields.update(custom_fields_delta)
        current_custom_fields = validate_custom_fields(
            db=db,
            entity_type=entity_type,
            custom_fields=current_custom_fields,
            is_create=False
        )

    # Step 2: Load bound workflow_definition
    wf = db.query(WorkflowDefinition).filter(
        WorkflowDefinition.entity_type == entity_type.lower(),
        WorkflowDefinition.version_label == workflow_version
    ).first()
    if not wf:
        raise CommandError("workflow_not_found", f"Workflow version '{workflow_version}' bound to entity not found")
    
    definition = wf.definition or {}

    # Step 3: Look up (from_state=status, event_type) in definition.transitions
    matching_transition = None
    for t in definition.get("transitions", []):
        if t.get("from") == current_status and t.get("event") == event_type:
            matching_transition = t
            break

    if not matching_transition:
        raise InvalidTransitionError(from_state=current_status, event_type=event_type)

    to_state = matching_transition.get("to")
    gate_ids = matching_transition.get("gates", [])

    # Step 4 & 5: Evaluate each gate attached to that transition
    all_passed, results, failing = evaluate_transition_gates(
        db=db,
        gate_ids=gate_ids,
        custom_fields=current_custom_fields,
        actor_id=actor_id,
        actor_type=actor_type,
        actor_roles=actor_roles,
    )

    if not all_passed:
        trace_dicts = [r.model_dump() for r in results]
        raise GateFailedError(
            gate_label=failing.label if failing else "Gate Check",
            reason=failing.reason if failing else "Gate conditions failed",
            trace=trace_dicts,
        )

    # Step 6: All gates pass -> single transaction with optimistic concurrency
    new_event_id = generate_uuid()
    now = utc_now()
    
    event_payload = dict(payload or {})
    event_payload["gate_trace"] = [r.model_dump() for r in results]
    if custom_fields_delta:
        event_payload["custom_fields_delta"] = custom_fields_delta

    try:
        # Optimistic concurrency check: UPDATE ... WHERE id = entity_id AND last_event_id = current_last_event_id
        stmt = (
            update(EntityModel)
            .where(EntityModel.id == entity_id)
            .where(EntityModel.last_event_id == current_last_event_id)
            .values(
                status=to_state,
                last_event_id=new_event_id,
                custom_fields=current_custom_fields,
                updated_at=now,
            )
        )
        result = db.execute(stmt)
        
        if result.rowcount == 0:
            db.rollback()
            raise StaleWriteError(f"Conflict on entity '{entity_id}': last_event_id changed concurrently")

        # Append to event log
        event_row = EventModel(
            event_id=new_event_id,
            entity_id=entity_id,
            event_type=event_type,
            actor_id=actor_id,
            actor_type=actor_type,
            transaction_time=now,
            from_state=current_status,
            to_state=to_state,
            payload=event_payload,
        )
        db.add(event_row)

        db.commit()

        return {
            "accepted": True,
            "entity_id": entity_id,
            "from_state": current_status,
            "new_status": to_state,
            "event_id": new_event_id,
            "gate_trace": [r.model_dump() for r in results],
        }
    except Exception as ex:
        db.rollback()
        raise ex
