from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Float, Integer, Text, JSON
from sqlalchemy.orm import relationship
from backend.database import Base
from backend.models.base import utc_now, generate_uuid


class Meter(Base):
    """Master Meter Catalog (METER dictionary).

    Defines measurement metrics (Continuous, Gauge, Characteristic) across the enterprise.
    """
    __tablename__ = "meter"

    meter_id = Column(String(50), primary_key=True)  # e.g. RUNHOURS, DISCHARGE_PSI, OIL_CONDITION
    description = Column(String(255), nullable=False)
    meter_type = Column(String(20), default="CONTINUOUS", nullable=False)  # CONTINUOUS | GAUGE | CHARACTERISTIC
    reading_type = Column(String(20), default="ACTUAL", nullable=False)    # ACTUAL | DELTA
    unit_of_measure = Column(String(30), nullable=True)                    # HOURS, PSI, MM/S, DEG_C, MILES, KWH
    domain_id = Column(String(50), nullable=True)
    domain_values = Column(JSON, nullable=True)                            # ['CLEAR', 'AMBER', 'DARK', 'BURNT']
    org_id = Column(String(50), nullable=True)
    site_id = Column(String(50), nullable=True)
    status = Column(String(30), default="ACTIVE", nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    asset_meters = relationship("AssetMeter", back_populates="meter", cascade="all, delete-orphan", lazy="selectin")
    location_meters = relationship("LocationMeter", back_populates="meter", cascade="all, delete-orphan", lazy="selectin")
    in_groups = relationship("MeterInGroup", back_populates="meter", cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self, include_usage: bool = True):
        return {
            "meter_id": self.meter_id,
            "description": self.description,
            "meter_type": self.meter_type,
            "reading_type": self.reading_type,
            "unit_of_measure": self.unit_of_measure,
            "domain_id": self.domain_id,
            "domain_values": self.domain_values or [],
            "org_id": self.org_id,
            "site_id": self.site_id,
            "status": self.status,
            "asset_usage_count": len(self.asset_meters) if self.asset_meters else 0,
            "location_usage_count": len(self.location_meters) if self.location_meters else 0,
            "group_usage_count": len(self.in_groups) if self.in_groups else 0,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class MeterGroup(Base):
    """Meter Group Header (METERGROUP).

    Standardized bundle of meters attached to equipment classes/types.
    """
    __tablename__ = "meter_group"

    group_id = Column(String(50), primary_key=True)  # e.g. MG_PUMP_CENT, MG_MOTOR_ELEC
    description = Column(String(255), nullable=False)
    org_id = Column(String(50), nullable=True)
    site_id = Column(String(50), nullable=True)
    status = Column(String(30), default="ACTIVE", nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    items = relationship(
        "MeterInGroup",
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="MeterInGroup.sequence.asc()",
        lazy="selectin",
    )

    def to_dict(self):
        return {
            "group_id": self.group_id,
            "description": self.description,
            "org_id": self.org_id,
            "site_id": self.site_id,
            "status": self.status,
            "meters_count": len(self.items) if self.items else 0,
            "meters": [item.to_dict() for item in self.items] if self.items else [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class MeterInGroup(Base):
    """Meters in a Group junction (METERINGROUP)."""
    __tablename__ = "meter_in_group"

    id = Column(String(100), primary_key=True)  # e.g. MG_PUMP_CENT:RUNHOURS
    group_id = Column(String(50), ForeignKey("meter_group.group_id", ondelete="CASCADE"), nullable=False)
    meter_id = Column(String(50), ForeignKey("meter.meter_id", ondelete="CASCADE"), nullable=False)
    sequence = Column(Integer, default=1, nullable=False)
    default_rollover = Column(Float, nullable=True)
    default_avg_method = Column(String(30), default="ALL", nullable=False)  # ALL | SLIDING-DAYS | SLIDING-READINGS | STATIC
    default_avg_rate = Column(Float, nullable=True)

    group = relationship("MeterGroup", back_populates="items", lazy="selectin")
    meter = relationship("Meter", back_populates="in_groups", lazy="selectin")

    def to_dict(self):
        return {
            "id": self.id,
            "group_id": self.group_id,
            "meter_id": self.meter_id,
            "sequence": self.sequence,
            "default_rollover": self.default_rollover,
            "default_avg_method": self.default_avg_method,
            "default_avg_rate": self.default_avg_rate,
            "description": self.meter.description if self.meter else None,
            "meter_type": self.meter.meter_type if self.meter else "CONTINUOUS",
            "unit_of_measure": self.meter.unit_of_measure if self.meter else None,
            "domain_values": self.meter.domain_values if self.meter else [],
        }


class AssetMeter(Base):
    """Active Meter instance attached to an Asset (ASSETMETER)."""
    __tablename__ = "asset_meter"

    id = Column(String(120), primary_key=True)  # e.g. BEDFORD:PUMP_SYS_100:RUNHOURS
    site_id = Column(String(50), nullable=False)
    asset_id = Column(String(50), nullable=False)
    meter_id = Column(String(50), ForeignKey("meter.meter_id", ondelete="CASCADE"), nullable=False)
    last_reading = Column(Float, nullable=True)
    last_reading_aln = Column(String(255), nullable=True)
    last_reading_date = Column(DateTime(timezone=True), nullable=True)
    rollover_point = Column(Float, nullable=True)                          # e.g. 100000.0
    avg_units_per_day = Column(Float, default=0.0, nullable=False)
    avg_calc_method = Column(String(30), default="ALL", nullable=False)   # ALL | SLIDING-DAYS | SLIDING-READINGS | STATIC
    life_to_date = Column(Float, default=0.0, nullable=False)             # Total lifetime runtime
    since_last_overhaul = Column(Float, default=0.0, nullable=False)      # Reset during major rebuild
    since_last_repair = Column(Float, default=0.0, nullable=False)        # Reset during repair
    active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    meter = relationship("Meter", back_populates="asset_meters", lazy="selectin")
    readings = relationship("MeterReading", back_populates="asset_meter", cascade="all, delete-orphan", lazy="selectin", order_by="desc(MeterReading.reading_date)")

    def to_dict(self):
        return {
            "id": self.id,
            "site_id": self.site_id,
            "asset_id": self.asset_id,
            "meter_id": self.meter_id,
            "description": self.meter.description if self.meter else self.meter_id,
            "meter_type": self.meter.meter_type if self.meter else "CONTINUOUS",
            "reading_type": self.meter.reading_type if self.meter else "ACTUAL",
            "unit_of_measure": self.meter.unit_of_measure if self.meter else None,
            "domain_values": self.meter.domain_values if self.meter else [],
            "last_reading": self.last_reading,
            "last_reading_aln": self.last_reading_aln,
            "last_reading_date": self.last_reading_date.isoformat() if self.last_reading_date else None,
            "rollover_point": self.rollover_point,
            "avg_units_per_day": round(self.avg_units_per_day, 2),
            "avg_calc_method": self.avg_calc_method,
            "life_to_date": round(self.life_to_date, 2),
            "since_last_overhaul": round(self.since_last_overhaul, 2),
            "since_last_repair": round(self.since_last_repair, 2),
            "active": self.active,
            "readings_count": len(self.readings) if self.readings else 0,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class LocationMeter(Base):
    """Active Meter instance attached to a Location / Facility (LOCATIONMETER)."""
    __tablename__ = "location_meter"

    id = Column(String(120), primary_key=True)  # e.g. BEDFORD:MECH_ROOM_101:KWH_METER
    site_id = Column(String(50), nullable=False)
    location_id = Column(String(50), nullable=False)
    meter_id = Column(String(50), ForeignKey("meter.meter_id", ondelete="CASCADE"), nullable=False)
    last_reading = Column(Float, nullable=True)
    last_reading_aln = Column(String(255), nullable=True)
    last_reading_date = Column(DateTime(timezone=True), nullable=True)
    rollover_point = Column(Float, nullable=True)
    avg_units_per_day = Column(Float, default=0.0, nullable=False)
    avg_calc_method = Column(String(30), default="ALL", nullable=False)
    life_to_date = Column(Float, default=0.0, nullable=False)
    active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    meter = relationship("Meter", back_populates="location_meters", lazy="selectin")
    readings = relationship("MeterReading", back_populates="location_meter", cascade="all, delete-orphan", lazy="selectin", order_by="desc(MeterReading.reading_date)")

    def to_dict(self):
        return {
            "id": self.id,
            "site_id": self.site_id,
            "location_id": self.location_id,
            "meter_id": self.meter_id,
            "description": self.meter.description if self.meter else self.meter_id,
            "meter_type": self.meter.meter_type if self.meter else "CONTINUOUS",
            "reading_type": self.meter.reading_type if self.meter else "ACTUAL",
            "unit_of_measure": self.meter.unit_of_measure if self.meter else None,
            "domain_values": self.meter.domain_values if self.meter else [],
            "last_reading": self.last_reading,
            "last_reading_aln": self.last_reading_aln,
            "last_reading_date": self.last_reading_date.isoformat() if self.last_reading_date else None,
            "rollover_point": self.rollover_point,
            "avg_units_per_day": round(self.avg_units_per_day, 2),
            "avg_calc_method": self.avg_calc_method,
            "life_to_date": round(self.life_to_date, 2),
            "active": self.active,
            "readings_count": len(self.readings) if self.readings else 0,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class MeterReading(Base):
    """Historical immutable ledger of all meter readings (METERREADING)."""
    __tablename__ = "meter_reading"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    site_id = Column(String(50), nullable=False)
    asset_id = Column(String(50), nullable=True)
    location_id = Column(String(50), nullable=True)
    meter_id = Column(String(50), ForeignKey("meter.meter_id", ondelete="CASCADE"), nullable=False)
    reading_date = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    reading_value = Column(Float, nullable=True)
    reading_aln = Column(String(255), nullable=True)
    delta_value = Column(Float, nullable=True)
    is_rollover = Column(Boolean, default=False, nullable=False)
    inspector_id = Column(String(50), nullable=True)
    entered_by = Column(String(50), nullable=True)
    workorder_id = Column(String(50), nullable=True)
    remarks = Column(Text, nullable=True)
    asset_meter_id = Column(String(120), ForeignKey("asset_meter.id", ondelete="CASCADE"), nullable=True)
    location_meter_id = Column(String(120), ForeignKey("location_meter.id", ondelete="CASCADE"), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    asset_meter = relationship("AssetMeter", back_populates="readings", lazy="selectin")
    location_meter = relationship("LocationMeter", back_populates="readings", lazy="selectin")

    def to_dict(self):
        return {
            "id": self.id,
            "site_id": self.site_id,
            "asset_id": self.asset_id,
            "location_id": self.location_id,
            "meter_id": self.meter_id,
            "reading_date": self.reading_date.isoformat() if self.reading_date else None,
            "reading_value": self.reading_value,
            "reading_aln": self.reading_aln,
            "delta_value": self.delta_value,
            "is_rollover": self.is_rollover,
            "inspector_id": self.inspector_id,
            "entered_by": self.entered_by,
            "workorder_id": self.workorder_id,
            "remarks": self.remarks,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class MeasurePoint(Base):
    """Condition Monitoring Measurement Point (MEASUREPOINT / POINTMETER).

    Defines alert limits (Upper/Lower Action & Warning) and automated action generation.
    """
    __tablename__ = "measure_point"

    point_id = Column(String(50), primary_key=True)  # e.g. MP_PUMP100_VIB, MP_PUMP100_OIL
    description = Column(String(255), nullable=False)
    site_id = Column(String(50), nullable=False)
    asset_id = Column(String(50), nullable=True)
    location_id = Column(String(50), nullable=True)
    meter_id = Column(String(50), ForeignKey("meter.meter_id", ondelete="CASCADE"), nullable=False)
    upper_action_limit = Column(Float, nullable=True)
    lower_action_limit = Column(Float, nullable=True)
    upper_warning_limit = Column(Float, nullable=True)
    lower_warning_limit = Column(Float, nullable=True)
    action_aln_value = Column(String(255), nullable=True)                  # e.g. "BURNT", "DIRTY", "FAIL"
    action_description = Column(String(255), nullable=True)                # e.g. "Trigger Emergency Bearing Inspection"
    action_job_plan = Column(String(100), nullable=True)
    action_priority = Column(Integer, default=1, nullable=False)
    status = Column(String(30), default="ACTIVE", nullable=False)
    last_breach_date = Column(DateTime(timezone=True), nullable=True)
    last_breach_value = Column(String(255), nullable=True)
    last_breach_type = Column(String(50), nullable=True)                   # UPPER_ACTION | LOWER_ACTION | WARNING | CHARACTERISTIC

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    meter = relationship("Meter", lazy="selectin")

    def to_dict(self):
        return {
            "point_id": self.point_id,
            "description": self.description,
            "site_id": self.site_id,
            "asset_id": self.asset_id,
            "location_id": self.location_id,
            "meter_id": self.meter_id,
            "meter_type": self.meter.meter_type if self.meter else "GAUGE",
            "unit_of_measure": self.meter.unit_of_measure if self.meter else None,
            "upper_action_limit": self.upper_action_limit,
            "lower_action_limit": self.lower_action_limit,
            "upper_warning_limit": self.upper_warning_limit,
            "lower_warning_limit": self.lower_warning_limit,
            "action_aln_value": self.action_aln_value,
            "action_description": self.action_description,
            "action_job_plan": self.action_job_plan,
            "action_priority": self.action_priority,
            "status": self.status,
            "last_breach_date": self.last_breach_date.isoformat() if self.last_breach_date else None,
            "last_breach_value": self.last_breach_value,
            "last_breach_type": self.last_breach_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
