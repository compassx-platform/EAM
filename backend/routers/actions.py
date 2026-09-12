from typing import List
from fastapi import APIRouter
from backend.services.actions import ACTION_TYPES_CATALOG

router = APIRouter(prefix="/actions", tags=["Post-Transition Actions"])

@router.get("/types")
def get_action_types() -> List[dict]:
    """Returns the closed fixed registry of declarative side-effect action types."""
    return ACTION_TYPES_CATALOG