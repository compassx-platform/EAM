from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from backend.database import Base, engine
from backend.models.users import AppUser, AppRole
from backend.models.field_registry import EntityField
from backend.models.workflow import WorkflowDefinition, GateInstance
from backend.models.forms import EntityForm
from backend.models.entities import WorkOrder, WorkOrderEvent, Permit, PermitEvent
from backend.models.base import generate_uuid, utc_now
from backend.services.command_handler import create_entity, propose_transition

def seed_all(db: Session):
    """Initializes schema and seeds baseline users, roles, fields, gates, workflows, and sample entities."""
    Base.metadata.create_all(bind=engine)

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
        # WorkOrder fields
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
            "field_name": "estimated_cost",
            "field_type": "number",
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
        # Permit fields
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

    # 4. Seed Gate Instances (Section 3.6 & Section 7.2)
    gates_data = [
        {
            "id": "gate_role_safety_officer",
            "entity_type": "permit",
            "gate_type": "role_check",
            "label": "Requires Safety Officer Role",
            "params": {"role": "Safety Officer"},
            "failure_policy": "block",
        },
        {
            "id": "gate_permit_hazards_not_empty",
            "entity_type": "permit",
            "gate_type": "field_not_empty",
            "label": "Hazards Identified is Required",
            "params": {"field": "hazards_identified"},
            "failure_policy": "block",
        },
        {
            "id": "gate_role_supervisor",
            "entity_type": "workorder",
            "gate_type": "role_check",
            "label": "Requires Supervisor Role",
            "params": {"role": "Supervisor"},
            "failure_policy": "block",
        },
        {
            "id": "gate_cost_threshold",
            "entity_type": "workorder",
            "gate_type": "numeric_threshold",
            "label": "Estimated Cost ≤ $15,000",
            "params": {"field": "estimated_cost", "operator": "<=", "value": 15000},
            "failure_policy": "block",
        },
        {
            "id": "gate_linked_permit_active",
            "entity_type": "workorder",
            "gate_type": "related_entity_status_check",
            "label": "Linked Permit must be Active",
            "params": {
                "relationship_field": "linked_permit_id",
                "target_entity_type": "permit",
                "required_status": "Active"
            },
            "failure_policy": "block",
        },
    ]

    for g_info in gates_data:
        existing = db.query(GateInstance).filter(GateInstance.id == g_info["id"]).first()
        if not existing:
            g = GateInstance(**g_info)
            db.add(g)
    db.commit()

    # 5. Seed Workflow Definitions (Section 3.4 & Section 6)
    # WorkOrder Workflow Definition
    wo_wf = db.query(WorkflowDefinition).filter(
        WorkflowDefinition.entity_type == "workorder",
        WorkflowDefinition.version_label == "standard_v1"
    ).first()
    if not wo_wf:
        wo_wf = WorkflowDefinition(
            id=generate_uuid(),
            entity_type="workorder",
            version_label="standard_v1",
            status="published",
            created_by="system",
            created_at=utc_now(),
            published_at=utc_now(),
            definition={
                "entity_type": "workorder",
                "version_label": "standard_v1",
                "states": ["Draft", "Submitted", "SupervisorApproved", "InProgress", "Completed", "Closed", "Rejected", "Cancelled"],
                "transitions": [
                    {"from": "Draft", "event": "SUBMITTED", "to": "Submitted", "gates": []},
                    {"from": "Submitted", "event": "APPROVED", "to": "SupervisorApproved", "gates": ["gate_role_supervisor", "gate_cost_threshold"]},
                    {"from": "Submitted", "event": "REJECTED", "to": "Rejected", "gates": ["gate_role_supervisor"]},
                    {"from": "SupervisorApproved", "event": "STARTED", "to": "InProgress", "gates": ["gate_linked_permit_active"]},
                    {"from": "InProgress", "event": "COMPLETED", "to": "Completed", "gates": []},
                    {"from": "Completed", "event": "CLOSED", "to": "Closed", "gates": []},
                    {"from": "Completed", "event": "REOPENED", "to": "InProgress", "gates": []},
                    {"from": "Draft", "event": "CANCELLED", "to": "Cancelled", "gates": []},
                    {"from": "Submitted", "event": "CANCELLED", "to": "Cancelled", "gates": []},
                    {"from": "SupervisorApproved", "event": "CANCELLED", "to": "Cancelled", "gates": []},
                ]
            }
        )
        db.add(wo_wf)

    # Permit Workflow Definition (Section 6)
    permit_wf = db.query(WorkflowDefinition).filter(
        WorkflowDefinition.entity_type == "permit",
        WorkflowDefinition.version_label == "permit_v1"
    ).first()
    if not permit_wf:
        permit_wf = WorkflowDefinition(
            id=generate_uuid(),
            entity_type="permit",
            version_label="permit_v1",
            status="published",
            created_by="system",
            created_at=utc_now(),
            published_at=utc_now(),
            definition={
                "entity_type": "permit",
                "version_label": "permit_v1",
                "states": ["Requested", "RiskAssessed", "Issued", "Active", "HandedBack", "Closed", "Expired", "Cancelled"],
                "transitions": [
                    {"from": "Requested", "event": "RISK_ASSESSMENT_COMPLETED", "to": "RiskAssessed", "gates": ["gate_permit_hazards_not_empty"]},
                    {"from": "RiskAssessed", "event": "ISSUED", "to": "Issued", "gates": ["gate_role_safety_officer"]},
                    {"from": "Issued", "event": "ACTIVATED", "to": "Active", "gates": []},
                    {"from": "Active", "event": "HANDED_BACK", "to": "HandedBack", "gates": []},
                    {"from": "HandedBack", "event": "CLOSED", "to": "Closed", "gates": []},
                    {"from": "Active", "event": "EXPIRED", "to": "Expired", "gates": []},
                    {"from": "Requested", "event": "CANCELLED", "to": "Cancelled", "gates": []},
                    {"from": "RiskAssessed", "event": "CANCELLED", "to": "Cancelled", "gates": []},
                    {"from": "Issued", "event": "CANCELLED", "to": "Cancelled", "gates": []},
                    {"from": "Active", "event": "CANCELLED", "to": "Cancelled", "gates": []},
                ]
            }
        )
        db.add(permit_wf)

    db.commit()

    # 6. Seed Sample Live Entities if none exist
    if db.query(Permit).count() == 0:
        # Sample Permit 1 (Active)
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
        # Progress p1: Requested -> RiskAssessed -> Issued -> Active
        propose_transition(db, "permit", p1_id, "RISK_ASSESSMENT_COMPLETED", "charlie.tech@compassx.io", payload={"comment": "Risk assessment completed with JSA"})
        propose_transition(db, "permit", p1_id, "ISSUED", "alice.safety@compassx.io", actor_roles=["Safety Officer"], payload={"comment": "Issued after site inspection"})
        propose_transition(db, "permit", p1_id, "ACTIVATED", "charlie.tech@compassx.io", payload={"comment": "Workforce on site and permit activated"})

        # Sample Permit 2 (Requested - newly created)
        p2_expiry = (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat()
        create_entity(
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

        # Sample Work Order 1 (linked to Active Permit 1)
        res_wo1 = create_entity(
            db=db,
            entity_type="workorder",
            actor_id="charlie.tech@compassx.io",
            custom_fields={
                "title": "Replace Turbine Impeller Shaft Seals",
                "description": "Remove worn seal rings on turbine #4 and install high-temp graphite packing",
                "priority": "High",
                "estimated_cost": 8500,
                "assigned_to": "Charlie Stone",
                "linked_permit_id": p1_id,
            },
            payload={"comment": "Work order created for outage repair"}
        )
        wo1_id = res_wo1["entity_id"]
        propose_transition(db, "workorder", wo1_id, "SUBMITTED", "charlie.tech@compassx.io", payload={"comment": "Ready for supervisor sign-off"})
        propose_transition(db, "workorder", wo1_id, "APPROVED", "bob.supervisor@compassx.io", actor_roles=["Supervisor"], payload={"comment": "Budget and schedule approved"})

        # Sample Work Order 2 (Unlinked Standalone Draft)
        create_entity(
            db=db,
            entity_type="workorder",
            actor_id="admin@compassx.io",
            custom_fields={
                "title": "HVAC Filter Replacement & Sensor Calibration",
                "description": "Quarterly preventative maintenance for Control Room air conditioning",
                "priority": "Medium",
                "estimated_cost": 1200,
                "assigned_to": "Maintenance Crew A",
                "linked_permit_id": None,
            },
            payload={"comment": "Scheduled quarterly maintenance routine"}
        )
