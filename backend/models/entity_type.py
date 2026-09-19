from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, JSON
from backend.database import Base
from backend.models.base import generate_uuid, utc_now

class EntityTypeDefinition(Base):
    """
    User-managed entity types (Section 3.1 & Entity Type Management).
    Allows creating, viewing, editing, and deleting entity types across the platform.
    """
    __tablename__ = "entity_type_definition"

    name = Column(String(50), primary_key=True)  # slug key, e.g. 'workorder', 'permit', 'pm_schedule'
    display_name = Column(String(100), nullable=False)  # e.g. 'Work Order', 'Permit to Work'
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True, default="Layers")
    is_system = Column(Boolean, default=False, nullable=False)
    version_number = Column(Integer, nullable=False, default=1)
    version_label = Column(String(50), nullable=False, default="v1")
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self):
        return {
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description or "",
            "icon": self.icon or "Layers",
            "is_system": self.is_system,
            "version_number": self.version_number or 1,
            "version_label": self.version_label or f"v{self.version_number or 1}",
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

class EntityTypeVersion(Base):
    """Immutable snapshot of an EntityTypeDefinition taken on each update/field edit (version history)."""
    __tablename__ = "entity_type_version"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(50), nullable=False, index=True)
    version_number = Column(Integer, nullable=False, default=1)
    version_label = Column(String(50), nullable=False, default="v1")
    display_name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True)
    fields_snapshot = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    created_by = Column(String(255), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "version_number": self.version_number,
            "version_label": self.version_label,
            "display_name": self.display_name,
            "description": self.description or "",
            "icon": self.icon or "Layers",
            "fields_snapshot": self.fields_snapshot or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "created_by": self.created_by,
        }
