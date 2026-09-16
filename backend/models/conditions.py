from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey
from backend.database import Base
from backend.models.base import generate_uuid, utc_now


class ConditionDefinition(Base):
    """
    A reusable, centrally-authored condition (Maximo Conditional Expression
    Manager analogue).

    Consumers (workflow transitions/branches, form visibility, future modules)
    reference conditions by id and ALWAYS read the live 'definition' — so edits
    propagate everywhere immediately. Each edit snapshots a ConditionVersion
    row for tracking/history without pinning consumers.

    definition (structured AST):
        {"logic": "AND"|"OR", "negate": false, "rules": [
            {"type": "attribute", "field": "permit_type", "operator": "eq", "value": "Hot Work"},
            {"type": "role", "role": "Supervisor"},
            {"group": {"logic": "OR", "rules": [...]}}
        ]}

    type: 'structured' (rule-tree AST) | 'script' (programmatic escape hatch)
    """
    __tablename__ = "condition_definition"

    id = Column(String(100), primary_key=True)  # Descriptive id e.g. 'cond_hot_work_approval'
    entity_type = Column(String(50), nullable=False, index=True)
    label = Column(String(255), nullable=False)
    description = Column(String(1000), nullable=True)
    type = Column(String(20), nullable=False, default="structured")  # 'structured' | 'script'
    definition = Column(JSON, nullable=False, default=dict)  # live AST (consumers read this)
    current_version = Column(Integer, nullable=False, default=1)
    failure_policy = Column(String(20), nullable=False, default="block")  # 'block' | 'allow'
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self, include_versions: bool = False):
        data = {
            "id": self.id,
            "entity_type": self.entity_type,
            "label": self.label,
            "description": self.description,
            "type": self.type,
            "definition": self.definition or {"logic": "AND", "rules": []},
            "current_version": self.current_version,
            "failure_policy": self.failure_policy,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        return data


class ConditionVersion(Base):
    """Immutable snapshot of a ConditionDefinition taken on each save (version history)."""
    __tablename__ = "condition_version"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    condition_id = Column(String(100), ForeignKey("condition_definition.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    label = Column(String(255), nullable=False)
    definition = Column(JSON, nullable=False)
    failure_policy = Column(String(20), nullable=False, default="block")
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "condition_id": self.condition_id,
            "version": self.version,
            "label": self.label,
            "definition": self.definition or {"logic": "AND", "rules": []},
            "failure_policy": self.failure_policy,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }