from backend.routers.auth import router as auth_router
from backend.routers.fields import router as fields_router
from backend.routers.conditions import router as conditions_router
from backend.routers.workflows import router as workflows_router
from backend.routers.entities import router as entities_router
from backend.routers.system import router as system_router
from backend.routers.forms import router as forms_router
from backend.routers.actions import router as actions_router
from backend.routers.lists import router as lists_router
from backend.routers.entity_types import router as entity_types_router
from backend.routers.persons import router as persons_router, groups_router
from backend.routers.roles import router as roles_router
from backend.routers.tasks import router as tasks_router

__all__ = [
    "auth_router",
    "fields_router",
    "conditions_router",
    "workflows_router",
    "entities_router",
    "system_router",
    "forms_router",
    "actions_router",
    "lists_router",
    "entity_types_router",
    "persons_router",
    "groups_router",
    "roles_router",
    "tasks_router",
]
