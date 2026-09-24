"""
People module MCP tools for CompassX EAM.

Provides tools for managing the People directory (persons, user accounts, supervisor
hierarchies, shifts, calendars, workflow delegations, availability windows, audit trails)
and Person Groups (crew work groups, sequence ordering, default member assignments).
"""

import re
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from backend.mcp_server.context import get_db_session
from backend.models.person import Person, PersonGroup, PersonGroupMember, PersonAvailability, PersonAudit
from backend.models.users import AppUser
from backend.models.workflow import WorkflowDefinition
from backend.models.entities import DynamicEntity
from backend.services.actor import resolve_actor_roles

PERSON_ID_RE = re.compile(r"^[A-Z0-9][A-Z0-9._@\-]{0,49}$")
GROUP_NAME_RE = re.compile(r"^[A-Z0-9][A-Z0-9._\-]{0,49}$")
AVAIL_REASONS = ["Holiday", "Sick", "Overtime", "Other"]
TERMINAL_FALLBACK = {"CLOSED", "CANCELED", "CANCELLED", "Rejected", "Expired"}


def _person_to_dict(db, person: Person) -> Dict[str, Any]:
    data = person.to_dict()
    user = db.query(AppUser).filter(AppUser.person_id == person.person_id).first()
    if user:
        data["user_id"] = user.email
        data["linked_roles"] = [r.name for r in user.roles]
    else:
        data["linked_roles"] = resolve_actor_roles(db, person.person_id, None)
    return data


def _normalize_person_id(raw: Optional[str], email: Optional[str]) -> str:
    if raw and raw.strip():
        candidate = raw.strip().upper()
    elif email and email.strip():
        local_part = email.strip().split("@")[0] if "@" in email else email.strip()
        candidate = local_part.upper()
    else:
        raise ValueError("person_id is required for standalone persons without login id")
    if not PERSON_ID_RE.match(candidate) or len(candidate) > 50:
        raise ValueError(f"person_id '{candidate}' is invalid — use uppercase alphanumeric, dots, underscores, dashes, @")
    return candidate


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        raise ValueError(f"Invalid ISO datetime '{value}'")


def _terminal_states(db, entity_type: str) -> set:
    wf = (
        db.query(WorkflowDefinition)
        .filter(WorkflowDefinition.entity_type == entity_type.lower(), WorkflowDefinition.status == "published")
        .order_by(WorkflowDefinition.published_at.desc(), WorkflowDefinition.created_at.desc())
        .first()
    )
    states = (wf.definition or {}).get("terminal_states") if wf and wf.definition else None
    if states:
        return {str(s) for s in states}
    return set(TERMINAL_FALLBACK)


def _workorders_referencing_person(db, person_id: str) -> List[Dict[str, Any]]:
    refs = []
    pid_u = person_id.upper()
    for ent in db.query(DynamicEntity).all():
        cf = ent.custom_fields or {}
        assigned = str(cf.get("assigned_to") or "").upper()
        owner = str(cf.get("owner") or "").upper()
        reported = str(cf.get("reported_by") or "").upper()
        if assigned == pid_u or owner == pid_u or reported == pid_u:
            terminal = _terminal_states(db, ent.entity_type)
            refs.append({
                "id": ent.id,
                "status": ent.status,
                "title": cf.get("title") or ent.id,
                "open": ent.status not in terminal,
            })
    return refs


def _permits_referencing_person(db, person_id: str) -> List[Dict[str, Any]]:
    refs = []
    pid_u = person_id.upper()
    for ent in db.query(DynamicEntity).all():
        cf = ent.custom_fields or {}
        owner = str(cf.get("owner") or "").upper()
        reported = str(cf.get("reported_by") or "").upper()
        affected = str(cf.get("affected_person") or "").upper()
        if owner == pid_u or reported == pid_u or affected == pid_u:
            terminal = _terminal_states(db, ent.entity_type)
            refs.append({
                "id": ent.id,
                "status": ent.status,
                "title": cf.get("title") or ent.id,
                "open": ent.status not in terminal,
            })
    return refs


def _inactivate_blockers(db, person: Person) -> List[str]:
    blockers: List[str] = []
    open_wos = [r for r in _workorders_referencing_person(db, person.person_id) if r["open"]]
    if open_wos:
        blockers.append(f"assigned to open record(s): {', '.join(r['id'] for r in open_wos[:3])}")

    for r in _permits_referencing_person(db, person.person_id):
        if r["open"]:
            blockers.append(f"owner/reporter on open record '{r['id']}'")
            break

    if db.query(Person).filter(Person.supervisor_id == person.person_id, Person.status == "ACTIVE").count():
        blockers.append("is the supervisor of active person(s)")

    now = datetime.now(timezone.utc)
    delegate_blockers = (
        db.query(Person)
        .filter(Person.workflow_delegate_id == person.person_id, Person.status == "ACTIVE")
        .all()
    )
    for d in delegate_blockers:
        dw_end = d.delegate_to
        if dw_end is None or (dw_end.tzinfo is not None and dw_end >= now) or (dw_end.tzinfo is None and dw_end.replace(tzinfo=timezone.utc) >= now):
            blockers.append(f"is the workflow delegate for '{d.person_id}'")
            break

    if db.query(PersonGroupMember).filter(PersonGroupMember.person_id == person.person_id).count():
        blockers.append("is a member of person group(s)")

    return blockers


# ---------------------------------------------------------------------------
# Person Tools
# ---------------------------------------------------------------------------

def people_list(
    status: Optional[str] = None,
    search: Optional[str] = None,
    group: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    List persons in the directory with optional status, search, and group filters.

    Args:
        status: Filter by status ('ACTIVE' | 'INACTIVE')
        search: Filter by person_id, display_name, or email
        group: Filter by Person Group membership
        limit: Max records to return (1-500)
        offset: Pagination offset
    """
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    with get_db_session() as db:
        query = db.query(Person)
        if status:
            query = query.filter(Person.status == status.strip().upper())
        if search:
            like = f"%{search.strip()}%"
            query = query.filter(
                (Person.person_id.ilike(like)) | (Person.display_name.ilike(like)) | (Person.primary_email.ilike(like))
            )
        if group:
            member_pids = [
                m.person_id
                for m in db.query(PersonGroupMember).filter(PersonGroupMember.group_name == group.strip().upper()).all()
            ]
            query = query.filter(Person.person_id.in_(member_pids))

        total = query.count()
        persons = query.order_by(Person.display_name.asc()).offset(offset).limit(limit).all()

        return {
            "success": True,
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": [_person_to_dict(db, p) for p in persons],
        }


def people_get(person_id: str) -> Dict[str, Any]:
    """
    Get detailed person profile, linked user account, and assigned roles.

    Args:
        person_id: Unique Person identifier (e.g. 'JOHN.DOE')
    """
    with get_db_session() as db:
        person = db.query(Person).filter(Person.person_id == person_id.strip().upper()).first()
        if not person:
            return {"success": False, "error": f"Person '{person_id}' not found"}
        return {"success": True, "person": _person_to_dict(db, person)}


def people_create(
    display_name: str,
    person_id: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    primary_email: Optional[str] = None,
    phone: Optional[str] = None,
    site: Optional[str] = None,
    supervisor_id: Optional[str] = None,
    primary_calendar: Optional[str] = None,
    primary_shift: Optional[str] = None,
    workflow_delegate_id: Optional[str] = None,
    delegate_from: Optional[str] = None,
    delegate_to: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a new person record in the directory.

    Args:
        display_name: Full display name (e.g. 'John Doe')
        person_id: Identifier (defaults to uppercase email prefix)
        first_name: First name
        last_name: Last name
        primary_email: Email address
        phone: Phone number
        site: Primary facility / site code
        supervisor_id: Supervisor PERSONID
        primary_calendar: Assigned work calendar code
        primary_shift: Assigned shift code (e.g. 'DAY', 'NIGHT')
        workflow_delegate_id: Person to delegate workflow approvals to
        delegate_from: Delegation start datetime (ISO 8601)
        delegate_to: Delegation end datetime (ISO 8601)
    """
    with get_db_session() as db:
        try:
            pid = _normalize_person_id(person_id, primary_email)
        except ValueError as e:
            return {"success": False, "error": str(e)}

        if db.query(Person).filter(Person.person_id == pid).first():
            return {"success": False, "error": f"Person '{pid}' already exists"}

        if primary_email and db.query(Person).filter(
            (Person.primary_email == primary_email.strip().lower()) & (Person.person_id != pid)
        ).first():
            return {"success": False, "error": f"Email '{primary_email}' already in use by another person"}

        if supervisor_id:
            sup = db.query(Person).filter(Person.person_id == supervisor_id.strip().upper()).first()
            if not sup or sup.status != "ACTIVE":
                return {"success": False, "error": f"Supervisor '{supervisor_id}' does not exist or is not ACTIVE"}

        if workflow_delegate_id:
            delg = db.query(Person).filter(Person.person_id == workflow_delegate_id.strip().upper()).first()
            if not delg or delg.status != "ACTIVE":
                return {"success": False, "error": f"Workflow delegate '{workflow_delegate_id}' does not exist or is not ACTIVE"}

        d_from = _parse_iso(delegate_from)
        d_to = _parse_iso(delegate_to)
        if d_from and d_to and d_from > d_to:
            return {"success": False, "error": "delegate_from must be <= delegate_to"}

        person = Person(
            person_id=pid,
            display_name=display_name.strip(),
            first_name=first_name.strip() if first_name else None,
            last_name=last_name.strip() if last_name else None,
            primary_email=primary_email.strip().lower() if primary_email else None,
            phone=phone.strip() if phone else None,
            site=site.strip() if site else None,
            supervisor_id=supervisor_id.strip().upper() if supervisor_id else None,
            primary_calendar=primary_calendar.strip() if primary_calendar else None,
            primary_shift=primary_shift.strip() if primary_shift else None,
            workflow_delegate_id=workflow_delegate_id.strip().upper() if workflow_delegate_id else None,
            delegate_from=d_from,
            delegate_to=d_to,
            status="ACTIVE",
            created_by="mcp_server",
        )
        db.add(person)
        db.commit()
        db.refresh(person)
        return {"success": True, "person": _person_to_dict(db, person)}


def people_update(
    person_id: str,
    display_name: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    primary_email: Optional[str] = None,
    phone: Optional[str] = None,
    site: Optional[str] = None,
    supervisor_id: Optional[str] = None,
    primary_calendar: Optional[str] = None,
    primary_shift: Optional[str] = None,
    workflow_delegate_id: Optional[str] = None,
    delegate_from: Optional[str] = None,
    delegate_to: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update person attributes and assignments.

    Args:
        person_id: Person identifier
        display_name: Updated display name
        first_name: Updated first name
        last_name: Updated last name
        primary_email: Updated email
        phone: Updated phone
        site: Updated site
        supervisor_id: Updated supervisor PERSONID
        primary_calendar: Updated work calendar
        primary_shift: Updated shift
        workflow_delegate_id: Updated workflow delegate
        delegate_from: Delegation start datetime
        delegate_to: Delegation end datetime
    """
    with get_db_session() as db:
        pid = person_id.strip().upper()
        person = db.query(Person).filter(Person.person_id == pid).first()
        if not person:
            return {"success": False, "error": f"Person '{person_id}' not found"}

        if primary_email is not None:
            email = primary_email.strip().lower()
            dup = db.query(Person).filter((Person.primary_email == email) & (Person.person_id != pid)).first()
            if dup:
                return {"success": False, "error": f"Email '{email}' already in use"}
            person.primary_email = email or None

        if display_name is not None:
            person.display_name = display_name.strip()
        if first_name is not None:
            person.first_name = first_name.strip() or None
        if last_name is not None:
            person.last_name = last_name.strip() or None
        if phone is not None:
            person.phone = phone.strip() or None
        if site is not None:
            person.site = site.strip() or None
        if supervisor_id is not None:
            person.supervisor_id = supervisor_id.strip().upper() if supervisor_id.strip() else None
        if workflow_delegate_id is not None:
            person.workflow_delegate_id = workflow_delegate_id.strip().upper() if workflow_delegate_id.strip() else None
        if primary_calendar is not None:
            person.primary_calendar = primary_calendar.strip() or None
        if primary_shift is not None:
            person.primary_shift = primary_shift.strip() or None
        if delegate_from is not None:
            person.delegate_from = _parse_iso(delegate_from)
        if delegate_to is not None:
            person.delegate_to = _parse_iso(delegate_to)

        db.commit()
        db.refresh(person)
        return {"success": True, "person": _person_to_dict(db, person)}


def people_delete(person_id: str) -> Dict[str, Any]:
    """
    Safely delete a person. Blocks deletion if linked to an active user account
    or if the person has open records / transactional history.

    Args:
        person_id: Person identifier
    """
    with get_db_session() as db:
        pid = person_id.strip().upper()
        person = db.query(Person).filter(Person.person_id == pid).first()
        if not person:
            return {"success": False, "error": f"Person '{person_id}' not found"}

        if db.query(AppUser).filter(AppUser.person_id == person.person_id).count():
            return {
                "success": False,
                "error": f"Person '{person_id}' is linked to an app user account — inactivate instead",
                "blockers": ["linked user account"],
            }

        blockers = _inactivate_blockers(db, person)
        if blockers:
            return {
                "success": False,
                "error": "Person has transactional history or dependencies — inactivate instead",
                "blockers": blockers,
            }

        db.delete(person)
        db.commit()
        return {"success": True, "deleted_person_id": pid}


def people_activate(person_id: str) -> Dict[str, Any]:
    """
    Activate a person profile and linked user account.

    Args:
        person_id: Person identifier
    """
    with get_db_session() as db:
        pid = person_id.strip().upper()
        person = db.query(Person).filter(Person.person_id == pid).first()
        if not person:
            return {"success": False, "error": f"Person '{person_id}' not found"}

        person.status = "ACTIVE"
        user = db.query(AppUser).filter(AppUser.person_id == person.person_id).first()
        if user:
            user.active = True
        db.commit()
        return {"success": True, "person_id": pid, "status": "ACTIVE"}


def people_inactivate(person_id: str) -> Dict[str, Any]:
    """
    Inactivate a person profile and cascades to deactivating linked user account.
    Checks for open work orders, permits, supervisor duties, or delegations first.

    Args:
        person_id: Person identifier
    """
    with get_db_session() as db:
        pid = person_id.strip().upper()
        person = db.query(Person).filter(Person.person_id == pid).first()
        if not person:
            return {"success": False, "error": f"Person '{person_id}' not found"}

        if person.status == "INACTIVE":
            return {"success": True, "person_id": pid, "already_inactive": True}

        blockers = _inactivate_blockers(db, person)
        if blockers:
            return {
                "success": False,
                "error": "Person cannot be inactivated due to active dependencies",
                "blockers": blockers,
            }

        person.status = "INACTIVE"
        cascade_user_id = None
        user = db.query(AppUser).filter(AppUser.person_id == person.person_id).first()
        if user:
            user.active = False
            cascade_user_id = user.email

        db.commit()
        return {
            "success": True,
            "person_id": pid,
            "status": "INACTIVE",
            "cascaded_user_id": cascade_user_id,
        }


def people_get_related(person_id: str) -> Dict[str, Any]:
    """
    Get all related records referencing a person (open workorders, permits,
    supervisees, and group memberships).

    Args:
        person_id: Person identifier
    """
    with get_db_session() as db:
        pid = person_id.strip().upper()
        person = db.query(Person).filter(Person.person_id == pid).first()
        if not person:
            return {"success": False, "error": f"Person '{person_id}' not found"}

        supervisees = [p.person_id for p in db.query(Person).filter(Person.supervisor_id == pid).all()]
        groups = [
            m.group_name
            for m in db.query(PersonGroupMember).filter(PersonGroupMember.person_id == pid).order_by(PersonGroupMember.group_name).all()
        ]

        return {
            "success": True,
            "person_id": pid,
            "workorders": _workorders_referencing_person(db, pid),
            "permits": _permits_referencing_person(db, pid),
            "supervises": supervisees,
            "groups": groups,
        }


def people_availability_list(person_id: str) -> Dict[str, Any]:
    """
    List scheduled availability and unavailability windows (Holiday, Sick, Overtime, Other).

    Args:
        person_id: Person identifier
    """
    with get_db_session() as db:
        pid = person_id.strip().upper()
        person = db.query(Person).filter(Person.person_id == pid).first()
        if not person:
            return {"success": False, "error": f"Person '{person_id}' not found"}

        rows = (
            db.query(PersonAvailability)
            .filter(PersonAvailability.person_id == pid)
            .order_by(PersonAvailability.available_from)
            .all()
        )
        return {"success": True, "person_id": pid, "count": len(rows), "items": [r.to_dict() for r in rows]}


def people_availability_create(
    person_id: str,
    reason: str,
    available_from: str,
    available_to: str,
) -> Dict[str, Any]:
    """
    Schedule an availability/unavailability window for a person.

    Args:
        person_id: Person identifier
        reason: Reason ('Holiday', 'Sick', 'Overtime', 'Other')
        available_from: Start ISO datetime
        available_to: End ISO datetime
    """
    if reason not in AVAIL_REASONS:
        return {"success": False, "error": f"reason must be one of {AVAIL_REASONS}"}

    with get_db_session() as db:
        pid = person_id.strip().upper()
        person = db.query(Person).filter(Person.person_id == pid).first()
        if not person:
            return {"success": False, "error": f"Person '{person_id}' not found"}

        try:
            d_from = _parse_iso(available_from)
            d_to = _parse_iso(available_to)
        except ValueError as e:
            return {"success": False, "error": str(e)}

        if d_from >= d_to:
            return {"success": False, "error": "available_from must be before available_to"}

        row = PersonAvailability(
            person_id=pid,
            reason=reason,
            available_from=d_from,
            available_to=d_to,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return {"success": True, "availability": row.to_dict()}


def people_audit_list(person_id: str) -> Dict[str, Any]:
    """
    Retrieve chronological audit trail of changes made to a person profile.

    Args:
        person_id: Person identifier
    """
    with get_db_session() as db:
        pid = person_id.strip().upper()
        person = db.query(Person).filter(Person.person_id == pid).first()
        if not person:
            return {"success": False, "error": f"Person '{person_id}' not found"}

        rows = (
            db.query(PersonAudit)
            .filter(PersonAudit.person_id == pid)
            .order_by(PersonAudit.occurred_at.desc())
            .limit(200)
            .all()
        )
        return {"success": True, "person_id": pid, "count": len(rows), "items": [r.to_dict() for r in rows]}


# ---------------------------------------------------------------------------
# Person Groups Tools
# ---------------------------------------------------------------------------

def people_groups_list(search: Optional[str] = None) -> Dict[str, Any]:
    """
    List Person Groups / Crew Work Groups.

    Args:
        search: Optional search term matching group name or description
    """
    with get_db_session() as db:
        query = db.query(PersonGroup)
        if search:
            like = f"%{search.strip()}%"
            query = query.filter((PersonGroup.group_name.ilike(like)) | (PersonGroup.description.ilike(like)))
        groups = query.order_by(PersonGroup.group_name.asc()).all()
        return {
            "success": True,
            "count": len(groups),
            "groups": [g.to_dict() for g in groups],
        }


def people_group_get(group_name: str) -> Dict[str, Any]:
    """
    Get detailed Person Group configuration including member roster and defaults.

    Args:
        group_name: Unique group identifier (e.g. 'ELECTRICAL_CREW')
    """
    with get_db_session() as db:
        gname = group_name.strip().upper()
        group = db.query(PersonGroup).filter(PersonGroup.group_name == gname).first()
        if not group:
            return {"success": False, "error": f"Person group '{group_name}' not found"}
        return {"success": True, "group": group.to_dict()}


def people_group_create(
    group_name: str,
    description: Optional[str] = None,
    is_crew_work_group: bool = False,
    use_for_org: Optional[str] = None,
    use_for_site: Optional[str] = None,
    members: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Create a new Person Group or Crew Work Group with optional initial members.

    Args:
        group_name: Unique group code (e.g. 'SAFETY_RESPONSE')
        description: Explanatory description
        is_crew_work_group: Whether this group functions as a work order crew
        use_for_org: Restrict to organization code
        use_for_site: Restrict to site code
        members: Optional list of members ({person_id, sequence, is_group_default})
    """
    with get_db_session() as db:
        gname = group_name.strip().upper()
        if not GROUP_NAME_RE.match(gname):
            return {"success": False, "error": f"group_name '{gname}' is invalid"}

        if db.query(PersonGroup).filter(PersonGroup.group_name == gname).first():
            return {"success": False, "error": f"Person group '{gname}' already exists"}

        group = PersonGroup(
            group_name=gname,
            description=description.strip() if description else None,
            is_crew_work_group=bool(is_crew_work_group),
            use_for_org=use_for_org.strip() if use_for_org else None,
            use_for_site=use_for_site.strip() if use_for_site else None,
        )
        db.add(group)
        db.flush()

        if members:
            seq = 1
            for m in members:
                pid = str(m.get("person_id", "")).strip().upper()
                p = db.query(Person).filter(Person.person_id == pid).first()
                if not p or p.status != "ACTIVE":
                    return {"success": False, "error": f"Member '{pid}' does not exist or is not ACTIVE"}
                db.add(PersonGroupMember(
                    group_name=gname,
                    person_id=pid,
                    sequence=m.get("sequence") or seq,
                    is_group_default=bool(m.get("is_group_default")),
                    is_org_default=bool(m.get("is_org_default")),
                    is_site_default=bool(m.get("is_site_default")),
                ))
                seq += 1

        db.commit()
        db.refresh(group)
        return {"success": True, "group": group.to_dict()}


def people_group_update(
    group_name: str,
    description: Optional[str] = None,
    is_crew_work_group: Optional[bool] = None,
    use_for_org: Optional[str] = None,
    use_for_site: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update person group metadata.

    Args:
        group_name: Group identifier
        description: New description
        is_crew_work_group: Toggle crew status
        use_for_org: Updated organization code
        use_for_site: Updated site code
    """
    with get_db_session() as db:
        gname = group_name.strip().upper()
        group = db.query(PersonGroup).filter(PersonGroup.group_name == gname).first()
        if not group:
            return {"success": False, "error": f"Person group '{group_name}' not found"}

        if description is not None:
            group.description = description.strip() or None
        if is_crew_work_group is not None:
            group.is_crew_work_group = bool(is_crew_work_group)
        if use_for_org is not None:
            group.use_for_org = use_for_org.strip() or None
        if use_for_site is not None:
            group.use_for_site = use_for_site.strip() or None

        db.commit()
        db.refresh(group)
        return {"success": True, "group": group.to_dict()}


def people_group_delete(group_name: str) -> Dict[str, Any]:
    """
    Safely delete a person group. Blocks deletion if referenced in entity records.

    Args:
        group_name: Group identifier
    """
    with get_db_session() as db:
        gname = group_name.strip().upper()
        group = db.query(PersonGroup).filter(PersonGroup.group_name == gname).first()
        if not group:
            return {"success": False, "error": f"Person group '{group_name}' not found"}

        used_by = [ent.id for ent in db.query(DynamicEntity).all() if (ent.custom_fields or {}).get("owner_group") == gname]
        if used_by:
            return {
                "success": False,
                "error": f"Group is referenced by entity records: {', '.join(used_by[:5])}",
                "blockers": used_by,
            }

        db.delete(group)
        db.commit()
        return {"success": True, "deleted_group": gname}


def people_group_member_add(
    group_name: str,
    person_id: str,
    sequence: Optional[int] = None,
    is_group_default: bool = False,
    is_org_default: bool = False,
    is_site_default: bool = False,
) -> Dict[str, Any]:
    """
    Add a person to a person group.

    Args:
        group_name: Group identifier
        person_id: Person identifier
        sequence: Priority / escalation sequence
        is_group_default: Set as default contact for this group
        is_org_default: Set as default contact for organization
        is_site_default: Set as default contact for site
    """
    with get_db_session() as db:
        gname = group_name.strip().upper()
        pid = person_id.strip().upper()

        group = db.query(PersonGroup).filter(PersonGroup.group_name == gname).first()
        if not group:
            return {"success": False, "error": f"Person group '{group_name}' not found"}

        person = db.query(Person).filter(Person.person_id == pid).first()
        if not person or person.status != "ACTIVE":
            return {"success": False, "error": f"Member '{pid}' does not exist or is not ACTIVE"}

        if db.query(PersonGroupMember).filter(
            PersonGroupMember.group_name == gname, PersonGroupMember.person_id == pid
        ).first():
            return {"success": False, "error": f"'{pid}' is already a member of '{gname}'"}

        seq = sequence
        if seq is None:
            max_seq = db.query(PersonGroupMember).filter(PersonGroupMember.group_name == gname).order_by(PersonGroupMember.sequence.desc()).first()
            seq = (max_seq.sequence + 1) if max_seq else 1

        if is_group_default:
            db.query(PersonGroupMember).filter(PersonGroupMember.group_name == gname).update({"is_group_default": False})

        db.add(PersonGroupMember(
            group_name=gname,
            person_id=pid,
            sequence=seq,
            is_group_default=bool(is_group_default),
            is_org_default=bool(is_org_default),
            is_site_default=bool(is_site_default),
        ))
        db.commit()
        db.refresh(group)
        return {"success": True, "group": group.to_dict()}


def people_group_member_update(
    group_name: str,
    person_id: str,
    sequence: Optional[int] = None,
    is_group_default: Optional[bool] = None,
    is_org_default: Optional[bool] = None,
    is_site_default: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Update member sequence or default status in a person group.

    Args:
        group_name: Group identifier
        person_id: Member person identifier
        sequence: New sequence number
        is_group_default: New group default flag
        is_org_default: New org default flag
        is_site_default: New site default flag
    """
    with get_db_session() as db:
        gname = group_name.strip().upper()
        pid = person_id.strip().upper()

        group = db.query(PersonGroup).filter(PersonGroup.group_name == gname).first()
        if not group:
            return {"success": False, "error": f"Person group '{group_name}' not found"}

        member = db.query(PersonGroupMember).filter(
            PersonGroupMember.group_name == gname, PersonGroupMember.person_id == pid
        ).first()
        if not member:
            return {"success": False, "error": f"Member '{pid}' not found in group '{gname}'"}

        if sequence is not None and sequence != member.sequence:
            member.sequence = sequence

        if is_group_default is True:
            db.query(PersonGroupMember).filter(PersonGroupMember.group_name == gname, PersonGroupMember.person_id != pid).update({"is_group_default": False})
            member.is_group_default = True
        elif is_group_default is False:
            member.is_group_default = False

        if is_org_default is not None:
            member.is_org_default = bool(is_org_default)
        if is_site_default is not None:
            member.is_site_default = bool(is_site_default)

        db.commit()
        db.refresh(group)
        return {"success": True, "group": group.to_dict()}


def people_group_member_remove(group_name: str, person_id: str) -> Dict[str, Any]:
    """
    Remove a member from a person group.

    Args:
        group_name: Group identifier
        person_id: Member person identifier to remove
    """
    with get_db_session() as db:
        gname = group_name.strip().upper()
        pid = person_id.strip().upper()

        group = db.query(PersonGroup).filter(PersonGroup.group_name == gname).first()
        if not group:
            return {"success": False, "error": f"Person group '{group_name}' not found"}

        member = db.query(PersonGroupMember).filter(
            PersonGroupMember.group_name == gname, PersonGroupMember.person_id == pid
        ).first()
        if not member:
            return {"success": False, "error": f"Member '{pid}' not found in group '{gname}'"}

        db.delete(member)
        db.commit()
        return {"success": True, "removed_member": pid, "group_name": gname}
