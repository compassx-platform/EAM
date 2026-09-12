from sqlalchemy import Column, String, DateTime, JSON
from backend.database import Base
from backend.models.base import utc_now

class ListDefinition(Base):
    """Central versioned option/checklist list (mirrors WorkflowDefinition versioning).

    One draft row per list_key holds the editable content; publishing creates a new
    immutable published snapshot and deprecates the previous published snapshot.
    Runtime consumers (field registry, form builder, create forms) resolve the
    latest published snapshot by list_key.
    """
    __tablename__ = "option_list"

    id = Column(String(36), primary_key=True)
    list_key = Column(String(100), nullable=False, index=True)
    kind = Column(String(20), nullable=False, default="options")  # 'options' | 'checklist'
    description = Column(String(255), nullable=True)
    version_label = Column(String(100), nullable=False)
    status = Column(String(20), nullable=False, default="draft", index=True)  # 'draft' | 'published' | 'deprecated'
    items = Column(JSON, nullable=False, default=list)  # options: [str...] | checklist: [{"label","required","assigned_role"}]
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    published_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "list_key": self.list_key,
            "kind": self.kind,
            "description": self.description,
            "version_label": self.version_label,
            "status": self.status,
            "items": self.items or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
        }