from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.users import AppUser, AppRole, app_user_role
from backend.models.person import Person
from backend.models.base import generate_uuid
from backend.services.compassx_users import (
    CompassxUserError,
    actor_from_compassx,
    fetch_workspace_members,
    user_token_from_header,
)

router = APIRouter(prefix="/auth", tags=["Auth & RBAC"])

class UserCreateRequest(BaseModel):
    email: str
    display_name: str
    roles: List[str] = []

class RoleCreateRequest(BaseModel):
    name: str

class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    person_id: Optional[str] = None
    active: bool
    roles: List[str]

def _default_person_id(email: str) -> str:
    """Enterprise PERSONID = the User ID (the login id) in capital letters."""
    return email.strip().upper()

def _ensure_person_for_user(db: Session, email: str, display_name: str) -> Person:
    """Creates/returns the backing Person for an app user (1:1, Enterprise suite sync)."""
    pid = _default_person_id(email)
    person = db.query(Person).filter(Person.person_id == pid).first()
    if not person:
        person = Person(
            person_id=pid,
            display_name=display_name,
            primary_email=email.strip().lower(),
            status="ACTIVE",
            created_by="system",
        )
        db.add(person)
        db.flush()
    return person

def _compassx_or_http(
    token: Optional[str],
    workspace_id: Optional[str],
    workspace_slug: Optional[str],
):
    try:
        return actor_from_compassx(token, workspace_id, workspace_slug)
    except CompassxUserError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.get("/users", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    x_user_token: Optional[str] = Header(None, alias="X-Compassx-User-Token"),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
    x_workspace_slug: Optional[str] = Header(None, alias="X-Workspace-Slug"),
):
    token = user_token_from_header(x_user_token)
    if token and x_workspace_id:
        try:
            members = fetch_workspace_members(token, x_workspace_id, x_workspace_slug)
        except CompassxUserError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
        directory = []
        for member in members:
            if member.get("principal_type") != "user":
                continue
            email = member.get("email") or ""
            directory.append(UserResponse(
                id=str(member.get("user_id") or member.get("principal_id") or email),
                email=email,
                display_name=member.get("display_name") or email or "User",
                person_id=None,
                active=True,
                roles=[str(member["role_id"])] if member.get("role_id") else [],
            ))
        return directory

    users = db.query(AppUser).all()
    return [
        UserResponse(
            id=u.id,
            email=u.email,
            display_name=u.display_name,
            person_id=u.person_id,
            active=u.active,
            roles=[r.name for r in u.roles]
        )
        for u in users
    ]

@router.get("/roles")
def list_roles(db: Session = Depends(get_db)):
    roles = db.query(AppRole).all()
    return [r.to_dict() for r in roles]

@router.post("/roles")
def create_role(req: RoleCreateRequest, db: Session = Depends(get_db)):
    existing = db.query(AppRole).filter(AppRole.name == req.name).first()
    if existing:
        return existing.to_dict()
    role = AppRole(id=generate_uuid(), name=req.name)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role.to_dict()

@router.post("/users", response_model=UserResponse)
def create_user(req: UserCreateRequest, db: Session = Depends(get_db)):
    existing = db.query(AppUser).filter(AppUser.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with email already exists")
    
    user = AppUser(
        id=generate_uuid(),
        email=req.email,
        display_name=req.display_name,
        active=True
    )
    db.add(user)

    # Assign roles
    if req.roles:
        roles = db.query(AppRole).filter(AppRole.name.in_(req.roles)).all()
        user.roles = roles

    # Every user is backed by a Person (Enterprise EAM: PERSONID = User ID in caps)
    person = _ensure_person_for_user(db, user.email, user.display_name)
    user.person_id = person.person_id

    db.commit()
    db.refresh(user)
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        person_id=user.person_id,
        active=user.active,
        roles=[r.name for r in user.roles]
    )

@router.get("/me")
def get_current_actor(
    x_actor_id: Optional[str] = Header(None, alias="X-Actor-Id"),
    x_actor_role: Optional[str] = Header(None, alias="X-Actor-Role"),
    x_user_token: Optional[str] = Header(None, alias="X-Compassx-User-Token"),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
    x_workspace_slug: Optional[str] = Header(None, alias="X-Workspace-Slug"),
    db: Session = Depends(get_db)
):
    """
    Returns the signed-in CompassX user when the portal passed a user token.
    Otherwise falls back to the local actor header.
    """
    compassx = _compassx_or_http(x_user_token, x_workspace_id, x_workspace_slug)
    if compassx is not None:
        actor_id, roles, user = compassx
        if x_actor_role and x_actor_role not in roles:
            roles.append(x_actor_role)
        return {
            "id": user.get("id"),
            "email": user.get("email"),
            "actor_id": actor_id,
            "display_name": user.get("display_name") or actor_id,
            "person_id": None,
            "roles": roles,
            "active": user.get("status", "active") == "active",
        }

    actor_id = x_actor_id or "admin@compassx.io"
    user = db.query(AppUser).filter((AppUser.email == actor_id) | (AppUser.id == actor_id)).first()
    
    if user:
        roles = [r.name for r in user.roles]
        if x_actor_role and x_actor_role not in roles:
            roles.append(x_actor_role)
        return {
            "actor_id": user.email,
            "display_name": user.display_name,
            "person_id": user.person_id,
            "roles": roles,
            "active": user.active,
        }
    
    return {
        "actor_id": actor_id,
        "display_name": actor_id.split("@")[0].capitalize(),
        "roles": [x_actor_role] if x_actor_role else ["Admin"],
        "active": True,
    }
