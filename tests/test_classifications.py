import pytest
from fastapi.testclient import TestClient


def test_list_seeded_classifications(client: TestClient):
    res = client.get("/api/classifications")
    assert res.status_code == 200
    cls_list = res.json()
    assert len(cls_list) >= 7
    paths = [c["hierarchy_path"] for c in cls_list]
    assert "ROTATING" in paths
    assert "ROTATING \\ PUMP" in paths
    assert "ROTATING \\ PUMP \\ CENTRIFUGAL" in paths
    assert "FACILITY \\ BUILDING \\ MECH_ROOM" in paths


def test_classification_tree_and_filtering(client: TestClient):
    # Tree for ASSET
    res_asset = client.get("/api/classifications/tree?use_with=ASSET")
    assert res_asset.status_code == 200
    asset_tree = res_asset.json()
    root_ids = [n["classification_id"] for n in asset_tree]
    assert "ROTATING" in root_ids
    assert "ELECTRICAL" in root_ids

    # Tree for LOCATIONS
    res_loc = client.get("/api/classifications/tree?use_with=LOCATIONS")
    assert res_loc.status_code == 200
    loc_tree = res_loc.json()
    loc_root_ids = [n["classification_id"] for n in loc_tree]
    assert "FACILITY" in loc_root_ids


def test_master_attribute_catalog_crud_and_guards(client: TestClient):
    # 1. List seeded master attributes
    res = client.get("/api/attributes")
    assert res.status_code == 200
    attrs = res.json()
    assert len(attrs) >= 20
    attr_ids = [a["attribute_id"] for a in attrs]
    assert "HORSEPOWER" in attr_ids
    assert "FLOW_RATE" in attr_ids
    assert "VOLTAGE_RATED" in attr_ids
    assert "SQUARE_FEET" in attr_ids

    # Check usage count on FLOW_RATE
    flow_attr = next(a for a in attrs if a["attribute_id"] == "FLOW_RATE")
    assert flow_attr["usage_count"] >= 1

    # 2. Create new master attribute
    res_create = client.post("/api/attributes", json={
        "attribute_id": "VIBRATION_RMS",
        "description": "Peak Vibration Velocity RMS",
        "data_type": "NUMERIC",
        "unit_of_measure": "MM/S",
    })
    assert res_create.status_code == 201
    created = res_create.json()
    assert created["attribute_id"] == "VIBRATION_RMS"
    assert created["unit_of_measure"] == "MM/S"

    # 3. Duplicate master attribute rejected
    res_dup = client.post("/api/attributes", json={
        "attribute_id": "VIBRATION_RMS",
        "description": "Duplicate attribute",
    })
    assert res_dup.status_code == 400

    # 4. Update master attribute
    res_up = client.put("/api/attributes/VIBRATION_RMS", json={
        "description": "Overall Vibration Velocity (ISO 10816)",
        "unit_of_measure": "IN/S",
    })
    assert res_up.status_code == 200
    assert res_up.json()["description"] == "Overall Vibration Velocity (ISO 10816)"
    assert res_up.json()["unit_of_measure"] == "IN/S"

    # 5. Prevent deleting master attribute that is referenced in ClassSpec
    res_del_fail = client.delete("/api/attributes/FLOW_RATE")
    assert res_del_fail.status_code == 400
    assert "reused in" in res_del_fail.json()["detail"]

    # 6. Delete unreferenced master attribute succeeds
    res_del = client.delete("/api/attributes/VIBRATION_RMS")
    assert res_del.status_code == 204


def test_cross_fleet_attribute_search(client: TestClient):
    # 1. Search for assets with FLOW_RATE >= 400 GPM
    res = client.get("/api/attributes/FLOW_RATE/instances?min_num=400")
    assert res.status_code == 200
    data = res.json()
    assert data["attribute_id"] == "FLOW_RATE"
    assert len(data["assets"]) >= 1
    asset_ids = [a["asset_id"] for a in data["assets"]]
    assert "PUMP_SYS_100" in asset_ids
    assert data["assets"][0]["num_value"] == 450.0

    # 2. Search for assets with exact casing material
    res_mat = client.get("/api/attributes/CASING_MAT/instances?exact_aln=316L+Stainless+Steel")
    assert res_mat.status_code == 200
    data_mat = res_mat.json()
    assert len(data_mat["assets"]) >= 1
    assert data_mat["assets"][0]["asset_id"] == "PUMP_SYS_100"

    # 3. Search for locations with SQUARE_FEET >= 3000
    res_sqft = client.get("/api/attributes/SQUARE_FEET/instances?min_num=3000")
    assert res_sqft.status_code == 200
    data_sqft = res_sqft.json()
    assert len(data_sqft["locations"]) >= 2
    loc_ids = [l["location_id"] for l in data_sqft["locations"]]
    assert "MECH_ROOM_101" in loc_ids
    assert "BLDG_01" in loc_ids


def test_classification_crud_and_attribute_inheritance(client: TestClient):
    # 1. Create root classification
    res_root = client.post("/api/classifications", json={
        "classification_id": "HVAC",
        "description": "Heating Ventilation & Air Conditioning",
        "use_with": ["ASSET", "LOCATIONS"],
        "attributes": [
            {
                "attribute_id": "REFRIGERANT_TYPE",
                "section": "Thermal",
                "description": "Refrigerant Gas Type",
                "data_type": "ALN",
                "domain_values": ["R-410A", "R-134a", "R-32"],
                "mandatory": True,
                "apply_down_hierarchy": True,
                "display_sequence": 1,
            }
        ]
    })
    assert res_root.status_code == 201
    root_cs_id = res_root.json()["classstructure_id"]
    assert root_cs_id == "CS_HVAC"
    assert res_root.json()["hierarchy_path"] == "HVAC"

    # 2. Create child classification
    res_child = client.post("/api/classifications", json={
        "classification_id": "CHILLER",
        "parent_classstructure_id": root_cs_id,
        "description": "Water-Cooled Centrifugal Chillers",
        "use_with": ["ASSET"],
        "attributes": [
            {
                "attribute_id": "COOLING_TONS",
                "section": "Thermal",
                "description": "Cooling Capacity",
                "data_type": "NUMERIC",
                "unit_of_measure": "TONS",
                "mandatory": True,
                "apply_down_hierarchy": True,
                "display_sequence": 1,
            }
        ]
    })
    assert res_child.status_code == 201
    child_cs_id = res_child.json()["classstructure_id"]
    assert res_child.json()["hierarchy_path"] == "HVAC \\ CHILLER"

    # 3. Get details of child and verify inherited attributes
    get_child = client.get(f"/api/classifications/{child_cs_id}")
    assert get_child.status_code == 200
    child_data = get_child.json()
    all_attrs = child_data.get("all_attributes", [])
    attr_names = [a["attribute_id"] for a in all_attrs]
    assert "REFRIGERANT_TYPE" in attr_names  # Inherited from HVAC
    assert "COOLING_TONS" in attr_names      # Local to CHILLER

    # 4. Add dynamic attribute template reusing master catalog
    res_attr = client.post(f"/api/classifications/{child_cs_id}/attributes", json={
        "attribute_id": "EER_RATING",
        "section": "Efficiency",
        "description": "Energy Efficiency Ratio",
        "data_type": "NUMERIC",
        "unit_of_measure": "BTU/WH",
    })
    assert res_attr.status_code == 201
    assert res_attr.json()["attribute_id"] == "EER_RATING"
    assert res_attr.json()["section"] == "Efficiency"

    # 5. Delete attribute template
    del_attr = client.delete(f"/api/classifications/{child_cs_id}/attributes/EER_RATING")
    assert del_attr.status_code == 204

    # 6. Prevent deleting parent while child exists
    del_parent_fail = client.delete(f"/api/classifications/{root_cs_id}")
    assert del_parent_fail.status_code == 400
    assert "child classification" in del_parent_fail.json()["detail"]

    # 7. Clean up child and parent
    del_child = client.delete(f"/api/classifications/{child_cs_id}")
    assert del_child.status_code == 204
    del_parent = client.delete(f"/api/classifications/{root_cs_id}")
    assert del_parent.status_code == 204


def test_asset_and_location_specification_values(client: TestClient):
    # 1. Fetch specifications for seeded pump asset
    res_pump = client.get("/api/assets/BEDFORD/PUMP_SYS_100/specifications")
    assert res_pump.status_code == 200
    pump_data = res_pump.json()
    assert pump_data["classstructure_id"] == "CS_PUMP_CENT"
    specs = {s["attribute_id"]: s for s in pump_data["specifications"]}
    assert "FLOW_RATE" in specs
    assert specs["FLOW_RATE"]["num_value"] == 450.0
    assert specs["FLOW_RATE"]["unit_of_measure"] == "GPM"
    assert "CASING_MAT" in specs
    assert specs["CASING_MAT"]["aln_value"] == "316L Stainless Steel"
    # Verify inherited spec from CS_ROTATING
    assert "RPM_RATED" in specs
    assert specs["RPM_RATED"]["num_value"] == 3550.0

    # 2. Update/upsert asset specifications
    update_res = client.put("/api/assets/BEDFORD/PUMP_SYS_100/specifications", json={
        "specs": [
            {
                "attribute_id": "FLOW_RATE",
                "section": "Hydraulics",
                "num_value": 520.0,
                "unit_of_measure": "GPM",
            },
            {
                "attribute_id": "CASING_MAT",
                "section": "Mechanical",
                "aln_value": "Duplex Stainless 2205",
            }
        ]
    })
    assert update_res.status_code == 200
    updated_specs = {s["attribute_id"]: s for s in update_res.json()["specifications"]}
    assert updated_specs["FLOW_RATE"]["num_value"] == 520.0
    assert updated_specs["CASING_MAT"]["aln_value"] == "Duplex Stainless 2205"

    # 3. Fetch specifications for seeded mechanical room location
    res_loc = client.get("/api/locations/BEDFORD/MECH_ROOM_101/specifications")
    assert res_loc.status_code == 200
    loc_data = res_loc.json()
    assert loc_data["classstructure_id"] == "CS_MECH_ROOM"
    loc_specs = {s["attribute_id"]: s for s in loc_data["specifications"]}
    assert "SQUARE_FEET" in loc_specs
    assert loc_specs["SQUARE_FEET"]["num_value"] == 3200.0
    assert "EXPLOSION_VENT" in loc_specs
    assert loc_specs["EXPLOSION_VENT"]["aln_value"] == "YES"

    # 4. Update location specifications
    update_loc = client.put("/api/locations/BEDFORD/MECH_ROOM_101/specifications", json={
        "specs": [
            {
                "attribute_id": "SQUARE_FEET",
                "section": "Physical Dimension",
                "num_value": 3500.0,
                "unit_of_measure": "SQFT",
            },
            {
                "attribute_id": "MAX_OCCUPANCY",
                "section": "Occupancy",
                "num_value": 15.0,
            }
        ]
    })
    assert update_loc.status_code == 200
    updated_loc_specs = {s["attribute_id"]: s for s in update_loc.json()["specifications"]}
    assert updated_loc_specs["SQUARE_FEET"]["num_value"] == 3500.0
    assert updated_loc_specs["MAX_OCCUPANCY"]["num_value"] == 15.0
