from sqlalchemy import Column, ForeignKey, Integer, String

from backend.database import Base


class AutonumberSequence(Base):
    """Prefix and seed for one sequence at organization or site level.

    site_id is empty for the organization row. The next issued value is
    prefix concatenated with seed + 1, and seed then becomes that number.
    """

    __tablename__ = "autonumber_sequence"

    org_id = Column(String(50), ForeignKey("organization.org_id", ondelete="CASCADE"), primary_key=True)
    sequence_name = Column(String(50), primary_key=True)
    site_id = Column(String(50), primary_key=True, default="")
    prefix = Column(String(30), nullable=False, default="")
    seed = Column(Integer, nullable=False, default=0)

    def to_dict(self):
        return {
            "org_id": self.org_id,
            "sequence_name": self.sequence_name,
            "site_id": self.site_id or None,
            "level": "site" if self.site_id else "organization",
            "prefix": self.prefix or "",
            "seed": int(self.seed or 0),
            "next_value": f"{self.prefix or ''}{int(self.seed or 0) + 1}",
        }
