from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.task_assignment import TaskAssignment
from backend.models.base import utc_now

router = APIRouter(prefix="/tasks", tags=["Task Assignments"])


class TaskStatusUpdate(BaseModel):
    status: str  # 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED'
    completed_by: Optional[str] = None


@router.get("/assignments")
def list_task_assignments(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    assigned_person_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(TaskAssignment)
    if entity_type:
        query = query.filter(TaskAssignment.entity_type == entity_type.lower())
    if entity_id:
        query = query.filter(TaskAssignment.entity_id == str(entity_id))
    if assigned_person_id:
        query = query.filter(TaskAssignment.assigned_person_id == assigned_person_id.upper())
    if status:
        query = query.filter(TaskAssignment.status == status.upper())

    assignments = query.order_by(TaskAssignment.created_at.desc()).all()
    return {"items": [a.to_dict() for a in assignments], "total": len(assignments)}


@router.get("/assignments/{task_id}")
def get_task_assignment(task_id: str, db: Session = Depends(get_db)):
    task = db.query(TaskAssignment).filter(TaskAssignment.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task assignment '{task_id}' not found")
    return task.to_dict()


@router.put("/assignments/{task_id}/status")
def update_task_status(task_id: str, payload: TaskStatusUpdate, db: Session = Depends(get_db)):
    task = db.query(TaskAssignment).filter(TaskAssignment.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail=f"Task assignment '{task_id}' not found")

    new_status = payload.status.upper()
    task.status = new_status
    if new_status in ("COMPLETED", "REJECTED"):
        task.completed_by = payload.completed_by
        task.completed_at = utc_now()
    db.commit()
    db.refresh(task)
    return task.to_dict()
