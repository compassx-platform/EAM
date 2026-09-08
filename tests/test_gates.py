import pytest
from datetime import datetime, timezone, timedelta
from backend.models.workflow import GateInstance
from backend.services.gate_evaluator import evaluate_single_gate

def test_role_check_gate(test_db):
    gate = GateInstance(
        id="test_role",
        entity_type="workorder",
        gate_type="role_check",
        label="Supervisor Check",
        params={"role": "Supervisor"},
        failure_policy="block"
    )
    # Actor lacks role
    res = evaluate_single_gate(test_db, gate, {}, actor_id="user1", actor_roles=["Technician"])
    assert res.passed is False
    assert res.effective_pass is False

    # Actor has role
    res2 = evaluate_single_gate(test_db, gate, {}, actor_id="user2", actor_roles=["Supervisor"])
    assert res2.passed is True
    assert res2.effective_pass is True

    # Admin passes all
    res3 = evaluate_single_gate(test_db, gate, {}, actor_id="admin@compassx.io", actor_roles=["Admin"])
    assert res3.passed is True
    assert res3.effective_pass is True

def test_numeric_threshold_gate(test_db):
    gate = GateInstance(
        id="test_cost",
        entity_type="workorder",
        gate_type="numeric_threshold",
        label="Cost <= 5000",
        params={"field": "estimated_cost", "operator": "<=", "value": 5000},
        failure_policy="block"
    )
    # Above threshold -> fail
    res = evaluate_single_gate(test_db, gate, {"estimated_cost": 6000}, actor_id="user1")
    assert res.passed is False

    # Below threshold -> pass
    res2 = evaluate_single_gate(test_db, gate, {"estimated_cost": 4500}, actor_id="user1")
    assert res2.passed is True

    # Equal -> pass
    res3 = evaluate_single_gate(test_db, gate, {"estimated_cost": 5000}, actor_id="user1")
    assert res3.passed is True

def test_field_not_empty_gate(test_db):
    gate = GateInstance(
        id="test_hazards",
        entity_type="permit",
        gate_type="field_not_empty",
        label="Hazards Required",
        params={"field": "hazards_identified"},
        failure_policy="block"
    )
    res_empty = evaluate_single_gate(test_db, gate, {"hazards_identified": ""}, actor_id="user1")
    assert res_empty.passed is False

    res_missing = evaluate_single_gate(test_db, gate, {}, actor_id="user1")
    assert res_missing.passed is False

    res_filled = evaluate_single_gate(test_db, gate, {"hazards_identified": "Electric shock risk"}, actor_id="user1")
    assert res_filled.passed is True

def test_failure_policy_allow_override(test_db):
    gate = GateInstance(
        id="test_allow_policy",
        entity_type="workorder",
        gate_type="numeric_threshold",
        label="Advisory Cost Check",
        params={"field": "estimated_cost", "operator": "<=", "value": 1000},
        failure_policy="allow"
    )
    res = evaluate_single_gate(test_db, gate, {"estimated_cost": 20000}, actor_id="user1")
    assert res.passed is False
    assert res.effective_pass is True  # Overridden by allow policy
    assert "failure_policy = allow" in res.reason
