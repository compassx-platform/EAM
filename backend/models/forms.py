from sqlalchemy import Column, String, Integer, DateTime, JSON
from backend.database import Base
from backend.models.base import utc_now

class EntityForm(Base):
    """Drag-and-drop form layout per entity type (create-form builder, Section 3.2)."""
    __tablename__ = "entity_form"

    entity_type = Column(String(50), primary_key=True)
    layout = Column(JSON, nullable=False, default=list)  # [{i,x,y,w,h,isHeader?,label?}]
    sections = Column(JSON, nullable=False, default=list)
    cols = Column(Integer, nullable=False, default=12)
    row_height = Column(Integer, nullable=False, default=40)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self):
        return {
            "entity_type": self.entity_type,
            "layout": self.layout or [],
            "sections": self.sections or [],
            "cols": self.cols,
            "row_height": self.row_height,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }