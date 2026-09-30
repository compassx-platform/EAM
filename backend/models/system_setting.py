from datetime import datetime, timezone
from sqlalchemy import Column, String, JSON, DateTime, Text
from backend.database import Base
from backend.models.base import utc_now


class SystemSetting(Base):
    """System-level configuration key-value and metadata table."""
    __tablename__ = "system_settings"

    key = Column(String(100), primary_key=True, index=True)
    value = Column(JSON, nullable=False, default=dict)
    category = Column(String(50), nullable=False, default="general", index=True)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
    updated_by = Column(String(100), default="system")

    def to_dict(self):
        return {
            "key": self.key,
            "value": self.value,
            "category": self.category,
            "description": self.description,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "updated_by": self.updated_by,
        }
