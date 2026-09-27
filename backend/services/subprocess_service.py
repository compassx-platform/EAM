import logging
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session

from backend.models.base import generate_uuid, utc_now
from backend.models.entities import get_entity_models
from backend.models.workflow import WorkflowDefinition
from backend.services.notification_service import dispatch_notification

logger = logging.getLogger(__name__)

SYSTEM_SUBPROCESS_ACTOR = "system:subprocess-engine"
DEFAULT_TERMINAL_STATES = {"COMPLETED", "APPROVED", "CLOSED", "RESOLVED", "COMPLETE", "CLOSE", "DONE"}


def is_subprocess_node(node: Dict[str, Any]) -> bool:
    """Checks if a workflow node is configured as a Subprocess node."""
    kind = str(node.get("kind", "")).lower()
    return kind in ("subprocess", "sub")


def find_subprocess_node_for_state(definition: Dict[str, Any], state_name: str) -> Optional[Dict[str, Any]]:
    """Looks up a state's node metadata to see if it is a Subprocess."""
    nodes = definition.get("nodes", []) or []
    return next((n for n in nodes if n.get("name") == state_name and is_subprocess_node(n)), None)


def handle_subprocess_state_entry(
    db: Session,
    entity_type: str,
    entity_id: str,
    state_name: str,
    definition: Dict[str, Any],
    custom_fields: Dict[str, Any],
    workflow_version: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Called when an entity transitions into a state.
    If the state is a Subprocess node and auto-creation is enabled,
    spawns the child entity and initiates its workflow.
    """
    node = find_subprocess_node_for_state(definition, state_name)
    if not node:
        return None

    subprocess_id = node.get("subprocess_id") or f"{state_name}_sub"
    target_entity_type = (node.get("subprocess_entity_type") or node.get("target_entity_type") or entity_type).lower()
    autocreate = node.get("autocreate_child", True)

    # Check if a child record is already linked in custom_fields
    existing_child_id = custom_fields.get("subprocess_child_id") or custom_fields.get("_child_entity_id")
    if existing_child_id:
        try:
            ChildModel, _ = get_entity_models(target_entity_type)
            child = db.query(ChildModel).filter(ChildModel.id == str(existing_child_id)).first()
            if child:
                return {
                    "subprocess_id": subprocess_id,
                    "target_entity_type": target_entity_type,
                    "child_id": child.id,
                    "child_status": child.status,
                    "action": "existing_child_found",
                }
        except Exception:
            pass

    if not autocreate:
        return {
            "subprocess_id": subprocess_id,
            "target_entity_type": target_entity_type,
            "action": "manual_launch_required",
        }

    # Auto-create child entity record
    try:
        from backend.services.command_handler import create_entity
        from backend.models.entity_type import EntityTypeDefinition

        # Verify target entity type exists
        type_def = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == target_entity_type).first()
        if not type_def:
            logger.warning(f"Subprocess target entity type '{target_entity_type}' does not exist.")
            return None

        # Prepare child entity custom fields
        parent_title = custom_fields.get("title") or custom_fields.get("name") or f"{entity_type} {entity_id[:8]}"
        child_custom_fields: Dict[str, Any] = {
            "title": f"Subprocess: {subprocess_id} ({parent_title})",
            "parent_entity_id": str(entity_id),
            "parent_entity_type": entity_type.lower(),
            "parent_state": state_name,
            "subprocess_id": subprocess_id,
        }

        # Copy any shared fields if relevant
        for k in ("site_id", "asset_num", "location", "department", "priority", "description"):
            if k in custom_fields and custom_fields[k] is not None:
                child_custom_fields[k] = custom_fields[k]

        # Ensure any required fields on target entity type have valid values
        from datetime import timedelta
        from backend.models.field_registry import EntityField
        from backend.models.forms import EntityForm

        fields = db.query(EntityField).filter(EntityField.entity_type == target_entity_type).all()
        for f in fields:
            if f.field_name not in child_custom_fields or child_custom_fields[f.field_name] is None:
                if f.required:
                    if f.field_name in custom_fields and custom_fields[f.field_name]:
                        child_custom_fields[f.field_name] = custom_fields[f.field_name]
                    elif f.select_options and len(f.select_options) > 0:
                        child_custom_fields[f.field_name] = f.select_options[0]
                    elif f.field_type in ("number", "integer"):
                        child_custom_fields[f.field_name] = 0
                    elif f.field_type in ("date", "datetime"):
                        child_custom_fields[f.field_name] = (utc_now() + timedelta(days=7)).isoformat()
                    elif f.field_type == "boolean":
                        child_custom_fields[f.field_name] = False
                    elif f.field_name == "priority":
                        child_custom_fields[f.field_name] = "Medium"
                    elif f.field_name == "permit_type":
                        child_custom_fields[f.field_name] = "Hot Work"
                    elif f.field_name == "location":
                        child_custom_fields[f.field_name] = "Facility Main"
                    elif f.field_name == "hazards_identified":
                        child_custom_fields[f.field_name] = "Standard site safety precautions and PPE required"
                    else:
                        child_custom_fields[f.field_name] = f"Auto {f.label or f.field_name}"

        form = db.query(EntityForm).filter(EntityForm.entity_type == target_entity_type).first()
        if form and form.layout:
            for item in form.layout:
                if item.get("isHeader") or item.get("isGroup"):
                    continue
                fname = item.get("fieldName") or item.get("field_name") or item.get("i")
                if not fname:
                    continue
                val = child_custom_fields.get(fname)
                if bool(item.get("required")) and (val is None or (isinstance(val, str) and not val.strip())):
                    if fname in custom_fields and custom_fields[fname]:
                        child_custom_fields[fname] = custom_fields[fname]
                    elif item.get("options") and len(item.get("options")) > 0:
                        child_custom_fields[fname] = item.get("options")[0]
                    elif fname == "hazards_identified":
                        child_custom_fields[fname] = "Standard site safety precautions and PPE required"
                    elif fname == "expiry_date":
                        child_custom_fields[fname] = (utc_now() + timedelta(days=7)).isoformat()
                    else:
                        child_custom_fields[fname] = f"Auto {item.get('label') or fname}"

        child_result = create_entity(
            db=db,
            entity_type=target_entity_type,
            actor_id=SYSTEM_SUBPROCESS_ACTOR,
            actor_type="system",
            custom_fields=child_custom_fields,
            payload={"reason": f"Auto-launched child subprocess for {entity_type} '{entity_id}' at state '{state_name}'"},
        )

        child_id = child_result.get("entity_id")

        # Update parent custom_fields to record linked child ID
        ParentModel, _ = get_entity_models(entity_type)
        parent = db.query(ParentModel).filter(ParentModel.id == entity_id).first()
        if parent:
            updated_fields = dict(parent.custom_fields or {})
            updated_fields["subprocess_child_id"] = child_id
            updated_fields["subprocess_entity_type"] = target_entity_type
            updated_fields["subprocess_id"] = subprocess_id
            parent.custom_fields = updated_fields
            db.commit()

        # Send notification
        dispatch_notification(
            db=db,
            recipient_id=getattr(parent, "created_by", None) or "admin@compassx.io",
            title=f"Subprocess Launched: {subprocess_id}",
            message=f"Child workflow {target_entity_type.upper()} ({child_id[:8]}) was initiated for {entity_type.upper()} at stage {state_name}.",
            category="workflow_action",
            entity_type=target_entity_type,
            entity_id=child_id,
        )

        return {
            "subprocess_id": subprocess_id,
            "target_entity_type": target_entity_type,
            "child_id": child_id,
            "child_status": child_result.get("status"),
            "action": "child_created",
        }
    except Exception as ex:
        logger.error(f"Failed to auto-create child subprocess for {entity_type} {entity_id}: {ex}", exc_info=True)
        return None


def sync_parent_on_child_terminal_state(
    db: Session,
    child_entity_type: str,
    child_id: str,
    child_status: str,
    child_custom_fields: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    Checks if a child record has reached a terminal / completion state.
    If so, looks up the parent entity record, validates that it is currently
    in the Subprocess state waiting on this child, and automatically transitions
    the parent workflow to the next step.
    """
    parent_id = child_custom_fields.get("parent_entity_id")
    parent_entity_type = child_custom_fields.get("parent_entity_type")

    if not parent_id or not parent_entity_type:
        return None

    try:
        from backend.services.command_handler import _load_workflow, propose_transition

        ParentModel, _ = get_entity_models(parent_entity_type)
        parent = db.query(ParentModel).filter(ParentModel.id == str(parent_id)).first()
        if not parent:
            return None

        # Load parent workflow definition
        wf = _load_workflow(db, parent_entity_type, parent.workflow_version)
        definition = wf.definition or {}

        # Look up parent's current state node
        subprocess_node = find_subprocess_node_for_state(definition, parent.status)
        if not subprocess_node:
            logger.info(f"Parent {parent_entity_type} {parent_id} is in status '{parent.status}', which is not a waiting subprocess node.")
            return None

        # Check terminal states list
        configured_terminals = subprocess_node.get("on_child_terminal_states")
        if configured_terminals and isinstance(configured_terminals, list) and len(configured_terminals) > 0:
            terminal_set = {str(s).strip().upper() for s in configured_terminals}
        else:
            terminal_set = DEFAULT_TERMINAL_STATES

        if child_status.strip().upper() not in terminal_set:
            return None

        # Find resume event from parent's transitions out of current state
        resume_event = subprocess_node.get("resume_event") or "NEXT"
        valid_events = [
            t.get("event") for t in definition.get("transitions", [])
            if t.get("from") == parent.status
        ]

        if resume_event not in valid_events:
            # Fallback to the first outgoing transition event
            if valid_events:
                resume_event = valid_events[0]
            else:
                logger.warning(f"Parent workflow has no outgoing transitions from subprocess state '{parent.status}'")
                return None

        # Propose transition on parent entity
        transition_result = propose_transition(
            db=db,
            entity_type=parent_entity_type,
            entity_id=str(parent_id),
            event_type=resume_event,
            actor_id=SYSTEM_SUBPROCESS_ACTOR,
            actor_type="system",
            payload={
                "reason": f"Child subprocess {child_entity_type} ({child_id[:8]}) reached terminal state '{child_status}'",
                "child_entity_type": child_entity_type,
                "child_entity_id": child_id,
                "child_status": child_status,
            },
        )

        dispatch_notification(
            db=db,
            recipient_id=getattr(parent, "created_by", None) or "admin@compassx.io",
            title=f"Subprocess Completed & Resumed",
            message=f"Child {child_entity_type.upper()} ({child_id[:8]}) completed. {parent_entity_type.upper()} advanced to '{transition_result.get('new_status')}'.",
            category="workflow_action",
            entity_type=parent_entity_type,
            entity_id=str(parent_id),
        )

        return {
            "resumed": True,
            "parent_id": str(parent_id),
            "parent_entity_type": parent_entity_type,
            "previous_status": parent.status,
            "new_status": transition_result.get("new_status"),
            "resume_event": resume_event,
        }
    except Exception as ex:
        logger.error(f"Error synchronizing parent workflow for child {child_entity_type} {child_id}: {ex}", exc_info=True)
        return None


def get_subprocess_status(
    db: Session,
    entity_type: str,
    entity_id: str,
) -> Dict[str, Any]:
    """
    Returns full subprocess relationship and execution status for an entity.
    Can be called for both parent entities and child subprocess records.
    """
    EntityModel, _ = get_entity_models(entity_type)
    entity = db.query(EntityModel).filter(EntityModel.id == entity_id).first()
    if not entity:
        return {"found": False, "error": "Entity not found"}

    custom_fields = dict(entity.custom_fields or {})
    result: Dict[str, Any] = {
        "found": True,
        "entity_id": entity_id,
        "entity_type": entity_type,
        "status": entity.status,
        "is_subprocess_state": False,
        "is_child_record": False,
        "child_subprocess": None,
        "parent_workflow": None,
    }

    # 1. Check if this is a child record
    parent_id = custom_fields.get("parent_entity_id")
    parent_entity_type = custom_fields.get("parent_entity_type")
    if parent_id and parent_entity_type:
        result["is_child_record"] = True
        result["parent_workflow"] = {
            "parent_entity_id": parent_id,
            "parent_entity_type": parent_entity_type,
            "parent_state": custom_fields.get("parent_state"),
            "subprocess_id": custom_fields.get("subprocess_id"),
        }
        try:
            ParentModel, _ = get_entity_models(parent_entity_type)
            parent = db.query(ParentModel).filter(ParentModel.id == str(parent_id)).first()
            if parent:
                result["parent_workflow"]["parent_status"] = parent.status
        except Exception:
            pass

    # 2. Check if current state in parent workflow is a Subprocess node
    try:
        from backend.services.command_handler import _load_workflow
        wf = _load_workflow(db, entity_type, entity.workflow_version)
        definition = wf.definition or {}
        sub_node = find_subprocess_node_for_state(definition, entity.status)
        if sub_node:
            result["is_subprocess_state"] = True
            result["subprocess_node"] = {
                "name": sub_node.get("name"),
                "subprocess_id": sub_node.get("subprocess_id"),
                "target_entity_type": sub_node.get("subprocess_entity_type") or sub_node.get("target_entity_type") or entity_type,
                "resume_event": sub_node.get("resume_event") or "NEXT",
                "autocreate_child": sub_node.get("autocreate_child", True),
            }
    except Exception:
        pass

    # 3. Check for linked child subprocess record
    child_id = custom_fields.get("subprocess_child_id") or custom_fields.get("_child_entity_id")
    child_type = (custom_fields.get("subprocess_entity_type") or entity_type).lower()
    if child_id:
        try:
            ChildModel, _ = get_entity_models(child_type)
            child = db.query(ChildModel).filter(ChildModel.id == str(child_id)).first()
            if child:
                result["child_subprocess"] = {
                    "child_id": child.id,
                    "child_entity_type": child_type,
                    "child_status": child.status,
                    "created_at": child.created_at.isoformat() if child.created_at else None,
                    "updated_at": child.updated_at.isoformat() if child.updated_at else None,
                    "custom_fields": child.custom_fields,
                }
        except Exception:
            pass

    return result
