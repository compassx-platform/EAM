"""
Workflow module MCP tools for CompassX EAM.

Provides tools for authoring, validating, publishing, inspecting, and managing
state-machine workflow definitions with deterministic business-rule gates.
"""

import re
from typing import Dict, Any, Optional, List
from backend.mcp.context import get_db_session, resolve_effective_actor
from backend.models.workflow import WorkflowDefinition
from backend.models.base import generate_uuid, utc_now
from backend.services.workflow_validator import validate_workflow_definition


def _next_workflow_version(db, entity_type: str) -> str:
    all_wfs = db.query(WorkflowDefinition).filter(WorkflowDefinition.entity_type == entity_type.lower()).all()
    max_v = 0
    for w in all_wfs:
        m = re.search(r'v(\d+)', w.version_label or "")
        if m:
            max_v = max(max_v, int(m.group(1)))
        elif w.version_label and w.version_label.isdigit():
            max_v = max(max_v, int(w.version_label))
    return f"v{max_v + 1}"


def workflow_list(
    entity_type: Optional[str] = None,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    """
    List workflow definitions across entity types with optional status filtering.

    Args:
        entity_type: Optional filter by entity type slug (e.g. 'workorder', 'permit')
        status: Optional filter by status ('draft', 'published', 'deprecated')
    """
    with get_db_session() as db:
        query = db.query(WorkflowDefinition)
        if entity_type:
            query = query.filter(WorkflowDefinition.entity_type == entity_type.strip().lower())
        if status:
            query = query.filter(WorkflowDefinition.status == status.strip().lower())

        workflows = query.order_by(WorkflowDefinition.entity_type, WorkflowDefinition.created_at.desc()).all()
        return {
            "success": True,
            "count": len(workflows),
            "workflows": [w.to_dict() for w in workflows],
        }


def workflow_get(workflow_id: str) -> Dict[str, Any]:
    """
    Retrieve complete workflow definition by ID, including states, transitions,
    choices, gates, and auto-transitions.

    Args:
        workflow_id: UUID of the workflow definition
    """
    with get_db_session() as db:
        wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id.strip()).first()
        if not wf:
            return {"success": False, "error": f"Workflow '{workflow_id}' not found"}
        return {"success": True, "workflow": wf.to_dict()}


def workflow_get_active(entity_type: str) -> Dict[str, Any]:
    """
    Get the currently active published workflow definition for an entity type.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder', 'permit')
    """
    with get_db_session() as db:
        wf = (
            db.query(WorkflowDefinition)
            .filter(
                WorkflowDefinition.entity_type == entity_type.strip().lower(),
                WorkflowDefinition.status == "published",
            )
            .order_by(WorkflowDefinition.published_at.desc(), WorkflowDefinition.created_at.desc())
            .first()
        )
        if not wf:
            return {
                "success": False,
                "error": f"No active published workflow found for '{entity_type}'",
            }
        return {"success": True, "workflow": wf.to_dict()}


def workflow_get_history(entity_type: str) -> Dict[str, Any]:
    """
    Get all workflow versions (drafts, published, deprecated) for an entity type.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder', 'permit')
    """
    with get_db_session() as db:
        workflows = (
            db.query(WorkflowDefinition)
            .filter(WorkflowDefinition.entity_type == entity_type.strip().lower())
            .order_by(WorkflowDefinition.created_at.desc())
            .all()
        )
        return {
            "success": True,
            "entity_type": entity_type.strip().lower(),
            "count": len(workflows),
            "history": [w.to_dict() for w in workflows],
        }


def workflow_save_draft(
    entity_type: str,
    definition: Dict[str, Any],
    workflow_id: Optional[str] = None,
    version_label: Optional[str] = None,
    on_behalf_of: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create or update a workflow draft definition.

    If updating an already published workflow, automatically forks into a new draft
    version to preserve immutability of published workflows.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder')
        definition: Workflow definition JSON containing 'states' and 'transitions'
        workflow_id: Optional existing workflow ID to update
        version_label: Optional version label (e.g. 'v2'); auto-incremented if omitted
        on_behalf_of: Optional user identifier saving the draft
    """
    with get_db_session() as db:
        et = entity_type.strip().lower()
        actor_id, _, _ = resolve_effective_actor(db, on_behalf_of=on_behalf_of)

        if workflow_id:
            wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id.strip()).first()
            if not wf:
                return {"success": False, "error": f"Workflow '{workflow_id}' not found"}

            if wf.status == "published":
                # Fork into new draft version
                label = version_label.strip() if version_label else _next_workflow_version(db, et)
                new_wf = WorkflowDefinition(
                    id=generate_uuid(),
                    entity_type=et,
                    version_label=label,
                    status="draft",
                    definition=definition,
                    created_by=actor_id,
                    created_at=utc_now(),
                )
                db.add(new_wf)
                db.commit()
                db.refresh(new_wf)
                return {
                    "success": True,
                    "forked_from_published": True,
                    "workflow": new_wf.to_dict(),
                }
            else:
                if version_label and version_label.strip():
                    wf.version_label = version_label.strip()
                elif not wf.version_label:
                    wf.version_label = _next_workflow_version(db, et)
                wf.definition = definition
                db.commit()
                db.refresh(wf)
                return {"success": True, "forked_from_published": False, "workflow": wf.to_dict()}
        else:
            label = version_label.strip() if version_label else _next_workflow_version(db, et)
            wf = WorkflowDefinition(
                id=generate_uuid(),
                entity_type=et,
                version_label=label,
                status="draft",
                definition=definition,
                created_by=actor_id,
                created_at=utc_now(),
            )
            db.add(wf)
            db.commit()
            db.refresh(wf)
            return {"success": True, "created": True, "workflow": wf.to_dict()}


def workflow_validate(workflow_id: str) -> Dict[str, Any]:
    """
    Validate a workflow against graph integrity rules (Section 6):
    - Unreachable states
    - Dead-end states
    - Ambiguous transitions
    - Existence of referenced conditions/gates

    Args:
        workflow_id: UUID of the workflow definition to validate
    """
    with get_db_session() as db:
        wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id.strip()).first()
        if not wf:
            return {"success": False, "error": f"Workflow '{workflow_id}' not found"}

        errors, warnings = validate_workflow_definition(db, wf.entity_type, wf.definition or {})
        return {
            "success": True,
            "workflow_id": wf.id,
            "version_label": wf.version_label,
            "status": wf.status,
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
        }


def workflow_publish(workflow_id: str) -> Dict[str, Any]:
    """
    Validate and publish a draft workflow definition.

    Runs graph integrity validation first. If validation passes, updates status to
    'published' and automatically deprecates any previously published workflows
    for that entity type.

    Args:
        workflow_id: UUID of the draft workflow to publish
    """
    with get_db_session() as db:
        wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id.strip()).first()
        if not wf:
            return {"success": False, "error": f"Workflow '{workflow_id}' not found"}

        errors, warnings = validate_workflow_definition(db, wf.entity_type, wf.definition or {})
        if errors:
            return {
                "success": False,
                "error": "Cannot publish invalid workflow draft",
                "errors": errors,
                "warnings": warnings,
            }

        # Deprecate prior published workflows for this entity type
        prior_published = (
            db.query(WorkflowDefinition)
            .filter(
                WorkflowDefinition.entity_type == wf.entity_type,
                WorkflowDefinition.status == "published",
                WorkflowDefinition.id != wf.id,
            )
            .all()
        )
        for p in prior_published:
            p.status = "deprecated"

        wf.status = "published"
        wf.published_at = utc_now()
        db.commit()
        db.refresh(wf)

        return {
            "success": True,
            "published": True,
            "workflow": wf.to_dict(),
            "warnings": warnings,
        }


def workflow_deprecate(workflow_id: str) -> Dict[str, Any]:
    """
    Deprecate a published workflow definition.

    Args:
        workflow_id: UUID of the workflow definition to deprecate
    """
    with get_db_session() as db:
        wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id.strip()).first()
        if not wf:
            return {"success": False, "error": f"Workflow '{workflow_id}' not found"}

        wf.status = "deprecated"
        db.commit()
        db.refresh(wf)
        return {"success": True, "workflow": wf.to_dict()}


def workflow_delete(workflow_id: str) -> Dict[str, Any]:
    """
    Delete a workflow definition.

    Args:
        workflow_id: UUID of the workflow definition to delete
    """
    with get_db_session() as db:
        wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id.strip()).first()
        if not wf:
            return {"success": False, "error": f"Workflow '{workflow_id}' not found"}

        db.delete(wf)
        db.commit()
        return {"success": True, "deleted_id": workflow_id}
