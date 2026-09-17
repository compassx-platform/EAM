from datetime import datetime, timezone, timedelta
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from backend.database import Base, engine
from backend.models.users import AppUser, AppRole
from backend.models.field_registry import EntityField
from backend.models.workflow import WorkflowDefinition
from backend.models.conditions import ConditionDefinition, ConditionVersion
from backend.models.forms import EntityForm
from backend.models.entities import WorkOrder, Permit, PMSchedule
from backend.models.lists import ListDefinition
from backend.models.entity_type import EntityTypeDefinition
from backend.models.base import generate_uuid, utc_now
from backend.services.command_handler import create_entity, propose_transition

def _ensure_column(db: Session, table: str, column: str, ddl: str) -> None:
    """Idempotently adds a nullable column to an existing table (create_all will not alter it)."""
    inspector = inspect(db.get_bind())
    cols = {c["name"] for c in inspector.get_columns(table)}
    if column in cols:
        return
    db.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))

def seed_all(db: Session):
    """Initializes schema and seeds baseline users, roles, fields, gates, workflows, and sample entities."""
    Base.metadata.create_all(bind=db.get_bind())

    # Lightweight schema backfills for pre-existing dev databases
    _ensure_column(db, "entity_field", "label", "label VARCHAR(100)")

    # 0. Seed Default Entity Types
    default_entity_types = [
        ("workorder", "Work Order", "Maintenance work orders, repair jobs, and equipment tasks", "ClipboardList", True),
        ("permit", "Permit to Work", "Safety permits, hot work, and hazardous work authorisations", "ShieldCheck", True),
        ("pm_schedule", "PM Schedule", "Preventative maintenance schedules and recurring tasks", "Calendar", True),
    ]
    for name, display_name, desc, icon, is_sys in default_entity_types:
        et = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == name).first()
        if not et:
            et = EntityTypeDefinition(
                name=name,
                display_name=display_name,
                description=desc,
                icon=icon,
                is_system=is_sys
            )
            db.add(et)
    db.commit()

    # 1. Seed Roles
    roles_data = ["Admin", "Supervisor", "Safety Officer", "Technician", "Manager"]
    role_objs = {}
    for r_name in roles_data:
        role = db.query(AppRole).filter(AppRole.name == r_name).first()
        if not role:
            role = AppRole(id=generate_uuid(), name=r_name)
            db.add(role)
            db.commit()
            db.refresh(role)
        role_objs[r_name] = role

    # 2. Seed Users
    users_data = [
        {"email": "admin@compassx.io", "name": "Alex Admin", "roles": ["Admin"]},
        {"email": "alice.safety@compassx.io", "name": "Alice Vance (Safety Officer)", "roles": ["Safety Officer"]},
        {"email": "bob.supervisor@compassx.io", "name": "Bob Miller (Supervisor)", "roles": ["Supervisor"]},
        {"email": "charlie.tech@compassx.io", "name": "Charlie Stone (Technician)", "roles": ["Technician"]},
        {"email": "diana.manager@compassx.io", "name": "Diana Ross (Plant Manager)", "roles": ["Manager", "Supervisor"]},
    ]
    for u_info in users_data:
        user = db.query(AppUser).filter(AppUser.email == u_info["email"]).first()
        if not user:
            user = AppUser(
                id=generate_uuid(),
                email=u_info["email"],
                display_name=u_info["name"],
                active=True
            )
            user.roles = [role_objs[rn] for rn in u_info["roles"]]
            db.add(user)
            db.commit()

    # 3. Seed Entity Fields (Section 3.2)
    fields_data = [
        # ---- WorkOrder fields ----
        {
            "entity_type": "workorder",
            "field_name": "title",
            "field_type": "text",
            "required": True,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "description",
            "field_type": "text",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "priority",
            "field_type": "select",
            "required": True,
            "select_options": ["Low", "Medium", "High", "Critical"],
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "worktype",
            "field_type": "select",
            "required": False,
            "select_options": ["EM", "CM", "PM", "BM", "DM"],
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "hazardous",
            "field_type": "select",
            "required": False,
            "select_options": ["Yes", "No"],
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "estimated_cost",
            "field_type": "number",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "estlabcost",
            "field_type": "number",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "estmatcost",
            "field_type": "number",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "actlabcost",
            "field_type": "number",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "actmatcost",
            "field_type": "number",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "failurecode",
            "field_type": "text",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "failure_class",
            "field_type": "text",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "failure_problem",
            "field_type": "text",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "failure_cause",
            "field_type": "text",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "failure_remedy",
            "field_type": "text",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "assigned_to",
            "field_type": "text",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "workorder",
            "field_name": "linked_permit_id",
            "field_type": "entity_reference",
            "required": False,
            "select_options": None,
            "reference_entity_type": "permit",
        },
        {
            "entity_type": "workorder",
            "field_name": "linked_pm_id",
            "field_type": "entity_reference",
            "required": False,
            "select_options": None,
            "reference_entity_type": "pm_schedule",
        },
        {
            "entity_type": "workorder",
            "field_name": "next_wo_id",
            "field_type": "entity_reference",
            "required": False,
            "select_options": None,
            "reference_entity_type": "workorder",
        },
        # ---- Permit fields ----
        {
            "entity_type": "permit",
            "field_name": "title",
            "field_type": "text",
            "required": True,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "permit",
            "field_name": "permit_type",
            "field_type": "select",
            "required": True,
            "select_options": ["Hot Work", "Confined Space", "Electrical Isolation", "Working at Heights", "Chemical Handling"],
            "reference_entity_type": None,
        },
        {
            "entity_type": "permit",
            "field_name": "location",
            "field_type": "text",
            "required": True,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "permit",
            "field_name": "hazards_identified",
            "field_type": "text",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "permit",
            "field_name": "safety_precautions",
            "field_type": "text",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "permit",
            "field_name": "expiry_date",
            "field_type": "date",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "permit",
            "field_name": "risk_level",
            "field_type": "select",
            "required": False,
            "select_options": ["Low", "Medium", "High"],
            "reference_entity_type": None,
        },
        {
            "entity_type": "permit",
            "field_name": "isolation_notes",
            "field_type": "long_text",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "permit",
            "field_name": "supervisor_signoff",
            "field_type": "boolean",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "permit",
            "field_name": "supervisor_notes",
            "field_type": "long_text",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        # ---- PM Schedule fields (Step 6 PM records) ----
        {
            "entity_type": "pm_schedule",
            "field_name": "name",
            "field_type": "text",
            "required": True,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "pm_schedule",
            "field_name": "asset",
            "field_type": "text",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "pm_schedule",
            "field_name": "next_due_date",
            "field_type": "date",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
        {
            "entity_type": "pm_schedule",
            "field_name": "last_completion_date",
            "field_type": "date",
            "required": False,
            "select_options": None,
            "reference_entity_type": None,
        },
    ]

    for f_info in fields_data:
        existing = db.query(EntityField).filter(
            EntityField.entity_type == f_info["entity_type"],
            EntityField.field_name == f_info["field_name"]
        ).first()
        if not existing:
            f = EntityField(**f_info)
            db.add(f)
    db.commit()

    # 4. Seed Conditions (central, reusable, versioned rule registry — replaces gates)
    conditions_data = [
        # --- Permit conditions ---
        {
            "id": "cond_role_safety_officer",
            "entity_type": "permit",
            "label": "Requires Safety Officer Role",
            "definition": {"logic": "AND", "rules": [{"type": "role", "role": "Safety Officer"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_permit_hazards_filled",
            "entity_type": "permit",
            "label": "Hazards Identified is Required",
            "definition": {"logic": "AND", "rules": [{"type": "field_not_empty", "field": "hazards_identified"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_permit_is_isolation",
            "entity_type": "permit",
            "label": "Permit Type is Electrical Isolation",
            "definition": {"logic": "AND", "rules": [{"type": "attribute", "field": "permit_type", "operator": "eq", "value": "Electrical Isolation"}]},
            "failure_policy": "block",
        },
        # --- WorkOrder conditions (v1 lifecycle) ---
        {
            "id": "cond_role_supervisor",
            "entity_type": "workorder",
            "label": "Requires Supervisor Role",
            "definition": {"logic": "AND", "rules": [{"type": "role", "role": "Supervisor"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_cost_threshold",
            "entity_type": "workorder",
            "label": "Estimated Cost ≤ $15,000",
            "definition": {"logic": "AND", "rules": [{"type": "attribute", "field": "estimated_cost", "operator": "le", "value": 15000}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_linked_permit_active",
            "entity_type": "workorder",
            "label": "Linked Permit must be Active",
            "definition": {"logic": "AND", "rules": [{"type": "related", "relationship_field": "linked_permit_id", "target_entity_type": "permit", "required_status": "Active"}]},
            "failure_policy": "block",
        },
        # --- WorkOrder conditions (standard_v2 realistic flow) ---
        {
            "id": "cond_wo_role_manager",
            "entity_type": "workorder",
            "label": "Requires Manager Role",
            "definition": {"logic": "AND", "rules": [{"type": "role", "role": "Manager"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_wo_is_emergency",
            "entity_type": "workorder",
            "label": "WORKTYPE is Emergency (EM)",
            "definition": {"logic": "AND", "rules": [{"type": "attribute", "field": "worktype", "operator": "eq", "value": "EM"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_wo_cost_high",
            "entity_type": "workorder",
            "label": "Estimate > $5,000 (needs manager approval)",
            "definition": {"logic": "AND", "rules": [{"type": "expression", "expression": "($estlabcost + $estmatcost)", "operator": ">", "value": 5000}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_wo_permit_required",
            "entity_type": "workorder",
            "label": "Safety Permit Required (hazardous = Yes)",
            "definition": {"logic": "AND", "rules": [{"type": "attribute", "field": "hazardous", "operator": "eq", "value": "Yes"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_wo_permit_linked",
            "entity_type": "workorder",
            "label": "Work Permit Must Be Linked",
            "definition": {"logic": "AND", "rules": [{"type": "field_not_empty", "field": "linked_permit_id"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_wo_linked_permit_approved",
            "entity_type": "workorder",
            "label": "Linked Permit must be APPROVED",
            "definition": {"logic": "AND", "rules": [{"type": "related", "relationship_field": "linked_permit_id", "target_entity_type": "permit", "required_status": "Approved"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_wo_variance_over",
            "entity_type": "workorder",
            "label": "Actual vs Estimate Variance > 15%",
            "definition": {"logic": "AND", "rules": [{"type": "expression", "expression": "($actlabcost + $actmatcost) / ($estlabcost + $estmatcost)", "operator": ">", "value": 1.15}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_wo_failure_recorded",
            "entity_type": "workorder",
            "label": "Failure Recorded (FAILURECODE set)",
            "definition": {"logic": "AND", "rules": [{"type": "attribute", "field": "failurecode", "operator": "is_not_empty"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_wo_failure_class",
            "entity_type": "workorder",
            "label": "Failure Class Required",
            "definition": {"logic": "AND", "rules": [{"type": "field_not_empty", "field": "failure_class"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_wo_failure_problem",
            "entity_type": "workorder",
            "label": "Failure Problem Required",
            "definition": {"logic": "AND", "rules": [{"type": "field_not_empty", "field": "failure_problem"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_wo_failure_cause",
            "entity_type": "workorder",
            "label": "Failure Cause Required",
            "definition": {"logic": "AND", "rules": [{"type": "field_not_empty", "field": "failure_cause"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_wo_failure_remedy",
            "entity_type": "workorder",
            "label": "Failure Remedy Required",
            "definition": {"logic": "AND", "rules": [{"type": "field_not_empty", "field": "failure_remedy"}]},
            "failure_policy": "block",
        },
        {
            "id": "cond_wo_pm_linked",
            "entity_type": "workorder",
            "label": "Linked to a PM Schedule",
            "definition": {"logic": "AND", "rules": [{"type": "field_not_empty", "field": "linked_pm_id"}]},
            "failure_policy": "block",
        },
    ]

    for c_info in conditions_data:
        existing = db.query(ConditionDefinition).filter(ConditionDefinition.id == c_info["id"]).first()
        if not existing:
            cond = ConditionDefinition(**c_info, type="structured", current_version=1, created_by="admin@compassx.io")
            db.add(cond)
            db.add(ConditionVersion(
                condition_id=cond.id,
                version=1,
                label=cond.label,
                definition=cond.definition,
                failure_policy=cond.failure_policy,
                created_by="admin@compassx.io",
            ))
    db.commit()

    # 5a. WorkOrder standard_v1 (legacy lifecycle — kept for bound instances & coexistence tests)
    seed_legacy_workflow_if_absent(db, "workorder", "standard_v1", {
        "entity_type": "workorder",
        "version_label": "standard_v1",
        "states": ["Draft", "Submitted", "SupervisorApproved", "InProgress", "Completed", "Closed", "Rejected", "Cancelled"],
        "terminal_states": ["Closed", "Cancelled", "Rejected"],
        "transitions": [
            {"from": "Draft", "event": "SUBMITTED", "to": "Submitted", "conditions": []},
            {"from": "Submitted", "event": "APPROVED", "to": "SupervisorApproved", "conditions": ["cond_role_supervisor", "cond_cost_threshold"]},
            {"from": "Submitted", "event": "REJECTED", "to": "Rejected", "conditions": ["cond_role_supervisor"]},
            {"from": "SupervisorApproved", "event": "STARTED", "to": "InProgress", "conditions": ["cond_linked_permit_active"]},
            {"from": "InProgress", "event": "COMPLETED", "to": "Completed", "conditions": []},
            {"from": "Completed", "event": "CLOSED", "to": "Closed", "conditions": []},
            {"from": "Completed", "event": "REOPENED", "to": "InProgress", "conditions": []},
            {"from": "Draft", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "Submitted", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "SupervisorApproved", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
        ]
    }, created_at=utc_now() - timedelta(minutes=10))

    # 5b. WorkOrder standard_v2 — the realistic Maximo-style flow (all configurable)
    seed_legacy_workflow_if_absent(db, "workorder", "standard_v2", {
        "entity_type": "workorder",
        "version_label": "standard_v2",
        "states": ["WAPPR", "MGR_APPR", "APPR", "PRMT_PEND", "INPRG", "VR_REVIEW", "COMP", "FAILURE", "CLOSING", "CLOSED", "CANCELED"],
        "terminal_states": ["CLOSED", "CANCELED"],
        "transitions": [
            # Step 1/2 — Waiting for approval (WAPPR): supervisor decision node
            {"from": "WAPPR", "event": "SUP_AUTHORIZE",
             "conditions": ["cond_role_supervisor"],
             "choices": [
                 {"to": "MGR_APPR", "when": ["cond_wo_cost_high"]},       # > $5k -> second approval layer
                 {"to": "APPR", "when": []},                              # below threshold -> auto-approve path
             ]},
            {"from": "WAPPR", "event": "SUP_REJECT", "to": "WAPPR", "conditions": ["cond_role_supervisor"]},
            {"from": "WAPPR", "event": "CANCEL", "to": "CANCELED", "conditions": []},
            # Emergency auto-route event (fired by auto_transitions when WORKTYPE=EM)
            {"from": "WAPPR", "event": "AUTO_EMR", "to": "INPRG", "conditions": []},

            # Step 2 sub-node — Manager Approval
            {"from": "MGR_APPR", "event": "MGR_AUTHORIZE", "to": "APPR", "conditions": ["cond_wo_role_manager"]},
            {"from": "MGR_APPR", "event": "MGR_REJECT", "to": "WAPPR", "conditions": ["cond_wo_role_manager"]},
            {"from": "MGR_APPR", "event": "CANCEL", "to": "CANCELED", "conditions": []},

            # Step 3 — approved: permit-pending cross-object gate or straight to work
            {"from": "APPR", "event": "START_WORK",
             "choices": [
                 {"to": "PRMT_PEND", "when": ["cond_wo_permit_required"]},  # hazardous -> permit pending
                 {"to": "INPRG", "when": []},
             ]},
            {"from": "PRMT_PEND", "event": "START_WORK", "to": "INPRG",
             "conditions": ["cond_wo_permit_linked", "cond_wo_linked_permit_approved"]},  # cross-object gate
            {"from": "APPR", "event": "CANCEL", "to": "CANCELED", "conditions": []},
            {"from": "PRMT_PEND", "event": "CANCEL", "to": "CANCELED", "conditions": []},

            # Step 4 — in progress: variance review on completion
            {"from": "INPRG", "event": "COMPLETE_WORK",
             "choices": [
                 {"to": "VR_REVIEW", "when": ["cond_wo_variance_over"]},   # over tolerance -> supervisor sign-off
                 {"to": "COMP", "when": []},
             ]},
            {"from": "VR_REVIEW", "event": "SUP_SIGNOFF", "to": "COMP", "conditions": ["cond_role_supervisor"]},
            {"from": "INPRG", "event": "CANCEL", "to": "CANCELED", "conditions": []},

            # Step 5 — completion decision: failure-driven work needs RCA
            {"from": "COMP", "event": "FINALIZE",
             "choices": [
                 {"to": "FAILURE", "when": ["cond_wo_failure_recorded"]},  # FAILURECODE set -> RCA required
                 {"to": "CLOSING", "when": []},
             ]},
            {"from": "FAILURE", "event": "RCA_COMPLETE", "to": "CLOSING",
             "conditions": ["cond_wo_failure_class", "cond_wo_failure_problem", "cond_wo_failure_cause", "cond_wo_failure_remedy"]},

            # Step 6 — close: PM-linked work triggers declarative side effects
            {"from": "CLOSING", "event": "CLOSE_WO",
             "choices": [
                 {"to": "CLOSED", "when": ["cond_wo_pm_linked"],
                  "on_after": [
                      {"type": "update_related_entity_field", "params": {
                          "relationship_field": "linked_pm_id",
                          "target_entity_type": "pm_schedule",
                          "field": "last_completion_date",
                          "value": "now",
                      }},
                      {"type": "create_related_entity", "params": {
                          "target_entity_type": "workorder",
                          "relationship_field": "next_wo_id",
                          "template": {
                              "title": "{{title}} (Next PM)",
                              "worktype": "{{worktype}}",
                              "priority": "{{priority}}",
                              "linked_pm_id": "{{linked_pm_id}}",
                          },
                      }},
                  ]},
                 {"to": "CLOSED", "when": []},
             ]},
        ],
        "auto_transitions": [
            {"from": "WAPPR", "event": "AUTO_EMR", "when": ["cond_wo_is_emergency"]},
        ],
    }, created_at=utc_now() - timedelta(minutes=5))

    # 5c. Permit standard_v1 (legacy lifecycle — kept for bound instances & coexistence tests)
    seed_legacy_workflow_if_absent(db, "permit", "permit_v1", {
        "entity_type": "permit",
        "version_label": "permit_v1",
        "states": ["Requested", "RiskAssessed", "Issued", "Active", "HandedBack", "Closed", "Expired", "Cancelled"],
        "terminal_states": ["Closed", "Cancelled", "Expired"],
        "transitions": [
            {"from": "Requested", "event": "RISK_ASSESSMENT_COMPLETED", "to": "RiskAssessed", "conditions": ["cond_permit_hazards_filled"]},
            {"from": "RiskAssessed", "event": "ISSUED", "to": "Issued", "conditions": ["cond_role_safety_officer"]},
            {"from": "Issued", "event": "ACTIVATED", "to": "Active", "conditions": []},
            {"from": "Active", "event": "HANDED_BACK", "to": "HandedBack", "conditions": []},
            {"from": "HandedBack", "event": "CLOSED", "to": "Closed", "conditions": []},
            {"from": "Active", "event": "EXPIRED", "to": "Expired", "conditions": []},
            {"from": "Requested", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "RiskAssessed", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "Issued", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "Active", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
        ]
    }, created_at=utc_now() - timedelta(minutes=10))

    # 5d. Permit standard_v2 — adds the APPROVED state the WO permit gate depends on
    seed_legacy_workflow_if_absent(db, "permit", "permit_v2", {
        "entity_type": "permit",
        "version_label": "permit_v2",
        "states": ["Requested", "RiskAssessed", "Approved", "Issued", "Active", "HandedBack", "Closed", "Expired", "Cancelled"],
        "terminal_states": ["Closed", "Cancelled", "Expired"],
        "transitions": [
            {"from": "Requested", "event": "RISK_ASSESSMENT_COMPLETED", "to": "RiskAssessed", "conditions": ["cond_permit_hazards_filled"]},
            {"from": "RiskAssessed", "event": "APPROVED", "to": "Approved", "conditions": ["cond_role_safety_officer"]},
            {"from": "Approved", "event": "ISSUED", "to": "Issued", "conditions": ["cond_role_safety_officer"]},
            {"from": "Issued", "event": "ACTIVATED", "to": "Active", "conditions": []},
            {"from": "Active", "event": "HANDED_BACK", "to": "HandedBack", "conditions": []},
            {"from": "HandedBack", "event": "CLOSED", "to": "Closed", "conditions": []},
            {"from": "Active", "event": "EXPIRED", "to": "Expired", "conditions": []},
            {"from": "Requested", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "RiskAssessed", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "Approved", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "Issued", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "Active", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
        ]
    }, created_at=utc_now() - timedelta(minutes=5))

    # 5d2. Permit standard_v3 — field-driven routing (form value -> workflow stage) with
    # an extra IsolationPrecheck node for Electrical Isolation permits (Section 4.2 demo).
    seed_legacy_workflow_if_absent(db, "permit", "permit_v3", {
        "entity_type": "permit",
        "version_label": "permit_v3",
        "states": ["Requested", "IsolationPrecheck", "RiskAssessed", "Approved", "Issued", "Active", "HandedBack", "Closed", "Expired", "Cancelled"],
        "terminal_states": ["Closed", "Cancelled", "Expired"],
        "transitions": [
            # Create -> Requested (CREATED implicit) -> decision node.
            # permit_type = "Electrical Isolation" routes to IsolationPrecheck for a
            # dedicated isolation review; everything else goes straight to risk assessment.
            {"from": "Requested", "event": "RISK_ASSESSMENT_COMPLETED",
             "conditions": ["cond_permit_hazards_filled"],
             "choices": [
                 {"to": "IsolationPrecheck", "when": ["cond_permit_is_isolation"]},
                 {"to": "RiskAssessed", "when": []},
             ]},
            {"from": "IsolationPrecheck", "event": "ISOLATION_REVIEW", "to": "RiskAssessed", "conditions": ["cond_role_safety_officer"]},
            {"from": "RiskAssessed", "event": "APPROVED", "to": "Approved", "conditions": ["cond_role_safety_officer"]},
            {"from": "Approved", "event": "ISSUED", "to": "Issued", "conditions": ["cond_role_safety_officer"]},
            {"from": "Issued", "event": "ACTIVATED", "to": "Active", "conditions": []},
            {"from": "Active", "event": "HANDED_BACK", "to": "HandedBack", "conditions": []},
            {"from": "HandedBack", "event": "CLOSED", "to": "Closed", "conditions": []},
            {"from": "Active", "event": "EXPIRED", "to": "Expired", "conditions": []},
            {"from": "Requested", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "IsolationPrecheck", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "RiskAssessed", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "Approved", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "Issued", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
            {"from": "Active", "event": "CANCELLED", "to": "Cancelled", "conditions": []},
        ],
        "auto_transitions": [],
    }, created_at=utc_now())

    # 5d3. Seed the permit form layout with two-way condition rules:
    #   * permit_type = "Electrical Isolation" -> isolation group appears (field -> form)
    #   * _workflow_status in review/approval stages -> supervisor group appears (stage -> form)
    seed_permit_form_layout(db)

    # 5e. PM Schedule — create-only tracking workflow (Step 6 PM records)
    seed_legacy_workflow_if_absent(db, "pm_schedule", "pm_schedule_v1", {
        "entity_type": "pm_schedule",
        "version_label": "pm_schedule_v1",
        "states": ["Scheduled"],
        "terminal_states": ["Scheduled"],
        "transitions": [],
        "auto_transitions": [],
    }, created_at=utc_now() - timedelta(minutes=5))

    db.commit()

    # 5f. Seed central option/checklist lists and wire the permit_type field to one
    seed_lists(db)

    # 6. Seed Sample Live Entities if none exist
    seed_sample_entities(db)


def seed_permit_form_layout(db: Session):
    """Seeds the permit-to-work form layout demonstrating both binding directions.

    Field -> workflow stage and stage -> form are wired as visibility conditions:
      * The "Isolation Details" group only appears when ``permit_type`` equals
        "Electrical Isolation" (field value drives what is visible).
      * The "Supervisor Approval" group only appears when the current workflow
        stage is a review/approval stage (``_workflow_status`` pseudo-field),
        so at create time / in Requested the approval fields stay hidden.
    """
    existing = db.query(EntityForm).filter(EntityForm.entity_type == "permit").first()
    if existing:
        return

    layout = [
        # --- Section + request fields (visible at create / Requested stage) ---
        {"i": "header:permit_request", "x": 0, "y": 0, "w": 12, "h": 1, "isHeader": True, "label": "Permit Request"},
        {"i": "title", "x": 0, "y": 1, "w": 6, "h": 1, "fieldName": "title", "fieldType": "text", "label": "Title", "required": True},
        {"i": "permit_type", "x": 6, "y": 1, "w": 6, "h": 1, "fieldName": "permit_type", "fieldType": "dropdown", "optionsList": "permit_type", "label": "Permit Type", "required": True},
        {"i": "location", "x": 0, "y": 2, "w": 6, "h": 1, "fieldName": "location", "fieldType": "text", "label": "Location", "required": True},
        {"i": "risk_level", "x": 6, "y": 2, "w": 6, "h": 1, "fieldName": "risk_level", "fieldType": "dropdown", "options": ["Low", "Medium", "High"], "label": "Risk Level", "required": False},
        {"i": "hazards_identified", "x": 0, "y": 3, "w": 12, "h": 2, "fieldName": "hazards_identified", "fieldType": "long_text", "label": "Hazards Identified", "required": True},
        {"i": "safety_precautions", "x": 0, "y": 5, "w": 12, "h": 2, "fieldName": "safety_precautions", "fieldType": "long_text", "label": "Safety Precautions", "required": False},

        # --- Isolation details group: only for Electrical Isolation permits (field -> form) ---
        {"i": "group:isolation_details", "x": 0, "y": 7, "w": 12, "h": 1, "isGroup": True, "groupId": "group:isolation_details", "label": "Isolation Details",
         "visibilityCondition": {
             "action": "show",
             "matchType": "all",
             "rules": [{"field": "permit_type", "operator": "equals", "value": "Electrical Isolation"}],
         }},
        {"i": "isolation_notes", "x": 0, "y": 8, "w": 12, "h": 2, "fieldName": "isolation_notes", "fieldType": "long_text", "groupId": "group:isolation_details", "label": "Isolation Point Notes", "required": False},

        # --- Supervisor approval group: appears at review/approval stages (stage -> form) ---
        {"i": "group:supervisor_approval", "x": 0, "y": 10, "w": 12, "h": 1, "isGroup": True, "groupId": "group:supervisor_approval", "label": "Supervisor Approval",
         "visibilityCondition": {
             "action": "show",
             "matchType": "any",
             "rules": [
                 {"field": "_workflow_status", "operator": "equals", "value": "IsolationPrecheck"},
                 {"field": "_workflow_status", "operator": "equals", "value": "Approved"},
             ],
         }},
        {"i": "supervisor_signoff", "x": 0, "y": 11, "w": 6, "h": 1, "fieldName": "supervisor_signoff", "fieldType": "boolean", "groupId": "group:supervisor_approval", "label": "Supervisor Sign-off", "required": False},
        {"i": "supervisor_notes", "x": 6, "y": 12, "w": 6, "h": 2, "fieldName": "supervisor_notes", "fieldType": "long_text", "groupId": "group:supervisor_approval", "label": "Supervisor Notes", "required": False},
    ]

    form = EntityForm(
        entity_type="permit",
        layout=layout,
        cols=12,
        row_height=40,
    )
    db.add(form)
    db.commit()


def seed_lists(db: Session):
    """Seeds central option/checklist lists and wires the permit_type registry field to one."""
    lists_data = [
        {
            "list_key": "wo_priority",
            "kind": "options",
            "description": "Work order priority levels",
            "items": ["Low", "Medium", "High", "Critical"],
        },
        {
            "list_key": "permit_type",
            "kind": "options",
            "description": "Permit to Work types",
            "items": ["Hot Work", "Confined Space", "Electrical Isolation", "Working at Heights", "Chemical Handling"],
        },
        {
            "list_key": "permit_safety_checklist",
            "kind": "checklist",
            "description": "Pre-work safety checks required before a permit goes active",
            "items": [
                {"label": "Fire watch assigned", "required": True, "assigned_role": "Safety Officer"},
                {"label": "Extinguisher within reach", "required": True, "assigned_role": None},
                {"label": "Area cordoned / signage up", "required": True, "assigned_role": None},
                {"label": "Gas monitoring active", "required": False, "assigned_role": "Safety Officer"},
            ],
        },
    ]

    for entry in lists_data:
        key = entry["list_key"]
        existing = db.query(ListDefinition).filter(ListDefinition.list_key == key).first()
        if not existing:
            published = ListDefinition(
                id=generate_uuid(),
                list_key=key,
                kind=entry["kind"],
                description=entry["description"],
                version_label="v1",
                status="published",
                items=entry["items"],
                created_at=utc_now(),
                published_at=utc_now(),
            )
            db.add(published)

    # Wire the existing permit_type registry field to the permit_type list so the
    # demo shows the list-driven select (validation now resolves from the list).
    permit_field = db.query(EntityField).filter(
        EntityField.entity_type == "permit",
        EntityField.field_name == "permit_type",
    ).first()
    if permit_field and not permit_field.option_list_key:
        permit_field.option_list_key = "permit_type"

    db.commit()


def seed_legacy_workflow_if_absent(db: Session, entity_type: str, version_label: str, definition: dict, created_at: datetime = None):
    existing = db.query(WorkflowDefinition).filter(
        WorkflowDefinition.entity_type == entity_type,
        WorkflowDefinition.version_label == version_label
    ).first()
    if existing:
        return
    ts = created_at or utc_now()
    wf = WorkflowDefinition(
        id=generate_uuid(),
        entity_type=entity_type,
        version_label=version_label,
        status="published",
        created_by="system",
        created_at=ts,
        published_at=ts,
        definition=definition,
    )
    db.add(wf)


def seed_sample_entities(db: Session):
    if db.query(Permit).count() > 0:
        return

    # --- Sample Permit 1: hot-work permit walked through permit_v2 to ACTIVE ---
    p1_expiry = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    res_p1 = create_entity(
        db=db,
        entity_type="permit",
        actor_id="charlie.tech@compassx.io",
        custom_fields={
            "title": "Main Turbines Hot Work Permit",
            "permit_type": "Hot Work",
            "location": "Turbine Hall Bay 4",
            "hazards_identified": "Sparks near gas manifold line",
            "safety_precautions": "Fire watch on duty, dual extinguishers mounted",
            "expiry_date": p1_expiry,
            "risk_level": "High"
        },
        payload={"comment": "Emergency maintenance hot work authorization requested"}
    )
    p1_id = res_p1["entity_id"]
    propose_transition(db, "permit", p1_id, "RISK_ASSESSMENT_COMPLETED", "charlie.tech@compassx.io", payload={"comment": "Risk assessment completed with JSA"})
    propose_transition(db, "permit", p1_id, "APPROVED", "alice.safety@compassx.io", actor_roles=["Safety Officer"], payload={"comment": "Approved after site inspection"})
    propose_transition(db, "permit", p1_id, "ISSUED", "alice.safety@compassx.io", actor_roles=["Safety Officer"], payload={"comment": "Permit issued"})
    propose_transition(db, "permit", p1_id, "ACTIVATED", "charlie.tech@compassx.io", payload={"comment": "Workforce on site and permit activated"})

    # --- Sample Permit 2: confined-space permit sitting at APPROVED (WO gate demo) ---
    p2_expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
    res_p2 = create_entity(
        db=db,
        entity_type="permit",
        actor_id="charlie.tech@compassx.io",
        custom_fields={
            "title": "Substation B Confined Space Entry",
            "permit_type": "Confined Space",
            "location": "Substation B Transformer Pit",
            "hazards_identified": "Atmospheric oxygen depletion risk",
            "safety_precautions": "Continuous 4-gas monitoring and extraction fan active",
            "expiry_date": p2_expiry,
            "risk_level": "High"
        },
        payload={"comment": "Annual inspection of transformer isolation chambers"}
    )
    p2_id = res_p2["entity_id"]
    propose_transition(db, "permit", p2_id, "RISK_ASSESSMENT_COMPLETED", "charlie.tech@compassx.io", payload={"comment": "JSA complete"})
    propose_transition(db, "permit", p2_id, "APPROVED", "alice.safety@compassx.io", actor_roles=["Safety Officer"], payload={"comment": "Approved pending issuance"})

    # --- Sample PM schedule (Step 6 target) ---
    res_pm = create_entity(
        db=db,
        entity_type="pm_schedule",
        actor_id="admin@compassx.io",
        custom_fields={
            "name": "Compressor Vane Quarterly PM",
            "asset": "COMP-004",
            "next_due_date": (datetime.now(timezone.utc) + timedelta(days=21)).isoformat(),
        },
        payload={"comment": "Quarterly preventive maintenance program"}
    )
    pm_id = res_pm["entity_id"]

    # --- Sample Work Order 1: high-estimate, non-emergency -> parked at WAPPR ---
    create_entity(
        db=db,
        entity_type="workorder",
        actor_id="charlie.tech@compassx.io",
        custom_fields={
            "title": "Replace Turbine Impeller Shaft Seals",
            "description": "Remove worn seal rings on turbine #4 and install high-temp graphite packing",
            "priority": "High",
            "worktype": "CM",
            "hazardous": "No",
            "estlabcost": 12000,
            "estmatcost": 6000,
            "assigned_to": "Charlie Stone",
            "linked_permit_id": p1_id,
        },
        payload={"comment": "Work order created for outage repair (cost high -> manager approval layer)"}
    )

    # --- Sample Work Order 2: EMERGENCY worktype -> auto-routes WAPPR -> INPRG ---
    create_entity(
        db=db,
        entity_type="workorder",
        actor_id="charlie.tech@compassx.io",
        custom_fields={
            "title": "Cooling Water Line Burst — Urgent Isolation",
            "description": "Pipe burst on cooling water main; isolate and repair",
            "priority": "Critical",
            "worktype": "EM",
            "hazardous": "No",
            "estlabcost": 1500,
            "estmatcost": 800,
            "assigned_to": "Shift Crew A",
        },
        payload={"comment": "Emergency work order — routed straight to INPRG"}
    )

    # --- Sample Work Order 3: hazardous + linked approved permit, parked at WAPPR ---
    create_entity(
        db=db,
        entity_type="workorder",
        actor_id="charlie.tech@compassx.io",
        custom_fields={
            "title": "Substation B Transformer Inspection",
            "description": "Annual inspection of transformer isolation chambers",
            "priority": "Medium",
            "worktype": "CM",
            "hazardous": "Yes",
            "estlabcost": 2500,
            "estmatcost": 900,
            "assigned_to": "Maintenance Crew B",
            "linked_permit_id": p2_id,
        },
        payload={"comment": "Hazardous work — will require approved permit before INPRG"}
    )

    db.commit()