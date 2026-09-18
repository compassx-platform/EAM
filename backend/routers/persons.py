import re
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.person import Person, PersonGroup, PersonGroupMember, PersonAvailability, PersonAudit
from backend.models.users import AppUser
from backend.models.workflow import WorkflowDefinition
from backend.services.actor import resolve_actor_roles

PERSON_ID_RE = re.compile(r"^[A-Z0-9][A-Z0-9._@\-]{0,49}$")
GROUP_NAME_RE = re.compile(r"^[A-Z0-9][A-Z0-9._\-]{0,49}$")
AVAIL_REASONS = ["Holiday", "Sick", "Overtime", "Other"]
TERMINAL_FALLBACK = {"CLOSED", "CANCELED", "CANCELLED", "Rejected", "Expired"}

router = APIRouter(prefix="/persons", tags=["People Management"])
groups_router = APIRouter(prefix="/person-groups", tags=["Person Groups"])


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class PersonCreate(BaseModel):
    person_id: Optional[str] = None
    display_name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    primary_email: Optional[str] = None
    phone: Optional[str] = None
    site: Optional[str] = None
    supervisor_id: Optional[str] = None
    primary_calendar: Optional[str] = None
    primary_shift: Optional[str] = None
    workflow_delegate_id: Optional[str] = None
    delegate_from: Optional[str] = None
    delegate_to: Optional[str] = None


class PersonUpdate(BaseModel):
    display_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    primary_email: Optional[str] = None
    phone: Optional[str] = None
    site: Optional[str] = None
    supervisor_id: Optional[str] = None
    primary_calendar: Optional[str] = None
    primary_shift: Optional[str] = None
    workflow_delegate_id: Optional[str] = None
    delegate_from: Optional[str] = None
    delegate_to: Optional[str] = None


class AvailabilityCreate(BaseModel):
    reason: str
    available_from: str
    available_to: str


class MemberAdd(BaseModel):
    person_id: str
    sequence: Optional[int] = None
    is_group_default: Optional[bool] = False
    is_org_default: Optional[bool] = False
    is_site_default: Optional[bool] = False


class MemberUpdate(BaseModel):
    sequence: Optional[int] = None
    is_group_default: Optional[bool] = None
    is_org_default: Optional[bool] = None
    is_site_default: Optional[bool] = None


class PersonGroupCreate(BaseModel):
    group_name: str
    description: Optional[str] = None
    is_crew_work_group: Optional[bool] = False
    use_for_org: Optional[str] = None
    use_for_site: Optional[str] = None
    members: List[MemberAdd] = []


class PersonGroupUpdate(BaseModel):
    description: Optional[str] = None
    is_crew_work_group: Optional[bool] = None
    use_for_org: Optional[str] = None
    use_for_site: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _person_to_dict(db: Session, person: Person) -> Dict[str, Any]:
    data = person.to_dict()
    user = db.query(AppUser).filter(AppUser.person_id == person.person_id).first()
    if user:
        data["user_id"] = user.email
        data["linked_roles"] = [r.name for r in user.roles]
    else:
        data["linked_roles"] = resolve_actor_roles(db, person.person_id, None)
    return data


def _normalize_person_id(raw: Optional[str], email: Optional[str]) -> str:
    """Maximo PERSONID = the User ID (login id) in capital letters."""
    if raw and raw.strip():
        candidate = raw.strip().upper()
    elif email and email.strip():
        local_part = email.strip().split("@")[0] if "@" in email else email.strip()
        candidate = local_part.upper()
    else:
        raise HTTPException(status_code=400, detail="person_id is required for standalone persons (no login id)")
    if not PERSON_ID_RE.match(candidate) or len(candidate) > 50:
        raise HTTPException(
            status_code=400,
            detail=f"person_id '{candidate}' is invalid — use A-Z, 0-9, '.', '_', '-', '@', max 50 chars, starting with a letter/digit",
        )
    return candidate


def _get_person(db: Session, person_id: str) -> Person:
    person = db.query(Person).filter(Person.person_id == person_id.upper()).first()
    if not person:
        raise HTTPException(status_code=404, detail=f"Person '{person_id}' not found")
    return person


def _get_group(db: Session, group_name: str) -> PersonGroup:
    group = db.query(PersonGroup).filter(PersonGroup.group_name == group_name.upper()).first()
    if not group:
        raise HTTPException(status_code=404, detail=f"Person group '{group_name}' not found")
    return group


def _validate_person_refs(db: Session, supervisor_id: Optional[str], delegate_id: Optional[str], self_pid: Optional[str] = None):
    if supervisor_id:
        sup = db.query(Person).filter(Person.person_id == supervisor_id.upper()).first()
        if not sup or sup.status != "ACTIVE":
            raise HTTPException(status_code=400, detail=f"Supervisor '{supervisor_id}' does not exist or is not ACTIVE")
        if self_pid and sup.person_id == self_pid:
            raise HTTPException(status_code=400, detail="Person cannot be their own supervisor")
    if delegate_id:
        delg = db.query(Person).filter(Person.person_id == delegate_id.upper()).first()
        if not delg or delg.status != "ACTIVE":
            raise HTTPException(status_code=400, detail=f"Workflow delegate '{delegate_id}' does not exist or is not ACTIVE")
        if self_pid and delg.person_id == self_pid:
            raise HTTPException(status_code=400, detail="Person cannot be their own workflow delegate")


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid ISO datetime '{value}'")


def _terminal_states(db: Session, entity_type: str, workflow_version: str) -> set:
    wf = (
        db.query(WorkflowDefinition)
        .filter(WorkflowDefinition.entity_type == entity_type.lower(), WorkflowDefinition.version_label == workflow_version)
        .first()
    )
    states = (wf.definition or {}).get("terminal_states") if wf and wf.definition else None
    if states:
        return {str(s) for s in states}
    return set(TERMINAL_FALLBACK)


def _workorders_referencing_person(db: Session, person_id: str) -> List[Dict[str, Any]]:
    from backend.models.entities import WorkOrder
    refs = []
    pid_u = person_id.upper()
    for wo in db.query(WorkOrder).all():
        cf = wo.custom_fields or {}
        assigned = str(cf.get("assigned_to") or "").upper()
        owner = str(cf.get("owner") or "").upper()
        reported = str(cf.get("reported_by") or "").upper()
        if assigned == pid_u or owner == pid_u or reported == pid_u:
            terminal = _terminal_states(db, "workorder", wo.workflow_version)
            refs.append({
                "id": wo.id,
                "status": wo.status,
                "title": cf.get("title") or wo.id,
                "open": wo.status not in terminal,
            })
    return refs


def _permits_referencing_person(db: Session, person_id: str) -> List[Dict[str, Any]]:
    from backend.models.entities import Permit
    refs = []
    pid_u = person_id.upper()
    for p in db.query(Permit).all():
        cf = p.custom_fields or {}
        owner = str(cf.get("owner") or "").upper()
        reported = str(cf.get("reported_by") or "").upper()
        affected = str(cf.get("affected_person") or "").upper()
        if owner == pid_u or reported == pid_u or affected == pid_u:
            terminal = _terminal_states(db, "permit", p.workflow_version)
            refs.append({
                "id": p.id,
                "status": p.status,
                "title": cf.get("title") or p.id,
                "open": p.status not in terminal,
            })
    return refs


def _inactivate_blockers(db: Session, person: Person) -> List[str]:
    blockers: List[str] = []

    open_wos = [r for r in _workorders_referencing_person(db, person.person_id) if r["open"]]
    if open_wos:
        blockers.append(f"assigned to open work order(s): {', '.join(r['id'] for r in open_wos[:3])}")

    for r in _permits_referencing_person(db, person.person_id):
        if r["open"]:
            blockers.append(f"owner/reporter on open permit '{r['id']}'")
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
# Persons CRUD
# ---------------------------------------------------------------------------

@router.get("")
def list_persons(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    group: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Person)

    if status:
        query = query.filter(Person.status == status.upper())
    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            (Person.person_id.ilike(like)) | (Person.display_name.ilike(like)) | (Person.primary_email.ilike(like))
        )
    if group:
        member_pids = [
            m.person_id
            for m in db.query(PersonGroupMember).filter(PersonGroupMember.group_name == group.upper()).all()
        ]
        query = query.filter(Person.person_id.in_(member_pids))

    total = query.count()
    persons = query.order_by(Person.display_name.asc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [_person_to_dict(db, p) for p in persons],
    }


@router.post("", status_code=201)
def create_person(req: PersonCreate, db: Session = Depends(get_db)):
    person_id = _normalize_person_id(req.person_id, req.primary_email)
    if db.query(Person).filter(Person.person_id == person_id).first():
        raise HTTPException(status_code=400, detail=f"Person '{person_id}' already exists")

    if req.primary_email and db.query(Person).filter(
        (Person.primary_email == req.primary_email.strip().lower()) & (Person.person_id != person_id)
    ).first():
        raise HTTPException(status_code=400, detail=f"Email '{req.primary_email}' already in use by another person")

    _validate_person_refs(db, req.supervisor_id, req.workflow_delegate_id, person_id)

    d_from = _parse_iso(req.delegate_from)
    d_to = _parse_iso(req.delegate_to)
    if d_from and d_to and d_from > d_to:
        raise HTTPException(status_code=400, detail="delegate_from must be <= delegate_to")

    person = Person(
        person_id=person_id,
        display_name=req.display_name.strip(),
        first_name=req.first_name.strip() if req.first_name else None,
        last_name=req.last_name.strip() if req.last_name else None,
        primary_email=req.primary_email.strip().lower() if req.primary_email else None,
        phone=req.phone.strip() if req.phone else None,
        site=req.site.strip() if req.site else None,
        supervisor_id=req.supervisor_id.upper() if req.supervisor_id else None,
        primary_calendar=req.primary_calendar.strip() if req.primary_calendar else None,
        primary_shift=req.primary_shift.strip() if req.primary_shift else None,
        workflow_delegate_id=req.workflow_delegate_id.upper() if req.workflow_delegate_id else None,
        delegate_from=d_from,
        delegate_to=d_to,
        status="ACTIVE",
        created_by="api",
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return _person_to_dict(db, person)


@router.get("/{person_id}")
def get_person(person_id: str, db: Session = Depends(get_db)):
    person = _get_person(db, person_id)
    return _person_to_dict(db, person)


@router.put("/{person_id}")
def update_person(person_id: str, req: PersonUpdate, db: Session = Depends(get_db)):
    person = _get_person(db, person_id)

    if req.primary_email is not None:
        email = req.primary_email.strip().lower()
        dup = db.query(Person).filter((Person.primary_email == email) & (Person.person_id != person.person_id)).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"Email '{email}' already in use by another person")
        person.primary_email = email or None

    if req.display_name is not None:
        person.display_name = req.display_name.strip()
    if req.first_name is not None:
        person.first_name = req.first_name.strip() or None
    if req.last_name is not None:
        person.last_name = req.last_name.strip() or None
    if req.phone is not None:
        person.phone = req.phone.strip() or None
    if req.site is not None:
        person.site = req.site.strip() or None
    if req.supervisor_id is not None:
        person.supervisor_id = req.supervisor_id.upper() if req.supervisor_id.strip() else None
    if req.workflow_delegate_id is not None:
        person.workflow_delegate_id = req.workflow_delegate_id.upper() if req.workflow_delegate_id.strip() else None
    if req.primary_calendar is not None:
        person.primary_calendar = req.primary_calendar.strip() or None
    if req.primary_shift is not None:
        person.primary_shift = req.primary_shift.strip() or None
    if req.delegate_from is not None:
        person.delegate_from = _parse_iso(req.delegate_from)
    if req.delegate_to is not None:
        person.delegate_to = _parse_iso(req.delegate_to)

    _validate_person_refs(db, person.supervisor_id, person.workflow_delegate_id, person.person_id)
    if person.delegate_from and person.delegate_to and person.delegate_from > person.delegate_to:
        raise HTTPException(status_code=400, detail="delegate_from must be <= delegate_to")

    db.commit()
    db.refresh(person)
    return _person_to_dict(db, person)


@router.delete("/{person_id}")
def delete_person(person_id: str, db: Session = Depends(get_db)):
    person = _get_person(db, person_id)

    if db.query(AppUser).filter(AppUser.person_id == person.person_id).count():
        raise HTTPException(
            status_code=409,
            detail={
                "error_code": "delete_blocked",
                "message": f"Person '{person_id}' is linked to an app user — inactivate instead.",
                "blockers": ["linked user account"],
            },
        )
    blockers = _inactivate_blockers(db, person)
    if blockers:
        raise HTTPException(
            status_code=409,
            detail={"error_code": "delete_blocked", "message": "Person has transactional history — inactivate instead.", "blockers": blockers},
        )

    db.delete(person)
    db.commit()
    return {"deleted": True, "person_id": person.person_id}


@router.post("/{person_id}/inactivate")
def inactivate_person(person_id: str, db: Session = Depends(get_db)):
    person = _get_person(db, person_id)
    if person.status == "INACTIVE":
        return {"inactivated": True, "person_id": person.person_id, "already": True}

    blockers = _inactivate_blockers(db, person)
    if blockers:
        raise HTTPException(
            status_code=422,
            detail={"error_code": "inactivate_blocked", "message": "Person cannot be inactivated.", "blockers": blockers},
        )

    person.status = "INACTIVE"
    cascade_user_id = None
    user = db.query(AppUser).filter(AppUser.person_id == person.person_id).first()
    if user:
        user.active = False
        cascade_user_id = user.email

    db.commit()
    return {"inactivated": True, "person_id": person.person_id, "inactivated_user_id": cascade_user_id}


@router.post("/{person_id}/activate")
def activate_person(person_id: str, db: Session = Depends(get_db)):
    person = _get_person(db, person_id)
    person.status = "ACTIVE"
    user = db.query(AppUser).filter(AppUser.person_id == person.person_id).first()
    if user:
        user.active = True
    db.commit()
    return {"activated": True, "person_id": person.person_id}


@router.get("/{person_id}/related")
def person_related(person_id: str, db: Session = Depends(get_db)):
    person = _get_person(db, person_id)
    supervisees = [p.person_id for p in db.query(Person).filter(Person.supervisor_id == person.person_id).all()]
    groups = [
        m.group_name
        for m in db.query(PersonGroupMember).filter(PersonGroupMember.person_id == person.person_id).order_by(PersonGroupMember.group_name).all()
    ]
    return {
        "person_id": person.person_id,
        "workorders": _workorders_referencing_person(db, person.person_id),
        "permits": _permits_referencing_person(db, person.person_id),
        "supervises": supervisees,
        "groups": groups,
    }


# Availability (Phase 1-lite)

@router.post("/{person_id}/availability", status_code=201)
def create_availability(person_id: str, req: AvailabilityCreate, db: Session = Depends(get_db)):
    person = _get_person(db, person_id)
    if req.reason not in AVAIL_REASONS:
        raise HTTPException(status_code=400, detail=f"reason must be one of {AVAIL_REASONS}")
    d_from = _parse_iso(req.available_from)
    d_to = _parse_iso(req.available_to)
    if d_from >= d_to:
        raise HTTPException(status_code=400, detail="available_from must be < available_to")

    def _make_aware(dt: datetime) -> datetime:
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt

    existing = db.query(PersonAvailability).filter(PersonAvailability.person_id == person.person_id).all()
    for row in existing:
        r_from = _make_aware(row.available_from)
        r_to = _make_aware(row.available_to)
        if r_from < d_to and d_from < r_to:
            raise HTTPException(status_code=409, detail="Availability window overlaps an existing window")

    row = PersonAvailability(
        person_id=person.person_id,
        reason=req.reason,
        available_from=d_from,
        available_to=d_to,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.to_dict()


@router.get("/{person_id}/availability")
def list_availability(person_id: str, db: Session = Depends(get_db)):
    person = _get_person(db, person_id)
    rows = db.query(PersonAvailability).filter(PersonAvailability.person_id == person.person_id).order_by(PersonAvailability.available_from).all()
    return {"person_id": person.person_id, "items": [r.to_dict() for r in rows]}


@router.get("/{person_id}/audit")
def list_person_audit(person_id: str, db: Session = Depends(get_db)):
    person = _get_person(db, person_id)
    rows = db.query(PersonAudit).filter(PersonAudit.person_id == person.person_id).order_by(PersonAudit.occurred_at.desc()).limit(200).all()
    return {"person_id": person.person_id, "items": [r.to_dict() for r in rows]}


# ---------------------------------------------------------------------------
# Person Groups CRUD
# ---------------------------------------------------------------------------

def _group_summary(group: PersonGroup) -> Dict[str, Any]:
    data = group.to_dict()
    data.pop("members", None)
    return data


@groups_router.get("")
def list_groups(search: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = db.query(PersonGroup)
    if search:
        like = f"%{search.strip()}%"
        query = query.filter((PersonGroup.group_name.ilike(like)) | (PersonGroup.description.ilike(like)))
    groups = query.order_by(PersonGroup.group_name.asc()).all()
    return {"items": [_group_summary(g) for g in groups]}


@groups_router.post("", status_code=201)
def create_group(req: PersonGroupCreate, db: Session = Depends(get_db)):
    group_name = req.group_name.strip().upper()
    if not GROUP_NAME_RE.match(group_name):
        raise HTTPException(status_code=400, detail=f"group_name '{group_name}' is invalid")
    if db.query(PersonGroup).filter(PersonGroup.group_name == group_name).first():
        raise HTTPException(status_code=400, detail=f"Person group '{group_name}' already exists")

    group = PersonGroup(
        group_name=group_name,
        description=req.description.strip() if req.description else None,
        is_crew_work_group=bool(req.is_crew_work_group),
        use_for_org=req.use_for_org.strip() if req.use_for_org else None,
        use_for_site=req.use_for_site.strip() if req.use_for_site else None,
    )
    db.add(group)
    db.flush()

    _replace_members(db, group, req.members)
    db.commit()
    db.refresh(group)
    return group.to_dict()


@groups_router.get("/{group_name}")
def get_group(group_name: str, db: Session = Depends(get_db)):
    return _get_group(db, group_name).to_dict()


@groups_router.put("/{group_name}")
def update_group(group_name: str, req: PersonGroupUpdate, db: Session = Depends(get_db)):
    group = _get_group(db, group_name)
    if req.description is not None:
        group.description = req.description.strip() or None
    if req.is_crew_work_group is not None:
        group.is_crew_work_group = req.is_crew_work_group
    if req.use_for_org is not None:
        group.use_for_org = req.use_for_org.strip() or None
    if req.use_for_site is not None:
        group.use_for_site = req.use_for_site.strip() or None
    db.commit()
    db.refresh(group)
    return group.to_dict()


@groups_router.delete("/{group_name}")
def delete_group(group_name: str, db: Session = Depends(get_db)):
    group = _get_group(db, group_name)
    from backend.models.entities import WorkOrder
    used_by = [wo.id for wo in db.query(WorkOrder).all() if (wo.custom_fields or {}).get("owner_group") == group.group_name]
    if used_by:
        raise HTTPException(
            status_code=409,
            detail={"error_code": "delete_blocked", "message": "Group is referenced by work orders.", "blockers": [f"work order '{uid}'" for uid in used_by[:5]]},
        )
    db.delete(group)
    db.commit()
    return {"deleted": True, "group_name": group.group_name}


# Members

def _replace_members(db: Session, group: PersonGroup, members: List[MemberAdd]):
    existing = db.query(PersonGroupMember).filter(PersonGroupMember.group_name == group.group_name).all()
    for m in existing:
        db.delete(m)

    seq = 1
    defaults_at = [m for m in members if m.is_group_default]
    if len(defaults_at) > 1:
        raise HTTPException(status_code=400, detail="Only one group default member is allowed")

    for m in members:
        pid = m.person_id.strip().upper()
        person = db.query(Person).filter(Person.person_id == pid).first()
        if not person or person.status != "ACTIVE":
            raise HTTPException(status_code=400, detail=f"Member '{pid}' does not exist or is not ACTIVE")
        db.add(PersonGroupMember(
            group_name=group.group_name,
            person_id=pid,
            sequence=m.sequence if m.sequence else seq,
            is_group_default=bool(m.is_group_default),
            is_org_default=bool(m.is_org_default),
            is_site_default=bool(m.is_site_default),
        ))
        seq += 1


@groups_router.post("/{group_name}/members", status_code=201)
def add_member(group_name: str, req: MemberAdd, db: Session = Depends(get_db)):
    group = _get_group(db, group_name)
    pid = req.person_id.strip().upper()
    person = db.query(Person).filter(Person.person_id == pid).first()
    if not person or person.status != "ACTIVE":
        raise HTTPException(status_code=400, detail=f"Member '{pid}' does not exist or is not ACTIVE")
    if db.query(PersonGroupMember).filter(
        PersonGroupMember.group_name == group.group_name, PersonGroupMember.person_id == pid
    ).first():
        raise HTTPException(status_code=400, detail=f"'{pid}' is already a member of '{group.group_name}'")

    sequence = req.sequence
    if sequence is None:
        max_seq = db.query(PersonGroupMember).filter(PersonGroupMember.group_name == group.group_name).order_by(PersonGroupMember.sequence.desc()).first()
        sequence = (max_seq.sequence + 1) if max_seq else 1
    if db.query(PersonGroupMember).filter(
        PersonGroupMember.group_name == group.group_name, PersonGroupMember.sequence == sequence
    ).first():
        raise HTTPException(status_code=409, detail="Sequence already used by another member")

    if req.is_group_default:
        db.query(PersonGroupMember).filter(PersonGroupMember.group_name == group.group_name).update({"is_group_default": False})

    db.add(PersonGroupMember(
        group_name=group.group_name,
        person_id=pid,
        sequence=sequence,
        is_group_default=bool(req.is_group_default),
        is_org_default=bool(req.is_org_default),
        is_site_default=bool(req.is_site_default),
    ))
    db.commit()
    return _get_group(db, group.group_name).to_dict()


@groups_router.put("/{group_name}/members/{person_id}")
def update_member(group_name: str, person_id: str, req: MemberUpdate, db: Session = Depends(get_db)):
    _get_group(db, group_name)
    member = db.query(PersonGroupMember).filter(
        PersonGroupMember.group_name == group_name.upper(), PersonGroupMember.person_id == person_id.upper()
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in group")

    if req.sequence is not None and req.sequence != member.sequence:
        clash = db.query(PersonGroupMember).filter(
            PersonGroupMember.group_name == member.group_name,
            PersonGroupMember.sequence == req.sequence,
            PersonGroupMember.person_id != member.person_id,
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Sequence already used by another member")
        member.sequence = req.sequence
    for key, value in [("is_group_default", req.is_group_default), ("is_org_default", req.is_org_default), ("is_site_default", req.is_site_default)]:
        if value is not None:
            setattr(member, key, value)
    db.commit()
    return _get_group(db, member.group_name).to_dict()


@groups_router.delete("/{group_name}/members/{person_id}")
def remove_member(group_name: str, person_id: str, db: Session = Depends(get_db)):
    _get_group(db, group_name)
    member = db.query(PersonGroupMember).filter(
        PersonGroupMember.group_name == group_name.upper(), PersonGroupMember.person_id == person_id.upper()
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in group")
    db.delete(member)
    db.commit()
    return {"deleted": True, "group_name": group_name.upper(), "person_id": person_id.upper()}