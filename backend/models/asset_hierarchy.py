from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Float, Integer, Text
from sqlalchemy.orm import relationship
from backend.database import Base
from backend.models.base import utc_now


class Location(Base):
    """Location entity (Operating Location, Storeroom, Salvage, Holding, etc.).

    Locations represent physical or functional areas within a Site where work is performed
    or where equipment/materials reside.
    """
    __tablename__ = "location"

    location_id = Column(String(50), primary_key=True)
    site_id = Column(String(50), ForeignKey("site.site_id", ondelete="CASCADE"), primary_key=True)
    org_id = Column(String(50), nullable=False)
    parent_location_id = Column(String(50), nullable=True)
    description = Column(String(255), nullable=True)
    type = Column(String(30), default="OPERATING", nullable=False)  # OPERATING | STOREROOM | SALVAGE | HOLDING | VENDOR | REPAIR
    status = Column(String(30), default="OPERATING", nullable=False)  # OPERATING | NOT_READY | DECOMMISSIONED
    gl_account = Column(String(100), nullable=True)
    classstructure_id = Column(String(50), nullable=True)
    classification_path = Column(String(500), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    site = relationship("Site", lazy="selectin")
    assets = relationship(
        "Asset",
        primaryjoin="and_(Location.site_id==Asset.site_id, Location.location_id==Asset.location_id)",
        foreign_keys="[Asset.site_id, Asset.location_id]",
        back_populates="location",
        overlaps="site",
        lazy="selectin",
    )

    def to_dict(self):
        return {
            "location_id": self.location_id,
            "site_id": self.site_id,
            "org_id": self.org_id,
            "parent_location_id": self.parent_location_id,
            "description": self.description,
            "type": self.type,
            "status": self.status,
            "gl_account": self.gl_account,
            "classstructure_id": self.classstructure_id,
            "classification_path": self.classification_path,
            "assets_count": len(self.assets) if self.assets else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Asset(Base):
    """Asset entity with multi-level Parent-Child hierarchy.

    Assets are pieces of equipment or production machinery tracked at the Site level.
    Assets can reside in a Location and have a Parent Asset (sub-assembly hierarchy).
    """
    __tablename__ = "asset"

    asset_id = Column(String(50), primary_key=True)
    site_id = Column(String(50), ForeignKey("site.site_id", ondelete="CASCADE"), primary_key=True)
    org_id = Column(String(50), nullable=False)
    location_id = Column(String(50), nullable=True)
    parent_asset_id = Column(String(50), nullable=True)
    classstructure_id = Column(String(50), nullable=True)
    classification_path = Column(String(500), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    item_num = Column(String(50), nullable=True)  # Rotating inventory item reference
    serial_num = Column(String(100), nullable=True)
    status = Column(String(30), default="OPERATING", nullable=False)  # OPERATING | NOT_READY | IN_REPAIR | DECOMMISSIONED
    vendor = Column(String(50), nullable=True)
    manufacturer = Column(String(100), nullable=True)
    model = Column(String(100), nullable=True)
    purchase_cost = Column(Float, default=0.0, nullable=False)
    install_date = Column(DateTime(timezone=True), nullable=True)
    priority = Column(Integer, default=3, nullable=False)  # 1 (Critical) to 5 (Low)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    site = relationship("Site", overlaps="location,assets", lazy="selectin")
    location = relationship(
        "Location",
        primaryjoin="and_(Asset.site_id==Location.site_id, Asset.location_id==Location.location_id)",
        foreign_keys="[Asset.site_id, Asset.location_id]",
        back_populates="assets",
        overlaps="site,assets",
        lazy="selectin",
    )

    def to_dict(self):
        return {
            "asset_id": self.asset_id,
            "site_id": self.site_id,
            "org_id": self.org_id,
            "location_id": self.location_id,
            "parent_asset_id": self.parent_asset_id,
            "classstructure_id": self.classstructure_id,
            "classification_path": self.classification_path,
            "name": self.name,
            "description": self.description,
            "item_num": self.item_num,
            "serial_num": self.serial_num,
            "status": self.status,
            "vendor": self.vendor,
            "manufacturer": self.manufacturer,
            "model": self.model,
            "purchase_cost": self.purchase_cost,
            "install_date": self.install_date.isoformat() if self.install_date else None,
            "priority": self.priority,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
