import time
from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.database import get_db, Base, engine
from backend.models.entities import DynamicEntity, DynamicEntityEvent
from backend.models.entity_type import EntityTypeDefinition
from backend.models.workflow import WorkflowDefinition
from backend.models.conditions import ConditionDefinition
from backend.models.field_registry import EntityField
from backend.models.users import AppUser, AppRole
from backend.services.expiry_worker import check_and_expire_permits

router = APIRouter(prefix="/system", tags=["System & Admin"])
_start_time = time.time()

@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    registered = [et.name for et in db.query(EntityTypeDefinition).order_by(EntityTypeDefinition.name.asc()).all()]
    return {
        "status": "healthy",
        "service": "compassx-eam-backend",
        "version": "1.0.0",
        "uptime_seconds": round(time.time() - _start_time, 2),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "registered_entities": registered,
    }

@router.get("/stats")
def get_system_stats(db: Session = Depends(get_db)):
    entities_count = db.query(DynamicEntity).count()
    total_events = db.query(DynamicEntityEvent).count()
    entity_types_count = db.query(EntityTypeDefinition).count()
    workflows_count = db.query(WorkflowDefinition).count()
    conditions_count = db.query(ConditionDefinition).count()
    fields_count = db.query(EntityField).count()
    users_count = db.query(AppUser).count()

    return {
        "entities_count": entities_count,
        "entity_types_count": entity_types_count,
        "total_events": total_events,
        "workflows_count": workflows_count,
        "conditions_count": conditions_count,
        "fields_count": fields_count,
        "users_count": users_count,
    }

@router.get("/events")
def list_all_events(limit: int = 50, db: Session = Depends(get_db)):
    """
    Returns unified recent event audit stream across all entities.
    """
    events = db.query(DynamicEntityEvent).order_by(DynamicEntityEvent.transaction_time.desc()).limit(limit).all()
    return [e.to_dict() for e in events]

@router.post("/check-expiry")
def trigger_expiry_check(db: Session = Depends(get_db)):
    """
    Manually triggers the permit expiry checker (Section 7.4).
    """
    expired = check_and_expire_permits(db)
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "expired_count": len(expired),
        "expired_permits": expired,
    }
