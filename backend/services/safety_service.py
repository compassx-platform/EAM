"""Apply a safety plan onto an entity and keep the copied rows independent."""

from typing import Optional

from sqlalchemy.orm import Session

from backend.models.asset_hierarchy import Asset, Location
from backend.models.entities import get_entity_models
from backend.models.safety import (
    AppliedHazard,
    AppliedPrecaution,
    AppliedSafety,
    AppliedTagOut,
    Hazard,
    SafetyPlan,
    SafetyPlanHazard,
    SafetyPlanTagOut,
)
from backend.services.actions import update_entity_fields


class SafetyError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _norm(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text.upper() if text else None


def _matches(related_asset: Optional[str], related_location: Optional[str], asset_id: Optional[str], location_id: Optional[str]) -> bool:
    """A blank pair is generic and always applies. Otherwise the asset or location must match."""
    if not related_asset and not related_location:
        return True
    if related_location and location_id and related_location == location_id:
        return True
    if related_asset and asset_id and related_asset == asset_id:
        return True
    return False


def resolve_safety_plan(
    db: Session,
    safety_plan_id: Optional[str],
    site_id: Optional[str],
    asset_id: Optional[str],
    location_id: Optional[str],
) -> SafetyPlan:
    """Use the named plan, otherwise the location default, otherwise the asset default."""
    site_id = _norm(site_id)
    asset_id = _norm(asset_id)
    location_id = _norm(location_id)
    plan_id = _norm(safety_plan_id)

    if not plan_id and site_id and location_id:
        loc = db.query(Location).filter(Location.site_id == site_id, Location.location_id == location_id).first()
        if loc and loc.default_safety_plan_id:
            plan_id = loc.default_safety_plan_id
    if not plan_id and site_id and asset_id:
        asset = db.query(Asset).filter(Asset.site_id == site_id, Asset.asset_id == asset_id).first()
        if asset and asset.default_safety_plan_id:
            plan_id = asset.default_safety_plan_id
    if not plan_id:
        raise SafetyError("safety_plan_required", "No safety plan was selected and neither the location nor the asset has a default plan.")

    plan = db.query(SafetyPlan).filter(SafetyPlan.safety_plan_id == plan_id).first()
    if not plan:
        raise SafetyError("safety_plan_not_found", f"Safety plan '{plan_id}' does not exist.")
    if site_id and plan.site_id != site_id:
        raise SafetyError("safety_plan_site_mismatch", f"Safety plan '{plan_id}' belongs to site '{plan.site_id}'.")
    return plan


def get_applied(db: Session, entity_type: str, entity_id: str) -> Optional[AppliedSafety]:
    return (
        db.query(AppliedSafety)
        .filter(AppliedSafety.entity_type == entity_type.strip().lower(), AppliedSafety.entity_id == entity_id)
        .first()
    )


def apply_safety_plan(
    db: Session,
    entity_type: str,
    entity_id: str,
    safety_plan_id: Optional[str] = None,
    site_id: Optional[str] = None,
    asset_id: Optional[str] = None,
    location_id: Optional[str] = None,
) -> AppliedSafety:
    entity_type = entity_type.strip().lower()
    EntityModel, _ = get_entity_models(entity_type)
    entity = db.query(EntityModel).filter(EntityModel.id == entity_id, EntityModel.entity_type == entity_type).first()
    if not entity:
        raise SafetyError("entity_not_found", f"{entity_type} '{entity_id}' was not found.")

    fields = entity.custom_fields or {}
    site_id = _norm(site_id or fields.get("site_id") or fields.get("site"))
    asset_id = _norm(asset_id or fields.get("asset_id"))
    location_id = _norm(location_id or fields.get("location_id") or fields.get("location"))

    plan = resolve_safety_plan(db, safety_plan_id, site_id, asset_id, location_id)

    existing = get_applied(db, entity_type, entity_id)
    if existing:
        db.delete(existing)
        db.flush()

    applied = AppliedSafety(
        entity_type=entity_type,
        entity_id=entity_id,
        safety_plan_id=plan.safety_plan_id,
        site_id=site_id or plan.site_id,
        asset_id=asset_id,
        location_id=location_id,
    )
    db.add(applied)
    db.flush()

    for row in plan.hazards or []:
        if not isinstance(row, SafetyPlanHazard):
            continue
        if not _matches(row.related_asset_id, row.related_location_id, asset_id, location_id):
            continue
        hazard: Hazard = row.hazard
        copied = AppliedHazard(
            applied_safety_id=applied.id,
            hazard_id=hazard.hazard_id,
            description=hazard.description,
            is_hazardous_material=bool(hazard.is_hazardous_material),
            health_rating=hazard.health_rating,
            flammability_rating=hazard.flammability_rating,
            reactivity_rating=hazard.reactivity_rating,
            contact_rating=hazard.contact_rating,
            msds_document_id=hazard.msds_document_id,
            related_asset_id=row.related_asset_id,
            related_location_id=row.related_location_id,
        )
        db.add(copied)
        db.flush()
        for link in hazard.precautions or []:
            precaution = link.precaution
            db.add(AppliedPrecaution(
                applied_hazard_id=copied.id,
                precaution_id=precaution.precaution_id if precaution else link.precaution_id,
                description=precaution.description if precaution else link.precaution_id,
            ))

    for row in plan.tagouts or []:
        if not isinstance(row, SafetyPlanTagOut):
            continue
        if not _matches(row.work_asset_id, row.work_location_id, asset_id, location_id):
            continue
        tag = row.tagout
        db.add(AppliedTagOut(
            applied_safety_id=applied.id,
            tagout_id=tag.tagout_id if tag else row.tagout_id,
            hazard_id=tag.hazard_id if tag else None,
            description=tag.description if tag else row.tagout_id,
            device=tag.device if tag else None,
        ))

    db.commit()
    db.refresh(applied)

    update_entity_fields(
        db,
        entity_type,
        entity_id,
        {"safety_plan_id": plan.safety_plan_id},
        reason=f"Applied safety plan {plan.safety_plan_id}",
    )
    db.refresh(applied)
    return applied
