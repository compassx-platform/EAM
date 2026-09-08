import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, JSON, Text
from backend.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class EntityBaseMixin:
    """Fixed schema for current-state / query-side tables (Section 3.1)"""
    id = Column(String(36), primary_key=True, default=generate_uuid)
    entity_type = Column(String(50), nullable=False, index=True)
    status = Column(String(100), nullable=False, index=True)
    workflow_version = Column(String(100), nullable=False)
    last_event_id = Column(String(36), nullable=True)
    custom_fields = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "status": self.status,
            "workflow_version": self.workflow_version,
            "last_event_id": self.last_event_id,
            "custom_fields": self.custom_fields or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

class EntityEventBaseMixin:
    """Fixed schema for event log / command-side tables (Section 3.1)"""
    event_id = Column(String(36), primary_key=True, default=generate_uuid)
    entity_id = Column(String(36), nullable=False, index=True)
    event_type = Column(String(100), nullable=False, index=True)
    actor_id = Column(String(255), nullable=False)
    actor_type = Column(String(20), nullable=False, default="human")  # 'human' | 'system'
    transaction_time = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    from_state = Column(String(100), nullable=True)
    to_state = Column(String(100), nullable=False)
    payload = Column(JSON, nullable=False, default=dict)

    def to_dict(self):
        return {
            "event_id": self.event_id,
            "entity_id": self.entity_id,
            "event_type": self.event_type,
            "actor_id": self.actor_id,
            "actor_type": self.actor_type,
            "transaction_time": self.transaction_time.isoformat() if self.transaction_time else None,
            "from_state": self.from_state,
            "to_state": self.to_state,
            "payload": self.payload or {},
        }
