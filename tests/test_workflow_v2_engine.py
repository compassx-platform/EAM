"""
Tests for the standard_v2 realistic Work Order flow: expression engine, the
new declarative gate types, conditional routing (choices), automatic
conditional routing (auto_transitions), and declarative post-transition side
effects (on_after actions).

All flow behavior under test is configured purely through seed data — none of
these tests hard-code transition logic; they only assert observed behavior.
"""
import pytest
from datetime import datetime

from backend.services.expression import (
    evaluate_arithmetic,
    ExpressionError,
    render_template,
    render_template_mapping,
)
from backend.services.condition_evaluator import evaluate_condition
from backend.services.command_handler import (
    create_entity,
    propose_transition,
    NoConditionSatisfiedError,
    _resolve_transition_target,
    SYSTEM_WORKFLOW_ACTOR,
)
from backend.models.conditions import ConditionDefinition
from backend.models.entities import (
    DynamicEntity,
    DynamicEntityEvent,
)


@pytest.fixture
def conditions(test_db):
    """Look up the seeded conditions used across the v2 flow."""
    ids = [
        "cond_wo_is_emergency",
        "cond_wo_cost_high",
        "cond_wo_permit_required",
        "cond_wo_failure_recorded",
        "cond_wo_variance_over",
    ]
    found = {}
    for c in test_db.query(ConditionDefinition).filter(ConditionDefinition.id.in_(ids)).all():
        found[c.id] = c
    return found


def create_workorder_v2(db, **custom_fields):
    defaults = {
        "title": "Test Work Order",
        "priority": "Medium",
        "worktype": "CM",
        "hazardous": "No",
        "estlabcost": 1000,
        "estmatcost": 500,
    }
    defaults.update(custom_fields)
    return create_entity(db=db, entity_type="workorder", actor_id="tech@compassx.io", custom_fields=defaults)


# ---------------------------------------------------------------------------
# 1. Expression engine
# ---------------------------------------------------------------------------

def test_expression_engine_arithmetic():
    fields = {"estlabcost": 12000, "estmatcost": 6000, "actlabcost": 2200, "actmatcost": 300}
    assert evaluate_arithmetic("($estlabcost + $estmatcost)", fields) == 18000.0
    assert evaluate_arithmetic("{estlabcost} * 2 - 1000", fields) == 23000.0
    assert evaluate_arithmetic("-5 + 8", fields) == 3.0
    assert evaluate_arithmetic("(-$actlabcost) + 100", fields) == -2100.0
    assert evaluate_arithmetic("( $actlabcost + $actmatcost ) / ( $estlabcost + $estmatcost )", fields) == pytest.approx(2500.0 / 18000.0)


@pytest.mark.parametrize("expression", ["10 / 0", "$unknown + 1", "1 + ", "abc", "($a + 1"])
def test_expression_engine_rejects_bad(expression):
    with pytest.raises(ExpressionError):
        evaluate_arithmetic(expression, {"a": 1})


def test_expression_render_templates():
    fields = {"title": "Seal Kit"}
    rendered, unresolved = render_template("WO: {{title}} / {{now}}", fields)
    assert rendered.startswith("WO: Seal Kit / 2")
    assert unresolved == []

    rendered, unresolved = render_template("{{title}} ({{missing}})", fields)
    assert rendered == "Seal Kit ()"
    assert unresolved == ["missing"]

    mapping, unresolved = render_template_mapping(
        {"title": "{{title}} (Next PM)", "priority": "High", "retries": 3}, fields
    )
    assert mapping == {"title": "Seal Kit (Next PM)", "priority": "High", "retries": 3}
    assert unresolved == []


# ---------------------------------------------------------------------------
# 2. New declarative gate types
# ---------------------------------------------------------------------------

def test_attribute_condition_gate(test_db, conditions):
    c = conditions["cond_wo_is_emergency"]
    assert conditions["cond_wo_is_emergency"].definition["rules"][0]["type"] == "attribute"

    em_pass = evaluate_condition(db=test_db, condition=c, custom_fields={"worktype": "EM"}, actor_id="x@y")
    assert em_pass.effective_pass is True
    assert em_pass.passed is True

    cm_fail = evaluate_condition(db=test_db, condition=c, custom_fields={"worktype": "CM"}, actor_id="x@y")
    assert cm_fail.passed is False
    assert "CM" in cm_fail.reason


def test_attribute_condition_is_not_empty(test_db, conditions):
    c = conditions["cond_wo_failure_recorded"]
    assert evaluate_condition(db=test_db, condition=c, custom_fields={"failurecode": "FX-007"}, actor_id="x@y").passed is True
    assert evaluate_condition(db=test_db, condition=c, custom_fields={"failurecode": ""}, actor_id="x@y").passed is False
    assert evaluate_condition(db=test_db, condition=c, custom_fields={}, actor_id="x@y").passed is False


def test_expression_threshold_gate_cost(test_db, conditions):
    c = conditions["cond_wo_cost_high"]
    high = evaluate_condition(db=test_db, condition=c, custom_fields={"estlabcost": 12000, "estmatcost": 6000}, actor_id="x@y")
    assert high.passed is True
    low = evaluate_condition(db=test_db, condition=c, custom_fields={"estlabcost": 200, "estmatcost": 100}, actor_id="x@y")
    assert low.passed is False


def test_expression_threshold_gate_variance(test_db, conditions):
    c = conditions["cond_wo_variance_over"]
    base = {"estlabcost": 10000, "estmatcost": 5000}
    over = evaluate_condition(db=test_db, condition=c, custom_fields={**base, "actlabcost": 18000, "actmatcost": 9000}, actor_id="x@y")
    assert over.passed is True  # 27000/15000 = 1.8 > 1.15
    within = evaluate_condition(db=test_db, condition=c, custom_fields={**base, "actlabcost": 11000, "actmatcost": 5000}, actor_id="x@y")
    assert within.passed is False  # 16000/15000 = 1.067 <= 1.15


# ---------------------------------------------------------------------------
# 3. Conditional routing (choices)
# ---------------------------------------------------------------------------

def test_resolve_transition_target_no_condition(test_db):
    transition = {
        "from": "X",
        "event": "E",
        "choices": [
            {"to": "TARGET", "when": ["cond_wo_is_emergency"]},
        ],
    }
    with pytest.raises(NoConditionSatisfiedError) as exc_info:
        _resolve_transition_target(
            db=test_db,
            transition=transition,
            custom_fields={"worktype": "CM"},
            actor_context={"actor_id": "x@y", "actor_type": "human"},
        )
    assert exc_info.value.code == "no_condition_satisfied"
    assert exc_info.value.details["choice_trace"][0]["matched"] is False

    to_state, idx, trace, on_after = _resolve_transition_target(
        db=test_db,
        transition=transition,
        custom_fields={"worktype": "EM"},
        actor_context={"actor_id": "x@y", "actor_type": "human"},
    )
    assert to_state == "TARGET"
    assert idx == 0
    assert trace[0]["matched"] is True


def test_conditional_routing_low_cost_default_branch(test_db):
    res = create_workorder_v2(test_db)  # 1500 estimate, non EM/hazardous
    wo_id = res["entity_id"]
    assert res["status"] == "WAPPR"
    assert res["workflow_version"] == "standard_v2"

    result = propose_transition(
        db=test_db,
        entity_type="workorder",
        entity_id=wo_id,
        event_type="SUP_AUTHORIZE",
        actor_id="bob.supervisor@compassx.io",
        actor_roles=["Supervisor"],
    )
    assert result["new_status"] == "APPR"
    assert result["routing"]["choice_index"] == 1  # second, unconditional, catch-all branch
    assert result["routing"]["choices"][1]["matched"] is True


def test_conditional_routing_high_cost_manager_layer(test_db):
    res = create_workorder_v2(test_db, estlabcost=12000, estmatcost=6000)
    wo_id = res["entity_id"]

    result = propose_transition(
        db=test_db,
        entity_type="workorder",
        entity_id=wo_id,
        event_type="SUP_AUTHORIZE",
        actor_id="bob.supervisor@compassx.io",
        actor_roles=["Supervisor"],
    )
    assert result["new_status"] == "MGR_APPR"
    assert result["routing"]["choice_index"] == 0
    assert result["routing"]["choices"][0]["to"] == "MGR_APPR"

    # Manager rejects -> loops back to WAPPR for rework
    back = propose_transition(
        db=test_db,
        entity_type="workorder",
        entity_id=wo_id,
        event_type="MGR_REJECT",
        actor_id="dean.hr@compassx.io",
        actor_roles=["Manager"],
    )
    assert back["new_status"] == "WAPPR"


def test_conditional_routing_gate_supervisor_required(test_db):
    res = create_workorder_v2(test_db, estlabcost=12000, estmatcost=6000)
    with pytest.raises(Exception) as exc_info:
        propose_transition(
            db=test_db,
            entity_type="workorder",
            entity_id=res["entity_id"],
            event_type="SUP_AUTHORIZE",
            actor_id="charlie.tech@compassx.io",
            actor_roles=["Technician"],
        )
    assert "Supervisor" in str(exc_info.value)


# ---------------------------------------------------------------------------
# 4. Automatic conditional routing (auto_transitions)
# ---------------------------------------------------------------------------

def test_emergency_workorder_auto_routes_to_inprg(test_db):
    res = create_workorder_v2(test_db, worktype="EM", title="Cooling Line Burst")
    assert res["status"] == "INPRG"
    assert res["settled"], "expected an auto-transition to be fired on create"

    auto_events = (
        test_db.query(DynamicEntityEvent)
        .filter(DynamicEntityEvent.entity_id == res["entity_id"], DynamicEntityEvent.event_type == "AUTO_EMR")
        .all()
    )
    assert len(auto_events) == 1
    assert auto_events[0].from_state == "WAPPR"
    assert auto_events[0].to_state == "INPRG"
    assert auto_events[0].actor_id == SYSTEM_WORKFLOW_ACTOR
    assert auto_events[0].actor_type == "system"


def test_non_emergency_workorder_stays_parked(test_db):
    res = create_workorder_v2(test_db)
    assert res["status"] == "WAPPR"
    assert "settled" not in res


# ---------------------------------------------------------------------------
# 5. The realistic v2 flow — happy path walk-through
# ---------------------------------------------------------------------------

def test_express_path_no_permit_no_variance_no_failure(test_db):
    """Non-hazardous, low-cost work never touches permit/variance/failure layers."""
    res = create_workorder_v2(test_db)
    wo_id = res["entity_id"]

    steps = [
        ("SUP_AUTHORIZE", "APPR", ["Supervisor"]),
        ("START_WORK", "INPRG", []),
        ("COMPLETE_WORK", "COMP", []),
        ("FINALIZE", "CLOSING", []),
        ("CLOSE_WO", "CLOSED", []),
    ]
    for event, expected_status, roles in steps:
        out = propose_transition(
            db=test_db,
            entity_type="workorder",
            entity_id=wo_id,
            event_type=event,
            actor_id="bob.supervisor@compassx.io" if roles else "charlie.tech@compassx.io",
            actor_roles=roles or None,
        )
        assert out["new_status"] == expected_status, f"{event} -> {out['new_status']}"

    assert "side_effects" not in out

    wo = test_db.query(DynamicEntity).filter(DynamicEntity.id == wo_id).first()
    assert wo.status == "CLOSED"


def test_full_v2_hazardous_flow_with_actions(test_db):
    # --- Permit: park at APPROVED (exactly what the WO gate requires) ---
    res_p = create_entity(
        db=test_db,
        entity_type="permit",
        actor_id="charlie.tech@compassx.io",
        custom_fields={
            "title": "Boiler Inspection Hot Work Permit",
            "permit_type": "Hot Work",
            "location": "Boiler House Level 2",
            "hazards_identified": "Combustible dust",
        },
    )
    permit_id = res_p["entity_id"]
    assert res_p["status"] == "Requested"
    propose_transition(db=test_db, entity_type="permit", entity_id=permit_id, event_type="RISK_ASSESSMENT_COMPLETED", actor_id="charlie.tech@compassx.io")
    propose_transition(db=test_db, entity_type="permit", entity_id=permit_id, event_type="APPROVED", actor_id="alice.safety@compassx.io", actor_roles=["Safety Officer"])
    permit = test_db.query(DynamicEntity).filter(DynamicEntity.id == permit_id).first()
    assert permit.status == "Approved"

    # --- PM schedule that closing work will update ---
    res_pm = create_entity(
        db=test_db,
        entity_type="pm_schedule",
        actor_id="admin@compassx.io",
        custom_fields={"name": "Compressor Vane Quarterly PM", "asset": "COMP-004"},
    )
    pm_id = res_pm["entity_id"]
    assert res_pm["workflow_version"] == "pm_schedule_v1"

    # --- Hazardous, high-cost work order with linked permit + PM ---
    res_wo = create_workorder_v2(
        test_db,
        title="Replace Turbine Impeller Shaft Seals",
        priority="High",
        hazardous="Yes",
        estlabcost=12000,
        estmatcost=6000,
        linked_permit_id=permit_id,
        linked_pm_id=pm_id,
    )
    wo_id = res_wo["entity_id"]
    assert res_wo["status"] == "WAPPR"

    # 1. Supervisor authorizes -> cost > 5k routes through manager approval
    out = propose_transition(db=test_db, entity_type="workorder", entity_id=wo_id, event_type="SUP_AUTHORIZE", actor_id="bob.supervisor@compassx.io", actor_roles=["Supervisor"])
    assert out["new_status"] == "MGR_APPR"
    assert out["routing"]["choice_index"] == 0

    # 2. Manager approves -> APPR
    out = propose_transition(db=test_db, entity_type="workorder", entity_id=wo_id, event_type="MGR_AUTHORIZE", actor_id="dean.hr@compassx.io", actor_roles=["Manager"])
    assert out["new_status"] == "APPR"

    # 3. Hazardous -> permit-pending instead of straight to work
    out = propose_transition(db=test_db, entity_type="workorder", entity_id=wo_id, event_type="START_WORK", actor_id="charlie.tech@compassx.io")
    assert out["new_status"] == "PRMT_PEND"

    # 4. Cross-object gate: linked permit must be APPROVED
    out = propose_transition(db=test_db, entity_type="workorder", entity_id=wo_id, event_type="START_WORK", actor_id="charlie.tech@compassx.io")
    assert out["new_status"] == "INPRG"

    # 5. Complete with cost overrun (>15% variance) -> supervisor sign-off layer
    out = propose_transition(
        db=test_db,
        entity_type="workorder",
        entity_id=wo_id,
        event_type="COMPLETE_WORK",
        actor_id="charlie.tech@compassx.io",
        custom_fields_delta={"actlabcost": 18000, "actmatcost": 9000},
    )
    assert out["new_status"] == "VR_REVIEW"
    assert out["routing"]["choice_index"] == 0

    out = propose_transition(db=test_db, entity_type="workorder", entity_id=wo_id, event_type="SUP_SIGNOFF", actor_id="bob.supervisor@compassx.io", actor_roles=["Supervisor"])
    assert out["new_status"] == "COMP"

    # 6. Failure recorded -> RCA required before closing
    out = propose_transition(
        db=test_db,
        entity_type="workorder",
        entity_id=wo_id,
        event_type="FINALIZE",
        actor_id="charlie.tech@compassx.io",
        custom_fields_delta={"failurecode": "FX-007"},
    )
    assert out["new_status"] == "FAILURE"

    out = propose_transition(
        db=test_db,
        entity_type="workorder",
        entity_id=wo_id,
        event_type="RCA_COMPLETE",
        actor_id="charlie.tech@compassx.io",
        custom_fields_delta={
            "failure_class": "Mechanical",
            "failure_problem": "Seal wear",
            "failure_cause": "Contamination",
            "failure_remedy": "Replace seals + oil flush",
        },
    )
    assert out["new_status"] == "CLOSING"

    # 7. Close PM-linked work -> declarative side effects fire
    out = propose_transition(db=test_db, entity_type="workorder", entity_id=wo_id, event_type="CLOSE_WO", actor_id="bob.supervisor@compassx.io", actor_roles=["Supervisor"])
    assert out["new_status"] == "CLOSED"
    assert out["routing"]["choice_index"] == 0  # PM-linked branch

    side_effects = {se["type"]: se for se in out["side_effects"]}
    assert side_effects["update_related_entity_field"]["success"] is True
    assert side_effects["create_related_entity"]["success"] is True

    # 8a. PM schedule last_completion_date updated via a FIELD_UPDATE event
    pm = test_db.query(DynamicEntity).filter(DynamicEntity.id == pm_id).first()
    assert pm.custom_fields.get("last_completion_date") is not None

    pm_event = (
        test_db.query(DynamicEntityEvent)
        .filter(DynamicEntityEvent.entity_id == pm_id, DynamicEntityEvent.event_type == "FIELD_UPDATE")
        .first()
    )
    assert pm_event is not None
    assert pm_event.actor_id == SYSTEM_WORKFLOW_ACTOR
    assert pm_event.payload["custom_fields_delta"]["last_completion_date"] is not None

    # 8b. Next work order generated, new id written back to the closing WO
    wo = test_db.query(DynamicEntity).filter(DynamicEntity.id == wo_id).first()
    next_wo_id = wo.custom_fields.get("next_wo_id")
    assert next_wo_id is not None

    next_wo = test_db.query(DynamicEntity).filter(DynamicEntity.id == next_wo_id).first()
    assert next_wo is not None
    assert next_wo.status == "WAPPR"
    assert next_wo.workflow_version == "standard_v2"
    assert next_wo.custom_fields["title"] == "Replace Turbine Impeller Shaft Seals (Next PM)"
    assert next_wo.custom_fields["linked_pm_id"] == pm_id
    assert next_wo.custom_fields["priority"] == "High"


# ---------------------------------------------------------------------------
# 6. Seed sample entities + API surfaces
# ---------------------------------------------------------------------------

def test_seed_emergency_sample_auto_settled(test_db):
    wo = None
    for row in test_db.query(DynamicEntity).all():
        if (row.custom_fields or {}).get("title") == "Cooling Water Line Burst — Urgent Isolation":
            wo = row
            break
    assert wo is not None
    assert wo.status == "INPRG"
    assert wo.workflow_version == "standard_v2"

    sample_events = (
        test_db.query(DynamicEntityEvent)
        .filter(DynamicEntityEvent.entity_id == wo.id, DynamicEntityEvent.event_type == "AUTO_EMR")
        .count()
    )
    assert sample_events == 1


def test_valid_transitions_expose_choices(client):
    res = client.post("/api/workorder/create", json={"custom_fields": {"title": "API WO", "priority": "Low"}})
    assert res.status_code == 200
    body = res.json()
    wo_id = body["entity_id"]
    assert body["status"] == "WAPPR"

    vt = client.get(f"/api/workorder/{wo_id}/valid-transitions")
    assert vt.status_code == 200
    payload = vt.json()
    assert payload["current_status"] == "WAPPR"

    sup = next(t for t in payload["valid_transitions"] if t["event_type"] == "SUP_AUTHORIZE")
    assert sup["to_state"] is None  # decision node
    assert len(sup["choices"]) == 2
    assert sup["choices"][0]["to"] == "MGR_APPR"
    assert sup["choices"][1]["to"] == "APPR"

    assert any(a["event"] == "AUTO_EMR" for a in payload["auto_transitions_pending"])


def test_simulator_resolves_choices(client):
    res = client.post("/api/workorder/create", json={"custom_fields": {"title": "Sim WO", "priority": "Low"}})
    wo_id = res.json()["entity_id"]

    sim = client.post(
        "/api/workorder/simulate",
        json={
            "entity_id": wo_id,
            "event_type": "SUP_AUTHORIZE",
            "actor_roles": ["Supervisor"],
            "custom_fields_override": {"estlabcost": 12000, "estmatcost": 6000},
        },
    )
    assert sim.status_code == 200
    payload = sim.json()
    assert payload["accepted"] is True
    assert payload["to_state"] == "MGR_APPR"
    assert payload["routing"]["choice_index"] == 0