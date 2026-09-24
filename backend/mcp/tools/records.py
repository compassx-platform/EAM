"""
Records module MCP tools for CompassX EAM.

Provides tools for creating, querying, transitioning, simulating, and rebuilding
records (entity instances and their immutable event audit trails) in the single-command
CQRS pipeline on behalf of users.
"""

from typing import Dict, Any, Optional, List
from backend.mcp.context import get_db_session, resolve_effective_actor
from backend.models.entities import get_entity_models, DynamicEntity
from backend.models.entity_type import EntityTypeDefinition
from backend.models.workflow import WorkflowDefinition
from backend.services.command_handler import (
    create_entity,
    propose_transition,
    CommandError,
    StaleWriteError,
    InvalidTransitionError,
    ConditionFailedError,
)
from backend.services.field_validator import FieldValidationError
from backend.services.simulator import simulate_transition
from backend.services.projector import rebuild_entity_from_events


def _verify_entity_type(db, entity_type: str) -> str:
    key = (entity_type or "").strip().lower()
    if not key:
        raise ValueError("Entity type cannot be empty")
    exists = db.query(EntityTypeDefinition).filter(EntityTypeDefinition.name == key).first()
    if not exists:
        raise ValueError(f"Unknown entity type '{entity_type}'")
    return key


def records_list(
    entity_type: str,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    List records (materialized current state) for a specified entity type.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder', 'permit')
        status: Optional filter by workflow status (e.g. 'DRAFT', 'ACTIVE')
        search: Optional search text to filter by ID or custom field values
        limit: Max number of records to return (1-500, default 50)
        offset: Pagination offset
    """
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    with get_db_session() as db:
        try:
            key = _verify_entity_type(db, entity_type)
        except ValueError as e:
            return {"success": False, "error": str(e)}

        EntityModel, _ = get_entity_models(key)
        query = db.query(EntityModel)

        if EntityModel == DynamicEntity:
            query = query.filter(DynamicEntity.entity_type == key)

        if status:
            query = query.filter(EntityModel.status == status.strip())

        total = query.count()
        entities = query.order_by(EntityModel.updated_at.desc()).offset(offset).limit(limit).all()
        items = [e.to_dict() for e in entities]

        if search and search.strip():
            s = search.strip().lower()
            filtered = []
            for item in items:
                # Match against id or any custom field value
                match = s in str(item.get("id", "")).lower() or s in str(item.get("status", "")).lower()
                if not match and item.get("custom_fields"):
                    match = any(s in str(v).lower() for v in item["custom_fields"].values() if v is not None)
                if match:
                    filtered.append(item)
            items = filtered

        return {
            "success": True,
            "entity_type": key,
            "total": total,
            "limit": limit,
            "offset": offset,
            "count": len(items),
            "items": items,
        }


def records_get(entity_type: str, entity_id: str) -> Dict[str, Any]:
    """
    Retrieve full details for a record, including its current materialized state
    and complete chronological event sourcing audit history.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder', 'permit')
        entity_id: Unique record ID
    """
    with get_db_session() as db:
        try:
            key = _verify_entity_type(db, entity_type)
        except ValueError as e:
            return {"success": False, "error": str(e)}

        EntityModel, EventModel = get_entity_models(key)
        query = db.query(EntityModel).filter(EntityModel.id == entity_id.strip())
        if EntityModel == DynamicEntity:
            query = query.filter(DynamicEntity.entity_type == key)
        entity = query.first()

        if not entity:
            return {"success": False, "error": f"{key} '{entity_id}' not found"}

        events = (
            db.query(EventModel)
            .filter(EventModel.entity_id == entity_id.strip())
            .order_by(EventModel.transaction_time.asc())
            .all()
        )

        return {
            "success": True,
            "entity": entity.to_dict(),
            "events": [e.to_dict() for e in events],
            "event_count": len(events),
        }


def records_create(
    entity_type: str,
    custom_fields: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
    workflow_version: Optional[str] = None,
    on_behalf_of: Optional[str] = None,
    actor_roles: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Create a new record on behalf of a user in the CQRS single-command pipeline.

    Initializes the record at the initial stage of the active published workflow
    and records an immutable CREATED event in the audit log.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder', 'permit')
        custom_fields: Dictionary of field values according to the entity schema
        payload: Optional metadata or comment to store with the creation event
        workflow_version: Specific workflow version to bind to (defaults to active published)
        on_behalf_of: User identifier (email or PERSONID) on whose behalf this record is created
        actor_roles: Optional explicit list of RBAC roles (resolved automatically if omitted)
    """
    with get_db_session() as db:
        try:
            key = _verify_entity_type(db, entity_type)
            actor_id, actor_type, roles = resolve_effective_actor(
                db, on_behalf_of=on_behalf_of, actor_type="human", actor_roles=actor_roles
            )

            result = create_entity(
                db=db,
                entity_type=key,
                actor_id=actor_id,
                actor_type=actor_type,
                actor_roles=roles,
                custom_fields=custom_fields or {},
                payload=payload,
                workflow_version=workflow_version,
            )
            return {
                "success": True,
                "acted_on_behalf_of": actor_id,
                "actor_roles": roles,
                "id": result.get("entity_id"),
                "status": result.get("status"),
                "last_event_id": result.get("event_id"),
                "record": result,
            }
        except CommandError as ce:
            return {"success": False, "error_code": ce.code, "error": ce.message, "details": ce.details}
        except FieldValidationError as fve:
            return {"success": False, "error_code": "field_validation_error", "error": fve.message, "field_name": fve.field_name}
        except Exception as ex:
            return {"success": False, "error": str(ex)}


def records_transition(
    entity_type: str,
    entity_id: str,
    event_type: str,
    custom_fields_delta: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
    expected_last_event_id: Optional[str] = None,
    on_behalf_of: Optional[str] = None,
    actor_roles: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Propose and execute a workflow transition on a record on behalf of a user.

    Validates transition eligibility against published workflow rules, checks closed
    condition gates (role check, numeric threshold, field not empty, date comparison,
    related entity), enforces optimistic concurrency, logs an immutable event, and updates
    materialized state.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder', 'permit')
        entity_id: Unique record ID
        event_type: Workflow event trigger to execute (e.g. 'SUBMIT', 'APPROVE', 'REJECT')
        custom_fields_delta: Optional updates to custom fields applied during transition
        payload: Optional metadata or comment to store with the transition event
        expected_last_event_id: Compare-and-swap token to prevent concurrent stale writes
        on_behalf_of: User identifier (email or PERSONID) on whose behalf this action is taken
        actor_roles: Optional explicit list of RBAC roles (resolved automatically if omitted)
    """
    with get_db_session() as db:
        try:
            key = _verify_entity_type(db, entity_type)
            actor_id, actor_type, roles = resolve_effective_actor(
                db, on_behalf_of=on_behalf_of, actor_type="human", actor_roles=actor_roles
            )

            result = propose_transition(
                db=db,
                entity_type=key,
                entity_id=entity_id.strip(),
                event_type=event_type.strip(),
                actor_id=actor_id,
                actor_type=actor_type,
                actor_roles=roles,
                payload=payload,
                custom_fields_delta=custom_fields_delta,
                expected_last_event_id=expected_last_event_id,
            )
            return {
                "success": True,
                "acted_on_behalf_of": actor_id,
                "actor_roles": roles,
                "transition": result,
            }
        except StaleWriteError as swe:
            return {"success": False, "error_code": "stale_write", "error": swe.message}
        except ConditionFailedError as cfe:
            return {"success": False, "error_code": "condition_failed", "error": cfe.message, "details": cfe.details}
        except InvalidTransitionError as ite:
            return {"success": False, "error_code": "invalid_transition", "error": ite.message, "details": ite.details}
        except CommandError as ce:
            return {"success": False, "error_code": ce.code, "error": ce.message, "details": ce.details}
        except FieldValidationError as fve:
            return {"success": False, "error_code": "field_validation_error", "error": fve.message, "field_name": fve.field_name}
        except Exception as ex:
            return {"success": False, "error": str(ex)}


def records_get_valid_transitions(entity_type: str, entity_id: str) -> Dict[str, Any]:
    """
    Inspect legal next transitions available for a record given its current status
    and active published workflow definition.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder', 'permit')
        entity_id: Unique record ID
    """
    with get_db_session() as db:
        try:
            key = _verify_entity_type(db, entity_type)
        except ValueError as e:
            return {"success": False, "error": str(e)}

        EntityModel, _ = get_entity_models(key)
        query = db.query(EntityModel).filter(EntityModel.id == entity_id.strip())
        if EntityModel == DynamicEntity:
            query = query.filter(DynamicEntity.entity_type == key)
        entity = query.first()

        if not entity:
            return {"success": False, "error": f"{key} '{entity_id}' not found"}

        wf = (
            db.query(WorkflowDefinition)
            .filter(
                WorkflowDefinition.entity_type == key,
                WorkflowDefinition.status == "published",
            )
            .order_by(
                WorkflowDefinition.published_at.desc(),
                WorkflowDefinition.created_at.desc(),
            )
            .first()
        )

        if not wf:
            return {
                "success": True,
                "entity_id": entity_id,
                "entity_type": key,
                "current_status": entity.status,
                "has_published_workflow": False,
                "valid_transitions": [],
                "message": f"No published workflow is available for '{key}'",
            }

        transitions = (wf.definition or {}).get("transitions", [])
        valid_transitions = []
        for t in transitions:
            if t.get("from") == entity.status:
                entry = {
                    "event_type": t.get("event"),
                    "to_state": t.get("to"),
                    "conditions": t.get("conditions", []) or [],
                }
                if t.get("choices"):
                    entry["choices"] = t.get("choices")
                if t.get("on_after"):
                    entry["on_after"] = t.get("on_after")
                valid_transitions.append(entry)

        auto_pending = []
        for a in (wf.definition or {}).get("auto_transitions", []) or []:
            if a.get("from") == entity.status:
                auto_pending.append(a)

        return {
            "success": True,
            "entity_id": entity_id,
            "entity_type": key,
            "current_status": entity.status,
            "workflow_version": wf.version_label,
            "valid_transitions": valid_transitions,
            "auto_transitions_pending": auto_pending,
            "has_published_workflow": True,
        }


def records_simulate_transition(
    entity_type: str,
    event_type: str,
    entity_id: Optional[str] = None,
    custom_fields_override: Optional[Dict[str, Any]] = None,
    current_status_override: Optional[str] = None,
    workflow_version_override: Optional[str] = None,
    on_behalf_of: Optional[str] = None,
    actor_roles: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Simulate/dry-run a transition without modifying any database records or appending events.

    Useful for evaluating whether a transition would succeed for a given user and payload.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder', 'permit')
        event_type: Workflow event trigger to test
        entity_id: Optional existing entity ID to test against
        custom_fields_override: Optional test custom fields
        current_status_override: Optional starting state override
        workflow_version_override: Optional workflow version to test
        on_behalf_of: User identifier to simulate the action on behalf of
        actor_roles: Optional role list override
    """
    with get_db_session() as db:
        try:
            key = _verify_entity_type(db, entity_type)
            actor_id, actor_type, roles = resolve_effective_actor(
                db, on_behalf_of=on_behalf_of, actor_type="human", actor_roles=actor_roles
            )

            result = simulate_transition(
                db=db,
                entity_type=key,
                entity_id=entity_id,
                event_type=event_type,
                actor_id=actor_id,
                actor_type=actor_type,
                actor_roles=roles,
                custom_fields_override=custom_fields_override,
                current_status_override=current_status_override,
                workflow_version_override=workflow_version_override,
            )
            return {
                "success": True,
                "accepted": result.get("accepted", False),
                "simulated_for_actor": actor_id,
                "actor_roles": roles,
                "simulation": result,
            }
        except Exception as ex:
            return {"success": False, "error": str(ex)}


def records_rebuild_cache(entity_type: str, entity_id: str) -> Dict[str, Any]:
    """
    Rebuild the materialized current-state cache row by replaying the append-only event log.
    Validates event sourcing consistency.

    Args:
        entity_type: Slug of the entity type (e.g. 'workorder', 'permit')
        entity_id: Unique record ID
    """
    with get_db_session() as db:
        try:
            key = _verify_entity_type(db, entity_type)
            rebuilt = rebuild_entity_from_events(db, key, entity_id.strip())
            return {"success": True, "rebuilt": True, "entity": rebuilt}
        except Exception as ex:
            return {"success": False, "error": str(ex)}
