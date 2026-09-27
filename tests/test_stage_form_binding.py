"""Two-way binding between workflow stages and the form layout.

Direction 1 (form value -> workflow stage): an Electrical Isolation permit is
routed through an extra IsolationPrecheck node while other permit types take the
default risk-assessment branch (permit_v3 `choices` + attribute_condition gate).

Direction 2 (workflow stage -> form): the form builder response exposes the
published workflow stages so condition rules can bind to the `_workflow_status`
pseudo-field, and the seeded permit layout gates the supervisor-approval group
on review/approval stages.
"""


def test_form_response_exposes_workflow_stages(client):
    res = client.get("/api/forms/permit")
    assert res.status_code == 200
    payload = res.json()

    # Stage list comes from the latest published permit workflow (permit_v3).
    assert payload["initial_state"] == "Requested"
    assert "Requested" in payload["workflow_states"]
    assert "IsolationPrecheck" in payload["workflow_states"]
    assert "RiskAssessed" in payload["workflow_states"]
    assert "Approved" in payload["workflow_states"]

    layout = {it["i"]: it for it in payload["layout"]}

    # Isolation details group bound to the permit_type field value (field -> form).
    iso = layout["group:isolation_details"]
    iso_cond = iso.get("visibilityCondition") or iso.get("visibility_condition")
    iso_rules = iso_cond["rules"]
    assert iso_cond["action"] == "show"
    assert iso_cond["matchType"] == "all"
    assert any(
        r["field"] == "permit_type" and r["operator"] == "equals" and r["value"] == "Electrical Isolation"
        for r in iso_rules
    )

    # Supervisor approval group bound to the workflow stage pseudo-field (stage -> form).
    sup = layout["group:supervisor_approval"]
    sup_cond = sup.get("visibilityCondition") or sup.get("visibility_condition")
    sup_rules = sup_cond["rules"]
    assert sup_cond["action"] == "show"
    assert sup_cond["matchType"] == "any"
    assert any(r["field"] == "_workflow_status" and r["value"] == "IsolationPrecheck" for r in sup_rules)
    assert any(r["field"] == "_workflow_status" and r["value"] == "Approved" for r in sup_rules)


def test_electrical_isolation_permit_routes_to_isolation_precheck(client):
    res = client.post(
        "/api/permit/create",
        json={
            "custom_fields": {
                "title": "Switchgear Isolation",
                "permit_type": "Electrical Isolation",
                "location": "Switchroom B",
                "hazards_identified": "LOTO required before any work",
            }
        },
    )
    assert res.status_code == 200
    body = res.json()
    permit_id = body["entity_id"]
    assert body["status"] == "Requested"
    assert body["workflow_version"] == "permit_v3"

    # Field value (permit_type = Electrical Isolation) selects the isolation branch.
    out = client.post(
        "/api/permit/transition",
        json={"entity_id": permit_id, "event_type": "RISK_ASSESSMENT_COMPLETED", "actor_id": "charlie.tech@compassx.io"},
    )
    assert out.status_code == 200
    routed = out.json()
    assert routed["new_status"] == "IsolationPrecheck"
    assert routed["routing"]["choice_index"] == 0

    # Isolation review (Safety Officer) moves it on to risk assessment.
    out = client.post(
        "/api/permit/transition",
        json={
            "entity_id": permit_id,
            "event_type": "ISOLATION_REVIEW",
            "actor_id": "alice.safety@compassx.io",
            "actor_roles": ["Safety Officer"],
        },
    )
    assert out.status_code == 200
    assert out.json()["new_status"] == "RiskAssessed"

    # Approval path still works after the isolation review, so the rest of the
    # lifecycle and any linked-workorder gates are unaffected.
    out = client.post(
        "/api/permit/transition",
        json={
            "entity_id": permit_id,
            "event_type": "APPROVED",
            "actor_id": "alice.safety@compassx.io",
            "actor_roles": ["Safety Officer"],
        },
    )
    assert out.status_code == 200
    assert out.json()["new_status"] == "Approved"


def test_hot_work_permit_uses_default_risk_assessment_branch(client):
    res = client.post(
        "/api/permit/create",
        json={
            "custom_fields": {
                "title": "Grinding Hot Work",
                "permit_type": "Hot Work",
                "location": "Workshop Bay",
                "hazards_identified": "Sparks and hot debris",
            }
        },
    )
    permit_id = res.json()["entity_id"]

    out = client.post(
        "/api/permit/transition",
        json={"entity_id": permit_id, "event_type": "RISK_ASSESSMENT_COMPLETED", "actor_id": "charlie.tech@compassx.io"},
    )
    assert out.status_code == 200
    routed = out.json()
    assert routed["new_status"] == "RiskAssessed"
    assert routed["routing"]["choice_index"] == 1


def test_unknown_form_type_returns_empty_workflow_stages(client):
    res = client.get("/api/forms/does_not_exist")
    assert res.status_code == 200
    payload = res.json()
    assert payload["workflow_states"] == []
    assert payload["initial_state"] is None


def test_update_entity_custom_fields_patch(client):
    res = client.post(
        "/api/permit/create",
        json={
            "custom_fields": {
                "title": "Initial Permit Title",
                "permit_type": "Hot Work",
                "location": "Workshop Bay 2",
                "hazards_identified": "Sparks and hot debris",
            }
        },
    )
    assert res.status_code == 200
    permit_id = res.json()["entity_id"]

    # PATCH custom fields
    patch_res = client.patch(
        f"/api/permit/{permit_id}",
        json={
            "custom_fields": {
                "title": "Updated Permit Title",
                "sop_document": [{"name": "standard_operating_procedure.pdf", "size": 1024, "type": "application/pdf", "dataUrl": "data:..."}],
            }
        },
    )
    assert patch_res.status_code == 200
    body = patch_res.json()
    assert body["accepted"] is True
    assert body["entity"]["custom_fields"]["title"] == "Updated Permit Title"
    assert len(body["entity"]["custom_fields"]["sop_document"]) == 1

    # Verify get entity returns the persisted updated custom fields
    get_res = client.get(f"/api/permit/{permit_id}")
    assert get_res.status_code == 200
    assert get_res.json()["entity"]["custom_fields"]["title"] == "Updated Permit Title"
    assert get_res.json()["entity"]["custom_fields"]["sop_document"][0]["name"] == "standard_operating_procedure.pdf"


def test_interaction_node_target_form_tab_workflow_binding(client):
    """Verifies that an interaction node's interaction_tab binds to form tabs."""
    # 1. Update form layout to include a dedicated 'sop' tab
    form_res = client.post(
        "/api/forms",
        json={
            "entity_type": "permit",
            "tabs": [
                {"id": "general", "label": "General Details", "is_default": True},
                {"id": "sop", "label": "SOP Documentation", "is_default": False},
            ],
            "layout": [
                {"i": "title", "fieldName": "title", "tabId": "general", "x": 0, "y": 0, "w": 6, "h": 2},
                {"i": "hazards_identified", "fieldName": "hazards_identified", "tabId": "sop", "x": 0, "y": 0, "w": 12, "h": 3},
            ],
            "cols": 12,
            "row_height": 40,
        },
    )
    assert form_res.status_code == 200
    form_data = form_res.json()
    assert len(form_data["tabs"]) == 2
    assert any(t["id"] == "sop" for t in form_data["tabs"])

    # 2. Publish a workflow where IsolationPrecheck is an interaction node targeting 'sop' tab
    wf_res = client.post(
        "/api/workflows/draft",
        json={
            "entity_type": "permit",
            "version_label": "permit_v4_interaction_sop",
            "definition": {
                "states": ["Requested", "IsolationPrecheck", "Approved"],
                "initial_state": "Requested",
                "nodes": [
                    {"name": "Requested", "kind": "state", "label": "Requested"},
                    {
                        "name": "IsolationPrecheck",
                        "kind": "interaction",
                        "label": "SOP Review Step",
                        "interaction_tab": "sop",
                        "task_instructions": "Upload required SOP document.",
                    },
                    {"name": "Approved", "kind": "state", "label": "Approved"},
                ],
                "transitions": [
                    {"from": "Requested", "to": "IsolationPrecheck", "event": "SUBMIT"},
                    {"from": "IsolationPrecheck", "to": "Approved", "event": "APPROVE"},
                ],
                "terminal_states": ["Approved"],
            },
        },
    )
    assert wf_res.status_code == 200
    wf_id = wf_res.json()["id"]
    pub_res = client.post(f"/api/workflows/{wf_id}/publish")
    assert pub_res.status_code == 200

    # 3. Create entity and transition to interaction node
    create_res = client.post(
        "/api/permit/create",
        json={"custom_fields": {"title": "High Voltage Work"}},
    )
    assert create_res.status_code == 200
    entity_id = create_res.json()["entity_id"]

    trans_res = client.post(
        "/api/permit/transition",
        json={"entity_id": entity_id, "event_type": "SUBMIT"},
    )
    assert trans_res.status_code == 200
    assert trans_res.json()["new_status"] == "IsolationPrecheck"

    # 4. Verify entity workflow stage and node metadata
    wf_res = client.get("/api/workflows/active/permit")
    assert wf_res.status_code == 200
    published = wf_res.json()
    interaction_node = next((n for n in published["definition"]["nodes"] if n["name"] == "IsolationPrecheck"), None)
    assert interaction_node is not None
    assert interaction_node["kind"] == "interaction"
    assert interaction_node["interaction_tab"] == "sop"