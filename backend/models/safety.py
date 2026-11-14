"""Safety masters and the copy of a safety plan onto an entity record.

A safety plan is the reusable job-safety record (Maximo safety plan). Hazards,
precautions, hazardous materials, and tag outs live on the plan. Applying a plan
copies the matching rows onto the target entity so later edits stay on that record.
"""

from sqlalchemy import Column, String, Boolean, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from backend.database import Base
from backend.models.base import generate_uuid, utc_now


class Hazard(Base):
    __tablename__ = "hazard"

    hazard_id = Column(String(50), primary_key=True)
    description = Column(String(255), nullable=False)
    site_id = Column(String(50), nullable=True, index=True)
    is_hazardous_material = Column(Boolean, default=False, nullable=False)
    health_rating = Column(Integer, nullable=True)
    flammability_rating = Column(Integer, nullable=True)
    reactivity_rating = Column(Integer, nullable=True)
    contact_rating = Column(Integer, nullable=True)
    msds_document_id = Column(String(36), nullable=True)
    status = Column(String(20), default="ACTIVE", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    precautions = relationship(
        "HazardPrecaution",
        back_populates="hazard",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def to_dict(self):
        return {
            "hazard_id": self.hazard_id,
            "description": self.description,
            "site_id": self.site_id,
            "is_hazardous_material": self.is_hazardous_material,
            "health_rating": self.health_rating,
            "flammability_rating": self.flammability_rating,
            "reactivity_rating": self.reactivity_rating,
            "contact_rating": self.contact_rating,
            "msds_document_id": self.msds_document_id,
            "status": self.status,
            "precaution_ids": [link.precaution_id for link in (self.precautions or [])],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Precaution(Base):
    __tablename__ = "precaution"

    precaution_id = Column(String(50), primary_key=True)
    description = Column(String(255), nullable=False)
    site_id = Column(String(50), nullable=True, index=True)
    status = Column(String(20), default="ACTIVE", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self):
        return {
            "precaution_id": self.precaution_id,
            "description": self.description,
            "site_id": self.site_id,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class HazardPrecaution(Base):
    __tablename__ = "hazard_precaution"

    hazard_id = Column(String(50), ForeignKey("hazard.hazard_id", ondelete="CASCADE"), primary_key=True)
    precaution_id = Column(String(50), ForeignKey("precaution.precaution_id", ondelete="CASCADE"), primary_key=True)

    hazard = relationship("Hazard", back_populates="precautions")
    precaution = relationship("Precaution", lazy="selectin")


class TagOut(Base):
    __tablename__ = "tag_out"

    tagout_id = Column(String(50), primary_key=True)
    hazard_id = Column(String(50), ForeignKey("hazard.hazard_id", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(String(255), nullable=False)
    device = Column(String(100), nullable=True)
    site_id = Column(String(50), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self):
        return {
            "tagout_id": self.tagout_id,
            "hazard_id": self.hazard_id,
            "description": self.description,
            "device": self.device,
            "site_id": self.site_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SafetyPlan(Base):
    __tablename__ = "safety_plan"

    safety_plan_id = Column(String(50), primary_key=True)
    site_id = Column(String(50), nullable=False, index=True)
    description = Column(String(255), nullable=False)
    document_id = Column(String(36), nullable=True)
    status = Column(String(20), default="ACTIVE", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    hazards = relationship(
        "SafetyPlanHazard",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="SafetyPlanHazard.sequence.asc()",
        lazy="selectin",
    )
    tagouts = relationship(
        "SafetyPlanTagOut",
        back_populates="plan",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def to_dict(self):
        return {
            "safety_plan_id": self.safety_plan_id,
            "site_id": self.site_id,
            "description": self.description,
            "document_id": self.document_id,
            "status": self.status,
            "hazards": [row.to_dict() for row in (self.hazards or [])],
            "tagouts": [row.to_dict() for row in (self.tagouts or [])],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class SafetyPlanHazard(Base):
    __tablename__ = "safety_plan_hazard"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    safety_plan_id = Column(String(50), ForeignKey("safety_plan.safety_plan_id", ondelete="CASCADE"), nullable=False, index=True)
    hazard_id = Column(String(50), ForeignKey("hazard.hazard_id"), nullable=False)
    related_asset_id = Column(String(50), nullable=True)
    related_location_id = Column(String(50), nullable=True)
    sequence = Column(Integer, default=1, nullable=False)

    plan = relationship("SafetyPlan", back_populates="hazards")
    hazard = relationship("Hazard", lazy="selectin")

    def to_dict(self):
        hazard = self.hazard.to_dict() if self.hazard else None
        return {
            "id": self.id,
            "hazard_id": self.hazard_id,
            "description": hazard["description"] if hazard else None,
            "is_hazardous_material": hazard["is_hazardous_material"] if hazard else False,
            "related_asset_id": self.related_asset_id,
            "related_location_id": self.related_location_id,
            "sequence": self.sequence,
            "precaution_ids": hazard["precaution_ids"] if hazard else [],
        }


class SafetyPlanTagOut(Base):
    __tablename__ = "safety_plan_tagout"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    safety_plan_id = Column(String(50), ForeignKey("safety_plan.safety_plan_id", ondelete="CASCADE"), nullable=False, index=True)
    tagout_id = Column(String(50), ForeignKey("tag_out.tagout_id"), nullable=False)
    work_asset_id = Column(String(50), nullable=True)
    work_location_id = Column(String(50), nullable=True)

    plan = relationship("SafetyPlan", back_populates="tagouts")
    tagout = relationship("TagOut", lazy="selectin")

    def to_dict(self):
        tag = self.tagout.to_dict() if self.tagout else None
        return {
            "id": self.id,
            "tagout_id": self.tagout_id,
            "hazard_id": tag["hazard_id"] if tag else None,
            "description": tag["description"] if tag else None,
            "device": tag["device"] if tag else None,
            "work_asset_id": self.work_asset_id,
            "work_location_id": self.work_location_id,
        }


class AppliedSafety(Base):
    """The safety rows owned by one entity after a plan is applied."""

    __tablename__ = "applied_safety"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(String(36), nullable=False, index=True)
    safety_plan_id = Column(String(50), nullable=True)
    site_id = Column(String(50), nullable=True)
    asset_id = Column(String(50), nullable=True)
    location_id = Column(String(50), nullable=True)
    applied_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    hazards = relationship(
        "AppliedHazard",
        back_populates="applied",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    tagouts = relationship(
        "AppliedTagOut",
        back_populates="applied",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def to_dict(self):
        hazards = [row.to_dict() for row in (self.hazards or [])]
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "safety_plan_id": self.safety_plan_id,
            "site_id": self.site_id,
            "asset_id": self.asset_id,
            "location_id": self.location_id,
            "applied_at": self.applied_at.isoformat() if self.applied_at else None,
            "hazards": hazards,
            "hazardous_materials": [row for row in hazards if row["is_hazardous_material"]],
            "tagouts": [row.to_dict() for row in (self.tagouts or [])],
        }


class AppliedHazard(Base):
    __tablename__ = "applied_hazard"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    applied_safety_id = Column(String(36), ForeignKey("applied_safety.id", ondelete="CASCADE"), nullable=False, index=True)
    hazard_id = Column(String(50), nullable=True)
    description = Column(String(255), nullable=False)
    is_hazardous_material = Column(Boolean, default=False, nullable=False)
    health_rating = Column(Integer, nullable=True)
    flammability_rating = Column(Integer, nullable=True)
    reactivity_rating = Column(Integer, nullable=True)
    contact_rating = Column(Integer, nullable=True)
    msds_document_id = Column(String(36), nullable=True)
    related_asset_id = Column(String(50), nullable=True)
    related_location_id = Column(String(50), nullable=True)

    applied = relationship("AppliedSafety", back_populates="hazards")
    precautions = relationship(
        "AppliedPrecaution",
        back_populates="hazard",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "hazard_id": self.hazard_id,
            "description": self.description,
            "is_hazardous_material": self.is_hazardous_material,
            "health_rating": self.health_rating,
            "flammability_rating": self.flammability_rating,
            "reactivity_rating": self.reactivity_rating,
            "contact_rating": self.contact_rating,
            "msds_document_id": self.msds_document_id,
            "related_asset_id": self.related_asset_id,
            "related_location_id": self.related_location_id,
            "precautions": [row.to_dict() for row in (self.precautions or [])],
        }


class AppliedPrecaution(Base):
    __tablename__ = "applied_precaution"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    applied_hazard_id = Column(String(36), ForeignKey("applied_hazard.id", ondelete="CASCADE"), nullable=False, index=True)
    precaution_id = Column(String(50), nullable=True)
    description = Column(String(255), nullable=False)

    hazard = relationship("AppliedHazard", back_populates="precautions")

    def to_dict(self):
        return {
            "id": self.id,
            "precaution_id": self.precaution_id,
            "description": self.description,
        }


class AppliedTagOut(Base):
    __tablename__ = "applied_tagout"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    applied_safety_id = Column(String(36), ForeignKey("applied_safety.id", ondelete="CASCADE"), nullable=False, index=True)
    tagout_id = Column(String(50), nullable=True)
    hazard_id = Column(String(50), nullable=True)
    description = Column(String(255), nullable=False)
    device = Column(String(100), nullable=True)

    applied = relationship("AppliedSafety", back_populates="tagouts")

    def to_dict(self):
        return {
            "id": self.id,
            "tagout_id": self.tagout_id,
            "hazard_id": self.hazard_id,
            "description": self.description,
            "device": self.device,
        }
