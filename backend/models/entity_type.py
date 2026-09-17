from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Text
from backend.database import Base
from backend.models.base import utc_now

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
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self):
        return {
            "name": self.name,
            "display_name": self.display_name,
            "description": self.description or "",
            "icon": self.icon or "Layers",
            "is_system": self.is_system,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
