"""
Condition module MCP tools for CompassX EAM.

Provides tools for creating, inspecting, versioning, evaluating, and tracking impact
of reusable deterministic business-rule conditions (closed condition gates: role checks,
field comparisons, numeric thresholds, date checks, related entity checks, arithmetic
expressions, and person group membership).
"""

from typing import Dict, Any, Optional, List
from backend.mcp_server.context import get_db_session, resolve_effective_actor
from backend.models.conditions import ConditionDefinition, ConditionVersion
from backend.models.workflow import WorkflowDefinition
from backend.models.forms import EntityForm
from backend.models.base import generate_uuid, utc_now
from backend.services.condition_evaluator import evaluate_condition, evaluate_rule_tree

ATOM_TYPES_CATALOG = [
    {
        "type": "attribute",
        "name": "Field comparison",
        "description": "Compare an entity field against a value (equality, ordering, membership, substring, emptiness).",
    },
    {
        "type": "role",
        "name": "Role check",
        "description": "Requires the actor to hold a specific role (e.g. Safety Officer, Supervisor).",
    },
    {
        "type": "field_not_empty",
        "name": "Field is filled",
        "description": "Verifies a field is present and non-empty.",
    },
    {
        "type": "date",
        "name": "Date comparison",
        "description": "Compares a date field against another date or 'now'.",
    },
    {
        "type": "related",
        "name": "Related entity check",
        "description": "Follows an entity_reference field to a target entity and checks its status or a field.",
    },
    {
        "type": "expression",
        "name": "Arithmetic expression",
        "description": "Evaluates a whitelisted arithmetic expression over fields and compares the result.",
    },
    {
        "type": "person_group",
        "name": "Person Group member",
        "description": "Checks if the person in a relationship field is an active member of a specified Person Group.",
    },
]

OPERATORS_CATALOG = {
    "string": ["eq", "ne", "in", "not_in", "contains", "starts_with", "ends_with", "is_empty", "is_not_empty"],
    "number": ["eq", "ne", "lt", "le", "gt", "ge", "is_empty", "is_not_empty"],
    "boolean": ["eq", "ne", "is_empty", "is_not_empty"],
    "date": ["lt", "le", "gt", "ge", "eq"],
    "select": ["eq", "ne", "in", "not_in", "is_empty", "is_not_empty"],
}


def condition_types_list() -> Dict[str, Any]:
    """
    Returns the closed catalog of atom/gate types and operators for condition rule authoring.
    """
    return {
        "success": True,
        "atoms": ATOM_TYPES_CATALOG,
        "operators": OPERATORS_CATALOG,
    }


def condition_list(entity_type: Optional[str] = None) -> Dict[str, Any]:
    """
    List reusable condition definitions (optionally filtered by entity type).

    Args:
        entity_type: Optional entity type slug (e.g. 'workorder', 'permit')
    """
    with get_db_session() as db:
        query = db.query(ConditionDefinition)
        if entity_type:
            query = query.filter(ConditionDefinition.entity_type == entity_type.strip().lower())
        conditions = query.order_by(ConditionDefinition.entity_type, ConditionDefinition.label).all()
        return {
            "success": True,
            "count": len(conditions),
            "conditions": [c.to_dict() for c in conditions],
        }


def condition_get(condition_id: str) -> Dict[str, Any]:
    """
    Retrieve condition definition details by ID.

    Args:
        condition_id: Unique condition ID
    """
    with get_db_session() as db:
        cond = db.query(ConditionDefinition).filter(ConditionDefinition.id == condition_id.strip()).first()
        if not cond:
            return {"success": False, "error": f"Condition '{condition_id}' not found"}
        return {"success": True, "condition": cond.to_dict()}


def condition_save(
    entity_type: str,
    label: str,
    definition: Dict[str, Any],
    condition_id: Optional[str] = None,
    description: Optional[str] = None,
    type: str = "structured",
    failure_policy: str = "block",
    on_behalf_of: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create or update a reusable condition definition with automatic version history.

    Consumers (workflows, form visibility) read live conditions by ID. Each modification
    automatically saves an immutable ConditionVersion snapshot.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder')
        label: Descriptive label (e.g. 'Safety Officer Approval Required')
        definition: Rule tree AST {'logic': 'AND'|'OR', 'rules': [...]} or script expression
        condition_id: Unique identifier (e.g. 'cond_safety_check'). Auto-generated if omitted
        description: Explanatory note
        type: 'structured' (rule tree AST) or 'script'
        failure_policy: 'block' (fail-closed, blocks transition) or 'allow' (fail-open advisory)
        on_behalf_of: User authoring the condition
    """
    with get_db_session() as db:
        et = entity_type.strip().lower()
        actor_id, _, _ = resolve_effective_actor(db, on_behalf_of=on_behalf_of)
        cid = condition_id.strip() if condition_id else f"cond_{et}_{generate_uuid()[:6]}"

        if type == "script":
            norm_def = {"expression": definition.get("expression", "")}
        else:
            if not isinstance(definition, dict) or not isinstance(definition.get("rules"), list):
                return {"success": False, "error": "Structured definition must be {'logic': 'AND'|'OR', 'rules': [...]}"}
            norm_def = definition

        existing = db.query(ConditionDefinition).filter(ConditionDefinition.id == cid).first()
        if existing:
            has_changed = (
                existing.label != label
                or (existing.description or "").strip() != (description or "").strip()
                or existing.definition != norm_def
                or existing.failure_policy != failure_policy
                or existing.type != type
            )
            if has_changed:
                existing.label = label
                existing.description = description
                existing.type = type
                existing.definition = norm_def
                existing.failure_policy = failure_policy
                existing.updated_at = utc_now()
                new_version = (existing.current_version or 1) + 1
                existing.current_version = new_version

                version = ConditionVersion(
                    condition_id=existing.id,
                    version=new_version,
                    label=label,
                    definition=norm_def,
                    failure_policy=failure_policy,
                    created_by=actor_id,
                )
                db.add(version)
                db.commit()
                db.refresh(existing)
            return {"success": True, "created": False, "condition": existing.to_dict()}
        else:
            cond = ConditionDefinition(
                id=cid,
                entity_type=et,
                label=label,
                description=description,
                type=type,
                definition=norm_def,
                current_version=1,
                failure_policy=failure_policy,
                created_by=actor_id,
            )
            db.add(cond)
            version = ConditionVersion(
                condition_id=cid,
                version=1,
                label=label,
                definition=norm_def,
                failure_policy=failure_policy,
                created_by=actor_id,
            )
            db.add(version)
            db.commit()
            db.refresh(cond)
            return {"success": True, "created": True, "condition": cond.to_dict()}


def condition_delete(condition_id: str) -> Dict[str, Any]:
    """
    Delete a condition definition and its version history.

    Args:
        condition_id: Unique condition ID
    """
    with get_db_session() as db:
        cond = db.query(ConditionDefinition).filter(ConditionDefinition.id == condition_id.strip()).first()
        if not cond:
            return {"success": False, "error": f"Condition '{condition_id}' not found"}

        db.query(ConditionVersion).filter(ConditionVersion.condition_id == condition_id.strip()).delete()
        db.delete(cond)
        db.commit()
        return {"success": True, "deleted_id": condition_id}


def condition_versions_list(condition_id: str) -> Dict[str, Any]:
    """
    List historical version snapshots for a condition.

    Args:
        condition_id: Unique condition ID
    """
    with get_db_session() as db:
        cond = db.query(ConditionDefinition).filter(ConditionDefinition.id == condition_id.strip()).first()
        if not cond:
            return {"success": False, "error": f"Condition '{condition_id}' not found"}

        versions = (
            db.query(ConditionVersion)
            .filter(ConditionVersion.condition_id == condition_id.strip())
            .order_by(ConditionVersion.version.desc())
            .all()
        )
        return {
            "success": True,
            "condition_id": condition_id,
            "count": len(versions),
            "versions": [v.to_dict() for v in versions],
        }


def condition_used_by(condition_id: str) -> Dict[str, Any]:
    """
    Perform impact analysis to identify all workflows and form layouts referencing
    this condition.

    Args:
        condition_id: Unique condition ID
    """
    with get_db_session() as db:
        cond = db.query(ConditionDefinition).filter(ConditionDefinition.id == condition_id.strip()).first()
        if not cond:
            return {"success": False, "error": f"Condition '{condition_id}' not found"}

        cid = condition_id.strip()
        workflows = []
        for wf in db.query(WorkflowDefinition).all():
            defn = wf.definition or {}
            hits = []
            for i, tr in enumerate(defn.get("transitions", [])):
                refs = list(tr.get("conditions", []) or [])
                refs.extend(list(tr.get("gates", []) or []))
                if cid in refs:
                    hits.append(f"transition[{i}] ({tr.get('event')}, {tr.get('from')}->{tr.get('to')})")
                for j, ch in enumerate(tr.get("choices", []) or []):
                    if cid in (ch.get("when", []) or []):
                        hits.append(f"transition[{i}].choice[{j}]")
            for at in defn.get("auto_transitions", []) or []:
                if cid in (at.get("when", []) or []):
                    hits.append(f"auto_transition ({at.get('event')})")
            if hits:
                workflows.append({
                    "id": wf.id,
                    "version_label": wf.version_label,
                    "status": wf.status,
                    "references": hits,
                })

        forms = []
        for form in db.query(EntityForm).all():
            hits = []
            for row in form.sections or []:
                if (row.get("visibility_condition") or {}).get("condition_id") == cid:
                    hits.append(f"sections.{row.get('id')}")
            for row in (form.layout or []):
                vc = row.get("visibility_condition") or {}
                if vc.get("condition_id") == cid or any((r or {}).get("condition_id") == cid for r in vc.get("rules", []) if isinstance(r, dict)):
                    hits.append(f"layout.{row.get('i')}")
            if hits:
                forms.append({"entity_type": form.entity_type, "references": hits})

        return {
            "success": True,
            "condition_id": cid,
            "referenced": bool(workflows or forms),
            "workflows": workflows,
            "forms": forms,
        }


def condition_evaluate(
    condition_id: str,
    custom_fields: Optional[Dict[str, Any]] = None,
    on_behalf_of: Optional[str] = None,
    actor_type: str = "human",
    actor_roles: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Evaluate condition rules against sample entity payload and actor context.

    Args:
        condition_id: Unique condition ID
        custom_fields: Dictionary of sample entity fields
        on_behalf_of: Actor identity to test against (e.g. role check)
        actor_type: 'human' | 'system'
        actor_roles: Optional explicit roles override
    """
    with get_db_session() as db:
        cond = db.query(ConditionDefinition).filter(ConditionDefinition.id == condition_id.strip()).first()
        if not cond:
            return {"success": False, "error": f"Condition '{condition_id}' not found"}

        actor_id, act_type, roles = resolve_effective_actor(
            db, on_behalf_of=on_behalf_of, actor_type=actor_type, actor_roles=actor_roles
        )

        res = evaluate_condition(
            db=db,
            condition=cond,
            custom_fields=custom_fields or {},
            actor_id=actor_id,
            actor_type=act_type,
            actor_roles=roles,
        )
        return {
            "success": True,
            "condition_id": cond.id,
            "passed": res.passed,
            "failure_policy": cond.failure_policy,
            "blocks_transition": not res.passed and cond.failure_policy == "block",
            "reason": res.reason,
            "evaluation_result": res.model_dump(),
        }
