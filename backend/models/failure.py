from sqlalchemy import Column, String, DateTime, UniqueConstraint
from backend.database import Base
from backend.models.base import generate_uuid, utc_now


class FailureCode(Base):
    """A reusable failure code and its description, scoped to one organization."""

    __tablename__ = "failure_code"
    __table_args__ = (UniqueConstraint("org_id", "code", name="uq_failure_code_org_code"),)

    id = Column(String(120), primary_key=True)
    org_id = Column(String(50), nullable=False)
    code = Column(String(80), nullable=False)
    description = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "org_id": self.org_id,
            "code": self.code,
            "description": self.description,
        }


class FailureList(Base):
    """One placement of a failure code in the class, problem, cause, remedy tree."""

    __tablename__ = "failure_list"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(50), nullable=False)
    parent_id = Column(String(36), nullable=True)
    code = Column(String(80), nullable=False)
    node_type = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self, description: str | None = None):
        return {
            "id": self.id,
            "org_id": self.org_id,
            "parent_id": self.parent_id,
            "code": self.code,
            "node_type": self.node_type,
            "description": description or "",
        }
