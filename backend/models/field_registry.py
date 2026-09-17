from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, JSON
from backend.database import Base
from backend.models.base import utc_now

# Registry field types. These double as the form widget catalog so a form item
# bound to an entity field renders with the exact widget type (text, dropdown,
# checklist, …). `select` renders as a dropdown at runtime.
FIELD_TYPES = [
    "text", "long_text", "email", "phone", "url",
    "number", "date", "datetime", "time",
    "boolean",
    "select", "selection", "checkbox_group",
    "entity_reference",
    "table", "checklist", "file",
]

# Types that carry a choice set (inline options and/or a published options list).
OPTION_FIELD_TYPES = {"select", "selection", "checkbox_group", "table", "dropdown"}
# Types that reference a published checklist list.
CHECKLIST_FIELD_TYPES = {"checklist"}

class EntityField(Base):
    """Field Schema Registry per entity type (Section 3.2)"""
    __tablename__ = "entity_field"

    entity_type = Column(String(50), primary_key=True)
    field_name = Column(String(100), primary_key=True)
    field_type = Column(String(30), nullable=False)  # one of FIELD_TYPES
    label = Column(String(100), nullable=True)  # Human-readable label for wizard / auto-generated forms
    required = Column(Boolean, default=False, nullable=False)
    select_options = Column(JSON, nullable=True)  # List of string options for 'select'
    option_list_key = Column(String(100), nullable=True)  # Central list reference (published snapshot)
    reference_entity_type = Column(String(50), nullable=True)  # Target entity_type for 'entity_reference'
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self):
        return {
            "entity_type": self.entity_type,
            "field_name": self.field_name,
            "field_type": self.field_type,
            "label": self.label,
            "required": self.required,
            "select_options": self.select_options or [],
            "option_list_key": self.option_list_key,
            "reference_entity_type": self.reference_entity_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
