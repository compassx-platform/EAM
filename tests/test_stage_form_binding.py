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