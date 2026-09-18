from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base
from backend.models.base import generate_uuid, utc_now


class Person(Base):
    """Master identity record (IBM Maximo PERSON analogue).

    System-level master data — NOT a generic workflow entity. Lifecycle is a
    simple ACTIVE/INACTIVE status flag (Maximo), NOT event-sourced. Topics like
    contact/shift, supervisor, workflow delegate, and group membership map
    directly to the Maximo People/Person Groups semantics.
    """
    __tablename__ = "person"

    person_id = Column(String(50), primary_key=True)  # Maximo PERSONID: User ID in capital letters
    display_name = Column(String(255), nullable=False)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    primary_email = Column(String(255), nullable=True, index=True)
    phone = Column(String(50), nullable=True)
    site = Column(String(50), nullable=True)
    supervisor_id = Column(String(50), ForeignKey("person.person_id"), nullable=True, index=True)
    primary_calendar = Column(String(50), nullable=True)
    primary_shift = Column(String(50), nullable=True)
    workflow_delegate_id = Column(String(50), ForeignKey("person.person_id"), nullable=True)
    delegate_from = Column(DateTime(timezone=True), nullable=True)
    delegate_to = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), nullable=False, default="ACTIVE")  # 'ACTIVE' | 'INACTIVE'
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_dict(self, actor_roles=None):
        return {
            "person_id": self.person_id,
            "display_name": self.display_name,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "primary_email": self.primary_email,
            "phone": self.phone,
            "site": self.site,
            "supervisor_id": self.supervisor_id,
            "primary_calendar": self.primary_calendar,
            "primary_shift": self.primary_shift,
            "workflow_delegate_id": self.workflow_delegate_id,
            "delegate_from": self.delegate_from.isoformat() if self.delegate_from else None,
            "delegate_to": self.delegate_to.isoformat() if self.delegate_to else None,
            "status": self.status,
            "user_id": None,
            "linked_roles": actor_roles or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class PersonGroup(Base):
    """Named team (IBM Maximo PERSONGROUP analogue).

    Used as workorder.owner_group, workflow routing target, and (via the crew
    work group flag) the labor pool for future Crews.
    """
    __tablename__ = "person_group"

    group_name = Column(String(50), primary_key=True)
    description = Column(String(255), nullable=True)
    is_crew_work_group = Column(Boolean, default=False, nullable=False)
    use_for_org = Column(String(50), nullable=True)
    use_for_site = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    members = relationship(
        "PersonGroupMember",
        cascade="all, delete-orphan",
        back_populates="group",
        lazy="selectin",
        order_by="PersonGroupMember.sequence",
    )

    def to_dict(self):
        return {
            "group_name": self.group_name,
            "description": self.description,
            "is_crew_work_group": self.is_crew_work_group,
            "use_for_org": self.use_for_org,
            "use_for_site": self.use_for_site,
            "member_count": len(self.members),
            "members": [m.to_dict() for m in self.members],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class PersonGroupMember(Base):
    """Membership row with workflow routing order (Maximo sequence + defaults)."""
    __tablename__ = "person_group_member"

    group_name = Column(String(50), ForeignKey("person_group.group_name"), primary_key=True)
    person_id = Column(String(50), ForeignKey("person.person_id"), primary_key=True)
    sequence = Column(Integer, nullable=False, default=1)
    is_group_default = Column(Boolean, default=False, nullable=False)
    is_org_default = Column(Boolean, default=False, nullable=False)
    is_site_default = Column(Boolean, default=False, nullable=False)

    group = relationship("PersonGroup", back_populates="members")
    person = relationship("Person")

    def to_dict(self):
        return {
            "group_name": self.group_name,
            "person_id": self.person_id,
            "sequence": self.sequence,
            "is_group_default": self.is_group_default,
            "is_org_default": self.is_org_default,
            "is_site_default": self.is_site_default,
            "display_name": self.person.display_name if self.person else None,
            "status": self.person.status if self.person else None,
        }


class PersonAvailability(Base):
    """Availability overlay (Maximo `Modify Person Availability` analogue). Phase 1-lite."""
    __tablename__ = "person_availability"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    person_id = Column(String(50), ForeignKey("person.person_id"), nullable=False, index=True)
    reason = Column(String(50), nullable=False)  # 'Holiday' | 'Sick' | 'Overtime' | 'Other'
    available_from = Column(DateTime(timezone=True), nullable=False)
    available_to = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "person_id": self.person_id,
            "reason": self.reason,
            "available_from": self.available_from.isoformat() if self.available_from else None,
            "available_to": self.available_to.isoformat() if self.available_to else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PersonAudit(Base):
    """Append-only changed-field audit (lightweight; no event-sourced projector)."""
    __tablename__ = "person_audit"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    person_id = Column(String(50), ForeignKey("person.person_id"), nullable=False, index=True)
    changed_by = Column(String(255), nullable=False)
    field_name = Column(String(100), nullable=False)
    old_value = Column(String(1000), nullable=True)
    new_value = Column(String(1000), nullable=True)
    occurred_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "person_id": self.person_id,
            "changed_by": self.changed_by,
            "field_name": self.field_name,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "occurred_at": self.occurred_at.isoformat() if self.occurred_at else None,
        }