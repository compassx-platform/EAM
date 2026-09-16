import pytest
from backend.models.conditions import ConditionDefinition, ConditionVersion
from backend.services.condition_evaluator import (
    evaluate_condition,
    evaluate_condition_ids,
    evaluate_condition_any,
    evaluate_rule_tree,
)


def _cond(db, cid="cond_test_supervisor", entity_type="workorder", definition=None, label="Supervisor Check", policy="block"):
    c = ConditionDefinition(
        id=cid,
        entity_type=entity_type,
        label=label,
        type="structured",
        definition=definition or {"logic": "AND", "rules": [{"type": "role", "role": "Supervisor"}]},
        current_version=1,
        failure_policy=policy,
        created_by="test@compassx.io",
    )
    db.add(c)
    db.flush()
    return c


def test_role_atom(test_db):
    c = _cond(test_db)
    res = evaluate_condition(test_db, c, {}, actor_id="user1", actor_roles=["Technician"])
    assert res.passed is False and res.effective_pass is False
    res2 = evaluate_condition(test_db, c, {}, actor_id="user2", actor_roles=["Supervisor"])
    assert res2.passed is True
    res3 = evaluate_condition(test_db, c, {}, actor_id="admin@compassx.io", actor_roles=["Admin"])
    assert res3.passed is True


def test_attribute_numeric_and_string(test_db):
    c = _cond(test_db, cid="cond_cost", definition={
        "logic": "AND", "rules": [{"type": "attribute", "field": "estimated_cost", "operator": "le", "value": 5000}]
    })
    assert evaluate_condition(test_db, c, {"estimated_cost": 6000}, actor_id="u").passed is False
    assert evaluate_condition(test_db, c, {"estimated_cost": 4500}, actor_id="u").passed is True
    assert evaluate_condition(test_db, c, {"estimated_cost": 5000}, actor_id="u").passed is True

    c2 = _cond(test_db, cid="cond_type", definition={
        "logic": "AND", "rules": [{"type": "attribute", "field": "permit_type", "operator": "eq", "value": "Electrical Isolation"}]
    })
    assert evaluate_condition(test_db, c2, {"permit_type": "Electrical Isolation"}, actor_id="u").passed is True
    assert evaluate_condition(test_db, c2, {"permit_type": "Hot Work"}, actor_id="u").passed is False


def test_field_not_empty_atom(test_db):
    c = _cond(test_db, cid="cond_hazards", definition={
        "logic": "AND", "rules": [{"type": "field_not_empty", "field": "hazards_identified"}]
    })
    assert evaluate_condition(test_db, c, {"hazards_identified": ""}, actor_id="u").passed is False
    assert evaluate_condition(test_db, c, {}, actor_id="u").passed is False
    assert evaluate_condition(test_db, c, {"hazards_identified": "Electric shock risk"}, actor_id="u").passed is True


def test_and_or_nested_groups_and_negation(test_db):
    # (permit_type == Hot Work) AND (role == Supervisor OR _workflow_status == SupervisorApproval)
    c = _cond(test_db, cid="cond_hot_work_approval", definition={
        "logic": "AND",
        "rules": [
            {"type": "attribute", "field": "permit_type", "operator": "eq", "value": "Hot Work"},
            {"group": {"logic": "OR", "rules": [
                {"type": "role", "role": "Supervisor"},
                {"type": "attribute", "field": "_workflow_status", "operator": "eq", "value": "SupervisorApproval"},
            ]}},
        ],
    })
    base = {"permit_type": "Hot Work"}
    assert evaluate_condition(test_db, c, base, actor_id="u", actor_roles=["Supervisor"]).passed is True
    assert evaluate_condition(test_db, c, base, actor_id="u", actor_roles=["Technician"]).passed is False
    assert evaluate_condition(test_db, c, {**base, "_workflow_status": "SupervisorApproval"}, actor_id="u", actor_roles=["Technician"]).passed is True
    assert evaluate_condition(test_db, c, {"permit_type": "Cold Work"}, actor_id="u", actor_roles=["Supervisor"]).passed is False

    # Negated group: NOT (permit_type is Hot Work)
    c2 = _cond(test_db, cid="cond_not_hot", definition={
        "logic": "AND", "negate": True,
        "rules": [{"type": "attribute", "field": "permit_type", "operator": "eq", "value": "Hot Work"}],
    })
    assert evaluate_condition(test_db, c2, {"permit_type": "Hot Work"}, actor_id="u").passed is False
    assert evaluate_condition(test_db, c2, {"permit_type": "Cold Work"}, actor_id="u").passed is True


def test_failure_policy_allow_override(test_db):
    c = _cond(test_db, cid="cond_advisory", policy="allow", definition={
        "logic": "AND", "rules": [{"type": "attribute", "field": "estimated_cost", "operator": "le", "value": 1000}]
    })
    res = evaluate_condition(test_db, c, {"estimated_cost": 20000}, actor_id="u")
    assert res.passed is False
    assert res.effective_pass is True
    assert "failure_policy = allow" in res.reason


def test_evaluate_condition_ids_all_and_any(test_db):
    c1 = _cond(test_db, cid="cond_a", definition={
        "logic": "AND", "rules": [{"type": "role", "role": "Supervisor"}]})
    c2 = _cond(test_db, cid="cond_b", definition={
        "logic": "AND", "rules": [{"type": "attribute", "field": "hazardous", "operator": "eq", "value": "Yes"}]})
    db = test_db
    all_ok, results, failing = evaluate_condition_ids(db, ["cond_a", "cond_b"], {"hazardous": "Yes"}, "u", actor_roles=["Technician"])
    assert all_ok is False and failing.condition_id == "cond_a"
    all_ok2, _, _ = evaluate_condition_ids(db, ["cond_a", "cond_b"], {"hazardous": "Yes"}, "u", actor_roles=["Supervisor"])
    assert all_ok2 is True
    any_ok, _ = evaluate_condition_any(db, ["cond_a", "cond_b"], {"hazardous": "Yes"}, "u", actor_roles=["Technician"])
    assert any_ok is True


def test_missing_condition_is_blocking(test_db):
    all_ok, results, failing = evaluate_condition_ids(test_db, ["cond_does_not_exist"], {}, "u")
    assert all_ok is False
    assert "not found" in results[0].reason


def test_versioned_registry_live_update(test_db):
    """Create -> v1. Edit -> v2 snapshot + live definition updated. Versions retained for tracking."""
    from backend.routers.conditions import create_or_update_condition, ConditionRequest
    created = create_or_update_condition(ConditionRequest(
        entity_type="permit", label="Hot Work Approval",
        definition={"logic": "AND", "rules": [{"type": "attribute", "field": "permit_type", "operator": "eq", "value": "Hot Work"}]},
    ), test_db)
    cid = created["id"]
    assert created["current_version"] == 1
    assert len(test_db.query(ConditionVersion).filter(ConditionVersion.condition_id == cid).all()) == 1

    updated = create_or_update_condition(ConditionRequest(
        id=cid, entity_type="permit", label="Hot Work Approval (updated)",
        definition={"logic": "AND", "rules": [
            {"type": "attribute", "field": "permit_type", "operator": "eq", "value": "Hot Work"},
            {"type": "role", "role": "Supervisor"},
        ]},
    ), test_db)
    assert updated["current_version"] == 2
    # Live definition now includes the role rule
    live = test_db.query(ConditionDefinition).filter(ConditionDefinition.id == cid).first()
    assert len(live.definition["rules"]) == 2
    versions = test_db.query(ConditionVersion).filter(ConditionVersion.condition_id == cid).order_by(ConditionVersion.version).all()
    assert [v.version for v in versions] == [1, 2]
    assert live.definition["rules"] == versions[-1].definition["rules"]


def test_live_update_propagates_everywhere(test_db):
    """Editing a referenced condition changes routing everywhere without touching consumers."""
    from backend.models.workflow import WorkflowDefinition
    from backend.services.condition_evaluator import evaluate_condition
    cond = _cond(test_db, cid="cond_route_selector", definition={
        "logic": "AND", "rules": [{"type": "attribute", "field": "permit_type", "operator": "eq", "value": "Hot Work"}]})
    # A workflow'd transition references this condition id (consumer)
    wf = WorkflowDefinition(id="wf_1", entity_type="permit", version_label="p_v1", status="published",
                            definition={"states": ["Start", "A", "B"], "transitions": [
                                {"from": "Start", "event": "GO", "conditions": [cond.id], "to": "A"}]})
    test_db.add(wf)
    test_db.flush()

    # Consumer evaluates current live logic
    res = evaluate_condition(test_db, cond, {"permit_type": "Hot Work"}, "u")
    assert res.passed is True

    # Author edits logic in ONE place
    cond.definition = {"logic": "AND", "rules": [{"type": "attribute", "field": "permit_type", "operator": "eq", "value": "Cold Work"}]}
    cond.current_version = 2
    test_db.add(ConditionVersion(condition_id=cond.id, version=2, label=cond.label, definition=cond.definition,
                                 failure_policy="block", created_by="admin@compassx.io"))
    test_db.flush()

    # Same consumer id now routes on the new logic — no consumer edits
    res2 = evaluate_condition(test_db, cond, {"permit_type": "Hot Work"}, "u")
    assert res2.passed is False
    res3 = evaluate_condition(test_db, cond, {"permit_type": "Cold Work"}, "u")
    assert res3.passed is True


def test_used_by_impact_analysis(test_db):
    from backend.models.workflow import WorkflowDefinition
    cond = _cond(test_db, cid="cond_impact", entity_type="permit")
    test_db.add(WorkflowDefinition(id="wf_impact", entity_type="permit", version_label="live_v1", status="published",
                                   definition={"states": ["S", "T"], "transitions": [
                                       {"from": "S", "event": "GO", "conditions": [cond.id], "to": "T"},
                                       {"from": "T", "event": "SPLIT", "choices": [{"to": "S", "when": [cond.id]}]},
                                   ]}))
    test_db.flush()
    from backend.routers.conditions import used_by
    report = used_by(cond.id, test_db)
    assert report["referenced"] is True
    assert len(report["workflows"]) == 1
    assert report["workflows"][0]["version_label"] == "live_v1"
    assert len(report["workflows"][0]["references"]) == 2