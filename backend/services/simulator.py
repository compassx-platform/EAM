from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from backend.models.entities import get_entity_models
from backend.models.workflow import WorkflowDefinition
from backend.services.gate_evaluator import evaluate_transition_gates, GateEvaluationResult

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
                "gate_trace": [],
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
                "gate_trace": [],
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
                "gate_trace": [],
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
            "gate_trace": [],
        }

    to_state = matching_transition.get("to")
    gate_ids = matching_transition.get("gates", [])

    all_passed, results, failing = evaluate_transition_gates(
        db=db,
        gate_ids=gate_ids,
        custom_fields=custom_fields,
        actor_id=actor_id,
        actor_type=actor_type,
        actor_roles=actor_roles,
    )

    return {
        "accepted": all_passed,
        "from_state": current_status,
        "to_state": to_state,
        "event_type": event_type,
        "workflow_version": workflow_version,
        "gate_failed": failing.label if failing else None,
        "reason": failing.reason if failing else ("All gates passed" if all_passed else None),
        "gate_trace": [r.model_dump() for r in results],
    }
