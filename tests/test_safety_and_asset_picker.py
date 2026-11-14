"""Safety plan copy rules and the asset list classification filter."""

from fastapi.testclient import TestClient


def _site(client: TestClient) -> None:
    assert client.post("/api/company-sets", json={
        "set_id": "SET1",
        "description": "Test company set",
        "auto_add_companies": True,
        "status": "ACTIVE",
    }).status_code == 201
    assert client.post("/api/organizations", json={
        "org_id": "ORG1",
        "name": "Test Organization",
        "company_set_id": "SET1",
        "base_currency_1": "USD",
    }).status_code == 201
    assert client.post("/api/organizations/ORG1/sites", json={
        "site_id": "BEDFORD",
        "name": "Bedford Plant",
    }).status_code == 201


def _permit(client: TestClient) -> str:
    res = client.post("/api/permit/create", json={
        "custom_fields": {
            "title": "String work",
            "permit_type": "Electrical Isolation",
            "location": "Block 4",
            "hazards_identified": "Shock",
        }
    })
    assert res.status_code == 200, res.text
    return res.json()["entity_id"]


def _masters(client: TestClient) -> None:
    assert client.post("/api/precautions", json={
        "precaution_id": "GLOVES",
        "description": "Wear gloves",
    }).status_code == 201
    assert client.post("/api/hazards", json={
        "hazard_id": "DUST",
        "description": "Dust",
        "is_hazardous_material": False,
        "precaution_ids": ["GLOVES"],
    }).status_code == 201
    assert client.post("/api/hazards", json={
        "hazard_id": "SHOCK",
        "description": "Electrical shock",
    }).status_code == 201
    assert client.post("/api/hazards", json={
        "hazard_id": "ACID",
        "description": "Acid",
        "is_hazardous_material": True,
        "health_rating": 3,
    }).status_code == 201
    assert client.post("/api/tag-outs", json={
        "tagout_id": "LOTO1",
        "hazard_id": "SHOCK",
        "description": "Lock the isolator",
        "device": "HASP",
    }).status_code == 201


def test_apply_copies_matching_rows_and_leaves_the_master_unchanged(client: TestClient):
    _site(client)
    _masters(client)
    assert client.post("/api/locations", json={
        "location_id": "BLOCK4",
        "site_id": "BEDFORD",
        "description": "Block 4",
    }).status_code == 201
    assert client.post("/api/safety-plans", json={
        "safety_plan_id": "JSA36",
        "site_id": "BEDFORD",
        "description": "String monitoring",
        "document_id": "doc-jsa-36",
        "hazards": [
            {"hazard_id": "DUST"},
            {"hazard_id": "SHOCK", "related_location_id": "BLOCK4"},
            {"hazard_id": "ACID", "related_location_id": "OTHER"},
        ],
        "tagouts": [
            {"tagout_id": "LOTO1", "work_location_id": "BLOCK4"},
        ],
    }).status_code == 201

    permit_id = _permit(client)
    applied = client.post("/api/safety-plans/apply", json={
        "entity_type": "permit",
        "entity_id": permit_id,
        "safety_plan_id": "JSA36",
        "site_id": "BEDFORD",
        "location_id": "BLOCK4",
    })
    assert applied.status_code == 200, applied.text
    body = applied.json()
    hazard_ids = [row["hazard_id"] for row in body["hazards"]]
    assert hazard_ids == ["DUST", "SHOCK"]
    assert body["hazardous_materials"] == []
    assert body["hazards"][0]["precautions"][0]["precaution_id"] == "GLOVES"
    assert body["tagouts"][0]["tagout_id"] == "LOTO1"
    assert body["safety_plan_id"] == "JSA36"

    edited = client.put(
        f"/api/applied-safety/permit/{permit_id}/hazards/{body['hazards'][0]['id']}",
        json={"description": "Dust on this job only"},
    )
    assert edited.status_code == 200
    assert edited.json()["hazards"][0]["description"] == "Dust on this job only"
    master = client.get("/api/hazards").json()
    dust = next(row for row in master if row["hazard_id"] == "DUST")
    assert dust["description"] == "Dust"

    removed = client.delete(
        f"/api/applied-safety/permit/{permit_id}/precautions/{body['hazards'][0]['precautions'][0]['id']}"
    )
    assert removed.status_code == 200
    assert removed.json()["hazards"][0]["precautions"] == []
    dust = next(row for row in client.get("/api/hazards").json() if row["hazard_id"] == "DUST")
    assert dust["precaution_ids"] == ["GLOVES"]


def test_location_default_plan_is_used_before_the_asset_plan(client: TestClient):
    _site(client)
    _masters(client)
    assert client.post("/api/safety-plans", json={
        "safety_plan_id": "LOCPLAN",
        "site_id": "BEDFORD",
        "description": "Location plan",
        "hazards": [{"hazard_id": "DUST"}],
    }).status_code == 201
    assert client.post("/api/safety-plans", json={
        "safety_plan_id": "ASSETPLAN",
        "site_id": "BEDFORD",
        "description": "Asset plan",
        "hazards": [{"hazard_id": "SHOCK"}],
    }).status_code == 201
    assert client.post("/api/locations", json={
        "location_id": "BLOCK4",
        "site_id": "BEDFORD",
        "description": "Block 4",
        "default_safety_plan_id": "LOCPLAN",
    }).status_code == 201
    assert client.post("/api/assets", json={
        "asset_id": "SCB3",
        "site_id": "BEDFORD",
        "location_id": "BLOCK4",
        "name": "SCB 3",
        "classstructure_id": "SCB",
        "default_safety_plan_id": "ASSETPLAN",
    }).status_code == 201

    permit_id = _permit(client)
    both = client.post("/api/safety-plans/apply", json={
        "entity_type": "permit",
        "entity_id": permit_id,
        "site_id": "BEDFORD",
        "location_id": "BLOCK4",
        "asset_id": "SCB3",
    })
    assert both.status_code == 200, both.text
    assert both.json()["safety_plan_id"] == "LOCPLAN"
    assert [row["hazard_id"] for row in both.json()["hazards"]] == ["DUST"]

    asset_only = client.post("/api/safety-plans/apply", json={
        "entity_type": "permit",
        "entity_id": permit_id,
        "site_id": "BEDFORD",
        "asset_id": "SCB3",
    })
    assert asset_only.status_code == 200, asset_only.text
    assert asset_only.json()["safety_plan_id"] == "ASSETPLAN"


def test_asset_list_filters_by_classification(client: TestClient):
    _site(client)
    assert client.post("/api/locations", json={
        "location_id": "BLOCK4",
        "site_id": "BEDFORD",
        "description": "Block 4",
    }).status_code == 201
    assert client.post("/api/assets", json={
        "asset_id": "SCB3",
        "site_id": "BEDFORD",
        "location_id": "BLOCK4",
        "name": "SCB 3",
        "classstructure_id": "SCB",
    }).status_code == 201
    assert client.post("/api/assets", json={
        "asset_id": "INV1",
        "site_id": "BEDFORD",
        "location_id": "BLOCK4",
        "name": "Inverter 1",
        "classstructure_id": "INVERTER",
    }).status_code == 201

    listed = client.get("/api/assets?site_id=BEDFORD&classstructure_id=SCB")
    assert listed.status_code == 200
    ids = [row["asset_id"] for row in listed.json()]
    assert ids == ["SCB3"]


def test_entity_form_keeps_asset_and_safety_widgets(client: TestClient):
    created = client.post("/api/entity-types", json={
        "name": "job_card",
        "display_name": "Job Card",
        "fields": [
            {"field_name": "equipment", "field_type": "asset", "label": "Equipment"},
            {"field_name": "components", "field_type": "asset_table", "label": "Components"},
            {"field_name": "jsa", "field_type": "safety_plan", "label": "JSA"},
        ],
    })
    assert created.status_code == 200, created.text
    form = client.get("/api/forms/job_card")
    assert form.status_code == 200, form.text
    types = {item["fieldName"]: item["fieldType"] for item in form.json()["layout"]}
    assert types["equipment"] == "asset"
    assert types["components"] == "asset_table"
    assert types["jsa"] == "safety_plan"

    saved_as_text = client.post("/api/forms", json={
        "entity_type": "job_card",
        "layout": [
            {
                "i": "field:equipment",
                "x": 0,
                "y": 0,
                "w": 6,
                "h": 1,
                "fieldName": "equipment",
                "fieldType": "text",
                "label": "Equipment",
            }
        ],
    })
    assert saved_as_text.status_code == 200, saved_as_text.text
    repaired = client.get("/api/forms/job_card")
    equipment = next(item for item in repaired.json()["layout"] if item["fieldName"] == "equipment")
    assert equipment["fieldType"] == "asset"
    assert equipment["h"] >= 2
    assert equipment["w"] == 12


def test_safety_plan_accepts_pdf_attachment(client: TestClient):
    _site(client)
    created = client.post("/api/safety-plans", json={
        "safety_plan_id": "JSA1",
        "site_id": "BEDFORD",
        "description": "String work",
    })
    assert created.status_code == 201, created.text
    attached = client.post(
        "/api/safety-plans/JSA1/document",
        files={"file": ("jsa.pdf", b"%PDF-1.4 test", "application/pdf")},
    )
    assert attached.status_code == 200, attached.text
    body = attached.json()
    assert body["document_id"]
    assert body["document_file_name"] == "jsa.pdf"
    rejected = client.post(
        "/api/safety-plans/JSA1/document",
        files={"file": ("notes.txt", b"not a pdf", "text/plain")},
    )
    assert rejected.status_code == 400
