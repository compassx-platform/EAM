from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
import re
from datetime import datetime, timezone

from backend.database import Base
from backend.models.workflow import WorkflowDefinition, GateInstance
from backend.models.conditions import ConditionDefinition, ConditionVersion
from backend.models.workflow_role import WorkflowRole
from backend.models.entity_type import EntityTypeDefinition
from backend.models.field_registry import EntityField
from backend.models.forms import EntityForm
from backend.models.base import generate_uuid, utc_now
from backend.services.workflow_validator import validate_workflow_definition, WorkflowValidationError

BUNDLE_SCHEMA_VERSION = "compassx-workflow-bundle/v1"

# Built-in enterprise best-practice workflow templates
BUILTIN_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "template_corrective_workorder": {
        "manifest": {
            "template_id": "template_corrective_workorder",
            "schema_version": BUNDLE_SCHEMA_VERSION,
            "name": "Corrective Work Order with Approvals & QA Subprocess",
            "description": "Standard EAM corrective maintenance process with safety assessment, router node for cost thresholds, supervisor sign-off, and child QA inspection subprocess.",
            "category": "Maintenance & Asset Management",
            "complexity": "Advanced",
            "entity_type": "workorder",
            "version_label": "v1.0",
            "author": "CompassX Solution Engineering",
            "icon": "Wrench",
            "tags": ["EAM", "Maintenance", "Router", "Subprocess", "Approval"],
        },
        "workflow": {
            "states": ["Draft", "Submitted", "Cost_Router", "Supervisor_Approval", "Manager_Approval", "In_Progress", "QA_Subprocess", "Completed", "Closed", "Cancelled"],
            "entry_state": "Draft",
            "terminal_states": ["Closed", "Cancelled"],
            "auto_transitions": [
                {
                    "from": "Cost_Router",
                    "event": "TRUE",
                    "when": ["cond_wo_high_cost"]
                },
                {
                    "from": "Cost_Router",
                    "event": "FALSE",
                    "when": []
                }
            ],
            "transitions": [
                {
                    "from": "Draft",
                    "to": "Submitted",
                    "event": "SUBMIT",
                    "conditions": []
                },
                {
                    "from": "Submitted",
                    "to": "Cost_Router",
                    "event": "EVALUATE_COST",
                    "conditions": []
                },
                {
                    "from": "Cost_Router",
                    "to": "Manager_Approval",
                    "event": "TRUE",
                    "conditions": ["cond_wo_high_cost"]
                },
                {
                    "from": "Cost_Router",
                    "to": "Supervisor_Approval",
                    "event": "FALSE",
                    "conditions": []
                },
                {
                    "from": "Supervisor_Approval",
                    "to": "In_Progress",
                    "event": "APPROVE",
                    "conditions": []
                },
                {
                    "from": "Supervisor_Approval",
                    "to": "Cancelled",
                    "event": "REJECT",
                    "conditions": []
                },
                {
                    "from": "Manager_Approval",
                    "to": "In_Progress",
                    "event": "APPROVE_EXECUTIVE",
                    "conditions": []
                },
                {
                    "from": "Manager_Approval",
                    "to": "Cancelled",
                    "event": "REJECT_EXECUTIVE",
                    "conditions": []
                },
                {
                    "from": "In_Progress",
                    "to": "QA_Subprocess",
                    "event": "REQUEST_QA",
                    "conditions": []
                },
                {
                    "from": "QA_Subprocess",
                    "to": "Completed",
                    "event": "QA_PASSED",
                    "conditions": []
                },
                {
                    "from": "Completed",
                    "to": "Closed",
                    "event": "CLOSE",
                    "conditions": []
                },
                {
                    "from": "Draft",
                    "to": "Cancelled",
                    "event": "CANCEL",
                    "conditions": []
                }
            ],
            "nodes": [
                {"name": "Draft", "kind": "start", "label": "Draft", "position": {"x": 80, "y": 200}},
                {"name": "Submitted", "kind": "state", "label": "Submitted", "position": {"x": 280, "y": 200}},
                {"name": "Cost_Router", "kind": "router", "label": "Cost Threshold Router", "condition_id": "cond_wo_high_cost", "conditions": ["cond_wo_high_cost"], "position": {"x": 480, "y": 200}},
                {"name": "Manager_Approval", "kind": "task", "label": "Manager Review (>$5K)", "task_role": "ROLE_MAINT_MANAGER", "position": {"x": 720, "y": 80}},
                {"name": "Supervisor_Approval", "kind": "task", "label": "Supervisor Review", "task_role": "ROLE_SUPERVISOR", "position": {"x": 720, "y": 300}},
                {"name": "In_Progress", "kind": "state", "label": "In Progress Execution", "position": {"x": 960, "y": 200}},
                {"name": "QA_Subprocess", "kind": "subprocess", "label": "QA Audit Subprocess", "subprocess_child_entity": "permit", "subprocess_resume_event": "QA_PASSED", "position": {"x": 1200, "y": 200}},
                {"name": "Completed", "kind": "state", "label": "Work Completed", "position": {"x": 1420, "y": 200}},
                {"name": "Closed", "kind": "stop", "label": "Closed", "position": {"x": 1640, "y": 200}},
                {"name": "Cancelled", "kind": "stop", "label": "Cancelled", "position": {"x": 720, "y": 450}}
            ]
        },
        "conditions": [
            {
                "id": "cond_wo_high_cost",
                "label": "High Cost Threshold (> $5,000)",
                "description": "True when total estimated or actual work order cost exceeds $5,000 requiring manager level approval.",
                "type": "structured",
                "failure_policy": "block",
                "definition": {
                    "logic": "AND",
                    "rules": [
                        {"type": "attribute", "field": "total_cost", "operator": "gt", "value": 5000}
                    ]
                }
            }
        ],
        "roles": [
            {
                "id": "ROLE_SUPERVISOR",
                "name": "Maintenance Supervisor",
                "description": "First-line supervisor responsible for maintenance crew dispatch and standard approvals.",
                "role_type": "PERSON_GROUP",
                "group_name": "MAINT_SUPERVISORS",
                "resolution_strategy": "broadcast"
            },
            {
                "id": "ROLE_MAINT_MANAGER",
                "name": "Maintenance Manager",
                "description": "Department head responsible for high-budget approvals and operational escalations.",
                "role_type": "PERSON_GROUP",
                "group_name": "MAINT_MANAGEMENT",
                "resolution_strategy": "broadcast"
            }
        ]
    },
    "template_permit_to_work": {
        "manifest": {
            "template_id": "template_permit_to_work",
            "schema_version": BUNDLE_SCHEMA_VERSION,
            "name": "Permit to Work (PTW) with Safety Gate & Isolation",
            "description": "Hazardous work authorization lifecycle with Job Safety Analysis (JSA), Safety Officer authorization, lock-out/tag-out isolation, and live expiry tracking.",
            "category": "Environmental Health & Safety",
            "complexity": "Intermediate",
            "entity_type": "permit",
            "version_label": "v1.0",
            "author": "CompassX EHS Center of Excellence",
            "icon": "ShieldAlert",
            "tags": ["EHS", "Safety", "Permit", "JSA", "Hot Work"],
        },
        "workflow": {
            "states": ["Requested", "Risk_Assessment", "Safety_Gate", "Active_Permit", "Suspended", "Completed", "Expired", "Rejected"],
            "entry_state": "Requested",
            "terminal_states": ["Completed", "Expired", "Rejected"],
            "auto_transitions": [
                {
                    "from": "Safety_Gate",
                    "event": "TRUE",
                    "when": ["cond_ptw_high_hazard"]
                },
                {
                    "from": "Safety_Gate",
                    "event": "FALSE",
                    "when": []
                }
            ],
            "transitions": [
                {
                    "from": "Requested",
                    "to": "Risk_Assessment",
                    "event": "PERFORM_JSA",
                    "conditions": []
                },
                {
                    "from": "Risk_Assessment",
                    "to": "Safety_Gate",
                    "event": "SUBMIT_FOR_GATE",
                    "conditions": []
                },
                {
                    "from": "Safety_Gate",
                    "to": "Active_Permit",
                    "event": "FALSE",
                    "conditions": []
                },
                {
                    "from": "Safety_Gate",
                    "to": "Active_Permit",
                    "event": "TRUE",
                    "conditions": ["cond_ptw_high_hazard"]
                },
                {
                    "from": "Active_Permit",
                    "to": "Suspended",
                    "event": "SUSPEND",
                    "conditions": []
                },
                {
                    "from": "Suspended",
                    "to": "Active_Permit",
                    "event": "RESUME",
                    "conditions": []
                },
                {
                    "from": "Active_Permit",
                    "to": "Completed",
                    "event": "HANDBACK",
                    "conditions": []
                },
                {
                    "from": "Active_Permit",
                    "to": "Expired",
                    "event": "EXPIRE",
                    "conditions": []
                },
                {
                    "from": "Suspended",
                    "to": "Expired",
                    "event": "EXPIRE",
                    "conditions": []
                },
                {
                    "from": "Expired",
                    "to": "Risk_Assessment",
                    "event": "REVALIDATE",
                    "conditions": []
                },
                {
                    "from": "Expired",
                    "to": "Completed",
                    "event": "CLOSE",
                    "conditions": []
                },
                {
                    "from": "Requested",
                    "to": "Rejected",
                    "event": "REJECT",
                    "conditions": []
                }
            ],
            "nodes": [
                {"name": "Requested", "kind": "start", "label": "Permit Requested", "position": {"x": 80, "y": 200}},
                {"name": "Risk_Assessment", "kind": "state", "label": "JSA Risk Assessment", "position": {"x": 300, "y": 200}},
                {"name": "Safety_Gate", "kind": "router", "label": "High Hazard Evaluation", "condition_id": "cond_ptw_high_hazard", "conditions": ["cond_ptw_high_hazard"], "position": {"x": 540, "y": 200}},
                {"name": "Active_Permit", "kind": "state", "label": "Active Permit Live", "position": {"x": 800, "y": 200}},
                {"name": "Suspended", "kind": "state", "label": "Suspended (Hazards)", "position": {"x": 800, "y": 380}},
                {"name": "Completed", "kind": "stop", "label": "Handback Completed", "position": {"x": 1060, "y": 140}},
                {"name": "Expired", "kind": "state", "label": "Permit Expired", "position": {"x": 1060, "y": 260}},
                {"name": "Rejected", "kind": "stop", "label": "Rejected", "position": {"x": 300, "y": 380}}
            ]
        },
        "conditions": [
            {
                "id": "cond_ptw_high_hazard",
                "label": "High Hazard Work (Hot Work / Confined Space)",
                "description": "True when permit type is Hot Work or Confined Space Entry requiring mandatory Safety Officer sign-off.",
                "type": "structured",
                "failure_policy": "block",
                "definition": {
                    "logic": "OR",
                    "rules": [
                        {"type": "attribute", "field": "permit_type", "operator": "eq", "value": "Hot Work"},
                        {"type": "attribute", "field": "permit_type", "operator": "eq", "value": "Confined Space"}
                    ]
                }
            }
        ],
        "roles": [
            {
                "id": "ROLE_SAFETY_OFFICER",
                "name": "Site Safety Officer",
                "description": "Certified EHS safety officer responsible for atmospheric testing and permit validation.",
                "role_type": "PERSON_GROUP",
                "group_name": "EHS_SAFETY_OFFICERS",
                "resolution_strategy": "broadcast"
            }
        ]
    },
    "template_capex_procurement": {
        "manifest": {
            "template_id": "template_capex_procurement",
            "schema_version": BUNDLE_SCHEMA_VERSION,
            "name": "CapEx Asset Purchase & Multi-Tier Delegation of Authority",
            "description": "Capital expenditure procurement approval process with department head verification, financial controller check, executive board signoff, and PO generation.",
            "category": "Procurement & Finance",
            "complexity": "Advanced",
            "entity_type": "purchase_request",
            "version_label": "v1.0",
            "author": "CompassX Finance & Supply Chain",
            "icon": "DollarSign",
            "tags": ["Finance", "CapEx", "Procurement", "DOA", "Purchase Order"],
        },
        "workflow": {
            "states": ["Draft", "Dept_Review", "CapEx_Router", "Controller_Review", "Board_Approval", "PO_Issued", "Fulfilled", "Rejected"],
            "entry_state": "Draft",
            "terminal_states": ["Fulfilled", "Rejected"],
            "auto_transitions": [
                {
                    "from": "CapEx_Router",
                    "event": "TRUE",
                    "when": ["cond_capex_high_value"]
                },
                {
                    "from": "CapEx_Router",
                    "event": "FALSE",
                    "when": []
                }
            ],
            "transitions": [
                {
                    "from": "Draft",
                    "to": "Dept_Review",
                    "event": "SUBMIT_REQUEST",
                    "conditions": []
                },
                {
                    "from": "Dept_Review",
                    "to": "CapEx_Router",
                    "event": "DEPT_APPROVE",
                    "conditions": []
                },
                {
                    "from": "CapEx_Router",
                    "to": "Board_Approval",
                    "event": "TRUE",
                    "conditions": ["cond_capex_high_value"]
                },
                {
                    "from": "CapEx_Router",
                    "to": "Controller_Review",
                    "event": "FALSE",
                    "conditions": []
                },
                {
                    "from": "Controller_Review",
                    "to": "PO_Issued",
                    "event": "APPROVE_FINANCE",
                    "conditions": []
                },
                {
                    "from": "Board_Approval",
                    "to": "PO_Issued",
                    "event": "APPROVE_BOARD",
                    "conditions": []
                },
                {
                    "from": "PO_Issued",
                    "to": "Fulfilled",
                    "event": "RECEIVE_GOODS",
                    "conditions": []
                },
                {
                    "from": "Dept_Review",
                    "to": "Rejected",
                    "event": "REJECT",
                    "conditions": []
                },
                {
                    "from": "Controller_Review",
                    "to": "Rejected",
                    "event": "REJECT",
                    "conditions": []
                },
                {
                    "from": "Board_Approval",
                    "to": "Rejected",
                    "event": "REJECT",
                    "conditions": []
                }
            ],
            "nodes": [
                {"name": "Draft", "kind": "start", "label": "Draft Request", "position": {"x": 80, "y": 200}},
                {"name": "Dept_Review", "kind": "task", "label": "Dept Head Review", "task_role": "ROLE_DEPT_HEAD", "position": {"x": 280, "y": 200}},
                {"name": "CapEx_Router", "kind": "router", "label": "Value Router (>$25K)", "condition_id": "cond_capex_high_value", "conditions": ["cond_capex_high_value"], "position": {"x": 500, "y": 200}},
                {"name": "Board_Approval", "kind": "task", "label": "Executive Board Approval", "task_role": "ROLE_EXECUTIVE_BOARD", "position": {"x": 740, "y": 100}},
                {"name": "Controller_Review", "kind": "task", "label": "Financial Controller", "task_role": "ROLE_FINANCE_DIRECTOR", "position": {"x": 740, "y": 300}},
                {"name": "PO_Issued", "kind": "state", "label": "PO Issued to Vendor", "position": {"x": 1000, "y": 200}},
                {"name": "Fulfilled", "kind": "stop", "label": "Asset Received / Fulfilled", "position": {"x": 1240, "y": 200}},
                {"name": "Rejected", "kind": "stop", "label": "Request Rejected", "position": {"x": 500, "y": 420}}
            ]
        },
        "conditions": [
            {
                "id": "cond_capex_high_value",
                "label": "CapEx High Value (> $25,000)",
                "description": "True when total expenditure exceeds $25,000 requiring Board of Directors approval.",
                "type": "structured",
                "failure_policy": "block",
                "definition": {
                    "logic": "AND",
                    "rules": [
                        {"type": "attribute", "field": "estimated_cost", "operator": "gt", "value": 25000}
                    ]
                }
            }
        ],
        "roles": [
            {
                "id": "ROLE_DEPT_HEAD",
                "name": "Department Head",
                "description": "Business unit manager responsible for requisition authorization.",
                "role_type": "PERSON_GROUP",
                "group_name": "DEPT_HEADS",
                "resolution_strategy": "broadcast"
            },
            {
                "id": "ROLE_FINANCE_DIRECTOR",
                "name": "Financial Controller",
                "description": "Corporate finance controller for budget and GL allocation validation.",
                "role_type": "PERSON_GROUP",
                "group_name": "FINANCE_MANAGEMENT",
                "resolution_strategy": "broadcast"
            },
            {
                "id": "ROLE_EXECUTIVE_BOARD",
                "name": "Executive Board of Directors",
                "description": "Executive committee authorizing strategic capital expenditures.",
                "role_type": "PERSON_GROUP",
                "group_name": "EXECUTIVE_BOARD",
                "resolution_strategy": "broadcast"
            }
        ]
    },
    "template_incident_capa": {
        "manifest": {
            "template_id": "template_incident_capa",
            "schema_version": BUNDLE_SCHEMA_VERSION,
            "name": "Field Incident Triage & Corrective Action (CAPA)",
            "description": "Safety incident logging, immediate containment triage, severity routing, root-cause investigation, and corrective/preventive action verification.",
            "category": "Quality & Compliance",
            "complexity": "Intermediate",
            "entity_type": "incident",
            "version_label": "v1.0",
            "author": "CompassX Quality & EHS",
            "icon": "AlertTriangle",
            "tags": ["CAPA", "Incident", "EHS", "Quality", "Investigation"],
        },
        "workflow": {
            "states": ["Reported", "Immediate_Triage", "Severity_Router", "Formal_Investigation", "CAPA_Assigned", "Verification", "Closed"],
            "entry_state": "Reported",
            "terminal_states": ["Closed"],
            "auto_transitions": [
                {
                    "from": "Severity_Router",
                    "event": "TRUE",
                    "when": ["cond_critical_severity"]
                },
                {
                    "from": "Severity_Router",
                    "event": "FALSE",
                    "when": []
                }
            ],
            "transitions": [
                {
                    "from": "Reported",
                    "to": "Immediate_Triage",
                    "event": "BEGIN_TRIAGE",
                    "conditions": []
                },
                {
                    "from": "Immediate_Triage",
                    "to": "Severity_Router",
                    "event": "EVALUATE_SEVERITY",
                    "conditions": []
                },
                {
                    "from": "Severity_Router",
                    "to": "Formal_Investigation",
                    "event": "TRUE",
                    "conditions": ["cond_critical_severity"]
                },
                {
                    "from": "Severity_Router",
                    "to": "CAPA_Assigned",
                    "event": "FALSE",
                    "conditions": []
                },
                {
                    "from": "Formal_Investigation",
                    "to": "CAPA_Assigned",
                    "event": "SUBMIT_FINDINGS",
                    "conditions": []
                },
                {
                    "from": "CAPA_Assigned",
                    "to": "Verification",
                    "event": "ACTIONS_COMPLETED",
                    "conditions": []
                },
                {
                    "from": "Verification",
                    "to": "Closed",
                    "event": "VERIFY_EFFECTIVENESS",
                    "conditions": []
                }
            ],
            "nodes": [
                {"name": "Reported", "kind": "start", "label": "Incident Reported", "position": {"x": 80, "y": 200}},
                {"name": "Immediate_Triage", "kind": "state", "label": "Immediate Containment", "position": {"x": 280, "y": 200}},
                {"name": "Severity_Router", "kind": "router", "label": "Critical Severity Router", "condition_id": "cond_critical_severity", "conditions": ["cond_critical_severity"], "position": {"x": 520, "y": 200}},
                {"name": "Formal_Investigation", "kind": "task", "label": "Formal Root Cause Analysis", "task_role": "ROLE_EHS_MANAGER", "position": {"x": 760, "y": 100}},
                {"name": "CAPA_Assigned", "kind": "state", "label": "CAPA Plan Implementation", "position": {"x": 1000, "y": 200}},
                {"name": "Verification", "kind": "state", "label": "Effectiveness Verification", "position": {"x": 1240, "y": 200}},
                {"name": "Closed", "kind": "stop", "label": "Incident Resolved & Closed", "position": {"x": 1480, "y": 200}}
            ]
        },
        "conditions": [
            {
                "id": "cond_critical_severity",
                "label": "Critical / High Severity Incident",
                "description": "True when incident severity is 'Critical' or 'Major' requiring formal Root Cause Analysis.",
                "type": "structured",
                "failure_policy": "block",
                "definition": {
                    "logic": "OR",
                    "rules": [
                        {"type": "attribute", "field": "severity", "operator": "eq", "value": "Critical"},
                        {"type": "attribute", "field": "severity", "operator": "eq", "value": "Major"}
                    ]
                }
            }
        ],
        "roles": [
            {
                "id": "ROLE_EHS_MANAGER",
                "name": "EHS Lead Investigator",
                "description": "Lead EHS professional specializing in incident root cause and CAPA governance.",
                "role_type": "PERSON_GROUP",
                "group_name": "EHS_INVESTIGATORS",
                "resolution_strategy": "broadcast"
            }
        ]
    }
}


def list_workflow_templates() -> List[Dict[str, Any]]:
    """Returns metadata cards for all available built-in templates."""
    results = []
    for tid, tdata in BUILTIN_TEMPLATES.items():
        manifest = tdata.get("manifest", {})
        wf = tdata.get("workflow", {})
        states = wf.get("states", [])
        transitions = wf.get("transitions", [])
        conds = tdata.get("conditions", [])
        roles = tdata.get("roles", [])
        results.append({
            **manifest,
            "state_count": len(states),
            "transition_count": len(transitions),
            "condition_count": len(conds),
            "role_count": len(roles),
        })
    return sorted(results, key=lambda x: x.get("name", ""))


def get_workflow_template(template_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves full template bundle by template_id."""
    return BUILTIN_TEMPLATES.get(template_id)


def export_workflow_bundle(db: Session, workflow_id: str) -> Dict[str, Any]:
    """
    Exports a workflow definition as a complete, self-contained portable bundle
    including all referenced conditions, roles, entity fields, and form layouts.
    """
    wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not wf:
        raise ValueError(f"Workflow with ID '{workflow_id}' not found")

    et = (wf.entity_type or "").lower().strip()
    definition = wf.definition or {}
    transitions = definition.get("transitions", []) or []
    nodes = definition.get("nodes", []) or []
    auto_transitions = definition.get("auto_transitions", []) or []

    # 1. Discover all referenced condition IDs
    referenced_condition_ids = set()
    for t in transitions:
        for c in (t.get("conditions") or []):
            if c: referenced_condition_ids.add(str(c).strip())
        for c in (t.get("gates") or []):
            if c: referenced_condition_ids.add(str(c).strip())
        for c in (t.get("when") or []):
            if c: referenced_condition_ids.add(str(c).strip())
        for ch in (t.get("choices") or []):
            if isinstance(ch, dict):
                for c in (ch.get("when") or []):
                    if c: referenced_condition_ids.add(str(c).strip())

    for n in nodes:
        if isinstance(n, dict):
            cid = n.get("condition_id")
            if cid: referenced_condition_ids.add(str(cid).strip())
            for c in (n.get("conditions") or []):
                if c: referenced_condition_ids.add(str(c).strip())

    for at in auto_transitions:
        if isinstance(at, dict):
            for c in (at.get("when") or []):
                if c: referenced_condition_ids.add(str(c).strip())

    # Query matching ConditionDefinitions
    bundled_conditions = []
    if referenced_condition_ids:
        cond_rows = db.query(ConditionDefinition).filter(
            ConditionDefinition.id.in_(list(referenced_condition_ids))
        ).all()
        bundled_conditions = [c.to_dict() for c in cond_rows]
    else:
        # Also include any conditions authored explicitly for this entity_type
        cond_rows = db.query(ConditionDefinition).filter(
            ConditionDefinition.entity_type == et
        ).all()
        bundled_conditions = [c.to_dict() for c in cond_rows]

    # 2. Discover all referenced roles
    referenced_role_ids = set()
    for n in nodes:
        if isinstance(n, dict):
            rid = n.get("task_role") or n.get("assigned_role")
            if rid: referenced_role_ids.add(str(rid).strip())

    bundled_roles = []
    if referenced_role_ids:
        role_rows = db.query(WorkflowRole).filter(
            WorkflowRole.id.in_(list(referenced_role_ids))
        ).all()
        bundled_roles = [r.to_dict() for r in role_rows]

    # 3. Bundled Entity Fields
    field_rows = db.query(EntityField).filter(EntityField.entity_type == et).all()
    bundled_fields = [f.to_dict() for f in field_rows]

    # 4. Bundled Form Layout
    form_row = db.query(EntityForm).filter(EntityForm.entity_type == et).first()
    bundled_form = form_row.to_dict() if form_row else None

    # 5. Bundled Gates
    gate_rows = db.query(GateInstance).filter(GateInstance.entity_type == et).all()
    bundled_gates = [g.to_dict() for g in gate_rows]

    # Construct Manifest
    entity_def = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == et).first()
    display_title = entity_def.display_name if entity_def else et.replace('_', ' ').title()

    bundle: Dict[str, Any] = {
        "manifest": {
            "schema_version": BUNDLE_SCHEMA_VERSION,
            "exported_at": utc_now().isoformat(),
            "name": f"{display_title} Workflow Process",
            "description": f"Exported workflow definition package for '{et}' ({wf.version_label})",
            "entity_type": et,
            "version_label": wf.version_label,
            "author": wf.created_by or "admin@compassx.io",
            "status": wf.status,
            "state_count": len(definition.get("states", [])),
            "transition_count": len(transitions),
            "condition_count": len(bundled_conditions),
            "role_count": len(bundled_roles),
        },
        "workflow": definition,
        "conditions": bundled_conditions,
        "roles": bundled_roles,
        "entity_fields": bundled_fields,
        "form_layout": bundled_form,
        "gates": bundled_gates,
    }

    return bundle


def import_workflow_bundle(
    db: Session,
    bundle: Dict[str, Any],
    target_entity_type: Optional[str] = None,
    conflict_strategy: str = "new_draft",  # 'new_draft' | 'overwrite_draft' | 'create_entity'
    import_conditions: bool = True,
    import_roles: bool = True,
    import_fields_and_forms: bool = True,
    activate_immediately: bool = False,
    created_by: str = "admin@compassx.io",
) -> Dict[str, Any]:
    """
    Imports a workflow bundle package into the system:
      1. Validates bundle structure and manifest
      2. Resolves target entity type (creates entity definition if new)
      3. Upserts conditions and roles if requested
      4. Upserts field definitions and form layout if requested
      5. Validates workflow graph topology against rules
      6. Creates/updates workflow definition draft
      7. Optionally activates (publishes) the workflow immediately
    """
    if not isinstance(bundle, dict):
        raise ValueError("Invalid bundle payload: must be a JSON object")

    manifest = bundle.get("manifest", {})
    workflow_data = bundle.get("workflow", {})

    if not workflow_data or not isinstance(workflow_data, dict):
        # Fallback if raw workflow definition was uploaded directly without manifest
        if "states" in bundle and "transitions" in bundle:
            workflow_data = bundle
            manifest = {
                "name": "Imported Workflow",
                "entity_type": target_entity_type or "workorder",
                "version_label": "v1.0"
            }
        else:
            raise ValueError("Bundle does not contain a valid 'workflow' definition object")

    # Determine final entity type
    raw_entity_type = target_entity_type or manifest.get("entity_type") or "custom_process"
    entity_type = raw_entity_type.lower().strip()

    # Ensure EntityTypeDefinition exists or register it
    existing_entity = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == entity_type).first()
    if not existing_entity:
        display_name = entity_type.replace('_', ' ').title()
        new_entity = EntityTypeDefinition(
            name=entity_type,
            display_name=display_name,
            description=f"Auto-created from workflow package import: {manifest.get('name', display_name)}",
            icon=manifest.get("icon") or "Layers",
            is_system=False,
            version_number=1,
            version_label="v1",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        db.add(new_entity)
        db.commit()

    imported_conditions_count = 0
    imported_roles_count = 0
    imported_fields_count = 0
    imported_form_updated = False

    # 1. Import Conditions
    if import_conditions and bundle.get("conditions"):
        for c in bundle["conditions"]:
            cid = c.get("id")
            if not cid:
                continue
            cond_row = db.query(ConditionDefinition).filter(ConditionDefinition.id == cid).first()
            if not cond_row:
                cond_row = ConditionDefinition(
                    id=cid,
                    entity_type=entity_type,
                    label=c.get("label") or cid,
                    description=c.get("description"),
                    type=c.get("type", "structured"),
                    definition=c.get("definition", {}),
                    current_version=1,
                    failure_policy=c.get("failure_policy", "block"),
                    created_by=created_by,
                    created_at=utc_now(),
                    updated_at=utc_now(),
                )
                db.add(cond_row)
                db.flush()
                # Create snapshot version
                snap = ConditionVersion(
                    id=generate_uuid(),
                    condition_id=cid,
                    version=1,
                    label=c.get("label") or cid,
                    definition=c.get("definition", {}),
                    failure_policy=c.get("failure_policy", "block"),
                    created_by=created_by,
                    created_at=utc_now(),
                )
                db.add(snap)
                imported_conditions_count += 1
            else:
                # Update condition definition live AST
                cond_row.label = c.get("label") or cond_row.label
                cond_row.description = c.get("description") or cond_row.description
                cond_row.definition = c.get("definition") or cond_row.definition
                cond_row.current_version = (cond_row.current_version or 1) + 1
                cond_row.updated_at = utc_now()
                # Snapshot
                snap = ConditionVersion(
                    id=generate_uuid(),
                    condition_id=cid,
                    version=cond_row.current_version,
                    label=cond_row.label,
                    definition=cond_row.definition,
                    failure_policy=cond_row.failure_policy,
                    created_by=created_by,
                    created_at=utc_now(),
                )
                db.add(snap)
                imported_conditions_count += 1

    # 2. Import Roles
    if import_roles and bundle.get("roles"):
        for r in bundle["roles"]:
            rid = r.get("id")
            if not rid:
                continue
            role_row = db.query(WorkflowRole).filter(WorkflowRole.id == rid).first()
            if not role_row:
                role_row = WorkflowRole(
                    id=rid,
                    name=r.get("name") or rid,
                    description=r.get("description"),
                    role_type=r.get("role_type", "PERSON_GROUP"),
                    person_id=r.get("person_id"),
                    group_name=r.get("group_name"),
                    field_name=r.get("field_name"),
                    email_address=r.get("email_address"),
                    resolution_strategy=r.get("resolution_strategy", "broadcast"),
                    created_at=utc_now(),
                    updated_at=utc_now(),
                )
                db.add(role_row)
                imported_roles_count += 1

    # 3. Import Fields & Forms
    if import_fields_and_forms:
        if bundle.get("entity_fields"):
            for f in bundle["entity_fields"]:
                fname = f.get("field_name")
                if not fname:
                    continue
                f_row = db.query(EntityField).filter(
                    EntityField.entity_type == entity_type,
                    EntityField.field_name == fname
                ).first()
                if not f_row:
                    f_row = EntityField(
                        entity_type=entity_type,
                        field_name=fname,
                        field_type=f.get("field_type", "text"),
                        label=f.get("label") or fname.replace('_', ' ').title(),
                        required=bool(f.get("required", False)),
                        select_options=f.get("select_options"),
                        option_list_key=f.get("option_list_key"),
                        reference_entity_type=f.get("reference_entity_type"),
                        created_at=utc_now(),
                    )
                    db.add(f_row)
                    imported_fields_count += 1

        if bundle.get("form_layout"):
            fl = bundle["form_layout"]
            form_row = db.query(EntityForm).filter(EntityForm.entity_type == entity_type).first()
            if not form_row:
                form_row = EntityForm(
                    entity_type=entity_type,
                    version_number=1,
                    version_label="v1",
                    layout=fl.get("layout", []),
                    sections=fl.get("sections", []),
                    cols=fl.get("cols", 12),
                    row_height=fl.get("row_height", 40),
                    updated_at=utc_now(),
                )
                db.add(form_row)
                imported_form_updated = True
            else:
                form_row.layout = fl.get("layout", form_row.layout)
                form_row.sections = fl.get("sections", form_row.sections)
                form_row.updated_at = utc_now()
                imported_form_updated = True

    db.commit()

    # 4. Validate graph definition topology
    errors, warnings = validate_workflow_definition(db, entity_type, workflow_data)
    if errors:
        raise WorkflowValidationError(errors=errors, warnings=warnings)

    # 5. Resolve workflow versioning & save workflow draft
    from backend.routers.workflows import _next_workflow_version

    target_wf: Optional[WorkflowDefinition] = None
    if conflict_strategy == "overwrite_draft":
        # Look for existing draft
        target_wf = db.query(WorkflowDefinition).filter(
            WorkflowDefinition.entity_type == entity_type,
            WorkflowDefinition.status == "draft"
        ).first()

    if target_wf:
        target_wf.definition = workflow_data
        target_wf.created_by = created_by
    else:
        new_v_label = _next_workflow_version(db, entity_type)
        target_wf = WorkflowDefinition(
            id=generate_uuid(),
            entity_type=entity_type,
            version_label=new_v_label,
            status="draft",
            definition=workflow_data,
            created_by=created_by,
            created_at=utc_now(),
        )
        db.add(target_wf)

    db.commit()
    db.refresh(target_wf)

    # 6. Immediate activation if requested
    if activate_immediately:
        prior_published = db.query(WorkflowDefinition).filter(
            WorkflowDefinition.entity_type == entity_type,
            WorkflowDefinition.status == "published",
            WorkflowDefinition.id != target_wf.id
        ).all()
        for p in prior_published:
            p.status = "deprecated"

        target_wf.status = "published"
        target_wf.published_at = utc_now()
        db.commit()
        db.refresh(target_wf)

    return {
        "success": True,
        "workflow": target_wf.to_dict(),
        "summary": {
            "entity_type": entity_type,
            "version_label": target_wf.version_label,
            "status": target_wf.status,
            "states_count": len(workflow_data.get("states", [])),
            "transitions_count": len(workflow_data.get("transitions", [])),
            "conditions_imported": imported_conditions_count,
            "roles_imported": imported_roles_count,
            "fields_imported": imported_fields_count,
            "form_layout_imported": imported_form_updated,
        },
        "warnings": warnings,
    }
