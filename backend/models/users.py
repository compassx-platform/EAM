import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from backend.database import Base
from backend.models.base import generate_uuid, utc_now

app_user_role = Table(
    "app_user_role",
    Base.metadata,
    Column("user_id", String(36), ForeignKey("app_user.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", String(36), ForeignKey("app_role.id", ondelete="CASCADE"), primary_key=True),
)

class AppUser(Base):
    __tablename__ = "app_user"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    display_name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    roles = relationship("AppRole", secondary=app_user_role, back_populates="users", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "display_name": self.display_name,
            "active": self.active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "roles": [role.name for role in self.roles],
        }

class AppRole(Base):
    __tablename__ = "app_role"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), unique=True, nullable=False, index=True)

    users = relationship("AppUser", secondary=app_user_role, back_populates="roles")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
        }
