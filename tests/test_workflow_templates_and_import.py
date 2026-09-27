import pytest
from backend.models.conditions import ConditionDefinition

def test_list_templates(client, test_db):
    response = client.get("/api/workflows/templates")
    assert response.status_code == 200
    templates = response.json()
    assert isinstance(templates, list)
    assert len(templates) >= 4
    
    template_ids = [t["template_id"] for t in templates]
    assert "template_corrective_workorder" in template_ids
    assert "template_permit_to_work" in template_ids
    assert "template_capex_procurement" in template_ids
    assert "template_incident_capa" in template_ids
    
    first = templates[0]
    assert "name" in first
    assert "description" in first
    assert "category" in first
    assert "state_count" in first
    assert "transition_count" in first

def test_get_template_detail(client, test_db):
    response = client.get("/api/workflows/templates/template_corrective_workorder")
    assert response.status_code == 200
    data = response.json()
    assert "manifest" in data
    assert "workflow" in data
    assert "conditions" in data
    assert "roles" in data
    
    assert data["manifest"]["template_id"] == "template_corrective_workorder"
    assert "Draft" in data["workflow"]["states"]
    assert "Cost_Router" in data["workflow"]["states"]
    assert len(data["conditions"]) >= 1
    assert data["conditions"][0]["id"] == "cond_wo_high_cost"

def test_get_template_not_found(client, test_db):
    response = client.get("/api/workflows/templates/non_existent_template_xyz")
    assert response.status_code == 404

def test_import_workflow_template_new_draft(client, test_db):
    # Fetch template bundle
    tmpl_res = client.get("/api/workflows/templates/template_corrective_workorder")
    assert tmpl_res.status_code == 200
    bundle = tmpl_res.json()
    
    # Import into custom test entity
    import_payload = {
        "bundle": bundle,
        "target_entity_type": "test_equip_workorder",
        "conflict_strategy": "new_draft",
        "import_conditions": True,
        "import_roles": True,
        "import_fields_and_forms": True,
        "activate_immediately": False
    }
    
    import_res = client.post("/api/workflows/import", json=import_payload)
    assert import_res.status_code == 200
    res_data = import_res.json()
    assert res_data["success"] is True
    assert res_data["workflow"]["entity_type"] == "test_equip_workorder"
    assert res_data["workflow"]["status"] == "draft"
    assert res_data["summary"]["states_count"] == len(bundle["workflow"]["states"])
    assert res_data["summary"]["conditions_imported"] >= 1
    
    # Check that condition exists
    cond = test_db.query(ConditionDefinition).filter(ConditionDefinition.id == "cond_wo_high_cost").first()
    assert cond is not None

def test_import_workflow_immediate_activation(client, test_db):
    tmpl_res = client.get("/api/workflows/templates/template_permit_to_work")
    assert tmpl_res.status_code == 200
    bundle = tmpl_res.json()
    
    import_payload = {
        "bundle": bundle,
        "target_entity_type": "test_hot_work_permit",
        "conflict_strategy": "new_draft",
        "import_conditions": True,
        "import_roles": True,
        "activate_immediately": True
    }
    
    import_res = client.post("/api/workflows/import", json=import_payload)
    assert import_res.status_code == 200
    res_data = import_res.json()
    assert res_data["workflow"]["status"] == "published"
    
    # Verify active workflow can be retrieved
    active_res = client.get("/api/workflows/active/test_hot_work_permit")
    assert active_res.status_code == 200
    assert active_res.json()["id"] == res_data["workflow"]["id"]

def test_export_workflow_bundle(client, test_db):
    # First import and activate
    tmpl_res = client.get("/api/workflows/templates/template_permit_to_work")
    bundle = tmpl_res.json()
    import_res = client.post("/api/workflows/import", json={
        "bundle": bundle,
        "target_entity_type": "test_export_permit",
        "activate_immediately": True
    })
    assert import_res.status_code == 200
    wf_id = import_res.json()["workflow"]["id"]
    
    export_res = client.get(f"/api/workflows/{wf_id}/export")
    assert export_res.status_code == 200
    exported_bundle = export_res.json()
    
    assert "manifest" in exported_bundle
    assert exported_bundle["manifest"]["schema_version"] == "compassx-workflow-bundle/v1"
    assert exported_bundle["manifest"]["entity_type"] == "test_export_permit"
    assert "workflow" in exported_bundle
    assert "conditions" in exported_bundle
    assert "roles" in exported_bundle
    assert len(exported_bundle["conditions"]) >= 1

def test_import_invalid_workflow_graph(client, test_db):
    invalid_bundle = {
        "manifest": {
            "name": "Invalid Workflow",
            "entity_type": "test_invalid"
        },
        "workflow": {
            "states": ["StateA", "StateB"],
            "transitions": [
                {"from": "StateA", "to": "NonExistentState", "event": "GO"}
            ]
        }
    }
    
    import_res = client.post("/api/workflows/import", json={"bundle": invalid_bundle})
    assert import_res.status_code == 400
    data = import_res.json()
    assert "detail" in data
