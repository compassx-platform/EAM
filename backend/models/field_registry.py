from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, JSON
from backend.database import Base
from backend.models.base import utc_now

class EntityField(Base):
    """Field Schema Registry per entity type (Section 3.2)"""
    __tablename__ = "entity_field"

    entity_type = Column(String(50), primary_key=True)
    field_name = Column(String(100), primary_key=True)
    field_type = Column(String(30), nullable=False)  # 'text' | 'number' | 'date' | 'select' | 'entity_reference'
    required = Column(Boolean, default=False, nullable=False)
    select_options = Column(JSON, nullable=True)  # List of string options for 'select'
    reference_entity_type = Column(String(50), nullable=True)  # Target entity_type for 'entity_reference'
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self):
        return {
            "entity_type": self.entity_type,
            "field_name": self.field_name,
            "field_type": self.field_type,
            "required": self.required,
            "select_options": self.select_options or [],
            "reference_entity_type": self.reference_entity_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
