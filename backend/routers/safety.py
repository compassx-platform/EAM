from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.doclink import DocInfo, DocLink
from backend.models.organization import Site
from backend.models.safety import (
    AppliedHazard,
    AppliedPrecaution,
    AppliedSafety,
    Hazard,
    HazardPrecaution,
    Precaution,
    SafetyPlan,
    SafetyPlanHazard,
    SafetyPlanTagOut,
    TagOut,
)
from backend.services.doc_management_service import doc_management_service
from backend.services.safety_service import SafetyError, apply_safety_plan, get_applied

router = APIRouter(prefix="/api", tags=["Safety"])


def _decorate(db: Session, plan: SafetyPlan) -> dict:
    payload = plan.to_dict()
    if plan.document_id:
        doc = db.query(DocInfo).filter(DocInfo.id == plan.document_id).first()
        if doc:
            payload["document_file_name"] = doc.file_name
            payload["document_title"] = doc.title
    return payload


def _up(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = value.strip()
    return text.upper() if text else None


class HazardWrite(BaseModel):
    hazard_id: str = Field(..., min_length=1, max_length=50)
    description: str = Field(..., min_length=1, max_length=255)
    site_id: Optional[str] = None
    is_hazardous_material: bool = False
    health_rating: Optional[int] = None
    flammability_rating: Optional[int] = None
    reactivity_rating: Optional[int] = None
    contact_rating: Optional[int] = None
    msds_document_id: Optional[str] = None
    status: str = "ACTIVE"
    precaution_ids: List[str] = []


class HazardUpdate(BaseModel):
    description: Optional[str] = None
    site_id: Optional[str] = None
    is_hazardous_material: Optional[bool] = None
    health_rating: Optional[int] = None
    flammability_rating: Optional[int] = None
    reactivity_rating: Optional[int] = None
    contact_rating: Optional[int] = None
    msds_document_id: Optional[str] = None
    status: Optional[str] = None
    precaution_ids: Optional[List[str]] = None


class PrecautionWrite(BaseModel):
    precaution_id: str = Field(..., min_length=1, max_length=50)
    description: str = Field(..., min_length=1, max_length=255)
    site_id: Optional[str] = None
    status: str = "ACTIVE"


class TagOutWrite(BaseModel):
    tagout_id: str = Field(..., min_length=1, max_length=50)
    hazard_id: str
    description: str = Field(..., min_length=1, max_length=255)
    device: Optional[str] = None
    site_id: Optional[str] = None


class PlanHazardWrite(BaseModel):
    hazard_id: str
    related_asset_id: Optional[str] = None
    related_location_id: Optional[str] = None
    sequence: int = 1


class PlanTagOutWrite(BaseModel):
    tagout_id: str
    work_asset_id: Optional[str] = None
    work_location_id: Optional[str] = None


class SafetyPlanWrite(BaseModel):
    safety_plan_id: str = Field(..., min_length=1, max_length=50)
    site_id: str
    description: str = Field(..., min_length=1, max_length=255)
    document_id: Optional[str] = None
    status: str = "ACTIVE"
    hazards: List[PlanHazardWrite] = []
    tagouts: List[PlanTagOutWrite] = []


class SafetyPlanUpdate(BaseModel):
    description: Optional[str] = None
    document_id: Optional[str] = None
    status: Optional[str] = None
    hazards: Optional[List[PlanHazardWrite]] = None
    tagouts: Optional[List[PlanTagOutWrite]] = None


class ApplySafetyPlan(BaseModel):
    entity_type: str
    entity_id: str
    safety_plan_id: Optional[str] = None
    site_id: Optional[str] = None
    asset_id: Optional[str] = None
    location_id: Optional[str] = None


class AppliedHazardWrite(BaseModel):
    description: Optional[str] = None
    hazard_id: Optional[str] = None
    is_hazardous_material: bool = False


def _replace_precautions(db: Session, hazard: Hazard, precaution_ids: List[str]) -> None:
    db.query(HazardPrecaution).filter(HazardPrecaution.hazard_id == hazard.hazard_id).delete()
    for raw in precaution_ids:
        pid = _up(raw)
        if not pid:
            continue
        if not db.query(Precaution).filter(Precaution.precaution_id == pid).first():
            raise HTTPException(status_code=400, detail=f"Precaution '{pid}' does not exist.")
        db.add(HazardPrecaution(hazard_id=hazard.hazard_id, precaution_id=pid))


def _replace_plan_children(db: Session, plan: SafetyPlan, hazards: List[PlanHazardWrite], tagouts: List[PlanTagOutWrite]) -> None:
    db.query(SafetyPlanHazard).filter(SafetyPlanHazard.safety_plan_id == plan.safety_plan_id).delete()
    db.query(SafetyPlanTagOut).filter(SafetyPlanTagOut.safety_plan_id == plan.safety_plan_id).delete()
    for index, row in enumerate(hazards, start=1):
        hid = _up(row.hazard_id)
        if not db.query(Hazard).filter(Hazard.hazard_id == hid).first():
            raise HTTPException(status_code=400, detail=f"Hazard '{hid}' does not exist.")
        db.add(SafetyPlanHazard(
            safety_plan_id=plan.safety_plan_id,
            hazard_id=hid,
            related_asset_id=_up(row.related_asset_id),
            related_location_id=_up(row.related_location_id),
            sequence=row.sequence or index,
        ))
    for row in tagouts:
        tid = _up(row.tagout_id)
        if not db.query(TagOut).filter(TagOut.tagout_id == tid).first():
            raise HTTPException(status_code=400, detail=f"Tag out '{tid}' does not exist.")
        db.add(SafetyPlanTagOut(
            safety_plan_id=plan.safety_plan_id,
            tagout_id=tid,
            work_asset_id=_up(row.work_asset_id),
            work_location_id=_up(row.work_location_id),
        ))


@router.get("/hazards")
def list_hazards(site_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Hazard)
    if site_id:
        sid = _up(site_id)
        query = query.filter((Hazard.site_id == sid) | (Hazard.site_id.is_(None)))
    return [row.to_dict() for row in query.order_by(Hazard.hazard_id.asc()).all()]


@router.post("/hazards", status_code=status.HTTP_201_CREATED)
def create_hazard(data: HazardWrite, db: Session = Depends(get_db)):
    hid = _up(data.hazard_id)
    if db.query(Hazard).filter(Hazard.hazard_id == hid).first():
        raise HTTPException(status_code=400, detail=f"Hazard '{hid}' already exists.")
    hazard = Hazard(
        hazard_id=hid,
        description=data.description.strip(),
        site_id=_up(data.site_id),
        is_hazardous_material=data.is_hazardous_material,
        health_rating=data.health_rating,
        flammability_rating=data.flammability_rating,
        reactivity_rating=data.reactivity_rating,
        contact_rating=data.contact_rating,
        msds_document_id=data.msds_document_id,
        status=data.status.upper(),
    )
    db.add(hazard)
    db.flush()
    _replace_precautions(db, hazard, data.precaution_ids)
    db.commit()
    db.refresh(hazard)
    return hazard.to_dict()


@router.put("/hazards/{hazard_id}")
def update_hazard(hazard_id: str, data: HazardUpdate, db: Session = Depends(get_db)):
    hazard = db.query(Hazard).filter(Hazard.hazard_id == _up(hazard_id)).first()
    if not hazard:
        raise HTTPException(status_code=404, detail="Hazard not found.")
    if data.description is not None:
        hazard.description = data.description.strip()
    if data.site_id is not None:
        hazard.site_id = _up(data.site_id)
    if data.is_hazardous_material is not None:
        hazard.is_hazardous_material = data.is_hazardous_material
    if data.health_rating is not None:
        hazard.health_rating = data.health_rating
    if data.flammability_rating is not None:
        hazard.flammability_rating = data.flammability_rating
    if data.reactivity_rating is not None:
        hazard.reactivity_rating = data.reactivity_rating
    if data.contact_rating is not None:
        hazard.contact_rating = data.contact_rating
    if data.msds_document_id is not None:
        hazard.msds_document_id = data.msds_document_id or None
    if data.status is not None:
        hazard.status = data.status.upper()
    if data.precaution_ids is not None:
        _replace_precautions(db, hazard, data.precaution_ids)
    db.commit()
    db.refresh(hazard)
    return hazard.to_dict()


@router.delete("/hazards/{hazard_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_hazard(hazard_id: str, db: Session = Depends(get_db)):
    hazard = db.query(Hazard).filter(Hazard.hazard_id == _up(hazard_id)).first()
    if not hazard:
        raise HTTPException(status_code=404, detail="Hazard not found.")
    db.delete(hazard)
    db.commit()
    return None


@router.get("/precautions")
def list_precautions(db: Session = Depends(get_db)):
    return [row.to_dict() for row in db.query(Precaution).order_by(Precaution.precaution_id.asc()).all()]


@router.post("/precautions", status_code=status.HTTP_201_CREATED)
def create_precaution(data: PrecautionWrite, db: Session = Depends(get_db)):
    pid = _up(data.precaution_id)
    if db.query(Precaution).filter(Precaution.precaution_id == pid).first():
        raise HTTPException(status_code=400, detail=f"Precaution '{pid}' already exists.")
    row = Precaution(
        precaution_id=pid,
        description=data.description.strip(),
        site_id=_up(data.site_id),
        status=data.status.upper(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.to_dict()


@router.get("/tag-outs")
def list_tagouts(db: Session = Depends(get_db)):
    return [row.to_dict() for row in db.query(TagOut).order_by(TagOut.tagout_id.asc()).all()]


@router.post("/tag-outs", status_code=status.HTTP_201_CREATED)
def create_tagout(data: TagOutWrite, db: Session = Depends(get_db)):
    tid = _up(data.tagout_id)
    hid = _up(data.hazard_id)
    if not db.query(Hazard).filter(Hazard.hazard_id == hid).first():
        raise HTTPException(status_code=400, detail=f"Hazard '{hid}' does not exist.")
    if db.query(TagOut).filter(TagOut.tagout_id == tid).first():
        raise HTTPException(status_code=400, detail=f"Tag out '{tid}' already exists.")
    row = TagOut(
        tagout_id=tid,
        hazard_id=hid,
        description=data.description.strip(),
        device=data.device,
        site_id=_up(data.site_id),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.to_dict()


@router.get("/safety-plans")
def list_safety_plans(site_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(SafetyPlan)
    if site_id:
        query = query.filter(SafetyPlan.site_id == _up(site_id))
    return [_decorate(db, row) for row in query.order_by(SafetyPlan.safety_plan_id.asc()).all()]


@router.get("/safety-plans/{safety_plan_id}")
def get_safety_plan(safety_plan_id: str, db: Session = Depends(get_db)):
    plan = db.query(SafetyPlan).filter(SafetyPlan.safety_plan_id == _up(safety_plan_id)).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Safety plan not found.")
    return _decorate(db, plan)


@router.post("/safety-plans", status_code=status.HTTP_201_CREATED)
def create_safety_plan(data: SafetyPlanWrite, db: Session = Depends(get_db)):
    pid = _up(data.safety_plan_id)
    sid = _up(data.site_id)
    if db.query(SafetyPlan).filter(SafetyPlan.safety_plan_id == pid).first():
        raise HTTPException(status_code=400, detail=f"Safety plan '{pid}' already exists.")
    if not db.query(Site).filter(Site.site_id == sid).first():
        raise HTTPException(status_code=400, detail=f"Site '{sid}' does not exist.")
    plan = SafetyPlan(
        safety_plan_id=pid,
        site_id=sid,
        description=data.description.strip(),
        document_id=data.document_id,
        status=data.status.upper(),
    )
    db.add(plan)
    db.flush()
    _replace_plan_children(db, plan, data.hazards, data.tagouts)
    db.commit()
    db.refresh(plan)
    return _decorate(db, plan)


@router.post("/safety-plans/{safety_plan_id}/document")
async def attach_safety_plan_document(
    safety_plan_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    plan = db.query(SafetyPlan).filter(SafetyPlan.safety_plan_id == _up(safety_plan_id)).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Safety plan not found.")
    filename = file.filename or "safety-plan.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="The safety plan attachment must be a PDF.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The PDF file is empty.")
    try:
        doc = await doc_management_service.upload_document(
            db=db,
            file_content=content,
            file_name=filename,
            content_type=file.content_type or "application/pdf",
            title=filename,
            description=f"PDF for safety plan {plan.safety_plan_id}",
            sub_path="safety-plans",
            tags=["safety-plan", plan.safety_plan_id],
            created_by="system",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    plan.document_id = doc.id
    db.add(DocLink(
        doc_info_id=doc.id,
        owner_table="SAFETYPLAN",
        owner_id=plan.safety_plan_id,
    ))
    db.commit()
    db.refresh(plan)
    return _decorate(db, plan)


@router.put("/safety-plans/{safety_plan_id}")
def update_safety_plan(safety_plan_id: str, data: SafetyPlanUpdate, db: Session = Depends(get_db)):
    plan = db.query(SafetyPlan).filter(SafetyPlan.safety_plan_id == _up(safety_plan_id)).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Safety plan not found.")
    if data.description is not None:
        plan.description = data.description.strip()
    if data.document_id is not None:
        plan.document_id = data.document_id or None
    if data.status is not None:
        plan.status = data.status.upper()
    if data.hazards is not None or data.tagouts is not None:
        _replace_plan_children(
            db,
            plan,
            data.hazards if data.hazards is not None else [
                PlanHazardWrite(
                    hazard_id=row.hazard_id,
                    related_asset_id=row.related_asset_id,
                    related_location_id=row.related_location_id,
                    sequence=row.sequence,
                )
                for row in plan.hazards
            ],
            data.tagouts if data.tagouts is not None else [
                PlanTagOutWrite(
                    tagout_id=row.tagout_id,
                    work_asset_id=row.work_asset_id,
                    work_location_id=row.work_location_id,
                )
                for row in plan.tagouts
            ],
        )
    db.commit()
    db.refresh(plan)
    return _decorate(db, plan)


@router.post("/safety-plans/apply")
def apply_plan(data: ApplySafetyPlan, db: Session = Depends(get_db)):
    try:
        applied = apply_safety_plan(
            db,
            entity_type=data.entity_type,
            entity_id=data.entity_id,
            safety_plan_id=data.safety_plan_id,
            site_id=data.site_id,
            asset_id=data.asset_id,
            location_id=data.location_id,
        )
    except SafetyError as exc:
        code = 404 if exc.code in {"entity_not_found", "safety_plan_not_found"} else 400
        raise HTTPException(status_code=code, detail=exc.message)
    return applied.to_dict()


@router.get("/applied-safety/{entity_type}/{entity_id}")
def read_applied(entity_type: str, entity_id: str, db: Session = Depends(get_db)):
    applied = get_applied(db, entity_type, entity_id)
    if not applied:
        return {
            "entity_type": entity_type.strip().lower(),
            "entity_id": entity_id,
            "safety_plan_id": None,
            "hazards": [],
            "hazardous_materials": [],
            "tagouts": [],
        }
    return applied.to_dict()


@router.put("/applied-safety/{entity_type}/{entity_id}/hazards/{applied_hazard_id}")
def edit_applied_hazard(
    entity_type: str,
    entity_id: str,
    applied_hazard_id: str,
    data: AppliedHazardWrite,
    db: Session = Depends(get_db),
):
    applied = get_applied(db, entity_type, entity_id)
    if not applied:
        raise HTTPException(status_code=404, detail="No safety plan has been applied to this record.")
    row = db.query(AppliedHazard).filter(
        AppliedHazard.id == applied_hazard_id,
        AppliedHazard.applied_safety_id == applied.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Applied hazard not found.")
    if data.description is not None:
        row.description = data.description.strip()
    db.commit()
    db.refresh(applied)
    return applied.to_dict()


@router.delete("/applied-safety/{entity_type}/{entity_id}/precautions/{applied_precaution_id}")
def delete_applied_precaution(
    entity_type: str,
    entity_id: str,
    applied_precaution_id: str,
    db: Session = Depends(get_db),
):
    applied = get_applied(db, entity_type, entity_id)
    if not applied:
        raise HTTPException(status_code=404, detail="No safety plan has been applied to this record.")
    row = (
        db.query(AppliedPrecaution)
        .join(AppliedHazard, AppliedPrecaution.applied_hazard_id == AppliedHazard.id)
        .filter(
            AppliedPrecaution.id == applied_precaution_id,
            AppliedHazard.applied_safety_id == applied.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Applied precaution not found.")
    db.delete(row)
    db.commit()
    db.refresh(applied)
    return applied.to_dict()
