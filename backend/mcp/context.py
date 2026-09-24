"""
Context management for acting on behalf of users in CompassX EAM MCP Server.

Provides:
- Session-level default actor context
- Dynamic resolution of actors and their RBAC roles (AppUser and Person / PERSONID)
- Helper for executing actions on behalf of a specific user or the current active user
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple, Dict, Any
from contextlib import contextmanager
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models.users import AppUser, AppRole
from backend.models.person import Person
from backend.services.actor import resolve_actor_roles


@dataclass
class ActorContext:
    actor_id: str = "admin@compassx.io"
    actor_type: str = "human"  # 'human' | 'system'
    actor_roles: Optional[List[str]] = None


# Module-level default actor context for the MCP server session
_current_actor = ActorContext()


@contextmanager
def get_db_session():
    """Context manager for obtaining a database session in MCP tools."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_actor() -> ActorContext:
    """Returns the current active default actor context."""
    return _current_actor


def set_current_actor(actor_id: str, actor_type: str = "human", actor_roles: Optional[List[str]] = None) -> ActorContext:
    """Sets the active default actor context for subsequent MCP tool calls."""
    global _current_actor
    _current_actor = ActorContext(
        actor_id=actor_id.strip(),
        actor_type=actor_type.strip(),
        actor_roles=list(actor_roles) if actor_roles else None,
    )
    return _current_actor


def resolve_effective_actor(
    db: Session,
    on_behalf_of: Optional[str] = None,
    actor_type: Optional[str] = None,
    actor_roles: Optional[List[str]] = None,
) -> Tuple[str, str, List[str]]:
    """
    Resolves the effective actor (actor_id, actor_type, roles) for a tool execution.

    If `on_behalf_of` is explicitly provided, it overrides the default session actor.
    Roles are automatically resolved from the database via AppUser / Person linkage
    unless explicitly passed.
    """
    current = get_current_actor()
    effective_actor_id = on_behalf_of.strip() if on_behalf_of and on_behalf_of.strip() else current.actor_id
    effective_actor_type = actor_type.strip() if actor_type and actor_type.strip() else current.actor_type

    # Explicit roles passed to the call, or fallback to session context roles
    explicit_roles = actor_roles if actor_roles is not None else current.actor_roles

    # Resolve roles against database (AppUser and Person)
    resolved_roles = list(resolve_actor_roles(db, effective_actor_id, explicit_roles))

    return effective_actor_id, effective_actor_type, resolved_roles


def get_actor_info(db: Session, actor_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Inspects and returns detailed information about an actor, including linked user,
    person profile, and effective roles.
    """
    target_id = (actor_id or get_current_actor().actor_id).strip()
    roles = list(resolve_actor_roles(db, target_id, None))

    user = db.query(AppUser).filter((AppUser.email == target_id) | (AppUser.id == target_id)).first()
    person = db.query(Person).filter(
        (Person.person_id == target_id.upper()) | (Person.primary_email == target_id.lower())
    ).first()

    return {
        "actor_id": target_id,
        "is_current_session_actor": target_id == get_current_actor().actor_id,
        "resolved_roles": roles,
        "user_account": user.to_dict() if user else None,
        "person_profile": person.to_dict() if person else None,
    }
