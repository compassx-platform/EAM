from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.users import AppUser, AppRole, app_user_role
from backend.models.base import generate_uuid

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
    active: bool
    roles: List[str]

@router.get("/users", response_model=List[UserResponse])
def list_users(db: Session = Depends(get_db)):
    users = db.query(AppUser).all()
    return [
        UserResponse(
            id=u.id,
            email=u.email,
            display_name=u.display_name,
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
        
    db.commit()
    db.refresh(user)
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        active=user.active,
        roles=[r.name for r in user.roles]
    )

@router.get("/me")
def get_current_actor(
    x_actor_id: Optional[str] = Header(None, alias="X-Actor-Id"),
    x_actor_role: Optional[str] = Header(None, alias="X-Actor-Role"),
    db: Session = Depends(get_db)
):
    """
    Returns active actor info based on request headers (or default user).
    Allows easy multi-persona simulation in the UI.
    """
    actor_id = x_actor_id or "admin@compassx.io"
    user = db.query(AppUser).filter((AppUser.email == actor_id) | (AppUser.id == actor_id)).first()
    
    if user:
        roles = [r.name for r in user.roles]
        if x_actor_role and x_actor_role not in roles:
            roles.append(x_actor_role)
        return {
            "actor_id": user.email,
            "display_name": user.display_name,
            "roles": roles,
            "active": user.active,
        }
    
    return {
        "actor_id": actor_id,
        "display_name": actor_id.split("@")[0].capitalize(),
        "roles": [x_actor_role] if x_actor_role else ["Admin"],
        "active": True,
    }
