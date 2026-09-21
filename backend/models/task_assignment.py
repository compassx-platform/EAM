from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.database import Base
from backend.models.base import generate_uuid, utc_now


class TaskAssignment(Base):
    """Runtime task assignment for workflow task nodes (IBM Maximo WFTASK / ASSIGNMENT analogue)."""
    __tablename__ = "task_assignment"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(String(50), nullable=False, index=True)
    workflow_version = Column(String(50), nullable=True)
    node_id = Column(String(100), nullable=True)
    state_name = Column(String(100), nullable=False)  # Task node state name
    role_id = Column(String(50), ForeignKey("workflow_role.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_person_id = Column(String(50), ForeignKey("person.person_id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_group_name = Column(String(50), ForeignKey("person_group.group_name", ondelete="SET NULL"), nullable=True)
    assigned_email = Column(String(255), nullable=True)
    status = Column(String(30), nullable=False, default="ASSIGNED", index=True)  # 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'DELEGATED' | 'REJECTED'
    instructions = Column(String(1000), nullable=True)
    time_limit_hours = Column(Integer, nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    resolution_trace = Column(JSON, nullable=True)
    completed_by = Column(String(255), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    role = relationship("WorkflowRole", foreign_keys=[role_id])
    person = relationship("Person", foreign_keys=[assigned_person_id])
    group = relationship("PersonGroup", foreign_keys=[assigned_group_name])

    def to_dict(self):
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "workflow_version": self.workflow_version,
            "node_id": self.node_id,
            "state_name": self.state_name,
            "role_id": self.role_id,
            "role_name": self.role.name if self.role else None,
            "role_type": self.role.role_type if self.role else None,
            "assigned_person_id": self.assigned_person_id,
            "assigned_person_name": self.person.display_name if self.person else None,
            "assigned_group_name": self.assigned_group_name,
            "assigned_email": self.assigned_email,
            "status": self.status,
            "instructions": self.instructions,
            "time_limit_hours": self.time_limit_hours,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "resolution_trace": self.resolution_trace,
            "completed_by": self.completed_by,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
