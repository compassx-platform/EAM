import pytest
from fastapi.testclient import TestClient


def test_list_seeded_locations(client: TestClient):
    res = client.get("/api/locations?site_id=BEDFORD")
    assert res.status_code == 200
    locs = res.json()
    loc_ids = [l["location_id"] for l in locs]
    assert "FACILITY_A" in loc_ids
    assert "BLDG_01" in loc_ids
    assert "MECH_ROOM_101" in loc_ids
    assert "CENTRAL_STORE_01" in loc_ids


def test_location_crud_and_validation(client: TestClient):
    # 1. Create top-level location
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

    # 2. Create sub-location under TEST_PLANT_99
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

    # 3. Prevent self-parenting
    self_res = client.put("/api/locations/BEDFORD/TEST_PLANT_99", json={
        "parent_location_id": "TEST_PLANT_99",
    })
    assert self_res.status_code == 400
    assert "Location cannot be its own parent" in self_res.json()["detail"]

    # 4. Get location details
    get_res = client.get("/api/locations/BEDFORD/TEST_PLANT_99")
    assert get_res.status_code == 200
    assert get_res.json()["location_id"] == "TEST_PLANT_99"

    # 5. Delete locations
    del_sub = client.delete("/api/locations/BEDFORD/TEST_BOILER_ROOM")
    assert del_sub.status_code == 204
    del_parent = client.delete("/api/locations/BEDFORD/TEST_PLANT_99")
    assert del_parent.status_code == 204


def test_list_seeded_assets(client: TestClient):
    res = client.get("/api/assets?site_id=BEDFORD")
    assert res.status_code == 200
    assets = res.json()
    asset_ids = [a["asset_id"] for a in assets]
    assert "PUMP_SYS_100" in asset_ids
    assert "MOTOR_50HP_01" in asset_ids
    assert "IMPELLER_ASSY_01" in asset_ids
    assert "ROBOT_ARM_200" in asset_ids


def test_asset_crud_and_parent_child_hierarchy(client: TestClient):
    # 1. Create parent machine asset
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
    data = res.json()
    assert data["asset_id"] == "COMPRESSOR_SYS_01"
    assert data["parent_asset_id"] is None

    # 2. Create child sub-assembly asset
    sub_res = client.post("/api/assets", json={
        "asset_id": "COMP_AIREND_01",
        "site_id": "BEDFORD",
        "location_id": "MECH_ROOM_101",
        "parent_asset_id": "COMPRESSOR_SYS_01",
        "name": "SIGMA Profile Rotary Screw Airend Unit",
        "description": "Compression rotor screw assembly block",
        "item_num": "COMP-AIR-02",
        "serial_num": "SN-SIGMA-441",
        "status": "OPERATING",
        "purchase_cost": 16500.0,
        "priority": 2,
    })
    assert sub_res.status_code == 201
    assert sub_res.json()["parent_asset_id"] == "COMPRESSOR_SYS_01"

    # 3. Prevent self-parenting
    self_res = client.put("/api/assets/BEDFORD/COMPRESSOR_SYS_01", json={
        "parent_asset_id": "COMPRESSOR_SYS_01",
    })
    assert self_res.status_code == 400
    assert "Asset cannot be its own parent" in self_res.json()["detail"]

    # 4. Get asset with child sub-assemblies
    get_res = client.get("/api/assets/BEDFORD/COMPRESSOR_SYS_01")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["asset_id"] == "COMPRESSOR_SYS_01"
    assert len(get_data["child_assets"]) >= 1
    assert get_data["child_assets"][0]["asset_id"] == "COMP_AIREND_01"

    # 5. Clean up
    del_sub = client.delete("/api/assets/BEDFORD/COMP_AIREND_01")
    assert del_sub.status_code == 204
    del_parent = client.delete("/api/assets/BEDFORD/COMPRESSOR_SYS_01")
    assert del_parent.status_code == 204


def test_hierarchy_drilldown_tree(client: TestClient):
    res = client.get("/api/hierarchy/drilldown?site_id=BEDFORD")
    assert res.status_code == 200
    sites = res.json()
    assert len(sites) == 1
    bedford = sites[0]
    assert bedford["site_id"] == "BEDFORD"
    assert bedford["total_locations"] >= 5
    assert bedford["total_assets"] >= 5

    # Check root location FACILITY_A
    root_locs = [l["location_id"] for l in bedford["locations_tree"]]
    assert "FACILITY_A" in root_locs

    facility_a = next(l for l in bedford["locations_tree"] if l["location_id"] == "FACILITY_A")
    child_loc_ids = [cl["location_id"] for cl in facility_a["children_locations"]]
    assert "BLDG_01" in child_loc_ids

    bldg_01 = next(cl for cl in facility_a["children_locations"] if cl["location_id"] == "BLDG_01")
    sub_sub_loc_ids = [ssl["location_id"] for ssl in bldg_01["children_locations"]]
    assert "MECH_ROOM_101" in sub_sub_loc_ids
    assert "ASSEMBLY_LINE_A" in sub_sub_loc_ids

    # Check installed assets in MECH_ROOM_101
    mech_room = next(ssl for ssl in bldg_01["children_locations"] if ssl["location_id"] == "MECH_ROOM_101")
    assert len(mech_room["assets"]) >= 1
    pump = mech_room["assets"][0]
    assert pump["asset_id"] == "PUMP_SYS_100"
    assert len(pump["children"]) >= 2
    pump_child_ids = [c["asset_id"] for c in pump["children"]]
    assert "MOTOR_50HP_01" in pump_child_ids
    assert "IMPELLER_ASSY_01" in pump_child_ids

    # Check unassigned / staged assets
    unassigned_ids = [a["asset_id"] for a in bedford["unassigned_assets"]]
    assert "SPARE_GENSET_500" in unassigned_ids
