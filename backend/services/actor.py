from typing import List, Optional
from sqlalchemy.orm import Session
from backend.models.users import AppUser


def resolve_actor_roles(db: Session, actor_id: str, actor_roles: Optional[List[str]]) -> List[str]:
    """Resolves an actor to its role list.

    IBM Maximo alignment: an actor may be identified either by its app-native
    ``AppUser`` identity (email or id) or by its ``PERSONID`` (the User ID in
    capital letters, e.g. ``ALICE.SAFETY@COMPASSX.IO``). PERSONID resolves back
    to the linked app user via ``Person.primary_email``.
    """
    if actor_roles:
        return list(actor_roles)
    if actor_id:
        user = db.query(AppUser).filter((AppUser.email == actor_id) | (AppUser.id == actor_id)).first()
        if user:
            return [r.name for r in user.roles]

        try:
            from backend.models.person import Person
            person = (
                db.query(Person)
                .filter(Person.person_id == str(actor_id).upper())
                .first()
            )
            if person and person.primary_email:
                user = db.query(AppUser).filter(AppUser.email == person.primary_email).first()
                if user:
                    return [r.name for r in user.roles]
        except Exception:
            pass
    return []