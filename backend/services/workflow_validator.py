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

    Recognizes the generic routing/action extensions:
      - ``transitions[].choices``   -> conditional routing targets ({to, when})
      - ``transitions[].when``      -> gate ids that gate a single choice
      - ``transitions[].on_after``  -> declarative post-transition actions
      - ``auto_transitions[].when`` -> data-driven automatic routing
      - ``terminal_states``         -> explicit terminal state designations
      - per-choice ``on_after``     -> side effects scoped to the taken branch

    Returns (errors, warnings).
    """
    errors: List[str] = []
    warnings: List[str] = []

    if not isinstance(definition, dict):
        return ["Definition must be a JSON object"], []

    states = definition.get("states", [])
    transitions = definition.get("transitions", [])
    auto_transitions = definition.get("auto_transitions", []) or []
    terminal_states = definition.get("terminal_states", []) or []

    if not states or not isinstance(states, list):
        errors.append("Workflow definition must contain at least one state in 'states'")
        return errors, warnings

    state_set = set(states)
    if len(state_set) != len(states):
        errors.append("Duplicate state names found in 'states'")

    for ts in terminal_states:
        if ts not in state_set:
            errors.append(f"terminal_states entry '{ts}' does not exist in 'states'")

    seen_transitions = set()
    states_with_outgoing = set()

    def _check_when(when: Any, context: str) -> None:
        if when is None:
            return
        if not isinstance(when, list):
            errors.append(f"{context}: 'when' must be a list of gate IDs")
            return
        for gate_id in when:
            if gate_id not in valid_gate_ids:
                errors.append(f"{context}: Gate ID '{gate_id}' does not exist for entity type '{entity_type}'")

    def _check_actions(on_after: Any, context: str) -> None:
        from backend.services.actions import ACTION_TYPE_SET
        if on_after is None:
            return
        if not isinstance(on_after, list):
            errors.append(f"{context}: 'on_after' must be a list of action objects")
            return
        for i, action in enumerate(on_after):
            if not isinstance(action, dict) or not action.get("type"):
                errors.append(f"{context}: on_after[{i}] must be an object with a 'type'")
                continue
            if action["type"] not in ACTION_TYPE_SET:
                errors.append(f"{context}: Unknown action type '{action['type']}'. Fixed registry: {sorted(ACTION_TYPE_SET)}")
            if "params" not in action or not isinstance(action.get("params"), dict):
                errors.append(f"{context}: on_after[{i}] missing 'params' object (empty dict ok)")

    if not isinstance(transitions, list):
        errors.append("Workflow definition must contain at least one transition in 'transitions'")
        return errors, warnings

    invalid_transition_amount = len(transitions) == 0
    if invalid_transition_amount:
        warnings.append("Workflow has no human transitions (create-only / tracking entity types are valid)")

    # Pre-fetch existing gate instances for this entity_type
    gate_instances = db.query(GateInstance).filter(GateInstance.entity_type == entity_type.lower()).all()
    valid_gate_ids = {g.id for g in gate_instances}

    for idx, t in enumerate(transitions):
        ctx = f"Transition #{idx + 1}"
        from_state = t.get("from")
        event_type = t.get("event")
        gates = t.get("gates", [])
        to_state = t.get("to")
        choices = t.get("choices") or []
        on_after = t.get("on_after")

        if not from_state or from_state not in state_set:
            errors.append(f"{ctx}: 'from' state '{from_state}' does not exist in 'states'")
        else:
            states_with_outgoing.add(from_state)

        if not event_type:
            errors.append(f"{ctx}: missing 'event'")

        if choices and to_state:
            errors.append(f"{ctx}: cannot define both 'to' and 'choices' on one transition (ambiguous)")
        if not choices and not to_state:
            errors.append(f"{ctx}: must define either 'to' or a non-empty 'choices' list")

        # Choice / conditional routing resolution
        if choices:
            if not isinstance(choices, list):
                errors.append(f"{ctx}: 'choices' must be a list")
            else:
                if not choices:
                    errors.append(f"{ctx}: 'choices' list is empty (set 'to' or provide at least one choice)")
                for cidx, choice in enumerate(choices):
                    cctx = f"{ctx} choice #{cidx + 1}"
                    if not isinstance(choice, dict):
                        errors.append(f"{cctx}: must be an object with 'to' and 'when'")
                        continue
                    c_to = choice.get("to")
                    if not c_to or c_to not in state_set:
                        errors.append(f"{cctx}: 'to' state '{c_to}' does not exist in 'states'")
                    else:
                        states_with_outgoing.add(from_state)
                    _check_when(choice.get("when"), cctx)
                    _check_actions(choice.get("on_after"), cctx)
                _check_actions(on_after, ctx)
        else:
            if to_state and to_state not in state_set:
                errors.append(f"{ctx}: 'to' state '{to_state}' does not exist in 'states'")
            elif to_state and from_state in state_set:
                states_with_outgoing.add(from_state)
            _check_when(t.get("when"), ctx)
            _check_actions(on_after, ctx)

        pair = (from_state, event_type)
        if pair in seen_transitions:
            errors.append(f"Duplicate transition detected: from '{from_state}' on event '{event_type}'")
        seen_transitions.add(pair)

        if not isinstance(gates, list):
            errors.append(f"{ctx}: 'gates' must be a list of gate IDs")
        else:
            for gate_id in gates:
                if gate_id not in valid_gate_ids:
                    errors.append(f"{ctx}: Gate ID '{gate_id}' does not exist for entity type '{entity_type}'")

    # Auto transitions: data-driven routing after every state change
    if not isinstance(auto_transitions, list):
        errors.append("'auto_transitions' must be a list")
    else:
        for aidx, a in enumerate(auto_transitions):
            actx = f"auto_transitions[{aidx}]"
            if not isinstance(a, dict):
                errors.append(f"{actx}: must be an object with 'from', 'event', and 'when'")
                continue
            a_from = a.get("from")
            a_event = a.get("event")
            if a_from not in state_set:
                errors.append(f"{actx}: 'from' state '{a_from}' does not exist in 'states'")
            if not a_event:
                errors.append(f"{actx}: missing 'event'")
            _check_when(a.get("when"), actx)
            # The auto transition must resolve to an actual transition row
            if a_event and (a_from, a_event) not in seen_transitions:
                errors.append(f"{actx}: event '{a_event}' from state '{a_from}' has no matching 'transitions' entry (auto transitions fire real workflow events)")

    # Terminal-state warnings use explicit config; no hardcoded names.
    for s in states:
        if s not in states_with_outgoing and s not in terminal_states:
            warnings.append(f"State '{s}' has no outgoing transitions (add to 'terminal_states' if intentional)")

    return errors, warnings