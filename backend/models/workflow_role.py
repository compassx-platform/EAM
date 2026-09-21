from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base
from backend.models.base import utc_now


class WorkflowRole(Base):
    """Dynamic recipient resolver (IBM Maximo MAXROLE analogue).

    Used primarily by Workflow Task Nodes, Escalations, and Communication
    Actions to dynamically determine assignees/recipients at runtime.

    Role Types:
      - PERSON: Static individual identity (person_id).
      - PERSON_GROUP: Sequenced team or broadcast work group (group_name).
      - DATASET_ATTRIBUTE: Dynamic attribute on the record (e.g. reported_by, supervisor_id).
      - EMAIL_ADDRESS: Static or dynamic email target.
    """
    __tablename__ = "workflow_role"

    id = Column(String(50), primary_key=True)  # ROLE_ID in uppercase, e.g. ROLE_SUPERVISOR
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    role_type = Column(String(30), nullable=False)  # 'PERSON' | 'PERSON_GROUP' | 'DATASET_ATTRIBUTE' | 'EMAIL_ADDRESS'

    # Target parameters based on role_type
    person_id = Column(String(50), ForeignKey("person.person_id", ondelete="SET NULL"), nullable=True)
    group_name = Column(String(50), ForeignKey("person_group.group_name", ondelete="SET NULL"), nullable=True)
    field_name = Column(String(100), nullable=True)  # custom_fields key or record field
    email_address = Column(String(255), nullable=True)

    # Resolution strategy for PERSON_GROUP: 'broadcast' | 'sequence_first_available' | 'default_member'
    resolution_strategy = Column(String(50), nullable=False, default="broadcast")

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    person = relationship("Person", foreign_keys=[person_id])
    group = relationship("PersonGroup", foreign_keys=[group_name])

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "role_type": self.role_type,
            "person_id": self.person_id,
            "person_name": self.person.display_name if self.person else None,
            "group_name": self.group_name,
            "group_description": self.group.description if self.group else None,
            "field_name": self.field_name,
            "email_address": self.email_address,
            "resolution_strategy": self.resolution_strategy,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
