import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.models.entities import DynamicEntity, DynamicEntityEvent
from backend.models.escalation import EscalationDefinition, EscalationLog
from backend.models.entity_type import EntityTypeDefinition
from backend.services.command_handler import create_entity, propose_transition
from backend.services.escalation_engine import (
    seed_default_escalations,
    run_all_active_escalations,
    execute_single_escalation,
)


def test_escalation_crud_and_run_api(client: TestClient, test_db: Session):
    # 1. List escalations (auto-seeds defaults)
    res = client.get("/api/escalations")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    assert any(e["id"] == "PTW_AUTO_EXPIRY" for e in data)

    # 2. Create custom escalation
    custom_esc = {
        "id": "TEST_CUSTOM_WATCHDOG",
        "name": "Test Custom Watchdog",
        "description": "Custom test watchdog for workorders",
        "entity_type": "workorder",
        "status": "ACTIVE",
        "applies_to": "entity",
        "schedule_cron": "*/10 * * * *",
        "check_interval_seconds": 10,
        "points": [
            {
                "id": "p1",
                "elapsed_hours": 0,
                "reference_date_field": "target_finish",
                "filter_status": ["Draft"],
                "actions": [
                    {
                        "action_type": "CHANGE_STATUS",
                        "status_value": "Approved",
                    }
                ]
            }
        ]
    }
    create_res = client.post("/api/escalations", json=custom_esc)
    assert create_res.status_code == 200
    assert create_res.json()["id"] == "TEST_CUSTOM_WATCHDOG"

    # 3. Toggle activate / deactivate
    deact = client.post("/api/escalations/TEST_CUSTOM_WATCHDOG/activate?active=false")
    assert deact.status_code == 200
    assert deact.json()["status"] == "INACTIVE"

    act = client.post("/api/escalations/TEST_CUSTOM_WATCHDOG/activate?active=true")
    assert act.status_code == 200
    assert act.json()["status"] == "ACTIVE"

    # 4. Trigger manual run
    run_res = client.post("/api/escalations/TEST_CUSTOM_WATCHDOG/run")
    assert run_res.status_code == 200
    assert run_res.json()["executed"] is True

    # 5. Run all
    run_all_res = client.post("/api/escalations/run-all")
    assert run_all_res.status_code == 200
    assert run_all_res.json()["executed"] is True

    # 6. Fetch logs
    logs_res = client.get("/api/escalations/logs")
    assert logs_res.status_code == 200
    assert isinstance(logs_res.json(), list)


def test_entity_lifecycle_statuses_and_workflow_node_mapping(client: TestClient, test_db: Session):
    # 1. Create entity type with custom lifecycle statuses
    et_payload = {
        "name": "hazard_ticket",
        "display_name": "Hazard Ticket",
        "description": "Safety hazard reporting",
        "icon": "AlertTriangle",
        "statuses": [
            {"id": "NEW", "label": "New Report", "category": "draft", "color": "gray"},
            {"id": "INVESTIGATING", "label": "Under Investigation", "category": "in_progress", "color": "amber"},
            {"id": "RESOLVED", "label": "Resolved & Mitigated", "category": "terminal", "color": "emerald"},
        ],
        "fields": [
            {"field_name": "title", "field_type": "text", "label": "Title", "required": True},
            {"field_name": "severity", "field_type": "select", "label": "Severity", "select_options": ["Low", "High"]}
        ]
    }
    res = client.post("/api/entity-types", json=et_payload)
    assert res.status_code == 200
    et_data = res.json()
    assert len(et_data.get("statuses", [])) == 3
    assert et_data["statuses"][0]["id"] == "NEW"

    # 2. Publish workflow with node mapped to entity_status
    wf_payload = {
        "entity_type": "hazard_ticket",
        "version_label": "v1",
        "name": "Hazard Lifecycle",
        "definition": {
            "states": ["Reported", "Field_Inspection", "Mitigated"],
            "entry_state": "Reported",
            "terminal_states": ["Mitigated"],
            "nodes": [
                {
                    "name": "Reported",
                    "kind": "state",
                    "entity_status": "NEW",
                },
                {
                    "name": "Field_Inspection",
                    "kind": "task",
                    "entity_status": "INVESTIGATING",
                },
                {
                    "name": "Mitigated",
                    "kind": "stop",
                    "entity_status": "RESOLVED",
                }
            ],
            "transitions": [
                {"from": "Reported", "to": "Field_Inspection", "event": "START_INVESTIGATION"},
                {"from": "Field_Inspection", "to": "Mitigated", "event": "RESOLVE"},
            ]
        }
    }
    wf_draft = client.post("/api/workflows/draft", json=wf_payload).json()
    client.post(f"/api/workflows/{wf_draft['id']}/publish")

    # 3. Create record -> check entity_status vs workflow_stage
    created = create_entity(
        db=test_db,
        entity_type="hazard_ticket",
        actor_id="charlie.tech@compassx.io",
        workflow_version="v1",
        custom_fields={"title": "Oil Spill Bay 3", "severity": "High"}
    )
    assert created["status"] == "NEW"  # Mapped status
    entity_rec = test_db.query(DynamicEntity).filter(DynamicEntity.id == created["entity_id"]).first()
    assert entity_rec.status == "NEW"
    assert entity_rec.workflow_stage == "Reported"

    # 4. Transition -> Field_Inspection (mapped to INVESTIGATING)
    trans1 = propose_transition(
        db=test_db,
        entity_type="hazard_ticket",
        entity_id=created["entity_id"],
        event_type="START_INVESTIGATION",
        actor_id="alice.safety@compassx.io",
    )
    assert trans1["new_status"] == "INVESTIGATING"
    assert trans1["workflow_stage"] == "Field_Inspection"
    test_db.refresh(entity_rec)
    assert entity_rec.status == "INVESTIGATING"
    assert entity_rec.workflow_stage == "Field_Inspection"

    # 5. Transition -> Mitigated (mapped to RESOLVED)
    trans2 = propose_transition(
        db=test_db,
        entity_type="hazard_ticket",
        entity_id=created["entity_id"],
        event_type="RESOLVE",
        actor_id="bob.supervisor@compassx.io",
    )
    assert trans2["new_status"] == "RESOLVED"
    assert trans2["workflow_stage"] == "Mitigated"
    test_db.refresh(entity_rec)
    assert entity_rec.status == "RESOLVED"
    assert entity_rec.workflow_stage == "Mitigated"
