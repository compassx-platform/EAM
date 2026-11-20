"""
Closed registry + executor for declarative post-transition side effects.

Workflow definitions reference actions *inline* on a transition (``on_after``);
the action *types* below are the fixed, app-owned implementations. A workflow
can never define a new action type — it can only parameterize one of these.

Actions marked ``reject_on_failure`` run before the transition commits. If one
of them fails, the transition is rolled back. The other actions still run
after the commit and a failure there is recorded without undoing the move.

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
    {
        "type": "send_in_app_notification",
        "name": "Send In-App Notification",
        "description": (
            "Dispatches an in-app notification to a person, role assignee, or user on transition. "
            "Supports {{field}} template variables in recipient, title, and message."
        ),
        "parameters": [
            {"name": "recipient", "label": "Recipient (Person ID, email, or {{field}})", "type": "string", "required": True},
            {"name": "title", "label": "Notification Title ({{field}} supported)", "type": "string", "required": True},
            {"name": "message", "label": "Notification Message ({{field}} supported)", "type": "string", "required": True},
            {"name": "category", "label": "Category (task_assigned / workflow_action / system_alert)", "type": "string", "required": False},
        ],
    },
    {
        "type": "set_value",
        "name": "Set Value",
        "description": "Writes fields on the current record. A value of 'now' stores the current time. {{field}} templates are supported.",
        "parameters": [
            {"name": "fields", "label": "Fields to set", "type": "json", "required": True},
        ],
    },
    {
        "type": "copy_lines",
        "name": "Copy Lines",
        "description": "Copies child rows from a template record onto the current record. The template is left unchanged.",
        "parameters": [
            {"name": "source_id_field", "label": "Field holding the template id", "type": "string", "required": True},
            {"name": "child_entity_type", "label": "Child entity type", "type": "string", "required": True},
            {"name": "source_link_field", "label": "Link field on the template's children", "type": "string", "required": True},
            {"name": "target_link_field", "label": "Link field written with this record's id", "type": "string", "required": True},
        ],
    },
    {
        "type": "rollup",
        "name": "Roll Up",
        "description": "Sums numeric fields from child records onto the current record.",
        "parameters": [
            {"name": "child_entity_type", "label": "Child entity type", "type": "string", "required": True},
            {"name": "link_field", "label": "Child field that points at this record", "type": "string", "required": True},
            {"name": "sums", "label": "List of {from, to} field pairs", "type": "json", "required": True},
        ],
    },
    {
        "type": "inherit_status",
        "name": "Inherit Status",
        "description": "Fires this same event on child records that opt in. A child that cannot take the event is left as it is.",
        "parameters": [
            {"name": "child_entity_type", "label": "Child entity type", "type": "string", "required": True},
            {"name": "link_field", "label": "Child field that points at this record", "type": "string", "required": True},
            {"name": "opt_in_field", "label": "Child field that must be true", "type": "string", "required": False},
            {"name": "flow_control_field", "label": "Parent field that blocks selected events", "type": "string", "required": False},
            {"name": "skip_events", "label": "Events blocked while flow control is on", "type": "json", "required": False},
        ],
    },
    {
        "type": "reserve_stock",
        "name": "Reserve Stock",
        "description": "Reserves stocked lines. A direct-issue line is skipped. A short balance rejects the action.",
        "parameters": [
            {"name": "site_field", "label": "Site field", "type": "string", "required": True},
            {"name": "item_field", "label": "Item field", "type": "string", "required": True},
            {"name": "storeroom_field", "label": "Storeroom field", "type": "string", "required": True},
            {"name": "quantity_field", "label": "Quantity field", "type": "string", "required": True},
            {"name": "direct_issue_field", "label": "Direct issue field", "type": "string", "required": False},
            {"name": "child_entity_type", "label": "Read lines from this child type", "type": "string", "required": False},
            {"name": "link_field", "label": "Child link field", "type": "string", "required": False},
        ],
    },
    {
        "type": "release_stock",
        "name": "Release Reservation",
        "description": "Releases reservations held by this record and, when named, by its child lines.",
        "parameters": [
            {"name": "child_entity_type", "label": "Child entity type", "type": "string", "required": False},
            {"name": "link_field", "label": "Child link field", "type": "string", "required": False},
        ],
    },
    {
        "type": "issue_stock",
        "name": "Issue or Return Stock",
        "description": "A positive quantity issues stock. A negative quantity returns it. A direct-issue line does not change the storeroom.",
        "parameters": [
            {"name": "site_field", "label": "Site field", "type": "string", "required": True},
            {"name": "item_field", "label": "Item field", "type": "string", "required": True},
            {"name": "storeroom_field", "label": "Storeroom field", "type": "string", "required": True},
            {"name": "quantity_field", "label": "Quantity field", "type": "string", "required": True},
            {"name": "direct_issue_field", "label": "Direct issue field", "type": "string", "required": False},
        ],
    },
]

ACTION_TYPE_SET = {a["type"] for a in ACTION_TYPES_CATALOG} | {"in_app_notification"}


def update_entity_fields(
    db: Session,
    entity_type: str,
    entity_id: str,
    fields_delta: Dict[str, Any],
    reason: Optional[str] = None,
    actor_id: str = SYSTEM_ACTOR_ID,
    actor_type: str = "system",
    commit: bool = True,
) -> Dict[str, Any]:
    """
    Applies a custom-field delta to an entity while preserving the event log:
    appends a FIELD_UPDATE event and updates the materialized row with an
    optimistic-concurrency guard. Returns the new entity snapshot.
    """
    from sqlalchemy import update as sa_update

    EntityModel, EventModel = get_entity_models(entity_type)
    entity = db.query(EntityModel).populate_existing().filter(EntityModel.id == entity_id).first()
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
    if commit:
        db.commit()
    else:
        db.flush()
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
    *,
    commit: bool = True,
    raise_on_failure: bool = False,
    event_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Runs transition actions. When ``raise_on_failure`` is set, the first failed
    action raises and the caller rolls the transition back.
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
                        commit=commit,
                    )
                    entry.update({"success": True, "target_entity_id": target["id"], "updated_field": field, "value": new_val})

            elif atype == "create_related_entity":
                from backend.services.record_lines import asset_is_operating, find_open_record, is_due
                target_type = params.get("target_entity_type")
                template = params.get("template") or {}
                rel_field = params.get("relationship_field")
                if params.get("due_field"):
                    lead_raw = custom_fields.get(params.get("lead_days_field")) if params.get("lead_days_field") else params.get("lead_days")
                    try:
                        lead_days = float(lead_raw or 0)
                    except (TypeError, ValueError):
                        lead_days = 0
                    if not is_due(custom_fields, params["due_field"], lead_days):
                        entry.update({"success": True, "skipped": True, "reason": "Not due yet."})
                        results.append(entry)
                        continue
                if params.get("require_operating"):
                    site = custom_fields.get(params.get("site_field") or "site_id")
                    if not asset_is_operating(
                        db,
                        site,
                        custom_fields.get(params.get("asset_field")) if params.get("asset_field") else None,
                        custom_fields.get(params.get("location_field")) if params.get("location_field") else None,
                    ):
                        raise CommandError("not_operating", "The asset or location is not operating.")
                rendered, unresolved = render_template_mapping(template, custom_fields)
                if params.get("reuse_match_fields"):
                    match = {name: rendered.get(name) for name in params["reuse_match_fields"]}
                    existing = find_open_record(db, target_type, match, params.get("closed_statuses") or [])
                    if existing:
                        if rel_field:
                            update_entity_fields(
                                db, entity_type=entity_type, entity_id=entity_id,
                                fields_delta={rel_field: existing.id},
                                reason=f"Reused open {target_type}",
                                commit=commit,
                            )
                        entry.update({"success": True, "created_entity_id": existing.id, "reused": True, "unresolved_placeholders": unresolved})
                        results.append(entry)
                        continue
                created = create_entity(
                    db=db,
                    entity_type=target_type,
                    actor_id=SYSTEM_ACTOR_ID,
                    actor_type="system",
                    custom_fields=rendered,
                    workflow_version=params.get("workflow_version"),
                    payload={"reason": f"Generated as side effect of {entity_type} '{entity_id}'"},
                    commit=commit,
                )
                new_id = created["entity_id"]
                if rel_field:
                    update_entity_fields(
                        db,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        fields_delta={rel_field: new_id},
                        reason=f"Side effect of {atype} on {entity_type} '{entity_id}'",
                        commit=commit,
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
                        commit=commit,
                        run_post_pipeline=commit,
                    )
                    entry.update({"success": True, "target_entity_id": linked_id, "new_status": result.get("new_status"), "unresolved_placeholders": unresolved})

            elif atype in ("send_in_app_notification", "in_app_notification"):
                from backend.services.notification_service import dispatch_notification
                recipient_raw = params.get("recipient") or params.get("recipient_id") or params.get("recipient_field")
                if recipient_raw and recipient_raw in custom_fields:
                    recipient = str(custom_fields[recipient_raw])
                else:
                    recipient, _ = render_template(str(recipient_raw or "ALL"), custom_fields)

                title_template = params.get("title", f"Workflow Notice: {entity_type} {entity_id}")
                msg_template = params.get("message", f"Transition triggered on {entity_type} {entity_id}")

                title, _ = render_template(str(title_template), custom_fields)
                message, _ = render_template(str(msg_template), custom_fields)
                category = params.get("category", "workflow_action")

                notif = dispatch_notification(
                    db=db,
                    recipient_id=recipient,
                    title=title,
                    message=message,
                    category=category,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    link_url=f"/records/{entity_id}?type={entity_type}",
                    sender_id=SYSTEM_ACTOR_ID,
                    auto_commit=True,
                )
                entry.update({"success": True, "notification_id": notif.id, "recipient_id": recipient, "title": title})

            elif atype == "set_value":
                fields = params.get("fields") or {}
                delta = {key: _resolve_value(value, custom_fields) if isinstance(value, str) else value for key, value in fields.items()}
                update_entity_fields(
                    db, entity_type=entity_type, entity_id=entity_id, fields_delta=delta,
                    reason=f"Set value on {entity_type} '{entity_id}'", commit=commit,
                )
                custom_fields.update(delta)
                entry.update({"success": True, "fields": delta})

            elif atype == "copy_lines":
                from backend.services.record_lines import copy_lines
                source_id = custom_fields.get(params.get("source_id_field"))
                if not source_id:
                    entry.update({"success": True, "skipped": True, "reason": "No template record is selected."})
                else:
                    created_ids = copy_lines(
                        db,
                        parent_id=entity_id,
                        source_id=str(source_id),
                        child_entity_type=params.get("child_entity_type"),
                        source_link_field=params.get("source_link_field"),
                        target_link_field=params.get("target_link_field"),
                        copy_fields=params.get("copy_fields"),
                        commit=commit,
                    )
                    entry.update({"success": True, "created_ids": created_ids})

            elif atype == "rollup":
                from backend.services.record_lines import rollup_sums
                totals = rollup_sums(
                    db, entity_id, params.get("child_entity_type"), params.get("link_field"), params.get("sums") or [],
                )
                if totals:
                    update_entity_fields(
                        db, entity_type=entity_type, entity_id=entity_id, fields_delta=totals,
                        reason="Rolled up child values", commit=commit,
                    )
                    custom_fields.update(totals)
                entry.update({"success": True, "totals": totals})

            elif atype == "inherit_status":
                from backend.services.record_lines import inherit_event
                outcome = inherit_event(
                    db,
                    parent_id=entity_id,
                    parent_fields=custom_fields,
                    child_entity_type=params.get("child_entity_type"),
                    link_field=params.get("link_field"),
                    event=params.get("event") or event_type or "",
                    opt_in_field=params.get("opt_in_field"),
                    flow_control_field=params.get("flow_control_field"),
                    skip_events=params.get("skip_events"),
                    commit=commit,
                )
                entry.update({"success": True, **outcome})

            elif atype in ("reserve_stock", "release_stock", "issue_stock"):
                from backend.services.record_lines import children_of
                from backend.services.stock_service import StockError, issue, release_holder, reserve
                holders = [(entity_type, entity_id, custom_fields)]
                if params.get("child_entity_type") and params.get("link_field"):
                    holders = [
                        (params["child_entity_type"], row.id, row.custom_fields or {})
                        for row in children_of(db, params["child_entity_type"], params["link_field"], entity_id)
                    ]
                if atype == "release_stock":
                    released = release_holder(db, entity_type, entity_id)
                    for holder_type, holder_id, _fields in holders:
                        if holder_type == entity_type and holder_id == entity_id:
                            continue
                        released += release_holder(db, holder_type, holder_id)
                    if commit:
                        db.commit()
                    entry.update({"success": True, "released": released})
                else:
                    for holder_type, holder_id, fields in holders:
                        site = fields.get(params.get("site_field")) or custom_fields.get(params.get("site_field"))
                        item = fields.get(params.get("item_field"))
                        room = fields.get(params.get("storeroom_field"))
                        direct = params.get("direct_issue_field") and str(fields.get(params.get("direct_issue_field")) or "").strip().lower() in ("1", "true", "yes", "y")
                        try:
                            qty = float(fields.get(params.get("quantity_field")) or 0)
                        except (TypeError, ValueError):
                            qty = 0
                        if direct or not item:
                            continue
                        try:
                            if atype == "reserve_stock":
                                reserve(db, str(site or ""), str(room or ""), str(item), qty, holder_type, holder_id)
                            else:
                                issue(db, str(site or ""), str(room or ""), str(item), qty, holder_type, holder_id)
                        except StockError as exc:
                            raise CommandError("stock", exc.message) from exc
                    if commit:
                        db.commit()
                    entry.update({"success": True})
        except Exception as ex:
            entry.update({"success": False, "error": getattr(ex, "message", None) or str(ex)})
            if raise_on_failure:
                results.append(entry)
                raise
        results.append(entry)
    return results