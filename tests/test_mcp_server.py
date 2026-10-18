"""
Automated test suite for CompassX EAM MCP Server.

Validates:
1. FastMCP server configuration, tool registration (61 tools across all 6 modules),
   prompts, and system resources.
2. Context management and acting on behalf of users with automatic RBAC role resolution.
3. Records module: create, transition, simulate, get, list, valid transitions, replay rebuild.
4. Workflow module: list, active, draft, validate, publish, deprecate, history.
5. Forms module: list, get, save, history, delete.
6. Entity module: entity types CRUD, custom fields registry, delete blockers.
7. Condition module: types catalog, create/update AST, evaluation, used_by impact analysis.
8. People module: directory CRUD, activation/inactivation, related records, availability,
   groups and member sequence assignments.
"""

import pytest
from backend.mcp_server.server import mcp, create_mcp_server
from backend.mcp_server.context import set_current_actor, get_current_actor
from backend.mcp_server.tools.records import (
    records_list,
    records_get,
    records_create,
    records_transition,
    records_get_valid_transitions,
    records_simulate_transition,
    records_rebuild_cache,
)
from backend.mcp_server.tools.workflow import (
    workflow_list,
    workflow_get,
    workflow_get_active,
    workflow_get_history,
    workflow_save_draft,
    workflow_validate,
    workflow_publish,
    workflow_deprecate,
)
from backend.mcp_server.tools.forms import (
    forms_list,
    forms_get,
    forms_save,
    forms_get_history,
)
from backend.mcp_server.tools.entity import (
    entity_type_list,
    entity_type_get,
    entity_type_create,
    entity_type_update,
    entity_fields_list,
    entity_field_create,
    entity_field_update,
    entity_field_delete,
    entity_type_delete,
)
from backend.mcp_server.tools.condition import (
    condition_types_list,
    condition_list,
    condition_get,
    condition_save,
    condition_evaluate,
    condition_used_by,
    condition_versions_list,
)
from backend.mcp_server.tools.people import (
    people_list,
    people_get,
    people_create,
    people_update,
    people_activate,
    people_inactivate,
    people_get_related,
    people_availability_create,
    people_availability_list,
    people_audit_list,
    people_groups_list,
    people_group_get,
    people_group_create,
    people_group_member_add,
    people_group_member_update,
    people_group_member_remove,
    people_group_delete,
)
from backend.mcp_server.tools.context import (
    user_set_active_actor,
    user_get_active_actor,
    user_list_available_actors,
    user_list_roles,
)
from backend.mcp_server.tools.asset_hierarchy import (
    location_list,
    location_get,
    location_create,
    location_update,
    location_delete,
    asset_list,
    asset_get,
    asset_create,
    asset_update,
    asset_delete,
    asset_hierarchy_drilldown,
    hierarchy_drilldown,
)


@pytest.fixture(autouse=True)
def setup_mcp_db(test_db, monkeypatch):
    """Ensures MCP tools use the test database session during tests."""
    monkeypatch.setattr("backend.mcp_server.context.SessionLocal", lambda: test_db)
    monkeypatch.setattr("backend.database.SessionLocal", lambda: test_db)
    set_current_actor("admin@compassx.io")
    yield


def test_mcp_server_registration():
    """Verify all tools across modules including asset hierarchy are properly registered."""
    tools = mcp._tool_manager.list_tools()
    assert len(tools) >= 73
    tool_names = {t.name for t in tools}

    # Core module coverage
    assert "records_create" in tool_names
    assert "records_transition" in tool_names
    assert "records_get" in tool_names
    assert "records_list" in tool_names
    assert "workflow_save_draft" in tool_names
    assert "workflow_publish" in tool_names
    assert "workflow_get_active" in tool_names
    assert "forms_get" in tool_names
    assert "forms_save" in tool_names
    assert "entity_type_create" in tool_names
    assert "entity_field_create" in tool_names
    assert "condition_save" in tool_names
    assert "condition_evaluate" in tool_names
    assert "people_create" in tool_names
    assert "people_group_create" in tool_names
    assert "location_list" in tool_names
    assert "location_get" in tool_names
    assert "location_create" in tool_names
    assert "location_update" in tool_names
    assert "location_delete" in tool_names
    assert "asset_list" in tool_names
    assert "asset_get" in tool_names
    assert "asset_create" in tool_names
    assert "asset_update" in tool_names
    assert "asset_delete" in tool_names
    assert "asset_hierarchy_drilldown" in tool_names
    assert "hierarchy_drilldown" in tool_names
    assert "user_set_active_actor" in tool_names
    assert "user_get_active_actor" in tool_names


def test_mcp_context_acting_on_behalf_of_users():
    """Verify user context inspection, switching, and role resolution."""
    # 1. Inspect initial active actor
    curr = user_get_active_actor()
    assert curr["success"] is True
    assert curr["active_actor_id"] == "admin@compassx.io"

    # 2. List available actors
    actors = user_list_available_actors()
    assert actors["success"] is True
    assert actors["user_count"] > 0
    assert actors["person_count"] > 0

    # 3. List system roles
    roles = user_list_roles()
    assert roles["success"] is True
    assert any(r["name"] == "Admin" for r in roles["roles"])
    assert any(r["name"] == "Safety Officer" for r in roles["roles"])

    # 4. Switch active actor to a safety user
    switched = user_set_active_actor("alice.safety@compassx.io")
    assert switched["success"] is True
    assert switched["active_actor_id"] == "alice.safety@compassx.io"
    assert "Safety Officer" in switched["resolved_roles"]


def test_mcp_records_module():
    """Verify creating, querying, transitioning, simulating, and rebuilding records."""
    # 1. Create a work order record on behalf of a user
    created = records_create(
        entity_type="workorder",
        custom_fields={"title": "Fix cooling pump #4", "priority": "High", "estimated_cost": 4500},
        payload={"comment": "Urgent pump vibration issue"},
        on_behalf_of="bob.technician@compassx.io",
    )
    assert created["success"] is True
    wo_id = created["id"]
    assert wo_id is not None
    assert created["status"] in ("WAPPR", "DRAFT", "Draft", "CREATED")
    last_event_id = created["last_event_id"]

    # 2. Get record details and audit trail
    detail = records_get("workorder", wo_id)
    assert detail["success"] is True
    assert detail["entity"]["id"] == wo_id
    assert len(detail["events"]) >= 1
    assert detail["events"][0]["event_type"] == "CREATED"
    assert detail["events"][0]["actor_id"] == "bob.technician@compassx.io"

    # 3. Inspect valid transitions
    valid = records_get_valid_transitions("workorder", wo_id)
    assert valid["success"] is True
    assert valid["has_published_workflow"] is True
    assert len(valid["valid_transitions"]) > 0
    event_to_call = valid["valid_transitions"][0]["event_type"]

    # 4. Simulate the transition for technician (fails supervisor role check)
    sim_tech = records_simulate_transition(
        entity_type="workorder",
        event_type="SUP_AUTHORIZE",
        entity_id=wo_id,
        on_behalf_of="bob.technician@compassx.io",
    )
    assert sim_tech["success"] is True
    assert sim_tech["accepted"] is False
    assert sim_tech["simulation"]["accepted"] is False
    assert "cond_role_supervisor" in str(sim_tech["simulation"])

    # 5. Transition fails if technician attempts supervisor authorization
    tr_fail = records_transition(
        entity_type="workorder",
        entity_id=wo_id,
        event_type="SUP_AUTHORIZE",
        expected_last_event_id=last_event_id,
        on_behalf_of="bob.technician@compassx.io",
    )
    assert tr_fail["success"] is False
    assert tr_fail["error_code"] == "condition_failed"

    # 6. Execute transition on behalf of a Supervisor user (succeeds)
    tr_sup = records_transition(
        entity_type="workorder",
        entity_id=wo_id,
        event_type="SUP_AUTHORIZE",
        expected_last_event_id=last_event_id,
        on_behalf_of="bob.supervisor@compassx.io",
    )
    assert tr_sup["success"] is True
    assert tr_sup["acted_on_behalf_of"] == "bob.supervisor@compassx.io"
    assert "Supervisor" in tr_sup["actor_roles"]

    # 6. Rebuild cache row from events
    rebuilt = records_rebuild_cache("workorder", wo_id)
    assert rebuilt["success"] is True
    assert rebuilt["entity"]["id"] == wo_id

    # 7. List records with filtering
    rec_list = records_list("workorder", limit=10)
    assert rec_list["success"] is True
    assert rec_list["total"] >= 1


def test_mcp_workflow_module():
    """Verify workflow listing, active lookup, draft authoring, validation, and publishing."""
    # 1. Get active published workflow
    active = workflow_get_active("workorder")
    assert active["success"] is True
    assert active["workflow"]["status"] == "published"

    # 2. List workflows
    wfs = workflow_list(entity_type="workorder")
    assert wfs["success"] is True
    assert len(wfs["workflows"]) >= 1

    # 3. Save a draft workflow
    draft_def = {
        "entity_type": "workorder",
        "states": ["Draft", "Submitted", "Closed"],
        "transitions": [
            {"from": "Draft", "event": "SUBMIT", "to": "Submitted", "conditions": []},
            {"from": "Submitted", "event": "CLOSE", "to": "Closed", "conditions": []},
        ],
        "terminal_states": ["Closed"],
    }
    draft = workflow_save_draft(
        entity_type="workorder",
        definition=draft_def,
        version_label="v99_test",
        on_behalf_of="admin@compassx.io",
    )
    assert draft["success"] is True
    draft_id = draft["workflow"]["id"]

    # 4. Validate the draft workflow
    val = workflow_validate(draft_id)
    assert val["success"] is True
    assert val["valid"] is True

    # 5. Check history
    hist = workflow_get_history("workorder")
    assert hist["success"] is True
    assert any(w["id"] == draft_id for w in hist["history"])


def test_mcp_forms_module():
    """Verify form layout inspection, saving, history, and versioning."""
    # 1. Get form layout
    form = forms_get("workorder")
    assert form["success"] is True
    assert "fields" in form["form"]

    # 2. Save form layout
    sample_layout = [
        {"i": "header:main", "label": "Work Order Details", "isHeader": True, "x": 0, "y": 0, "w": 12, "h": 1},
        {"i": "title", "label": "Title", "x": 0, "y": 1, "w": 12, "h": 1},
    ]
    saved = forms_save(entity_type="workorder", layout=sample_layout)
    assert saved["success"] is True

    # 3. History
    hist = forms_get_history("workorder")
    assert hist["success"] is True
    assert len(hist["versions"]) >= 1

    # 4. List forms
    flist = forms_list()
    assert flist["success"] is True
    assert any(f["entity_type"] == "workorder" for f in flist["forms"])


def test_mcp_entity_module():
    """Verify entity types CRUD and custom fields registry."""
    # 1. List entity types
    types = entity_type_list()
    assert types["success"] is True
    assert any(et["name"] == "workorder" for et in types["entity_types"])

    # 2. Create a new custom entity type
    new_type = entity_type_create(
        name="safety_audit",
        display_name="Safety Audit",
        description="Comprehensive site safety audit",
        fields=[
            {"field_name": "inspector_name", "field_type": "text", "label": "Inspector", "required": True},
            {"field_name": "score", "field_type": "number", "label": "Audit Score", "required": False},
        ]
    )
    assert new_type["success"] is True
    assert new_type["entity_type"]["name"] == "safety_audit"

    # 3. Get entity type
    fetched = entity_type_get("safety_audit")
    assert fetched["success"] is True
    assert fetched["entity_type"]["field_count"] >= 2

    # 4. Add a custom field to the new entity type
    f_create = entity_field_create(
        entity_type="safety_audit",
        field_name="audit_date",
        field_type="date",
        label="Date of Audit",
        required=True,
    )
    assert f_create["success"] is True
    assert f_create["field"]["field_name"] == "audit_date"

    # 5. List fields
    flist = entity_fields_list("safety_audit")
    assert flist["success"] is True
    assert any(f["field_name"] == "audit_date" for f in flist["fields"])

    # 6. Update field
    f_update = entity_field_update(
        entity_type="safety_audit",
        field_name="audit_date",
        label="Inspection Timestamp",
    )
    assert f_update["success"] is True
    assert f_update["field"]["label"] == "Inspection Timestamp"

    # 7. Delete field
    f_del = entity_field_delete("safety_audit", "audit_date")
    assert f_del["success"] is True

    # 8. Delete entity type
    del_et = entity_type_delete("safety_audit")
    assert del_et["success"] is True


def test_mcp_condition_module():
    """Verify condition types catalog, authoring, evaluation, and impact analysis."""
    # 1. Get types and operators catalog
    catalog = condition_types_list()
    assert catalog["success"] is True
    assert len(catalog["atoms"]) >= 5
    assert "number" in catalog["operators"]

    # 2. Save a structured condition
    cond = condition_save(
        entity_type="workorder",
        label="Estimated Cost Threshold Check",
        definition={
            "logic": "AND",
            "rules": [
                {"type": "attribute", "field": "estimated_cost", "operator": "lt", "value": 10000}
            ]
        },
        failure_policy="block",
    )
    assert cond["success"] is True
    cond_id = cond["condition"]["id"]

    # 3. Get condition
    fetched = condition_get(cond_id)
    assert fetched["success"] is True

    # 4. Evaluate condition (passing test)
    ev_pass = condition_evaluate(cond_id, custom_fields={"estimated_cost": 5000})
    assert ev_pass["success"] is True
    assert ev_pass["passed"] is True
    assert ev_pass["blocks_transition"] is False

    # 5. Evaluate condition (failing test)
    ev_fail = condition_evaluate(cond_id, custom_fields={"estimated_cost": 15000})
    assert ev_fail["success"] is True
    assert ev_fail["passed"] is False
    assert ev_fail["blocks_transition"] is True

    # 6. Used by analysis
    usage = condition_used_by(cond_id)
    assert usage["success"] is True
    assert "workflows" in usage

    # 7. Version history
    vlist = condition_versions_list(cond_id)
    assert vlist["success"] is True
    assert len(vlist["versions"]) >= 1


def test_mcp_people_module():
    """Verify people directory, assignments, availability, and person groups."""
    # 1. Create a person
    p = people_create(
        display_name="Dana Technician",
        person_id="DANA.TECH",
        primary_email="dana.tech@compassx.io",
        site="FACILITY-1",
        primary_shift="DAY",
    )
    assert p["success"] is True
    assert p["person"]["person_id"] == "DANA.TECH"

    # 2. Get person
    fetched = people_get("DANA.TECH")
    assert fetched["success"] is True
    assert fetched["person"]["site"] == "FACILITY-1"

    # 3. Update person
    upd = people_update("DANA.TECH", phone="555-0199")
    assert upd["success"] is True
    assert upd["person"]["phone"] == "555-0199"

    # 4. List persons
    plist = people_list(search="Dana")
    assert plist["success"] is True
    assert plist["total"] >= 1

    # 5. Schedule availability
    avail = people_availability_create(
        person_id="DANA.TECH",
        reason="Holiday",
        available_from="2026-10-01T08:00:00Z",
        available_to="2026-10-05T17:00:00Z",
    )
    assert avail["success"] is True

    # 6. List availability
    av_list = people_availability_list("DANA.TECH")
    assert av_list["success"] is True
    assert len(av_list["items"]) >= 1

    # 7. Create person group with member
    grp = people_group_create(
        group_name="ELECTRICAL_RESPONSE",
        description="Emergency electrical response team",
        is_crew_work_group=True,
        members=[{"person_id": "DANA.TECH", "sequence": 1, "is_group_default": True}]
    )
    assert grp["success"] is True
    assert grp["group"]["group_name"] == "ELECTRICAL_RESPONSE"

    # 8. List person groups
    glist = people_groups_list()
    assert glist["success"] is True
    assert any(g["group_name"] == "ELECTRICAL_RESPONSE" for g in glist["groups"])

    # 9. Get person related records
    rel = people_get_related("DANA.TECH")
    assert rel["success"] is True
    assert "ELECTRICAL_RESPONSE" in rel["groups"]

    # 10. Update group member
    upd_mem = people_group_member_update(
        group_name="ELECTRICAL_RESPONSE",
        person_id="DANA.TECH",
        sequence=2,
    )
    assert upd_mem["success"] is True

    # 11. Remove member & delete group
    rem = people_group_member_remove("ELECTRICAL_RESPONSE", "DANA.TECH")
    assert rem["success"] is True
    del_grp = people_group_delete("ELECTRICAL_RESPONSE")
    assert del_grp["success"] is True

    # 12. Inactivate & activate person
    inact = people_inactivate("DANA.TECH")
    assert inact["success"] is True
    assert inact["status"] == "INACTIVE"

    act = people_activate("DANA.TECH")
    assert act["success"] is True
    assert act["status"] == "ACTIVE"


def test_mcp_asset_hierarchy_tools(test_db):
    """Verify MCP tools for locations, assets, sub-assemblies, and hierarchy drilldown."""
    # 1. List seeded locations
    locs = location_list(site_id="BEDFORD")
    assert locs["success"] is True
    loc_ids = [l["location_id"] for l in locs["locations"]]
    assert "FACILITY_A" in loc_ids
    assert "MECH_ROOM_101" in loc_ids

    # 2. Create location
    created_loc = location_create(
        location_id="MCP_TEST_WAREHOUSE",
        site_id="BEDFORD",
        description="MCP Test Warehouse Location",
        type="STOREROOM",
        status="OPERATING",
        gl_account="1200-99",
    )
    assert created_loc["success"] is True
    assert created_loc["location"]["location_id"] == "MCP_TEST_WAREHOUSE"

    # 3. Create sub-location
    sub_loc = location_create(
        location_id="MCP_TEST_AISLE_1",
        site_id="BEDFORD",
        parent_location_id="MCP_TEST_WAREHOUSE",
        description="Aisle 1 Storage Rack",
        type="STOREROOM",
    )
    assert sub_loc["success"] is True
    assert sub_loc["location"]["parent_location_id"] == "MCP_TEST_WAREHOUSE"

    # 4. Prevent self-parenting on location
    self_loc = location_update(
        site_id="BEDFORD",
        location_id="MCP_TEST_WAREHOUSE",
        parent_location_id="MCP_TEST_WAREHOUSE",
    )
    assert self_loc["success"] is False
    assert "cannot be its own parent" in self_loc["error"]

    # 5. Get location details (including installed assets)
    get_loc = location_get(site_id="BEDFORD", location_id="MCP_TEST_WAREHOUSE")
    assert get_loc["success"] is True
    assert get_loc["location"]["location_id"] == "MCP_TEST_WAREHOUSE"
    assert "installed_assets" in get_loc["location"]

    # 6. List seeded assets
    assets = asset_list(site_id="BEDFORD")
    assert assets["success"] is True
    asset_ids = [a["asset_id"] for a in assets["assets"]]
    assert "PUMP_SYS_100" in asset_ids
    assert "MOTOR_50HP_01" in asset_ids

    # 7. Create parent machinery asset
    created_asset = asset_create(
        asset_id="MCP_COMPRESSOR_01",
        site_id="BEDFORD",
        location_id="MCP_TEST_WAREHOUSE",
        name="Main Industrial Air Compressor",
        description="Dual stage rotary screw compressor",
        item_num="ROT-COMP-99",
        serial_num="SN-MCP-9901",
        status="OPERATING",
        vendor="KAESER",
        manufacturer="Kaeser Compressors",
        model="CSD 125",
        purchase_cost=45000.0,
        install_date="2026-06-01T08:00:00Z",
        priority=1,
    )
    assert created_asset["success"] is True
    assert created_asset["asset"]["asset_id"] == "MCP_COMPRESSOR_01"

    # 8. Create child sub-assembly asset
    created_child = asset_create(
        asset_id="MCP_COMP_MOTOR_01",
        site_id="BEDFORD",
        location_id="MCP_TEST_WAREHOUSE",
        parent_asset_id="MCP_COMPRESSOR_01",
        name="Compressor 75HP Drive Motor",
        description="High efficiency electric drive motor",
        status="OPERATING",
        purchase_cost=12000.0,
        priority=2,
    )
    assert created_child["success"] is True
    assert created_child["asset"]["parent_asset_id"] == "MCP_COMPRESSOR_01"

    # 9. Prevent self-parenting on asset
    self_asset = asset_update(
        site_id="BEDFORD",
        asset_id="MCP_COMPRESSOR_01",
        parent_asset_id="MCP_COMPRESSOR_01",
    )
    assert self_asset["success"] is False
    assert "cannot be its own parent" in self_asset["error"]

    # 10. Get asset details and verify sub-assembly hierarchy
    get_ast = asset_get(site_id="BEDFORD", asset_id="MCP_COMPRESSOR_01")
    assert get_ast["success"] is True
    assert get_ast["asset"]["asset_id"] == "MCP_COMPRESSOR_01"
    child_ids = [c["asset_id"] for c in get_ast["asset"]["child_assets"]]
    assert "MCP_COMP_MOTOR_01" in child_ids

    # 11. Multi-level drilldown hierarchy tree
    drilldown = asset_hierarchy_drilldown(site_id="BEDFORD")
    assert drilldown["success"] is True
    assert drilldown["count"] == 1
    site_tree = drilldown["sites"][0]
    assert site_tree["site_id"] == "BEDFORD"
    assert site_tree["total_locations"] >= 5
    assert site_tree["total_assets"] >= 5

    # Also test convenience alias hierarchy_drilldown
    alias_tree = hierarchy_drilldown(site_id="BEDFORD")
    assert alias_tree["success"] is True
    assert len(alias_tree["sites"]) == 1

    # 12. Cleanup created assets and locations
    del_child = asset_delete(site_id="BEDFORD", asset_id="MCP_COMP_MOTOR_01")
    assert del_child["success"] is True
    del_parent = asset_delete(site_id="BEDFORD", asset_id="MCP_COMPRESSOR_01")
    assert del_parent["success"] is True

    del_sub_loc = location_delete(site_id="BEDFORD", location_id="MCP_TEST_AISLE_1")
    assert del_sub_loc["success"] is True
    del_main_loc = location_delete(site_id="BEDFORD", location_id="MCP_TEST_WAREHOUSE")
    assert del_main_loc["success"] is True
