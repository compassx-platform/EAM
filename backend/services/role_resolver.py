from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from backend.models.workflow_role import WorkflowRole
from backend.models.person import Person, PersonGroup, PersonGroupMember, PersonAvailability
from backend.models.base import utc_now


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _is_person_available(db: Session, person_id: str, check_time: Optional[datetime] = None) -> bool:
    """Checks if a person has an active unavailable window (Sick/Holiday/Other)."""
    t = _ensure_utc(check_time) or utc_now()
    records = (
        db.query(PersonAvailability)
        .filter(
            PersonAvailability.person_id == person_id,
            PersonAvailability.reason.in_(["Sick", "Holiday", "Other"]),
        )
        .all()
    )
    for unavail in records:
        af = _ensure_utc(unavail.available_from)
        at = _ensure_utc(unavail.available_to)
        if af and at and af <= t <= at:
            return False
    return True


def _get_active_delegate(db: Session, person: Person, check_time: Optional[datetime] = None) -> Optional[Person]:
    """Returns the active delegate Person if within the configured delegation window."""
    if not person.workflow_delegate_id:
        return None

    t = _ensure_utc(check_time) or utc_now()
    d_from = _ensure_utc(person.delegate_from)
    d_to = _ensure_utc(person.delegate_to)

    from_ok = d_from is None or d_from <= t
    to_ok = d_to is None or d_to >= t

    if from_ok and to_ok:
        delegate = db.query(Person).filter(Person.person_id == person.workflow_delegate_id).first()
        if delegate and delegate.status == "ACTIVE":
            return delegate
    return None


def _format_resolved_person(person: Person, is_delegate: bool = False, original_person_id: Optional[str] = None) -> Dict[str, Any]:
    return {
        "person_id": person.person_id,
        "display_name": person.display_name,
        "primary_email": person.primary_email,
        "phone": person.phone,
        "site": person.site,
        "status": person.status,
        "is_delegate": is_delegate,
        "original_person_id": original_person_id,
    }


def resolve_workflow_role(
    db: Session,
    role_id: str,
    custom_fields: Optional[Dict[str, Any]] = None,
    entity_data: Optional[Dict[str, Any]] = None,
    check_time: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Resolves a WorkflowRole dynamically based on its Maximo-aligned configuration.
    """
    role = db.query(WorkflowRole).filter(WorkflowRole.id == role_id).first()
    if not role:
        return {
            "role_id": role_id,
            "role_name": role_id,
            "role_type": "UNKNOWN",
            "resolved_persons": [],
            "resolved_emails": [],
            "trace": [f"Role '{role_id}' not found in database"],
            "resolution_summary": f"Role '{role_id}' does not exist",
        }

    return resolve_role_definition(
        db=db,
        role=role,
        custom_fields=custom_fields,
        entity_data=entity_data,
        check_time=check_time,
    )


def resolve_role_definition(
    db: Session,
    role: WorkflowRole,
    custom_fields: Optional[Dict[str, Any]] = None,
    entity_data: Optional[Dict[str, Any]] = None,
    check_time: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Resolves an in-memory or persisted WorkflowRole against entity context."""
    t = check_time or utc_now()
    fields = custom_fields or {}
    entity = entity_data or {}
    trace: List[str] = []
    resolved_persons: List[Dict[str, Any]] = []
    resolved_emails: List[str] = []

    role_type = (role.role_type or "PERSON").upper()
    trace.append(f"Resolving role '{role.name}' ({role.id}) with type '{role_type}'")

    if role_type == "PERSON":
        if not role.person_id:
            trace.append("No person_id configured for PERSON role")
        else:
            p = db.query(Person).filter(Person.person_id == role.person_id).first()
            if not p:
                trace.append(f"Person '{role.person_id}' not found")
            else:
                available = _is_person_available(db, p.person_id, t)
                delegate = _get_active_delegate(db, p, t)

                if delegate:
                    trace.append(f"Primary person '{p.display_name}' has active delegate '{delegate.display_name}' ({delegate.person_id})")
                    resolved_persons.append(_format_resolved_person(delegate, is_delegate=True, original_person_id=p.person_id))
                    if delegate.primary_email:
                        resolved_emails.append(delegate.primary_email)
                else:
                    if not available:
                        trace.append(f"Person '{p.display_name}' is currently unavailable (e.g. Leave/Sick) with no delegate configured")
                    else:
                        trace.append(f"Person '{p.display_name}' ({p.person_id}) is available")
                    resolved_persons.append(_format_resolved_person(p, is_delegate=False))
                    if p.primary_email:
                        resolved_emails.append(p.primary_email)

    elif role_type == "PERSON_GROUP":
        if not role.group_name:
            trace.append("No group_name configured for PERSON_GROUP role")
        else:
            group = db.query(PersonGroup).filter(PersonGroup.group_name == role.group_name).first()
            if not group:
                trace.append(f"PersonGroup '{role.group_name}' not found")
            else:
                members: List[PersonGroupMember] = group.members or []
                strategy = role.resolution_strategy or "broadcast"
                trace.append(f"PersonGroup '{group.group_name}' has {len(members)} member(s); strategy='{strategy}'")

                if strategy == "default_member":
                    # Look for is_group_default first
                    target_member = next((m for m in members if m.is_group_default and m.person and m.person.status == "ACTIVE"), None)
                    if not target_member and members:
                        target_member = members[0]

                    if target_member and target_member.person:
                        p = target_member.person
                        delegate = _get_active_delegate(db, p, t)
                        if delegate:
                            trace.append(f"Default member '{p.display_name}' delegated to '{delegate.display_name}'")
                            resolved_persons.append(_format_resolved_person(delegate, is_delegate=True, original_person_id=p.person_id))
                            if delegate.primary_email:
                                resolved_emails.append(delegate.primary_email)
                        else:
                            resolved_persons.append(_format_resolved_person(p, is_delegate=False))
                            if p.primary_email:
                                resolved_emails.append(p.primary_email)
                elif strategy == "sequence_first_available":
                    found = False
                    for m in members:
                        if not m.person or m.person.status != "ACTIVE":
                            continue
                        p = m.person
                        available = _is_person_available(db, p.person_id, t)
                        delegate = _get_active_delegate(db, p, t)
                        if available:
                            trace.append(f"First available sequenced member (seq {m.sequence}): '{p.display_name}' ({p.person_id})")
                            resolved_persons.append(_format_resolved_person(p, is_delegate=False))
                            if p.primary_email:
                                resolved_emails.append(p.primary_email)
                            found = True
                            break
                        elif delegate:
                            trace.append(f"Sequenced member (seq {m.sequence}) '{p.display_name}' unavailable, routing to active delegate '{delegate.display_name}'")
                            resolved_persons.append(_format_resolved_person(delegate, is_delegate=True, original_person_id=p.person_id))
                            if delegate.primary_email:
                                resolved_emails.append(delegate.primary_email)
                            found = True
                            break

                    if not found and members:
                        # Fallback to first member
                        p = members[0].person
                        if p:
                            trace.append(f"All members unavailable; fallback to first sequenced member '{p.display_name}'")
                            resolved_persons.append(_format_resolved_person(p, is_delegate=False))
                            if p.primary_email:
                                resolved_emails.append(p.primary_email)
                else:  # broadcast (default)
                    for m in members:
                        if not m.person or m.person.status != "ACTIVE":
                            continue
                        p = m.person
                        delegate = _get_active_delegate(db, p, t)
                        if delegate:
                            trace.append(f"Member '{p.display_name}' delegated to '{delegate.display_name}'")
                            resolved_persons.append(_format_resolved_person(delegate, is_delegate=True, original_person_id=p.person_id))
                            if delegate.primary_email:
                                resolved_emails.append(delegate.primary_email)
                        else:
                            resolved_persons.append(_format_resolved_person(p, is_delegate=False))
                            if p.primary_email:
                                resolved_emails.append(p.primary_email)

    elif role_type == "DATASET_ATTRIBUTE":
        attr_name = role.field_name
        if not attr_name:
            trace.append("No field_name configured for DATASET_ATTRIBUTE role")
        else:
            val = fields.get(attr_name) or entity.get(attr_name)
            if not val:
                trace.append(f"Record attribute '{attr_name}' is empty or not present in entity data")
            else:
                raw_id = str(val).strip()
                trace.append(f"Evaluating attribute '{attr_name}' with value '{raw_id}'")
                p = db.query(Person).filter((Person.person_id == raw_id.upper()) | (Person.primary_email == raw_id)).first()
                if p:
                    delegate = _get_active_delegate(db, p, t)
                    if delegate:
                        trace.append(f"Resolved attribute person '{p.display_name}' -> active delegate '{delegate.display_name}'")
                        resolved_persons.append(_format_resolved_person(delegate, is_delegate=True, original_person_id=p.person_id))
                        if delegate.primary_email:
                            resolved_emails.append(delegate.primary_email)
                    else:
                        trace.append(f"Resolved attribute person '{p.display_name}' ({p.person_id})")
                        resolved_persons.append(_format_resolved_person(p, is_delegate=False))
                        if p.primary_email:
                            resolved_emails.append(p.primary_email)
                else:
                    trace.append(f"No person record found matching attribute value '{raw_id}'")
                    if "@" in raw_id:
                        resolved_emails.append(raw_id)

    elif role_type == "EMAIL_ADDRESS":
        if role.email_address:
            resolved_emails.append(role.email_address)
            trace.append(f"Resolved static email address '{role.email_address}'")
        else:
            trace.append("No email_address configured for EMAIL_ADDRESS role")

    # Deduplicate resolved emails while preserving order
    unique_emails = list(dict.fromkeys(resolved_emails))

    summary = "; ".join(trace)
    return {
        "role_id": role.id,
        "role_name": role.name,
        "role_type": role_type,
        "resolved_persons": resolved_persons,
        "resolved_emails": unique_emails,
        "resolution_strategy": role.resolution_strategy,
        "trace": trace,
        "resolution_summary": summary,
    }
