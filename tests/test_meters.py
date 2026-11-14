import pytest
from fastapi.testclient import TestClient


def _bedford_assets(client: TestClient) -> None:
    assert client.post("/api/company-sets", json={
        "set_id": "SET1", "description": "Set", "auto_add_companies": True, "status": "ACTIVE",
    }).status_code == 201
    assert client.post("/api/organizations", json={
        "org_id": "ORG1", "name": "Org", "company_set_id": "SET1", "base_currency_1": "USD",
    }).status_code == 201
    assert client.post("/api/organizations/ORG1/sites", json={
        "site_id": "BEDFORD", "name": "Bedford",
    }).status_code == 201
    assert client.post("/api/locations", json={
        "location_id": "MECH_ROOM_101", "site_id": "BEDFORD", "description": "Mechanical room",
        "type": "OPERATING", "status": "OPERATING",
    }).status_code == 201
    for asset_id, name in (("PUMP_SYS_100", "Feed pump"), ("MOTOR_50HP_01", "Drive motor")):
        assert client.post("/api/assets", json={
            "asset_id": asset_id,
            "site_id": "BEDFORD",
            "location_id": "MECH_ROOM_101",
            "name": name,
            "status": "OPERATING",
        }).status_code == 201


def _meter(client: TestClient, meter_id: str, meter_type: str = "CONTINUOUS", unit: str = "HOURS") -> None:
    assert client.post("/api/meters", json={
        "meter_id": meter_id,
        "description": meter_id,
        "meter_type": meter_type,
        "reading_type": "ACTUAL",
        "unit_of_measure": unit,
        "status": "ACTIVE",
    }).status_code == 201


def test_list_and_get_master_meters(client: TestClient):
    assert client.get("/api/meters").json() == []
    _meter(client, "RUNHOURS")
    _meter(client, "DISCHARGE_PSI", "GAUGE", "PSI")
    _meter(client, "OIL_CONDITION", "CHARACTERISTIC", None)

    res = client.get("/api/meters")
    assert res.status_code == 200
    meter_ids = [m["meter_id"] for m in res.json()]
    assert "RUNHOURS" in meter_ids
    assert "DISCHARGE_PSI" in meter_ids
    assert "OIL_CONDITION" in meter_ids

    data = client.get("/api/meters/RUNHOURS").json()
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
    assert res.json()["meter_type"] == "GAUGE"

    res_update = client.put("/api/meters/TEST_FLOW_RATE", json={"description": "Updated Pipe Flow Rate"})
    assert res_update.status_code == 200
    assert res_update.json()["description"] == "Updated Pipe Flow Rate"

    assert client.delete("/api/meters/TEST_FLOW_RATE").status_code == 204


def test_meter_groups_crud(client: TestClient):
    assert client.get("/api/meter-groups").json() == []
    _meter(client, "RUNHOURS")
    _meter(client, "VIB_VELOCITY", "GAUGE", "MM/S")
    _meter(client, "BEARING_TEMP", "GAUGE", "DEG_C")

    res_create = client.post("/api/meter-groups", json={
        "group_id": "MG_TEST_FAN",
        "description": "HVAC Fan Unit Meter Group",
        "meters": [
            {"meter_id": "RUNHOURS", "sequence": 1, "default_rollover": 100000.0, "default_avg_rate": 12.0},
            {"meter_id": "VIB_VELOCITY", "sequence": 2},
        ],
    })
    assert res_create.status_code == 201
    assert len(res_create.json()["meters"]) == 2

    res_add = client.post("/api/meter-groups/MG_TEST_FAN/meters", json={
        "meter_id": "BEARING_TEMP",
        "sequence": 3,
    })
    assert res_add.status_code == 201
    assert len(res_add.json()["meters"]) == 3

    assert client.delete("/api/meter-groups/MG_TEST_FAN/meters/BEARING_TEMP").status_code == 204
    assert client.delete("/api/meter-groups/MG_TEST_FAN").status_code == 204


def test_asset_meter_reading_and_rollover(client: TestClient):
    _bedford_assets(client)
    _meter(client, "RUNHOURS")
    _meter(client, "CYCLE_COUNT", "CONTINUOUS", "CYCLES")
    assert client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters", json={
        "meter_id": "RUNHOURS",
        "rollover_point": 100000.0,
        "initial_reading": 4250.5,
    }).status_code == 201

    meters = client.get("/api/assets/BEDFORD/PUMP_SYS_100/meters").json()["meters"]
    runhours_meter = next(m for m in meters if m["meter_id"] == "RUNHOURS")
    initial_ltd = runhours_meter["life_to_date"]

    res_read = client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters/RUNHOURS/readings", json={
        "reading_value": 4271.0,
        "remarks": "Weekly log reading",
    })
    assert res_read.status_code == 201
    data = res_read.json()
    assert data["reading"]["delta_value"] == 20.5
    assert data["asset_meter"]["last_reading"] == 4271.0
    assert data["asset_meter"]["life_to_date"] == initial_ltd + 20.5

    assert client.post("/api/assets/BEDFORD/MOTOR_50HP_01/meters", json={
        "meter_id": "CYCLE_COUNT",
        "rollover_point": 1000.0,
        "initial_reading": 990.0,
    }).status_code == 201
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
    _bedford_assets(client)
    _meter(client, "VIB_VELOCITY", "GAUGE", "MM/S")
    _meter(client, "OIL_CONDITION", "CHARACTERISTIC", None)
    assert client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters", json={"meter_id": "VIB_VELOCITY"}).status_code == 201
    assert client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters", json={"meter_id": "OIL_CONDITION"}).status_code == 201
    assert client.post("/api/measure-points", json={
        "point_id": "MP_PUMP100_VIB",
        "description": "Pump vibration",
        "site_id": "BEDFORD",
        "asset_id": "PUMP_SYS_100",
        "meter_id": "VIB_VELOCITY",
        "upper_warning_limit": 3.5,
        "upper_action_limit": 4.5,
        "action_job_plan": "JP_PUMP_VIB_INSPECT",
    }).status_code == 201
    assert client.post("/api/measure-points", json={
        "point_id": "MP_PUMP100_OIL",
        "description": "Oil condition",
        "site_id": "BEDFORD",
        "asset_id": "PUMP_SYS_100",
        "meter_id": "OIL_CONDITION",
        "action_aln_value": "BURNT",
    }).status_code == 201

    res_normal = client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters/VIB_VELOCITY/readings", json={"reading_value": 2.5})
    assert res_normal.status_code == 201
    assert res_normal.json()["breach_alert"] is None

    res_breach = client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters/VIB_VELOCITY/readings", json={"reading_value": 5.2})
    assert res_breach.status_code == 201
    breach = res_breach.json()["breach_alert"]
    assert breach["point_id"] == "MP_PUMP100_VIB"
    assert breach["breach_type"] == "UPPER_ACTION"
    assert breach["action_job_plan"] == "JP_PUMP_VIB_INSPECT"

    res_char = client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters/OIL_CONDITION/readings", json={"reading_aln": "BURNT"})
    assert res_char.status_code == 201
    char_breach = res_char.json()["breach_alert"]
    assert char_breach["point_id"] == "MP_PUMP100_OIL"
    assert char_breach["breach_type"] == "CHARACTERISTIC_ACTION"


def test_meter_reset_operations(client: TestClient):
    _bedford_assets(client)
    _meter(client, "RUNHOURS")
    assert client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters", json={
        "meter_id": "RUNHOURS",
        "initial_reading": 100.0,
    }).status_code == 201

    res_reset = client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters/RUNHOURS/reset", json={"reset_type": "OVERHAUL"})
    assert res_reset.status_code == 200
    assert res_reset.json()["since_last_overhaul"] == 0.0

    res_repair = client.post("/api/assets/BEDFORD/PUMP_SYS_100/meters/RUNHOURS/reset", json={"reset_type": "REPAIR"})
    assert res_repair.status_code == 200
    assert res_repair.json()["since_last_repair"] == 0.0
