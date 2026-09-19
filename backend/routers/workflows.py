from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.workflow import WorkflowDefinition
from backend.models.base import generate_uuid, utc_now
from backend.services.workflow_validator import validate_workflow_definition, WorkflowValidationError

import re

router = APIRouter(prefix="/workflows", tags=["Workflows"])

class WorkflowDraftRequest(BaseModel):
    id: Optional[str] = None
    entity_type: str
    version_label: Optional[str] = None
    definition: Dict[str, Any]  # {"states": [...], "transitions": [...]}
    created_by: Optional[str] = "admin@compassx.io"

def _next_workflow_version(db: Session, entity_type: str) -> str:
    all_wfs = db.query(WorkflowDefinition).filter(WorkflowDefinition.entity_type == entity_type.lower()).all()
    max_v = 0
    for w in all_wfs:
        m = re.search(r'v(\d+)', w.version_label or "")
        if m:
            max_v = max(max_v, int(m.group(1)))
        elif w.version_label and w.version_label.isdigit():
            max_v = max(max_v, int(w.version_label))
    return f"v{max_v + 1}"

@router.get("")
def list_workflows(
    entity_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(WorkflowDefinition)
    if entity_type:
        query = query.filter(WorkflowDefinition.entity_type == entity_type.lower())
    if status:
        query = query.filter(WorkflowDefinition.status == status)
    
    workflows = query.order_by(WorkflowDefinition.entity_type, WorkflowDefinition.created_at.desc()).all()
    return [w.to_dict() for w in workflows]

@router.get("/entity/{entity_type}/history")
def get_workflow_history(entity_type: str, db: Session = Depends(get_db)):
    et = entity_type.lower().strip()
    workflows = (
        db.query(WorkflowDefinition)
        .filter(WorkflowDefinition.entity_type == et)
        .order_by(WorkflowDefinition.created_at.desc())
        .all()
    )
    return [w.to_dict() for w in workflows]

@router.get("/active/{entity_type}")
def get_active_workflow(entity_type: str, db: Session = Depends(get_db)):
    wf = db.query(WorkflowDefinition).filter(
        WorkflowDefinition.entity_type == entity_type.lower(),
        WorkflowDefinition.status == "published"
    ).order_by(WorkflowDefinition.published_at.desc()).first()
    
    if not wf:
        raise HTTPException(status_code=404, detail=f"No active published workflow found for '{entity_type}'")
    return wf.to_dict()

@router.get("/{id}")
def get_workflow(id: str, db: Session = Depends(get_db)):
    wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf.to_dict()

@router.post("/draft")
def save_draft(req: WorkflowDraftRequest, db: Session = Depends(get_db)):
    """
    Saves or creates a workflow draft definition with automatic versioning.
    """
    entity_type = req.entity_type.lower()
    
    if req.id:
        wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == req.id).first()
        if not wf:
            raise HTTPException(status_code=404, detail="Workflow draft not found")
        if wf.status == "published":
            # Fork into new draft per Section 3.4 (published rows are immutable)
            version_label = req.version_label or _next_workflow_version(db, entity_type)
            wf = WorkflowDefinition(
                id=generate_uuid(),
                entity_type=entity_type,
                version_label=version_label,
                status="draft",
                definition=req.definition,
                created_by=req.created_by,
                created_at=utc_now(),
            )
            db.add(wf)
        else:
            if req.version_label and req.version_label.strip():
                wf.version_label = req.version_label.strip()
            elif not wf.version_label:
                wf.version_label = _next_workflow_version(db, entity_type)
            wf.definition = req.definition
    else:
        version_label = req.version_label or _next_workflow_version(db, entity_type)
        wf = WorkflowDefinition(
            id=generate_uuid(),
            entity_type=entity_type,
            version_label=version_label,
            status="draft",
            definition=req.definition,
            created_by=req.created_by,
            created_at=utc_now(),
        )
        db.add(wf)

    db.commit()
    db.refresh(wf)
    return wf.to_dict()

@router.post("/{id}/validate")
def validate_workflow(id: str, db: Session = Depends(get_db)):
    """
    Validates a workflow against §6 graph rules (unreachable states, missing conditions, etc.).
    """
    wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    errors, warnings = validate_workflow_definition(db, wf.entity_type, wf.definition)
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }

@router.post("/{id}/publish")
def publish_workflow(id: str, db: Session = Depends(get_db)):
    """
    Validates and publishes a draft workflow definition (Section 3.4 & 6).
    """
    wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Run validation rules
    errors, warnings = validate_workflow_definition(db, wf.entity_type, wf.definition)
    if errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Cannot publish invalid workflow draft", "errors": errors, "warnings": warnings}
        )

    # Mark prior published versions as deprecated or keep them for active instance binding
    prior_published = db.query(WorkflowDefinition).filter(
        WorkflowDefinition.entity_type == wf.entity_type,
        WorkflowDefinition.status == "published",
        WorkflowDefinition.id != wf.id
    ).all()
    for p in prior_published:
        p.status = "deprecated"

    wf.status = "published"
    wf.published_at = utc_now()
    db.commit()
    db.refresh(wf)
    return {
        "published": True,
        "workflow": wf.to_dict(),
        "warnings": warnings,
    }

@router.post("/{id}/deprecate")
def deprecate_workflow(id: str, db: Session = Depends(get_db)):
    wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    wf.status = "deprecated"
    db.commit()
    return wf.to_dict()

@router.delete("/{id}")
def delete_workflow(id: str, db: Session = Depends(get_db)):
    wf = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    db.delete(wf)
    db.commit()
    return {"deleted": True, "id": id}
