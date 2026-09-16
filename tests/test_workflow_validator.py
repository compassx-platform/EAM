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
