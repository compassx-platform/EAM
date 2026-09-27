from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, JSON
from backend.database import Base
from backend.models.base import generate_uuid, utc_now

class EscalationDefinition(Base):
    """
    Enterprise Escalation Definition (IBM Maximo Escalation Architecture).
    Allows defining autonomous background watchdogs, SLA timers, date monitors,
    and automated workflow transitions / notifications across any entity type.
    """
    __tablename__ = "escalation_definition"

    id = Column(String(50), primary_key=True)  # slug ID e.g. 'PTW_AUTO_EXPIRY'
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    entity_type = Column(String(50), nullable=False, default="*")  # 'permit', 'workorder', '*'
    status = Column(String(20), nullable=False, default="ACTIVE")  # 'ACTIVE' | 'INACTIVE'
    applies_to = Column(String(50), nullable=False, default="entity")  # 'entity' | 'task_assignment'
    condition_id = Column(String(50), nullable=True)  # optional reference to condition registry
    condition_sql = Column(Text, nullable=True)  # optional filter
    schedule_cron = Column(String(50), nullable=True, default="*/5 * * * *")
    check_interval_seconds = Column(Integer, nullable=False, default=5)
    
    # Escalation Points: list of points with threshold, reference date field, and actions
    points = Column(JSON, nullable=False, default=list)
    is_system = Column(Boolean, default=False, nullable=False)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_run_status = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self):
        next_run = None
        if self.status == "ACTIVE":
            interval = self.check_interval_seconds or 5
            if self.last_run_at:
                next_run = (self.last_run_at + timedelta(seconds=interval)).isoformat()
            else:
                next_run = utc_now().isoformat()

        return {
            "id": self.id,
            "name": self.name,
            "description": self.description or "",
            "entity_type": self.entity_type,
            "status": self.status or "ACTIVE",
            "applies_to": self.applies_to or "entity",
            "condition_id": self.condition_id,
            "condition_sql": self.condition_sql,
            "schedule_cron": self.schedule_cron or "*/5 * * * *",
            "check_interval_seconds": self.check_interval_seconds or 5,
            "points": self.points or [],
            "is_system": self.is_system,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "last_run_status": self.last_run_status,
            "next_run_at": next_run,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class EscalationLog(Base):
    """Execution audit trail for Escalations."""
    __tablename__ = "escalation_log"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    escalation_id = Column(String(50), nullable=False, index=True)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(String(100), nullable=True, index=True)
    action_type = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="SUCCESS")  # 'SUCCESS' | 'FAILED' | 'SKIPPED'
    message = Column(Text, nullable=True)
    details = Column(JSON, nullable=False, default=dict)
    execution_time = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "escalation_id": self.escalation_id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "action_type": self.action_type,
            "status": self.status,
            "message": self.message or "",
            "details": self.details or {},
            "execution_time": self.execution_time.isoformat() if self.execution_time else None,
        }
