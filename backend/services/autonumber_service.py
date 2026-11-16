"""Assign the next configured number when a record is created."""

from typing import Any, Dict

from sqlalchemy.orm import Session

from backend.models.autonumber import AutonumberSequence
from backend.models.field_registry import EntityField
from backend.models.organization import Organization, Site


class AutonumberError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def apply_autonumbers(db: Session, entity_type: str, custom_fields: Dict[str, Any]) -> Dict[str, Any]:
    """Fill empty text fields that follow an organization or site sequence."""
    fields = dict(custom_fields or {})
    definitions = db.query(EntityField).filter(EntityField.entity_type == entity_type.lower()).all()
    for definition in definitions:
        sequence = (definition.autonumber_sequence or "").strip()
        level = (definition.autonumber_level or "").strip()
        if not sequence or level not in ("organization", "site"):
            continue
        if definition.field_type != "text":
            continue
        current = fields.get(definition.field_name)
        if current is not None and str(current).strip() != "":
            continue
        fields[definition.field_name] = _next_value(db, fields, sequence, level)
    return fields


def _next_value(db: Session, fields: Dict[str, Any], sequence: str, level: str) -> str:
    site_id = _site_id(fields)
    org_id = _org_id(db, fields, level, site_id)
    site_key = site_id if level == "site" else ""
    row = (
        db.query(AutonumberSequence)
        .filter(
            AutonumberSequence.org_id == org_id,
            AutonumberSequence.sequence_name == sequence,
            AutonumberSequence.site_id == site_key,
        )
        .first()
    )
    if row is None:
        if level == "site":
            raise AutonumberError(
                f"Site sequence '{sequence}' is not configured for site '{site_id}'."
            )
        raise AutonumberError(
            f"Organization sequence '{sequence}' is not configured for organization '{org_id}'."
        )
    nxt = int(row.seed or 0) + 1
    row.seed = nxt
    db.flush()
    return f"{row.prefix or ''}{nxt}"


def _site_id(fields: Dict[str, Any]) -> str:
    for key in ("site_id", "site"):
        value = fields.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _org_id(db: Session, fields: Dict[str, Any], level: str, site_id: str) -> str:
    if site_id:
        site = db.query(Site).filter(Site.site_id == site_id).first()
        if site is None:
            raise AutonumberError(f"Site '{site_id}' is not defined.")
        return site.org_id
    if level == "site":
        raise AutonumberError("Choose a site on the record before it can take a site number.")
    explicit = str(fields.get("org_id") or "").strip()
    if explicit:
        return explicit
    org_ids = [row[0] for row in db.query(Organization.org_id).all()]
    if len(org_ids) == 1:
        return org_ids[0]
    raise AutonumberError("This record needs a site or organization so the number sequence can be chosen.")
