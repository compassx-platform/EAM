from backend.routers.auth import router as auth_router
from backend.routers.fields import router as fields_router
from backend.routers.conditions import router as conditions_router
from backend.routers.workflows import router as workflows_router
from backend.routers.entities import router as entities_router
from backend.routers.system import router as system_router
from backend.routers.forms import router as forms_router
from backend.routers.actions import router as actions_router
from backend.routers.lists import router as lists_router

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
]
