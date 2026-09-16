from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from backend.models.entities import get_entity_models
from backend.models.workflow import WorkflowDefinition
from backend.services.condition_evaluator import evaluate_condition_ids, ConditionEvaluationResult
from backend.services.command_handler import _resolve_transition_target, NoConditionSatisfiedError

def simulate_transition(
    db: Session,
    entity_type: str,
    entity_id: Optional[str],
    event_type: str,
    actor_id: str,
    actor_type: str = "human",
    actor_roles: Optional[List[str]] = None,
    custom_fields_override: Optional[Dict[str, Any]] = None,
    current_status_override: Optional[str] = None,
    workflow_version_override: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Simulates a transition through Step 5 of the Command API sequence without writing to the database.
    Can be run against an existing entity or with simulated in-memory state.
    """
    EntityModel, _ = get_entity_models(entity_type)
    
    current_status = current_status_override
    workflow_version = workflow_version_override
    custom_fields = dict(custom_fields_override or {})

    if entity_id:
        entity = db.query(EntityModel).filter(EntityModel.id == entity_id).first()
        if not entity and not current_status:
            return {
                "accepted": False,
                "error": f"{entity_type} with ID '{entity_id}' not found",
                "condition_trace": [],
            }
        if entity:
            if not current_status:
                current_status = entity.status
            if not workflow_version:
                workflow_version = entity.workflow_version
            # Merge existing fields with overrides
            merged_fields = dict(entity.custom_fields or {})
            merged_fields.update(custom_fields)
            custom_fields = merged_fields

    if not workflow_version:
        published_wf = db.query(WorkflowDefinition).filter(
            WorkflowDefinition.entity_type == entity_type.lower(),
            WorkflowDefinition.status == "published"
        ).order_by(WorkflowDefinition.created_at.desc()).first()
        if not published_wf:
            return {
                "accepted": False,
                "error": f"No published workflow found for entity type '{entity_type}'",
                "condition_trace": [],
            }
        workflow_version = published_wf.version_label
        wf_def = published_wf.definition
    else:
        wf = db.query(WorkflowDefinition).filter(
            WorkflowDefinition.entity_type == entity_type.lower(),
            WorkflowDefinition.version_label == workflow_version
        ).first()
        if not wf:
            return {
                "accepted": False,
                "error": f"Workflow version '{workflow_version}' not found for '{entity_type}'",
                "condition_trace": [],
            }
        wf_def = wf.definition

    transitions = wf_def.get("transitions", [])
    matching_transition = None

    for t in transitions:
        if t.get("from") == current_status and t.get("event") == event_type:
            matching_transition = t
            break

    if not matching_transition:
        return {
            "accepted": False,
            "error": f"Invalid transition: No transition from state '{current_status}' on event '{event_type}'",
            "from_state": current_status,
            "to_state": None,
            "condition_trace": [],
        }

    to_state = matching_transition.get("to")
    condition_ids = matching_transition.get("conditions", []) or matching_transition.get("gates", []) or []

    all_passed, results, failing = evaluate_condition_ids(
        db=db,
        condition_ids=condition_ids,
        custom_fields=custom_fields,
        actor_id=actor_id,
        actor_type=actor_type,
        actor_roles=actor_roles,
    )

    trace = [r.model_dump() for r in results]

    # Resolve conditional routing target (choices) without writing anything.
    routing = None
    choice_trace = []
    try:
        resolved_to, choice_index, choice_trace, _ = _resolve_transition_target(
            db=db,
            transition=matching_transition,
            custom_fields=custom_fields,
            actor_context={"actor_id": actor_id, "actor_type": actor_type, "actor_roles": actor_roles},
        )
        if resolved_to is not None:
            to_state = resolved_to
        if choice_index is not None:
            routing = {"choice_index": choice_index, "choices": choice_trace}
    except NoConditionSatisfiedError as ncs:
        return {
            "accepted": False,
            "from_state": current_status,
            "to_state": None,
            "event_type": event_type,
            "workflow_version": workflow_version,
            "error": ncs.message,
            "reason": ncs.message,
            "condition_trace": trace,
            "routing": {"choices": ncs.details.get("choice_trace", [])},
        }

    accepted = all_passed and to_state is not None
    return {
        "accepted": accepted,
        "from_state": current_status,
        "to_state": to_state,
        "event_type": event_type,
        "workflow_version": workflow_version,
        "condition_failed": failing.label if failing else None,
        "reason": failing.reason if failing else ("All conditions passed" if accepted else None),
        "condition_trace": trace,
        "routing": routing,
    }
