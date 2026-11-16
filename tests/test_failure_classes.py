from backend.models.organization import CompanySet, Organization, Site


def _org(db):
    db.add(CompanySet(set_id="SET1", description="Set"))
    db.add(Organization(org_id="ORG1", name="Org", company_set_id="SET1"))
    db.add(Site(site_id="SITE1", org_id="ORG1", name="Site"))
    db.commit()


def test_failure_tree_and_pointers(client, test_db):
    _org(test_db)
    pumps = client.post("/api/failure-nodes", json={
        "org_id": "ORG1", "code": "PUMPS", "description": "Pumps", "node_type": "class",
    })
    assert pumps.status_code == 201, pumps.text
    leak = client.post("/api/failure-nodes", json={
        "org_id": "ORG1", "code": "LEAK", "description": "Leaking", "node_type": "problem",
        "parent_id": pumps.json()["id"],
    })
    assert leak.status_code == 201, leak.text
    seal = client.post("/api/failure-nodes", json={
        "org_id": "ORG1", "code": "SEAL", "description": "Seal wear", "node_type": "cause",
        "parent_id": leak.json()["id"],
    })
    assert seal.status_code == 201
    remedy = client.post("/api/failure-nodes", json={
        "org_id": "ORG1", "code": "REPL", "description": "Replaced seal", "node_type": "remedy",
        "parent_id": seal.json()["id"],
    })
    assert remedy.status_code == 201

    skipped = client.post("/api/failure-nodes", json={
        "org_id": "ORG1", "code": "SKIP", "description": "Skipped", "node_type": "cause",
        "parent_id": pumps.json()["id"],
    })
    assert skipped.status_code == 400

    again = client.post("/api/failure-nodes", json={
        "org_id": "ORG1", "code": "LEAK", "description": "Leaking elsewhere", "node_type": "problem",
        "parent_id": pumps.json()["id"],
    })
    assert again.status_code == 400

    valves = client.post("/api/failure-nodes", json={
        "org_id": "ORG1", "code": "VALVES", "description": "Valves", "node_type": "class",
    })
    shared = client.post("/api/failure-nodes", json={
        "org_id": "ORG1", "code": "LEAK", "description": "Leaking", "node_type": "problem",
        "parent_id": valves.json()["id"],
    })
    assert shared.status_code == 201

    location = client.post("/api/locations", json={
        "location_id": "BAY", "site_id": "SITE1", "type": "OPERATING", "failure_class_code": "PUMPS",
    })
    assert location.status_code == 201, location.text
    storeroom = client.post("/api/locations", json={
        "location_id": "STORE", "site_id": "SITE1", "type": "STOREROOM", "failure_class_code": "PUMPS",
    })
    assert storeroom.status_code == 400

    asset = client.post("/api/assets", json={
        "asset_id": "INV1", "site_id": "SITE1", "name": "Inverter", "location_id": "BAY",
        "failure_class_code": "VALVES", "classstructure_id": "CENTRIFUGAL",
    })
    assert asset.status_code == 201, asset.text
    assert asset.json()["classstructure_id"] == "CENTRIFUGAL"
    assert asset.json()["failure_class_code"] == "VALVES"

    problem = client.put("/api/assets/SITE1/INV1", json={"failure_class_code": "LEAK"})
    assert problem.status_code == 400

    applied = client.get("/api/failure-classes/applicable", params={"site_id": "SITE1", "asset_id": "INV1"})
    assert applied.json()["source"] == "asset"
    assert applied.json()["code"] == "VALVES"

    blocked = client.delete(f"/api/failure-nodes/{valves.json()['id']}")
    assert blocked.status_code == 400

    cleared = client.put("/api/assets/SITE1/INV1", json={"failure_class_code": "", "classstructure_id": "OTHER"})
    assert cleared.status_code == 200
    assert cleared.json()["failure_class_code"] is None
    assert cleared.json()["classstructure_id"] == "OTHER"
    inherited = client.get("/api/failure-classes/applicable", params={"site_id": "SITE1", "asset_id": "INV1"})
    assert inherited.json()["source"] == "location"
    assert inherited.json()["code"] == "PUMPS"

    moved = client.put("/api/locations/SITE1/BAY", json={"type": "REPAIR"})
    assert moved.status_code == 200
    assert moved.json()["failure_class_code"] is None
    none = client.get("/api/failure-classes/applicable", params={"site_id": "SITE1", "asset_id": "INV1"})
    assert none.json()["code"] is None

    removed = client.delete(f"/api/failure-nodes/{valves.json()['id']}")
    assert removed.status_code == 200
