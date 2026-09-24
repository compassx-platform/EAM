"""
User and actor context MCP tools for CompassX EAM.

Provides tools for inspecting, discovering, and switching the active user identity
on whose behalf the agent performs operations across all modules.
"""

from typing import Dict, Any, Optional, List
from backend.mcp_server.context import (
    get_db_session,
    get_current_actor,
    set_current_actor,
    get_actor_info,
)
from backend.models.users import AppUser, AppRole
from backend.models.person import Person


def user_set_active_actor(
    actor_id: str,
    actor_type: str = "human",
    actor_roles: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Set the default active user/actor identity on whose behalf subsequent MCP operations
    will be executed.

    Args:
        actor_id: User email (e.g. 'alice.safety@compassx.io') or PERSONID (e.g. 'ALICE.SAFETY')
        actor_type: 'human' | 'system' (default 'human')
        actor_roles: Optional explicit RBAC roles (resolved automatically if omitted)
    """
    with get_db_session() as db:
        ctx = set_current_actor(actor_id, actor_type, actor_roles)
        info = get_actor_info(db, ctx.actor_id)
        return {
            "success": True,
            "active_actor_id": ctx.actor_id,
            "actor_type": ctx.actor_type,
            "resolved_roles": info["resolved_roles"],
            "user_account": info["user_account"],
            "person_profile": info["person_profile"],
        }


def user_get_active_actor() -> Dict[str, Any]:
    """
    Inspect the currently active default user identity and resolved permissions.
    """
    with get_db_session() as db:
        info = get_actor_info(db)
        ctx = get_current_actor()
        return {
            "success": True,
            "active_actor_id": ctx.actor_id,
            "actor_type": ctx.actor_type,
            "explicit_roles": ctx.actor_roles,
            "effective_roles": info["resolved_roles"],
            "user_account": info["user_account"],
            "person_profile": info["person_profile"],
        }


def user_list_available_actors(limit: int = 50) -> Dict[str, Any]:
    """
    List active users and persons in the platform available to act on behalf of.

    Args:
        limit: Max items to return
    """
    limit = max(1, min(limit, 200))
    with get_db_session() as db:
        users = db.query(AppUser).filter(AppUser.active == True).limit(limit).all()
        persons = db.query(Person).filter(Person.status == "ACTIVE").limit(limit).all()

        return {
            "success": True,
            "user_count": len(users),
            "person_count": len(persons),
            "users": [u.to_dict() for u in users],
            "persons": [p.to_dict() for p in persons],
        }


def user_list_roles() -> Dict[str, Any]:
    """
    List all configured RBAC roles in the platform.
    """
    with get_db_session() as db:
        roles = db.query(AppRole).order_by(AppRole.name.asc()).all()
        return {
            "success": True,
            "count": len(roles),
            "roles": [r.to_dict() for r in roles],
        }
