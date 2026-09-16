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

