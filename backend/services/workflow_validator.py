from typing import Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from backend.models.workflow import GateInstance

class WorkflowValidationError(Exception):
    def __init__(self, errors: List[str], warnings: List[str] = None):
        super().__init__("; ".join(errors))
        self.errors = errors
        self.warnings = warnings or []

def validate_workflow_definition(
    db: Session,
    entity_type: str,
    definition: Dict[str, Any]
) -> Tuple[List[str], List[str]]:
    """
    Validates a WorkflowDefinition draft before publishing (Section 6).
    Returns (errors, warnings).
    """
    errors: List[str] = []
    warnings: List[str] = []

    if not isinstance(definition, dict):
        return ["Definition must be a JSON object"], []

    states = definition.get("states", [])
    transitions = definition.get("transitions", [])

    if not states or not isinstance(states, list):
        errors.append("Workflow definition must contain at least one state in 'states'")
        return errors, warnings

    if not transitions or not isinstance(transitions, list):
        errors.append("Workflow definition must contain at least one transition in 'transitions'")
        return errors, warnings

    state_set = set(states)
    if len(state_set) != len(states):
        errors.append("Duplicate state names found in 'states'")

    # Pre-fetch existing gate instances for this entity_type
    gate_instances = db.query(GateInstance).filter(GateInstance.entity_type == entity_type.lower()).all()
    valid_gate_ids = {g.id for g in gate_instances}

    seen_transitions = set()
    states_with_outgoing = set()

    for idx, t in enumerate(transitions):
        from_state = t.get("from")
        to_state = t.get("to")
        event_type = t.get("event")
        gates = t.get("gates", [])

        if not from_state or from_state not in state_set:
            errors.append(f"Transition #{idx+1}: 'from' state '{from_state}' does not exist in 'states'")
        else:
            states_with_outgoing.add(from_state)

        if not to_state or to_state not in state_set:
            errors.append(f"Transition #{idx+1}: 'to' state '{to_state}' does not exist in 'states'")

        if not event_type:
            errors.append(f"Transition #{idx+1}: missing 'event'")

        pair = (from_state, event_type)
        if pair in seen_transitions:
            errors.append(f"Duplicate transition detected: from '{from_state}' on event '{event_type}'")
        seen_transitions.add(pair)

        # Gate reference validation
        if not isinstance(gates, list):
            errors.append(f"Transition #{idx+1}: 'gates' must be a list of gate IDs")
        else:
            for gate_id in gates:
                if gate_id not in valid_gate_ids:
                    errors.append(f"Transition #{idx+1}: Gate ID '{gate_id}' does not exist for entity type '{entity_type}'")

    # Non-terminal state outgoing transition warning
    terminal_candidates = {"Closed", "Cancelled", "Expired", "Rejected", "HandedBack"}
    for s in states:
        if s not in states_with_outgoing and s not in terminal_candidates:
            warnings.append(f"State '{s}' has no outgoing transitions (terminal state)")

    return errors, warnings
