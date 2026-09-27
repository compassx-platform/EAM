from sqlalchemy import Column, String, Text, Boolean, DateTime
from backend.database import Base
from backend.models.base import generate_uuid, utc_now


class InAppNotification(Base):
    """In-App Notification record for task assignments, workflow actions, and system alerts."""
    __tablename__ = "in_app_notification"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    recipient_id = Column(String(100), nullable=False, index=True)  # person_id (e.g. 'ENG-001') or email or 'ALL'
    sender_id = Column(String(100), nullable=False, default="system:workflow-engine")
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    category = Column(String(50), nullable=False, default="task_assigned")  # 'task_assigned' | 'workflow_action' | 'system_alert' | 'status_changed'
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(String(100), nullable=True)
    link_url = Column(String(255), nullable=True)
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "recipient_id": self.recipient_id,
            "sender_id": self.sender_id,
            "title": self.title,
            "message": self.message,
            "category": self.category,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "link_url": self.link_url,
            "is_read": self.is_read,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
