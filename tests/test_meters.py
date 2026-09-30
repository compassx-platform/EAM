import pytest
from fastapi.testclient import TestClient


def test_list_and_get_master_meters(client: TestClient):
    res = client.get("/api/meters")
    assert res.status_code == 200
    meters = res.json()
    assert len(meters) >= 10
    meter_ids = [m["meter_id"] for m in meters]
    assert "RUNHOURS" in meter_ids
    assert "DISCHARGE_PSI" in meter_ids
    assert "OIL_CONDITION" in meter_ids

    # Get single meter
    res_single = client.get("/api/meters/RUNHOURS")
    assert res_single.status_code == 200
    data = res_single.json()
    assert data["meter_id"] == "RUNHOURS"
    assert data["meter_type"] == "CONTINUOUS"
    assert data["unit_of_measure"] == "HOURS"


def test_create_and_update_meter(client: TestClient):
    new_meter = {
        "meter_id": "TEST_FLOW_RATE",
        "description": "Pipe Discharge Flow Rate",
        "meter_type": "GAUGE",
        "reading_type": "ACTUAL",
        "unit_of_measure": "GPM",
        "status": "ACTIVE",
    }
    res = client.post("/api/meters", json=new_meter)
    assert res.status_code == 201
    created = res.json()
    assert created["meter_id"] == "TEST_FLOW_RATE"
    assert created["meter_type"] == "GAUGE"

    # Update description
    res_update = client.put("/api/meters/TEST_FLOW_RATE", json={"description": "Updated Pipe Flow Rate"})
    assert res_update.status_code == 200
    assert res_update.json()["description"] == "Updated Pipe Flow Rate"

    # Delete
    res_del = client.delete("/api/meters/TEST_FLOW_RATE")
    assert res_del.status_code == 204


def test_meter_groups_crud(client: TestClient):
    res = client.get("/api/meter-groups")
    assert res.status_code == 200
    groups = res.json()
    assert len(groups) >= 3

    # Create new group
    new_grp = {
        "group_id": "MG_TEST_FAN",
        "description": "HVAC Fan Unit Meter Group",
        "meters": [
            {"meter_id": "RUNHOURS", "sequence": 1, "default_rollover": 100000.0, "default_avg_rate": 12.0},
            {"meter_id": "VIB_VELOCITY", "sequence": 2},
        ]
    }
    res_create = client.post("/api/meter-groups", json=new_grp)
    assert res_create.status_code == 201
    grp_data = res_create.json()
    assert grp_data["group_id"] == "MG_TEST_FAN"
    assert len(grp_data["meters"]) == 2

    # Add meter to group
    res_add = client.post("/api/meter-groups/MG_TEST_FAN/meters", json={
        "meter_id": "BEARING_TEMP",
        "sequence": 3
    })
    assert res_add.status_code == 201
    assert len(res_add.json()["meters"]) == 3

    # Remove meter from group
    res_rem = client.delete("/api/meter-groups/MG_TEST_FAN/meters/BEARING_TEMP")
    assert res_rem.status_code == 204

    # Delete group
    res_del = client.delete("/api/meter-groups/MG_TEST_FAN")
    assert res_del.status_code == 204


def test_asset_meter_reading_and_rollover(client: TestClient):
    # Asset PUMP_SYS_100 has RUNHOURS seeded with last_reading = 4250.5, rollover_point = 100000.0
    res = client.get("/api/assets/BEDFORD/PUMP_SYS_100/meters")
    assert res.status_code == 200
    meters = res.json()["meters"]
    runhours_meter = next((m for m in meters if m["meter_id"] == "RUNHOURS"), None)
    assert runhours_meter is not None
    initial_ltd = runhours_meter["life_to_date"]

    # Ingest standard forward reading (+20.5 hours)
    new_reading = {
        "reading_value": 4271.0,
        "remarks": "Weekly log reading",
    }
    res_read = client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters/RUNHOURS/readings", json=new_reading)
    assert res_read.status_code == 201
    data = res_read.json()
    assert data["reading"]["delta_value"] == 20.5
    assert data["asset_meter"]["last_reading"] == 4271.0
    assert data["asset_meter"]["life_to_date"] == initial_ltd + 20.5

    # Test Rollover: Suppose reading rolls over dial (e.g. from 990 to 15 with rollover 1000)
    # Attach CYCLE_COUNT for rollover test
    client.post("/api/assets/BEDFORD/MOTOR_50HP_01/meters", json={
        "meter_id": "CYCLE_COUNT",
        "rollover_point": 1000.0,
        "initial_reading": 990.0
    })
    # Add reading 15.0 (rollover from 990 -> 1000 -> 15.0 => delta is (1000-990) + 15 = 25)
    res_roll = client.post("/api/assets/BEDFORD/MOTOR_50HP_01/meters/CYCLE_COUNT/readings", json={
        "reading_value": 15.0,
        "remarks": "Dial rolled over 1000",
    })
    assert res_roll.status_code == 201
    roll_data = res_roll.json()
    assert roll_data["reading"]["is_rollover"] is True
    assert roll_data["reading"]["delta_value"] == 25.0
    assert roll_data["asset_meter"]["life_to_date"] == 990.0 + 25.0


def test_measure_point_breach_detection(client: TestClient):
    # PUMP_SYS_100 has MP_PUMP100_VIB for VIB_VELOCITY with upper_warning_limit=3.5 and upper_action_limit=4.5
    # Let's log a normal reading
    res_normal = client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters/VIB_VELOCITY/readings", json={
        "reading_value": 2.5
    })
    assert res_normal.status_code == 201
    assert res_normal.json()["breach_alert"] is None

    # Log reading that breaches upper_action_limit (5.2 >= 4.5)
    res_breach = client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters/VIB_VELOCITY/readings", json={
        "reading_value": 5.2
    })
    assert res_breach.status_code == 201
    breach = res_breach.json()["breach_alert"]
    assert breach is not None
    assert breach["point_id"] == "MP_PUMP100_VIB"
    assert breach["breach_type"] == "UPPER_ACTION"
    assert breach["action_job_plan"] == "JP_PUMP_VIB_INSPECT"

    # Test Characteristic breach: OIL_CONDITION seeded with action_aln_value = "BURNT"
    res_char = client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters/OIL_CONDITION/readings", json={
        "reading_aln": "BURNT"
    })
    assert res_char.status_code == 201
    char_breach = res_char.json()["breach_alert"]
    assert char_breach is not None
    assert char_breach["point_id"] == "MP_PUMP100_OIL"
    assert char_breach["breach_type"] == "CHARACTERISTIC_ACTION"


def test_meter_reset_operations(client: TestClient):
    # Test overhaul reset on PUMP_SYS_100 RUNHOURS
    res_reset = client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters/RUNHOURS/reset", json={
        "reset_type": "OVERHAUL"
    })
    assert res_reset.status_code == 200
    assert res_reset.json()["since_last_overhaul"] == 0.0

    # Test repair reset
    res_repair = client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters/RUNHOURS/reset", json={
        "reset_type": "REPAIR"
    })
    assert res_repair.status_code == 200
    assert res_repair.json()["since_last_repair"] == 0.0
