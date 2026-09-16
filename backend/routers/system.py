import time
from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.database import get_db, Base, engine
from backend.models.entities import WorkOrder, WorkOrderEvent, Permit, PermitEvent, ENTITY_REGISTRY
from backend.models.workflow import WorkflowDefinition
from backend.models.conditions import ConditionDefinition
from backend.models.field_registry import EntityField
from backend.models.users import AppUser, AppRole
from backend.services.expiry_worker import check_and_expire_permits

router = APIRouter(prefix="/system", tags=["System & Admin"])
_start_time = time.time()

@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "compassx-eam-backend",
        "version": "1.0.0",
        "uptime_seconds": round(time.time() - _start_time, 2),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "registered_entities": list(ENTITY_REGISTRY.keys()),
    }

@router.get("/stats")
def get_system_stats(db: Session = Depends(get_db)):
    workorders_count = db.query(WorkOrder).count()
    permits_count = db.query(Permit).count()
    active_permits = db.query(Permit).filter(Permit.status == "Active").count()
    in_progress_wo = db.query(WorkOrder).filter(WorkOrder.status == "InProgress").count()
    total_events = db.query(WorkOrderEvent).count() + db.query(PermitEvent).count()
    workflows_count = db.query(WorkflowDefinition).count()
    conditions_count = db.query(ConditionDefinition).count()
    fields_count = db.query(EntityField).count()
    users_count = db.query(AppUser).count()

    return {
        "workorders": {
            "total": workorders_count,
            "in_progress": in_progress_wo,
        },
        "permits": {
            "total": permits_count,
            "active": active_permits,
        },
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
    wo_events = db.query(WorkOrderEvent).order_by(WorkOrderEvent.transaction_time.desc()).limit(limit).all()
    permit_events = db.query(PermitEvent).order_by(PermitEvent.transaction_time.desc()).limit(limit).all()

    combined = []
    for e in wo_events:
        d = e.to_dict()
        d["entity_type"] = "workorder"
        combined.append(d)
    for e in permit_events:
        d = e.to_dict()
        d["entity_type"] = "permit"
        combined.append(d)

    combined.sort(key=lambda x: x["transaction_time"] or "", reverse=True)
    return combined[:limit]

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

@router.post("/seed")
def reseed_database(db: Session = Depends(get_db)):
    """
    Reseeds default workflows, conditions, fields, users, and sample data.
    """
    from backend.seed_data import seed_all
    seed_all(db)
    return {"message": "Database successfully seeded with default workflows, conditions, users, and sample entities."}
