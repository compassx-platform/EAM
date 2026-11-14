import pytest
from fastapi.testclient import TestClient


def _bedford(client: TestClient) -> None:
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


def test_location_list_after_create(client: TestClient):
    _bedford(client)
    assert client.post("/api/locations", json={
        "location_id": "FACILITY_A",
        "site_id": "BEDFORD",
        "description": "Main facility",
        "type": "OPERATING",
        "status": "OPERATING",
    }).status_code == 201
    res = client.get("/api/locations?site_id=BEDFORD")
    assert res.status_code == 200
    loc_ids = [loc["location_id"] for loc in res.json()]
    assert loc_ids == ["FACILITY_A"]


def test_location_crud_and_validation(client: TestClient):
    _bedford(client)
    res = client.post("/api/locations", json={
        "location_id": "TEST_PLANT_99",
        "site_id": "BEDFORD",
        "description": "Test Production Plant 99",
        "type": "OPERATING",
        "status": "OPERATING",
        "gl_account": "6100-099",
    })
    assert res.status_code == 201
    data = res.json()
    assert data["location_id"] == "TEST_PLANT_99"
    assert data["parent_location_id"] is None

    sub_res = client.post("/api/locations", json={
        "location_id": "TEST_BOILER_ROOM",
        "site_id": "BEDFORD",
        "parent_location_id": "TEST_PLANT_99",
        "description": "Test Boiler Room",
        "type": "OPERATING",
        "status": "OPERATING",
    })
    assert sub_res.status_code == 201
    assert sub_res.json()["parent_location_id"] == "TEST_PLANT_99"

    self_res = client.put("/api/locations/BEDFORD/TEST_PLANT_99", json={
        "parent_location_id": "TEST_PLANT_99",
    })
    assert self_res.status_code == 400
    assert "Location cannot be its own parent" in self_res.json()["detail"]

    get_res = client.get("/api/locations/BEDFORD/TEST_PLANT_99")
    assert get_res.status_code == 200
    assert get_res.json()["location_id"] == "TEST_PLANT_99"

    assert client.delete("/api/locations/BEDFORD/TEST_BOILER_ROOM").status_code == 204
    assert client.delete("/api/locations/BEDFORD/TEST_PLANT_99").status_code == 204


def test_asset_crud_and_parent_child_hierarchy(client: TestClient):
    _bedford(client)
    assert client.post("/api/locations", json={
        "location_id": "MECH_ROOM_101",
        "site_id": "BEDFORD",
        "description": "Mechanical room",
        "type": "OPERATING",
        "status": "OPERATING",
    }).status_code == 201

    res = client.post("/api/assets", json={
        "asset_id": "COMPRESSOR_SYS_01",
        "site_id": "BEDFORD",
        "location_id": "MECH_ROOM_101",
        "name": "Rotary Screw Air Compressor System",
        "description": "Main plant instrument air compressor",
        "item_num": "COMP-ROT-01",
        "serial_num": "SN-KAESER-9912",
        "status": "OPERATING",
        "vendor": "KAESER",
        "manufacturer": "Kaeser Compressors",
        "model": "CSD 125",
        "purchase_cost": 54000.0,
        "priority": 1,
    })
    assert res.status_code == 201
    assert res.json()["parent_asset_id"] is None

    sub_res = client.post("/api/assets", json={
        "asset_id": "COMP_AIREND_01",
        "site_id": "BEDFORD",
        "location_id": "MECH_ROOM_101",
        "parent_asset_id": "COMPRESSOR_SYS_01",
        "name": "SIGMA Profile Rotary Screw Airend Unit",
        "status": "OPERATING",
        "purchase_cost": 16500.0,
        "priority": 2,
    })
    assert sub_res.status_code == 201
    assert sub_res.json()["parent_asset_id"] == "COMPRESSOR_SYS_01"

    self_res = client.put("/api/assets/BEDFORD/COMPRESSOR_SYS_01", json={
        "parent_asset_id": "COMPRESSOR_SYS_01",
    })
    assert self_res.status_code == 400
    assert "Asset cannot be its own parent" in self_res.json()["detail"]

    get_res = client.get("/api/assets/BEDFORD/COMPRESSOR_SYS_01")
    assert get_res.status_code == 200
    assert get_res.json()["child_assets"][0]["asset_id"] == "COMP_AIREND_01"

    assert client.delete("/api/assets/BEDFORD/COMP_AIREND_01").status_code == 204
    assert client.delete("/api/assets/BEDFORD/COMPRESSOR_SYS_01").status_code == 204


def test_hierarchy_drilldown_tree(client: TestClient):
    _bedford(client)
    assert client.post("/api/locations", json={
        "location_id": "FACILITY_A",
        "site_id": "BEDFORD",
        "description": "Main facility",
        "type": "OPERATING",
        "status": "OPERATING",
    }).status_code == 201
    assert client.post("/api/assets", json={
        "asset_id": "PUMP_SYS_100",
        "site_id": "BEDFORD",
        "location_id": "FACILITY_A",
        "name": "Feed pump",
        "status": "OPERATING",
    }).status_code == 201

    res = client.get("/api/hierarchy/drilldown?site_id=BEDFORD")
    assert res.status_code == 200
    sites = res.json()
    assert len(sites) == 1
    bedford = sites[0]
    assert bedford["site_id"] == "BEDFORD"
    assert bedford["total_locations"] == 1
    assert bedford["total_assets"] == 1
    assert bedford["locations_tree"][0]["location_id"] == "FACILITY_A"
    assert bedford["locations_tree"][0]["assets"][0]["asset_id"] == "PUMP_SYS_100"
