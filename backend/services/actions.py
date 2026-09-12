"""
Closed registry + executor for declarative post-transition side effects.

Workflow definitions reference actions *inline* on a transition (``on_after``);
the action *types* below are the fixed, app-owned implementations. A workflow
can never define a new action type — it can only parameterize one of these.

Side effects run AFTER the main transition commits, each in its own
transaction, and are best-effort: a failure is recorded in the response under
``side_effects`` and never rolls back the transition itself.

Event-sourcing contract:
  - ``create_related_entity``  goes through ``create_entity``         (real events)
  - ``transition_related_entity`` goes through ``propose_transition`` (real events)
  - ``update_related_entity_field`` is a custom-field mutation recorded as a
    ``FIELD_UPDATE`` event on the target entity, so its event log stays complete
    and replayable.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.models.base import generate_uuid, utc_now
from backend.models.entities import get_entity_models
from backend.services.command_handler import create_entity, propose_transition, CommandError
from backend.services.expression import render_template, render_template_mapping
from backend.services.field_validator import validate_custom_fields

SYSTEM_ACTOR_ID = "system:workflow-engine"

ACTION_TYPES_CATALOG = [
    {
        "type": "update_related_entity_field",
        "name": "Update Related Entity Field",
        "description": (
            "Updates a custom field on a related entity (e.g. a PM schedule's "
            "last_completion_date on work order close). Values support "
            "{{field}} templates and the literal 'now'."
        ),
        "parameters": [
            {"name": "relationship_field", "label": "Relationship Field (on this entity)", "type": "string", "required": True},
            {"name": "target_entity_type", "label": "Target Entity Type", "type": "string", "required": True},
            {"name": "field", "label": "Field To Update (on target)", "type": "string", "required": True},
            {"name": "value", "label": "New Value ({{field}} / 'now' supported)", "type": "string", "required": True},
        ],
    },
    {
        "type": "create_related_entity",
        "name": "Create Related Entity",
        "description": (
            "Creates a new entity instance (e.g. generating the next PM work "
            "order) with template custom fields, optionally writing the new id "
            "back to a field on the current entity."
        ),
        "parameters": [
            {"name": "target_entity_type", "label": "Target Entity Type", "type": "string", "required": True},
            {"name": "template", "label": "Template Custom Fields ({{field}} supported)", "type": "json", "required": True},
            {"name": "relationship_field", "label": "Field On This Entity To Receive New Id", "type": "string", "required": False},
            {"name": "workflow_version", "label": "Target Workflow Version (optional)", "type": "string", "required": False},
        ],
    },
    {
        "type": "transition_related_entity",
        "name": "Transition Related Entity",
        "description": (
            "Fires a workflow event on a related entity (e.g. reopening a "
            "permit, kicking a follow-up workflow). Runs as a system actor."
        ),
        "parameters": [
            {"name": "relationship_field", "label": "Relationship Field (on this entity)", "type": "string", "required": True},
            {"name": "target_entity_type", "label": "Target Entity Type", "type": "string", "required": True},
            {"name": "event", "label": "Event Type To Fire", "type": "string", "required": True},
            {"name": "payload_template", "label": "Payload Template ({{field}} supported)", "type": "json", "required": False},
        ],
    },
]

ACTION_TYPE_SET = {a["type"] for a in ACTION_TYPES_CATALOG}


def update_entity_fields(
    db: Session,
    entity_type: str,
    entity_id: str,
    fields_delta: Dict[str, Any],
    reason: Optional[str] = None,
    actor_id: str = SYSTEM_ACTOR_ID,
    actor_type: str = "system",
) -> Dict[str, Any]:
    """
    Applies a custom-field delta to an entity while preserving the event log:
    appends a FIELD_UPDATE event and updates the materialized row with an
    optimistic-concurrency guard. Returns the new entity snapshot.
    """
    from sqlalchemy import update as sa_update

    EntityModel, EventModel = get_entity_models(entity_type)
    entity = db.query(EntityModel).filter(EntityModel.id == entity_id).first()
    if not entity:
        raise CommandError("entity_not_found", f"{entity_type} with ID '{entity_id}' not found")

    merged = dict(entity.custom_fields or {})
    merged.update(fields_delta)
    cleaned = validate_custom_fields(db=db, entity_type=entity_type, custom_fields=merged, is_create=False)

    new_event_id = generate_uuid()
    now = utc_now()

    stmt = (
        sa_update(EntityModel)
        .where(EntityModel.id == entity_id)
        .where(EntityModel.last_event_id == entity.last_event_id)
        .values(
            custom_fields=cleaned,
            last_event_id=new_event_id,
            updated_at=now,
        )
    )
    rslt = db.execute(stmt)
    if rslt.rowcount == 0:
        raise CommandError("stale_write", f"Stale write updating fields on '{entity_type}' '{entity_id}'")

    event_row = EventModel(
        event_id=new_event_id,
        entity_id=entity_id,
        event_type="FIELD_UPDATE",
        actor_id=actor_id,
        actor_type=actor_type,
        transaction_time=now,
        from_state=entity.status,
        to_state=entity.status,
        payload={
            "custom_fields_delta": fields_delta,
            **( {"reason": reason} if reason else {} ),
        },
    )
    db.add(event_row)
    db.commit()
    db.refresh(entity)
    return entity.to_dict()


def _resolve_value(value: str, custom_fields: Dict[str, Any]) -> str:
    if isinstance(value, str) and value.strip().lower() == "now":
        return datetime.now(timezone.utc).isoformat()
    rendered, _ = render_template(value, custom_fields)
    return rendered


def execute_actions(
    db: Session,
    entity_type: str,
    entity_id: str,
    custom_fields: Dict[str, Any],
    actions: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Runs a transition's ``on_after`` actions post-commit. Always returns a list
    of per-action results (success or error) — never raises for action failures.
    """
    results: List[Dict[str, Any]] = []
    for action in actions or []:
        atype = action.get("type")
        params = action.get("params") or {}
        entry: Dict[str, Any] = {"type": atype, "success": False, "params": params}
        try:
            if atype not in ACTION_TYPE_SET:
                raise CommandError("unknown_action", f"Unknown action type '{atype}'")

            if atype == "update_related_entity_field":
                rel_field = params.get("relationship_field")
                target_type = params.get("target_entity_type")
                field = params.get("field")
                value = params.get("value")
                linked_id = custom_fields.get(rel_field)
                if not linked_id:
                    entry.update({"success": True, "skipped": True, "reason": f"No related entity linked in '{rel_field}'"})
                else:
                    new_val = _resolve_value(str(value), custom_fields)
                    target = update_entity_fields(
                        db,
                        entity_type=target_type,
                        entity_id=str(linked_id),
                        fields_delta={field: new_val},
                        reason=f"Side effect of {entity_type} '{entity_id}' {atype}",
                    )
                    entry.update({"success": True, "target_entity_id": target["id"], "updated_field": field, "value": new_val})

            elif atype == "create_related_entity":
                target_type = params.get("target_entity_type")
                template = params.get("template") or {}
                rel_field = params.get("relationship_field")
                rendered, unresolved = render_template_mapping(template, custom_fields)
                created = create_entity(
                    db=db,
                    entity_type=target_type,
                    actor_id=SYSTEM_ACTOR_ID,
                    actor_type="system",
                    custom_fields=rendered,
                    workflow_version=params.get("workflow_version"),
                    payload={"reason": f"Generated as side effect of {entity_type} '{entity_id}'"},
                )
                new_id = created["entity_id"]
                if rel_field:
                    update_entity_fields(
                        db,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        fields_delta={rel_field: new_id},
                        reason=f"Side effect of {atype} on {entity_type} '{entity_id}'",
                    )
                entry.update({
                    "success": True,
                    "created_entity_id": new_id,
                    "created_status": created["status"],
                    "unresolved_placeholders": unresolved,
                })

            elif atype == "transition_related_entity":
                rel_field = params.get("relationship_field")
                target_type = params.get("target_entity_type")
                event = params.get("event")
                payload_template = params.get("payload_template") or {}
                linked_id = custom_fields.get(rel_field)
                if not linked_id:
                    entry.update({"success": True, "skipped": True, "reason": f"No related entity linked in '{rel_field}'"})
                else:
                    rendered, unresolved = render_template_mapping(payload_template, custom_fields)
                    result = propose_transition(
                        db=db,
                        entity_type=target_type,
                        entity_id=str(linked_id),
                        event_type=event,
                        actor_id=SYSTEM_ACTOR_ID,
                        actor_type="system",
                        payload={**(rendered or {}), "reason": f"Side effect of {entity_type} '{entity_id}'"},
                    )
                    entry.update({"success": True, "target_entity_id": linked_id, "new_status": result.get("new_status"), "unresolved_placeholders": unresolved})
        except Exception as ex:  # best-effort: record, never rollback the transition
            entry.update({"success": False, "error": str(ex)})
        results.append(entry)
    return results