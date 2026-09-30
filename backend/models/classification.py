from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Float, Integer, Text, JSON
from sqlalchemy.orm import relationship
from backend.database import Base
from backend.models.base import utc_now


class AssetAttribute(Base):
    """Master Attribute entity (ASSETATTRIBUTE dictionary).

    Centralized global repository for reusable specification attributes across the enterprise.
    """
    __tablename__ = "asset_attribute"

    attribute_id = Column(String(50), primary_key=True)  # e.g. HORSEPOWER, VOLTAGE_RATED, FLOW_RATE
    description = Column(String(255), nullable=False)
    data_type = Column(String(20), default="ALN", nullable=False)  # ALN | NUMERIC | TABLE | DATE | YORN
    unit_of_measure = Column(String(30), nullable=True)  # HP, V, GPM, PSI, SQFT, RPM, kV, kVA
    domain_id = Column(String(50), nullable=True)
    domain_values = Column(JSON, nullable=True)          # ['316SS', 'Cast Iron', 'Duplex']
    org_id = Column(String(50), nullable=True)           # Optional organization scope (null = enterprise global)
    site_id = Column(String(50), nullable=True)          # Optional site scope
    status = Column(String(30), default="ACTIVE", nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    specs = relationship("ClassSpec", back_populates="master_attribute", cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self, include_usage: bool = True):
        return {
            "attribute_id": self.attribute_id,
            "description": self.description,
            "data_type": self.data_type,
            "unit_of_measure": self.unit_of_measure,
            "domain_id": self.domain_id,
            "domain_values": self.domain_values or [],
            "org_id": self.org_id,
            "site_id": self.site_id,
            "status": self.status,
            "usage_count": len(self.specs) if self.specs else 0,
            "used_in_classifications": [s.classstructure_id for s in self.specs] if (include_usage and self.specs) else [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Classification(Base):
    """Classification hierarchy entity (ClassStructure).

    Unified classification taxonomy for categorizing Assets, Locations, Work Orders, Items, etc.
    """
    __tablename__ = "classification"

    classstructure_id = Column(String(50), primary_key=True)  # Unique identifier (e.g. CS_PUMP_CENT)
    classification_id = Column(String(50), nullable=False)    # Noun/Category (e.g. CENTRIFUGAL)
    parent_classstructure_id = Column(String(50), ForeignKey("classification.classstructure_id", ondelete="CASCADE"), nullable=True)
    description = Column(String(255), nullable=False)
    hierarchy_path = Column(String(500), nullable=False)     # e.g. "ROTATING \ PUMP \ CENTRIFUGAL"
    use_with = Column(JSON, default=list, nullable=False)     # ['ASSET', 'LOCATIONS', 'WORKORDER', 'ITEM']
    org_id = Column(String(50), nullable=True)               # Optional organization scope (null = enterprise global)
    site_id = Column(String(50), nullable=True)              # Optional site scope
    status = Column(String(30), default="ACTIVE", nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    parent = relationship("Classification", remote_side=[classstructure_id], lazy="selectin")
    attributes = relationship(
        "ClassSpec",
        back_populates="classification",
        cascade="all, delete-orphan",
        order_by="ClassSpec.display_sequence.asc()",
        lazy="selectin",
    )

    def to_dict(self, include_attributes: bool = True):
        return {
            "classstructure_id": self.classstructure_id,
            "classification_id": self.classification_id,
            "parent_classstructure_id": self.parent_classstructure_id,
            "description": self.description,
            "hierarchy_path": self.hierarchy_path,
            "use_with": self.use_with or [],
            "org_id": self.org_id,
            "site_id": self.site_id,
            "status": self.status,
            "attributes_count": len(self.attributes) if self.attributes else 0,
            "attributes": [a.to_dict() for a in self.attributes] if (include_attributes and self.attributes) else [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ClassSpec(Base):
    """Specification Attribute template attached to a Classification (junction linking CLASSSTRUCTURE and ASSETATTRIBUTE)."""
    __tablename__ = "class_spec"

    id = Column(String(100), primary_key=True)  # e.g. CS_PUMP_CENT:FLOW_RATE
    classstructure_id = Column(String(50), ForeignKey("classification.classstructure_id", ondelete="CASCADE"), nullable=False)
    attribute_id = Column(String(50), ForeignKey("asset_attribute.attribute_id", ondelete="CASCADE"), nullable=False)
    section = Column(String(100), nullable=True)             # Section grouping (e.g. Electrical, Fluid Dynamics, Mechanical)
    description = Column(String(255), nullable=True)
    data_type = Column(String(20), default="ALN", nullable=False)  # ALN | NUMERIC | TABLE | DATE | YORN
    unit_of_measure = Column(String(30), nullable=True)      # GPM, HP, PSI, SQFT, RPM, V, KW
    domain_id = Column(String(50), nullable=True)
    domain_values = Column(JSON, nullable=True)              # ['316SS', 'Cast Iron', 'Duplex']
    default_value = Column(String(255), nullable=True)
    mandatory = Column(Boolean, default=False, nullable=False)
    inherited_from = Column(String(50), nullable=True)       # Parent classstructure_id if inherited
    apply_down_hierarchy = Column(Boolean, default=True, nullable=False)  # Propagate down child classifications
    display_sequence = Column(Integer, default=1, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    classification = relationship("Classification", back_populates="attributes", lazy="selectin")
    master_attribute = relationship("AssetAttribute", back_populates="specs", lazy="selectin")

    def to_dict(self):
        desc = self.description
        if not desc and self.master_attribute:
            desc = self.master_attribute.description
        return {
            "id": self.id,
            "classstructure_id": self.classstructure_id,
            "attribute_id": self.attribute_id,
            "section": self.section,
            "description": desc or self.attribute_id,
            "data_type": self.data_type,
            "unit_of_measure": self.unit_of_measure or (self.master_attribute.unit_of_measure if self.master_attribute else None),
            "domain_id": self.domain_id,
            "domain_values": self.domain_values if self.domain_values is not None else (self.master_attribute.domain_values if self.master_attribute else []),
            "default_value": self.default_value,
            "mandatory": self.mandatory,
            "inherited_from": self.inherited_from,
            "apply_down_hierarchy": self.apply_down_hierarchy,
            "display_sequence": self.display_sequence,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class AssetSpec(Base):
    """Actual specification attribute values for an Asset instance."""
    __tablename__ = "asset_spec"

    id = Column(String(120), primary_key=True)  # e.g. SITE_ID:ASSET_ID:ATTRIBUTE_ID
    asset_id = Column(String(50), nullable=False)
    site_id = Column(String(50), nullable=False)
    classstructure_id = Column(String(50), nullable=False)
    attribute_id = Column(String(50), nullable=False)
    section = Column(String(100), nullable=True)
    aln_value = Column(String(255), nullable=True)
    num_value = Column(Float, nullable=True)
    date_value = Column(DateTime(timezone=True), nullable=True)
    unit_of_measure = Column(String(30), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "asset_id": self.asset_id,
            "site_id": self.site_id,
            "classstructure_id": self.classstructure_id,
            "attribute_id": self.attribute_id,
            "section": self.section,
            "aln_value": self.aln_value,
            "num_value": self.num_value,
            "date_value": self.date_value.isoformat() if self.date_value else None,
            "unit_of_measure": self.unit_of_measure,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class LocationSpec(Base):
    """Actual specification attribute values for a Location instance."""
    __tablename__ = "location_spec"

    id = Column(String(120), primary_key=True)  # e.g. SITE_ID:LOCATION_ID:ATTRIBUTE_ID
    location_id = Column(String(50), nullable=False)
    site_id = Column(String(50), nullable=False)
    classstructure_id = Column(String(50), nullable=False)
    attribute_id = Column(String(50), nullable=False)
    section = Column(String(100), nullable=True)
    aln_value = Column(String(255), nullable=True)
    num_value = Column(Float, nullable=True)
    date_value = Column(DateTime(timezone=True), nullable=True)
    unit_of_measure = Column(String(30), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "location_id": self.location_id,
            "site_id": self.site_id,
            "classstructure_id": self.classstructure_id,
            "attribute_id": self.attribute_id,
            "section": self.section,
            "aln_value": self.aln_value,
            "num_value": self.num_value,
            "date_value": self.date_value.isoformat() if self.date_value else None,
            "unit_of_measure": self.unit_of_measure,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
