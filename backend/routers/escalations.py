import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.database import get_db
from backend.models.escalation import EscalationDefinition, EscalationLog
from backend.models.base import utc_now
from backend.services.escalation_engine import (
    seed_default_escalations,
    execute_single_escalation,
    run_all_active_escalations,
)

logger = logging.getLogger("escalations_router")
router = APIRouter(prefix="/escalations", tags=["escalations"])


class EscalationPointInput(BaseModel):
    id: Optional[str] = None
    elapsed_hours: float = 0.0
    reference_date_field: str = "expiry_date"
    filter_status: Optional[List[str]] = None
    condition_id: Optional[str] = None
    actions: List[Dict[str, Any]] = Field(default_factory=list)


class EscalationCreateInput(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    entity_type: str = "*"
    status: str = "ACTIVE"
    applies_to: str = "entity"
    condition_id: Optional[str] = None
    condition_sql: Optional[str] = None
    schedule_cron: Optional[str] = "*/5 * * * *"
    check_interval_seconds: int = 5
    points: List[Dict[str, Any]] = Field(default_factory=list)


class EscalationUpdateInput(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    entity_type: Optional[str] = None
    status: Optional[str] = None
    applies_to: Optional[str] = None
    condition_id: Optional[str] = None
    condition_sql: Optional[str] = None
    schedule_cron: Optional[str] = None
    check_interval_seconds: Optional[int] = None
    points: Optional[List[Dict[str, Any]]] = None


@router.get("")
def list_escalations(
    entity_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Lists all configured escalations with optional filters."""
    seed_default_escalations(db)
    query = db.query(EscalationDefinition)
    if entity_type and entity_type != "*":
        query = query.filter(EscalationDefinition.entity_type.in_([entity_type.lower(), "*"]))
    if status:
        query = query.filter(EscalationDefinition.status == status.upper())
    
    records = query.order_by(EscalationDefinition.is_system.desc(), EscalationDefinition.created_at.desc()).all()
    return [r.to_dict() for r in records]


@router.post("")
def create_escalation(
    payload: EscalationCreateInput,
    db: Session = Depends(get_db),
):
    """Creates a new Escalation record."""
    esc_id = (payload.id or payload.name.upper().replace(" ", "_")).strip()
    existing = db.query(EscalationDefinition).filter(EscalationDefinition.id == esc_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Escalation with ID '{esc_id}' already exists")

    rec = EscalationDefinition(
        id=esc_id,
        name=payload.name,
        description=payload.description or "",
        entity_type=payload.entity_type.lower(),
        status=payload.status.upper() if payload.status else "ACTIVE",
        applies_to=payload.applies_to,
        condition_id=payload.condition_id,
        condition_sql=payload.condition_sql,
        schedule_cron=payload.schedule_cron or "*/5 * * * *",
        check_interval_seconds=payload.check_interval_seconds or 5,
        points=payload.points or [],
        is_system=False,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec.to_dict()


@router.get("/logs")
def list_all_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """Returns recent escalation execution logs across the system."""
    logs = db.query(EscalationLog).order_by(desc(EscalationLog.execution_time)).limit(limit).all()
    return [l.to_dict() for l in logs]


@router.post("/run-all")
def run_all(db: Session = Depends(get_db)):
    """Manually triggers a check across all active escalations."""
    results = run_all_active_escalations(db)
    return {
        "executed": True,
        "triggered_count": len(results),
        "results": results,
    }


@router.get("/{escalation_id}")
def get_escalation(escalation_id: str, db: Session = Depends(get_db)):
    """Fetches a specific escalation by ID."""
    rec = db.query(EscalationDefinition).filter(EscalationDefinition.id == escalation_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"Escalation '{escalation_id}' not found")
    return rec.to_dict()


@router.put("/{escalation_id}")
def update_escalation(
    escalation_id: str,
    payload: EscalationUpdateInput,
    db: Session = Depends(get_db),
):
    """Updates an existing escalation."""
    rec = db.query(EscalationDefinition).filter(EscalationDefinition.id == escalation_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"Escalation '{escalation_id}' not found")

    if payload.name is not None:
        rec.name = payload.name
    if payload.description is not None:
        rec.description = payload.description
    if payload.entity_type is not None:
        rec.entity_type = payload.entity_type.lower()
    if payload.status is not None:
        rec.status = payload.status.upper()
    if payload.applies_to is not None:
        rec.applies_to = payload.applies_to
    if payload.condition_id is not None:
        rec.condition_id = payload.condition_id
    if payload.condition_sql is not None:
        rec.condition_sql = payload.condition_sql
    if payload.schedule_cron is not None:
        rec.schedule_cron = payload.schedule_cron
    if payload.check_interval_seconds is not None:
        rec.check_interval_seconds = payload.check_interval_seconds
    if payload.points is not None:
        rec.points = payload.points

    rec.updated_at = utc_now()
    db.commit()
    db.refresh(rec)
    return rec.to_dict()


@router.delete("/{escalation_id}")
def delete_escalation(escalation_id: str, db: Session = Depends(get_db)):
    """Deletes a user-defined escalation."""
    rec = db.query(EscalationDefinition).filter(EscalationDefinition.id == escalation_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"Escalation '{escalation_id}' not found")
    if rec.is_system:
        raise HTTPException(status_code=400, detail="System escalations cannot be deleted (deactivate them instead)")

    db.delete(rec)
    db.commit()
    return {"deleted": True, "id": escalation_id}


@router.post("/{escalation_id}/activate")
def toggle_activate_escalation(
    escalation_id: str,
    active: bool = Query(True),
    db: Session = Depends(get_db),
):
    """Activates or deactivates an escalation."""
    rec = db.query(EscalationDefinition).filter(EscalationDefinition.id == escalation_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"Escalation '{escalation_id}' not found")

    rec.status = "ACTIVE" if active else "INACTIVE"
    rec.updated_at = utc_now()
    db.commit()
    return {"id": rec.id, "status": rec.status}


@router.post("/{escalation_id}/run")
def run_single(escalation_id: str, db: Session = Depends(get_db)):
    """Manually executes a single escalation immediately."""
    rec = db.query(EscalationDefinition).filter(EscalationDefinition.id == escalation_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"Escalation '{escalation_id}' not found")

    results = execute_single_escalation(db, rec)
    return {
        "escalation_id": escalation_id,
        "executed": True,
        "triggered_count": len(results),
        "results": results,
    }


@router.get("/{escalation_id}/logs")
def get_escalation_logs(
    escalation_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Fetches execution logs for a specific escalation."""
    logs = (
        db.query(EscalationLog)
        .filter(EscalationLog.escalation_id == escalation_id)
        .order_by(desc(EscalationLog.execution_time))
        .limit(limit)
        .all()
    )
    return [l.to_dict() for l in logs]
