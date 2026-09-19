from sqlalchemy import Column, String, Integer, DateTime, JSON
from backend.database import Base
from backend.models.base import generate_uuid, utc_now

class EntityForm(Base):
    """Drag-and-drop form layout per entity type (create-form builder, Section 3.2)."""
    __tablename__ = "entity_form"

    entity_type = Column(String(50), primary_key=True)
    version_number = Column(Integer, nullable=False, default=1)
    version_label = Column(String(50), nullable=False, default="v1")
    layout = Column(JSON, nullable=False, default=list)  # [{i,x,y,w,h,isHeader?,label?}]
    sections = Column(JSON, nullable=False, default=list)
    cols = Column(Integer, nullable=False, default=12)
    row_height = Column(Integer, nullable=False, default=40)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self):
        return {
            "entity_type": self.entity_type,
            "version_number": self.version_number or 1,
            "version_label": self.version_label or f"v{self.version_number or 1}",
            "layout": self.layout or [],
            "sections": self.sections or [],
            "cols": self.cols,
            "row_height": self.row_height,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

class FormVersion(Base):
    """Immutable snapshot of an EntityForm taken on each save (version history)."""
    __tablename__ = "entity_form_version"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    entity_type = Column(String(50), nullable=False, index=True)
    version_number = Column(Integer, nullable=False, default=1)
    version_label = Column(String(50), nullable=False, default="v1")
    layout = Column(JSON, nullable=False, default=list)
    sections = Column(JSON, nullable=False, default=list)
    cols = Column(Integer, nullable=False, default=12)
    row_height = Column(Integer, nullable=False, default=40)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    created_by = Column(String(255), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "version_number": self.version_number,
            "version_label": self.version_label,
            "layout": self.layout or [],
            "sections": self.sections or [],
            "cols": self.cols,
            "row_height": self.row_height,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "created_by": self.created_by,
        }