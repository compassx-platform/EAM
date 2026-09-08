from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, JSON
from backend.database import Base
from backend.models.base import generate_uuid, utc_now

class WorkflowDefinition(Base):
    """Workflow Definition (Section 3.4 & Section 6)"""
    __tablename__ = "workflow_definition"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    entity_type = Column(String(50), nullable=False, index=True)
    version_label = Column(String(100), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="draft", index=True)  # 'draft' | 'published' | 'deprecated'
    definition = Column(JSON, nullable=False)  # {"states": [...], "transitions": [...]}
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    published_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "version_label": self.version_label,
            "status": self.status,
            "definition": self.definition or {"states": [], "transitions": []},
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
        }

class GateInstance(Base):
    """Parameterized Reusable Gate Instance (Section 3.6)"""
    __tablename__ = "gate_instance"

    id = Column(String(100), primary_key=True)  # Descriptive ID like 'gate_role_safety_officer' or UUID
    entity_type = Column(String(50), nullable=False, index=True)
    gate_type = Column(String(50), nullable=False)  # 'role_check', 'numeric_threshold', 'field_not_empty', 'date_check', 'related_entity_status_check'
    label = Column(String(255), nullable=False)
    params = Column(JSON, nullable=False, default=dict)
    failure_policy = Column(String(20), nullable=False, default="block")  # 'block' | 'allow'

    def to_dict(self):
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "gate_type": self.gate_type,
            "label": self.label,
            "params": self.params or {},
            "failure_policy": self.failure_policy,
        }
