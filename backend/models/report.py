from sqlalchemy import Boolean, Column, DateTime, JSON, String

from backend.database import Base
from backend.models.base import generate_uuid, utc_now


class ReportLayout(Base):
    """Print layout for one entity. Separate from the data-entry form."""

    __tablename__ = "report_layout"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    entity_type = Column(String(50), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    is_default = Column(Boolean, nullable=False, default=False)
    blocks = Column(JSON, nullable=False, default=list)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "name": self.name,
            "is_default": bool(self.is_default),
            "blocks": self.blocks or [],
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
