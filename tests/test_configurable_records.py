"""Generic record actions a company uses to assemble a work order.

No work order status list, table, or screen is involved. The tests only check
that configured actions and conditions do what the company asked.
"""

from datetime import datetime, timedelta, timezone

from backend.models.asset_hierarchy import Asset
from backend.models.organization import CompanySet, Organization, Site
from backend.models.stock import StockBalance, StockReservation


def _fields(*names, kinds=None):
    kinds = kinds or {}
    rows = [{"field_name": "title", "field_type": "text", "label": "Title", "required": False}]
    for name in names:
        rows.append({"field_name": name, "field_type": kinds.get(name, "text"), "label": name, "required": False})
    return rows


def _publish(client, entity_type, states, transitions):
    draft = client.post("/api/workflows/draft", json={
        "entity_type": entity_type,
        "version_label": "v1",
        "definition": {"states": states, "entry_state": states[0], "transitions": transitions},
    })
    assert draft.status_code == 200, draft.text
    published = client.post(f"/api/workflows/{draft.json()['id']}/publish")
    assert published.status_code == 200, published.text


def _condition(client, entity_type, cond_id, rule):
    res = client.post("/api/conditions", json={
        "id": cond_id,
        "entity_type": entity_type,
        "label": cond_id,
        "definition": {"logic": "AND", "rules": [rule]},
    })
    assert res.status_code == 200, res.text


def _create(client, entity_type, fields):
    res = client.post(f"/api/{entity_type}/create", json={"custom_fields": {"title": "Record", **fields}})
    assert res.status_code == 200, res.text
    return res.json()


def _move(client, entity_type, entity_id, event):
    return client.post(f"/api/{entity_type}/transition", json={"entity_id": entity_id, "event_type": event})


def _status(client, entity_type, entity_id):
    res = client.get(f"/api/{entity_type}/{entity_id}")
    assert res.status_code == 200, res.text
    return res.json()["entity"]


def _plant(db):
    db.add(CompanySet(set_id="SET1", description="Set"))
    db.add(Organization(org_id="ORG1", name="Org", company_set_id="SET1"))
    db.add(Site(site_id="BED1", org_id="ORG1", name="Bedford"))
    db.add(Asset(asset_id="PUMP1", site_id="BED1", org_id="ORG1", name="Idle pump", status="NOT_READY"))
    db.add(Asset(asset_id="PUMP2", site_id="BED1", org_id="ORG1", name="Running pump", status="OPERATING"))
    db.commit()


def _setup(client):
    line_fields = _fields(
        "parent_id", "template_id", "hours", "item", "storeroom", "site_id", "quantity", "follow", "direct_issue",
        kinds={"hours": "number", "quantity": "number", "follow": "boolean", "direct_issue": "boolean"},
    )
    assert client.post("/api/entity-types", json={
        "name": "line", "display_name": "Line", "fields": line_fields,
    }).status_code == 200
    _publish(client, "line", ["NEW", "DONE", "STARTED"], [
        {"from": "NEW", "to": "DONE", "event": "APPROVE"},
        {
            "from": "NEW", "to": "STARTED", "event": "START",
            "on_after": [{
                "type": "transition_related_entity",
                "params": {"relationship_field": "parent_id", "target_entity_type": "card", "event": "START"},
            }],
        },
    ])

    card_fields = _fields(
        "actual_start", "hours", "plan_id", "flow_control", "estimate", "site_id", "asset_id",
        "due_at", "lead_days", "meter_point", "generated_id",
        kinds={
            "actual_start": "datetime", "hours": "number", "flow_control": "boolean",
            "estimate": "number", "due_at": "datetime", "lead_days": "number",
        },
    )
    assert client.post("/api/entity-types", json={
        "name": "card",
        "display_name": "Card",
        "fields": card_fields,
        "children": [{"entity_type": "line", "link_field": "parent_id"}],
    }).status_code == 200
    _condition(client, "card", "cond_lines_done", {
        "type": "children", "child_entity_type": "line", "link_field": "parent_id",
        "quantifier": "all", "status": "DONE",
    })
    _condition(client, "card", "cond_no_actuals", {
        "type": "children", "child_entity_type": "line", "link_field": "parent_id",
        "quantifier": "none", "field": "hours", "operator": "is_not_empty",
    })
    _condition(client, "card", "cond_any_actual", {
        "type": "children", "child_entity_type": "line", "link_field": "parent_id",
        "quantifier": "any", "field": "hours", "operator": "is_not_empty",
    })
    _publish(client, "card", ["DRAFT", "OPEN", "RESERVED", "RELEASED", "ISSUED", "SOFT", "DONE", "STARTED", "CANCELLED"], [
        {
            "from": "DRAFT", "to": "OPEN", "event": "APPROVE",
            "on_after": [
                {"type": "set_value", "params": {"fields": {"actual_start": "now"}}},
                {"type": "copy_lines", "params": {
                    "source_id_field": "plan_id", "child_entity_type": "line",
                    "source_link_field": "template_id", "target_link_field": "parent_id",
                }},
                {"type": "rollup", "params": {
                    "child_entity_type": "line", "link_field": "parent_id",
                    "sums": [{"from": "hours", "to": "estimate"}],
                }},
                {"type": "inherit_status", "params": {
                    "child_entity_type": "line", "link_field": "parent_id", "opt_in_field": "follow",
                    "flow_control_field": "flow_control", "skip_events": ["APPROVE"],
                }},
            ],
        },
        {"from": "DRAFT", "to": "STARTED", "event": "START"},
        {
            "from": "DRAFT", "to": "RESERVED", "event": "RESERVE",
            "on_after": [{
                "reject_on_failure": True,
                "type": "reserve_stock",
                "params": {
                    "child_entity_type": "line", "link_field": "parent_id",
                    "site_field": "site_id", "item_field": "item", "storeroom_field": "storeroom",
                    "quantity_field": "quantity", "direct_issue_field": "direct_issue",
                },
            }],
        },
        {
            "from": "RESERVED", "to": "RELEASED", "event": "RELEASE",
            "on_after": [{
                "type": "release_stock",
                "params": {"child_entity_type": "line", "link_field": "parent_id"},
            }],
        },
        {
            "from": "DRAFT", "to": "ISSUED", "event": "ISSUE",
            "on_after": [{
                "type": "issue_stock",
                "params": {
                    "child_entity_type": "line", "link_field": "parent_id",
                    "site_field": "site_id", "item_field": "item", "storeroom_field": "storeroom",
                    "quantity_field": "quantity", "direct_issue_field": "direct_issue",
                },
            }],
        },
        {
            "from": "DRAFT", "to": "OPEN", "event": "BAD",
            "on_after": [{"reject_on_failure": True, "type": "set_value", "params": {"fields": {"hours": "nope"}}}],
        },
        {
            "from": "DRAFT", "to": "SOFT", "event": "SOFT",
            "on_after": [{"type": "set_value", "params": {"fields": {"hours": "nope"}}}],
        },
        {"from": "OPEN", "to": "DONE", "event": "COMPLETE", "conditions": ["cond_lines_done"]},
        {"from": "DRAFT", "to": "CANCELLED", "event": "CANCEL", "conditions": ["cond_no_actuals"]},
        {"from": "DRAFT", "to": "OPEN", "event": "NOTE_ACTUAL", "conditions": ["cond_any_actual"]},
    ])

    schedule_fields = _fields(
        "due_at", "lead_days", "site_id", "asset_id", "meter_point", "generated_id",
        kinds={"due_at": "datetime", "lead_days": "number"},
    )
    assert client.post("/api/entity-types", json={
        "name": "schedule", "display_name": "Schedule", "fields": schedule_fields,
    }).status_code == 200
    _publish(client, "schedule", ["WAIT", "RAN"], [{
        "from": "WAIT", "to": "RAN", "event": "GENERATE",
        "on_after": [{
            "reject_on_failure": True,
            "type": "create_related_entity",
            "params": {
                "target_entity_type": "card",
                "relationship_field": "generated_id",
                "due_field": "due_at",
                "lead_days_field": "lead_days",
                "require_operating": True,
                "site_field": "site_id",
                "asset_field": "asset_id",
                "reuse_match_fields": ["meter_point"],
                "closed_statuses": ["DONE"],
                "template": {"title": "Generated", "meter_point": "{{meter_point}}", "site_id": "{{site_id}}"},
            },
        }],
    }])


def test_set_value_stamps_now_and_a_rejecting_action_rolls_back(client):
    _setup(client)
    card = _create(client, "card", {})
    moved = _move(client, "card", card["entity_id"], "APPROVE")
    assert moved.status_code == 200, moved.text
    saved = _status(client, "card", card["entity_id"])
    assert saved["status"] == "OPEN"
    assert saved["custom_fields"]["actual_start"]

    refused_id = _create(client, "card", {})["entity_id"]
    refused = _move(client, "card", refused_id, "BAD")
    assert refused.status_code == 400, refused.text
    assert _status(client, "card", refused_id)["status"] == "DRAFT"

    soft_id = _create(client, "card", {})["entity_id"]
    soft = _move(client, "card", soft_id, "SOFT")
    assert soft.status_code == 200, soft.text
    assert _status(client, "card", soft_id)["status"] == "SOFT"
    assert any(item.get("success") is False for item in soft.json().get("side_effects") or [])


def test_child_records_have_their_own_workflow(client):
    _setup(client)
    card = _create(client, "card", {})
    line = _create(client, "line", {"parent_id": card["entity_id"], "title": "Task"})
    listed = client.get(f"/api/card/{card['entity_id']}/children")
    assert listed.status_code == 200, listed.text
    items = listed.json()["groups"][0]["items"]
    assert [row["id"] for row in items] == [line["entity_id"]]

    moved = _move(client, "line", line["entity_id"], "APPROVE")
    assert moved.status_code == 200, moved.text
    assert _status(client, "line", line["entity_id"])["status"] == "DONE"
    assert _status(client, "card", card["entity_id"])["status"] == "DRAFT"


def test_copy_does_not_change_the_template_and_rollup_sums_children(client):
    _setup(client)
    template = _create(client, "card", {})
    _create(client, "line", {"template_id": template["entity_id"], "hours": 4, "follow": True, "title": "Planned"})
    _create(client, "line", {"template_id": template["entity_id"], "hours": 1.5, "follow": False, "title": "Extra"})
    card = _create(client, "card", {"plan_id": template["entity_id"]})
    moved = _move(client, "card", card["entity_id"], "APPROVE")
    assert moved.status_code == 200, moved.text

    saved = _status(client, "card", card["entity_id"])
    assert saved["custom_fields"]["estimate"] == 5.5
    copied = client.get(f"/api/card/{card['entity_id']}/children").json()["groups"][0]["items"]
    assert len(copied) == 2
    assert sorted(row["custom_fields"]["hours"] for row in copied) == [1.5, 4]

    template_lines = client.get(f"/api/line?limit=50").json()["items"]
    originals = [row for row in template_lines if row["custom_fields"].get("template_id") == template["entity_id"]]
    assert len(originals) == 2
    assert all(not row["custom_fields"].get("parent_id") for row in originals)
    followed = [row for row in copied if row["custom_fields"].get("follow") in (True, "true", "True")]
    assert followed and followed[0]["status"] == "DONE"
    left = [row for row in copied if row["id"] not in {item["id"] for item in followed}]
    assert left[0]["status"] == "NEW"


def test_flow_control_skips_inheritance_and_labor_start_can_start_the_parent(client):
    _setup(client)
    held = _create(client, "card", {"flow_control": True})
    held_line = _create(client, "line", {"parent_id": held["entity_id"], "follow": True})
    assert _move(client, "card", held["entity_id"], "APPROVE").status_code == 200
    assert _status(client, "line", held_line["entity_id"])["status"] == "NEW"

    parent = _create(client, "card", {})
    starter = _create(client, "line", {"parent_id": parent["entity_id"]})
    bystander = _create(client, "line", {"parent_id": parent["entity_id"]})
    assert _move(client, "line", starter["entity_id"], "START").status_code == 200
    assert _status(client, "line", starter["entity_id"])["status"] == "STARTED"
    assert _status(client, "card", parent["entity_id"])["status"] == "STARTED"
    assert _status(client, "line", bystander["entity_id"])["status"] == "NEW"


def test_child_conditions_gate_complete_and_cancel(client):
    _setup(client)
    card = _create(client, "card", {})
    first = _create(client, "line", {"parent_id": card["entity_id"]})
    second = _create(client, "line", {"parent_id": card["entity_id"], "hours": 2})
    assert _move(client, "card", card["entity_id"], "APPROVE").status_code == 200
    blocked = _move(client, "card", card["entity_id"], "COMPLETE")
    assert blocked.status_code == 422

    assert _move(client, "line", first["entity_id"], "APPROVE").status_code == 200
    assert _move(client, "line", second["entity_id"], "APPROVE").status_code == 200
    finished = _move(client, "card", card["entity_id"], "COMPLETE")
    assert finished.status_code == 200, finished.text
    assert _status(client, "card", card["entity_id"])["status"] == "DONE"

    open_card = _create(client, "card", {})
    _create(client, "line", {"parent_id": open_card["entity_id"], "hours": 1})
    assert _move(client, "card", open_card["entity_id"], "CANCEL").status_code == 422
    assert _move(client, "card", open_card["entity_id"], "NOTE_ACTUAL").status_code == 200


def test_stock_reserve_refuses_a_short_balance_and_direct_issue_skips_stock(client, test_db):
    _setup(client)
    client.post("/api/stock/items", json={"org_id": "ORG1", "itemnum": "BOLT", "unit_cost": 2})
    client.post("/api/stock/storerooms", json={"site_id": "BED1", "storeroom": "CENTRAL"})
    client.post("/api/stock/balances", json={"site_id": "BED1", "storeroom": "CENTRAL", "itemnum": "BOLT", "quantity": 3})

    short = _create(client, "card", {})
    _create(client, "line", {
        "parent_id": short["entity_id"], "site_id": "BED1", "item": "BOLT",
        "storeroom": "CENTRAL", "quantity": 5,
    })
    refused = _move(client, "card", short["entity_id"], "RESERVE")
    assert refused.status_code == 400, refused.text
    assert _status(client, "card", short["entity_id"])["status"] == "DRAFT"
    assert test_db.query(StockReservation).count() == 0

    client.post("/api/stock/balances", json={"site_id": "BED1", "storeroom": "CENTRAL", "itemnum": "BOLT", "quantity": 10})
    card = _create(client, "card", {})
    _create(client, "line", {
        "parent_id": card["entity_id"], "site_id": "BED1", "item": "BOLT",
        "storeroom": "CENTRAL", "quantity": 4,
    })
    _create(client, "line", {
        "parent_id": card["entity_id"], "site_id": "BED1", "item": "BOLT",
        "storeroom": "CENTRAL", "quantity": 5, "direct_issue": True,
    })
    reserved = _move(client, "card", card["entity_id"], "RESERVE")
    assert reserved.status_code == 200, reserved.text
    test_db.expire_all()
    holds = test_db.query(StockReservation).all()
    assert len(holds) == 1
    assert holds[0].quantity == 4
    balance = test_db.query(StockBalance).one()
    assert balance.quantity == 10

    released = _move(client, "card", card["entity_id"], "RELEASE")
    assert released.status_code == 200, released.text
    test_db.expire_all()
    assert test_db.query(StockReservation).count() == 0

    issued = _create(client, "card", {})
    _create(client, "line", {
        "parent_id": issued["entity_id"], "site_id": "BED1", "item": "BOLT",
        "storeroom": "CENTRAL", "quantity": 2,
    })
    _create(client, "line", {
        "parent_id": issued["entity_id"], "site_id": "BED1", "item": "BOLT",
        "storeroom": "CENTRAL", "quantity": -1,
    })
    _create(client, "line", {
        "parent_id": issued["entity_id"], "site_id": "BED1", "item": "BOLT",
        "storeroom": "CENTRAL", "quantity": 9, "direct_issue": True,
    })
    assert _move(client, "card", issued["entity_id"], "ISSUE").status_code == 200
    test_db.expire_all()
    assert test_db.query(StockBalance).one().quantity == 9


def test_generation_checks_due_date_operating_asset_and_open_record(client, test_db):
    _setup(client)
    _plant(test_db)
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    next_month = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    early = _create(client, "schedule", {
        "due_at": next_month, "lead_days": 1, "site_id": "BED1", "asset_id": "PUMP2", "meter_point": "M1",
    })
    early_move = _move(client, "schedule", early["entity_id"], "GENERATE")
    assert early_move.status_code == 200, early_move.text
    assert early_move.json()["side_effects"][0]["skipped"] is True
    assert not _status(client, "schedule", early["entity_id"])["custom_fields"].get("generated_id")

    idle = _create(client, "schedule", {
        "due_at": yesterday, "lead_days": 0, "site_id": "BED1", "asset_id": "PUMP1", "meter_point": "M2",
    })
    refused = _move(client, "schedule", idle["entity_id"], "GENERATE")
    assert refused.status_code == 400, refused.text
    assert _status(client, "schedule", idle["entity_id"])["status"] == "WAIT"

    first = _create(client, "schedule", {
        "due_at": yesterday, "lead_days": 0, "site_id": "BED1", "asset_id": "PUMP2", "meter_point": "M3",
    })
    created = _move(client, "schedule", first["entity_id"], "GENERATE")
    assert created.status_code == 200, created.text
    generated_id = _status(client, "schedule", first["entity_id"])["custom_fields"]["generated_id"]
    assert _status(client, "card", generated_id)["custom_fields"]["meter_point"] == "M3"

    second = _create(client, "schedule", {
        "due_at": yesterday, "lead_days": 0, "site_id": "BED1", "asset_id": "PUMP2", "meter_point": "M3",
    })
    reused = _move(client, "schedule", second["entity_id"], "GENERATE")
    assert reused.status_code == 200, reused.text
    assert reused.json()["side_effects"][0]["reused"] is True
    assert _status(client, "schedule", second["entity_id"])["custom_fields"]["generated_id"] == generated_id
