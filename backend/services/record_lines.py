"""Child rows, copy, rollup, inheritance, and generation checks for any entity type."""

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.models.asset_hierarchy import Asset, Location
from backend.models.entities import get_entity_models
from backend.services.command_handler import CommandError, create_entity, propose_transition


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in ("1", "true", "yes", "y")


def children_of(db: Session, child_type: str, link_field: str, parent_id: str) -> list:
    model, _ = get_entity_models(child_type)
    rows = db.query(model).filter(model.entity_type == (child_type or "").strip().lower()).all()
    wanted = str(parent_id)
    return [row for row in rows if str((row.custom_fields or {}).get(link_field) or "") == wanted]


def copy_lines(
    db: Session,
    *,
    parent_id: str,
    source_id: str,
    child_entity_type: str,
    source_link_field: str,
    target_link_field: str,
    copy_fields: Optional[list] = None,
    commit: bool = True,
) -> list[str]:
    created: list[str] = []
    for source in children_of(db, child_entity_type, source_link_field, source_id):
        fields = dict(source.custom_fields or {})
        fields.pop(source_link_field, None)
        if copy_fields:
            fields = {name: fields.get(name) for name in copy_fields}
        fields[target_link_field] = parent_id
        result = create_entity(
            db=db,
            entity_type=child_entity_type,
            actor_id="system:workflow-engine",
            actor_type="system",
            custom_fields=fields,
            commit=commit,
        )
        created.append(result["entity_id"])
    return created


def rollup_sums(db: Session, parent_id: str, child_entity_type: str, link_field: str, sums: list) -> dict:
    totals: dict[str, float] = {}
    rows = children_of(db, child_entity_type, link_field, parent_id)
    for spec in sums or []:
        source = spec.get("from")
        target = spec.get("to")
        if not source or not target:
            continue
        total = 0.0
        for row in rows:
            try:
                total += float((row.custom_fields or {}).get(source) or 0)
            except (TypeError, ValueError):
                continue
        totals[target] = total
    return totals


def inherit_event(
    db: Session,
    *,
    parent_id: str,
    parent_fields: dict,
    child_entity_type: str,
    link_field: str,
    event: str,
    opt_in_field: Optional[str] = None,
    flow_control_field: Optional[str] = None,
    skip_events: Optional[list] = None,
    commit: bool = True,
) -> dict:
    skipped_events = {str(item).upper() for item in (skip_events or [])}
    if flow_control_field and _truthy(parent_fields.get(flow_control_field)) and event.upper() in skipped_events:
        return {"applied": [], "skipped": "flow_control"}
    applied = []
    skipped = []
    for child in children_of(db, child_entity_type, link_field, parent_id):
        if opt_in_field is not None and not _truthy((child.custom_fields or {}).get(opt_in_field)):
            skipped.append(child.id)
            continue
        try:
            if commit:
                propose_transition(
                    db=db,
                    entity_type=child_entity_type,
                    entity_id=child.id,
                    event_type=event,
                    actor_id="system:workflow-engine",
                    actor_type="system",
                    commit=True,
                    run_post_pipeline=False,
                )
            else:
                nested = db.begin_nested()
                try:
                    propose_transition(
                        db=db,
                        entity_type=child_entity_type,
                        entity_id=child.id,
                        event_type=event,
                        actor_id="system:workflow-engine",
                        actor_type="system",
                        commit=False,
                        run_post_pipeline=False,
                    )
                    nested.commit()
                except Exception:
                    nested.rollback()
                    raise
            applied.append(child.id)
        except Exception:
            skipped.append(child.id)
    return {"applied": applied, "skipped": skipped}


def parse_moment(value: Any) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def is_due(fields: dict, due_field: str, lead_days: float, now: Optional[datetime] = None) -> bool:
    due = parse_moment(fields.get(due_field))
    if due is None:
        return False
    moment = now or datetime.now(timezone.utc)
    return due <= moment + timedelta(days=float(lead_days or 0))


def asset_is_operating(db: Session, site_id: Optional[str], asset_id: Optional[str] = None, location_id: Optional[str] = None) -> bool:
    site = (site_id or "").strip().upper()
    if asset_id:
        asset = db.query(Asset).filter(Asset.site_id == site, Asset.asset_id == str(asset_id).strip().upper()).first()
        return bool(asset and (asset.status or "").upper() == "OPERATING")
    if location_id:
        location = db.query(Location).filter(Location.site_id == site, Location.location_id == str(location_id).strip().upper()).first()
        return bool(location and (location.status or "").upper() == "OPERATING")
    return False


def find_open_record(
    db: Session,
    entity_type: str,
    match: dict,
    closed_statuses: list,
    exclude_id: Optional[str] = None,
):
    closed = {str(item).strip().lower() for item in (closed_statuses or [])}
    model, _ = get_entity_models(entity_type)
    rows = db.query(model).filter(model.entity_type == entity_type.strip().lower()).all()
    for row in rows:
        if exclude_id and row.id == exclude_id:
            continue
        if (row.status or "").strip().lower() in closed:
            continue
        fields = row.custom_fields or {}
        if all(str(fields.get(key) or "") == str(value or "") for key, value in match.items()):
            return row
    return None


def require_lines(child_entity_type: str, link_field: str) -> None:
    if not child_entity_type or not link_field:
        raise CommandError("invalid_action", "A child entity type and link field are required.")
