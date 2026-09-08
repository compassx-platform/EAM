import pytest
from backend.services.workflow_validator import validate_workflow_definition

def test_valid_workflow_definition(test_db):
    valid_def = {
        "entity_type": "workorder",
        "states": ["Draft", "Submitted", "Closed"],
        "transitions": [
            {"from": "Draft", "event": "SUBMITTED", "to": "Submitted", "gates": []},
            {"from": "Submitted", "event": "CLOSED", "to": "Closed", "gates": ["gate_role_supervisor"]},
        ]
    }
    errors, warnings = validate_workflow_definition(test_db, "workorder", valid_def)
    assert len(errors) == 0

def test_invalid_states_and_missing_gates(test_db):
    invalid_def = {
        "entity_type": "workorder",
        "states": ["Draft", "Submitted"],
        "transitions": [
            {"from": "Draft", "event": "SUBMITTED", "to": "NonExistentState", "gates": ["non_existent_gate_id"]},
            {"from": "Draft", "event": "SUBMITTED", "to": "Submitted", "gates": []}, # duplicate (Draft, SUBMITTED)
        ]
    }
    errors, warnings = validate_workflow_definition(test_db, "workorder", invalid_def)
    assert len(errors) >= 3
    assert any("does not exist in 'states'" in e for e in errors)
    assert any("Gate ID 'non_existent_gate_id' does not exist" in e for e in errors)
    assert any("Duplicate transition detected" in e for e in errors)
