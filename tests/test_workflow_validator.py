import pytest
from backend.services.workflow_validator import validate_workflow_definition

def test_valid_workflow_definition(test_db):
    valid_def = {
        "entity_type": "workorder",
        "states": ["Draft", "Submitted", "Closed"],
        "transitions": [
            {"from": "Draft", "event": "SUBMITTED", "to": "Submitted", "conditions": []},
            {"from": "Submitted", "event": "CLOSED", "to": "Closed", "conditions": ["cond_role_supervisor"]},
        ]
    }
    errors, warnings = validate_workflow_definition(test_db, "workorder", valid_def)
    assert len(errors) == 0

def test_invalid_states_and_missing_conditions(test_db):
    invalid_def = {
        "entity_type": "workorder",
        "states": ["Draft", "Submitted"],
        "transitions": [
            {"from": "Draft", "event": "SUBMITTED", "to": "NonExistentState", "conditions": ["non_existent_condition_id"]},
            {"from": "Draft", "event": "SUBMITTED", "to": "Submitted", "conditions": []}, # duplicate (Draft, SUBMITTED)
        ]
    }
    errors, warnings = validate_workflow_definition(test_db, "workorder", invalid_def)
    assert len(errors) >= 3
    assert any("does not exist in 'states'" in e for e in errors)
    assert any("Condition ID 'non_existent_condition_id' does not exist" in e for e in errors)
    assert any("Duplicate transition detected" in e for e in errors)

def test_node_condition_validation(test_db):
    # Valid node condition
    valid_def = {
        "entity_type": "workorder",
        "states": ["Draft", "CheckCondition", "Closed"],
        "nodes": [
            {"name": "Draft", "kind": "start", "position": {"x": 0, "y": 0}},
            {"name": "CheckCondition", "kind": "gate", "position": {"x": 100, "y": 0}, "condition_id": "cond_role_supervisor"},
            {"name": "Closed", "kind": "end", "position": {"x": 200, "y": 0}},
        ],
        "transitions": [
            {"from": "Draft", "event": "SUBMIT", "to": "CheckCondition", "conditions": []},
            {"from": "CheckCondition", "event": "CLOSE", "to": "Closed", "conditions": []},
        ],
        "terminal_states": ["Closed"],
    }
    errors, warnings = validate_workflow_definition(test_db, "workorder", valid_def)
    assert len(errors) == 0

    # Invalid node condition
    invalid_def = {
        "entity_type": "workorder",
        "states": ["Draft", "CheckCondition", "Closed"],
        "nodes": [
            {"name": "CheckCondition", "kind": "gate", "position": {"x": 100, "y": 0}, "condition_id": "non_existent_cond"},
        ],
        "transitions": [
            {"from": "Draft", "event": "SUBMIT", "to": "CheckCondition", "conditions": []},
            {"from": "CheckCondition", "event": "CLOSE", "to": "Closed", "conditions": []},
        ],
        "terminal_states": ["Closed"],
    }
    errors, warnings = validate_workflow_definition(test_db, "workorder", invalid_def)
    assert any("Node 'CheckCondition': Condition ID 'non_existent_cond' does not exist" in e for e in errors)


def test_maximo_router_validation_rules(test_db):
    # Router missing condition
    no_cond_def = {
        "entity_type": "workorder",
        "states": ["Draft", "EvaluateCost", "Approved", "Rejected"],
        "nodes": [
            {"name": "Draft", "kind": "start", "position": {"x": 0, "y": 0}},
            {"name": "EvaluateCost", "kind": "router", "position": {"x": 100, "y": 0}},
            {"name": "Approved", "kind": "state", "position": {"x": 200, "y": 0}},
            {"name": "Rejected", "kind": "end", "position": {"x": 200, "y": 100}},
        ],
        "transitions": [
            {"from": "Draft", "event": "SUBMIT", "to": "EvaluateCost", "conditions": []},
            {"from": "EvaluateCost", "event": "TRUE", "to": "Approved", "conditions": []},
            {"from": "EvaluateCost", "event": "FALSE", "to": "Rejected", "conditions": []},
        ],
    }
    errors, warnings = validate_workflow_definition(test_db, "workorder", no_cond_def)
    assert any("Router 'EvaluateCost' must have a condition assigned" in e for e in errors)

    # Router missing FALSE branch
    missing_false_def = {
        "entity_type": "workorder",
        "states": ["Draft", "EvaluateCost", "Approved"],
        "nodes": [
            {"name": "Draft", "kind": "start", "position": {"x": 0, "y": 0}},
            {"name": "EvaluateCost", "kind": "router", "position": {"x": 100, "y": 0}, "condition_id": "cond_role_supervisor"},
            {"name": "Approved", "kind": "state", "position": {"x": 200, "y": 0}},
        ],
        "transitions": [
            {"from": "Draft", "event": "SUBMIT", "to": "EvaluateCost", "conditions": []},
            {"from": "EvaluateCost", "event": "TRUE", "to": "Approved", "conditions": []},
        ],
    }
    errors, warnings = validate_workflow_definition(test_db, "workorder", missing_false_def)
    assert any("Router 'EvaluateCost' is missing an outgoing FALSE branch" in e for e in errors)

    # Valid complete router workflow
    valid_router_def = {
        "entity_type": "workorder",
        "states": ["Draft", "EvaluateCost", "Approved", "Rejected"],
        "nodes": [
            {"name": "Draft", "kind": "start", "position": {"x": 0, "y": 0}},
            {"name": "EvaluateCost", "kind": "router", "position": {"x": 100, "y": 0}, "condition_id": "cond_role_supervisor"},
            {"name": "Approved", "kind": "state", "position": {"x": 200, "y": 0}},
            {"name": "Rejected", "kind": "end", "position": {"x": 200, "y": 100}},
        ],
        "transitions": [
            {"from": "Draft", "event": "SUBMIT", "to": "EvaluateCost", "conditions": []},
            {"from": "EvaluateCost", "event": "TRUE", "to": "Approved", "conditions": []},
            {"from": "EvaluateCost", "event": "FALSE", "to": "Rejected", "conditions": []},
        ],
        "terminal_states": ["Rejected"],
    }
    errors, warnings = validate_workflow_definition(test_db, "workorder", valid_router_def)
    assert len(errors) == 0


