from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc

from backend.database import get_db
from backend.models.base import utc_now
from backend.models.meter import (
    Meter,
    MeterGroup,
    MeterInGroup,
    AssetMeter,
    LocationMeter,
    MeterReading,
    MeasurePoint,
)
from backend.models.asset_hierarchy import Location, Asset

router = APIRouter(prefix="/api", tags=["Meters & Condition Monitoring"])


# ==============================================================================
# ---- Pydantic Schemas ----
# ==============================================================================

class MeterCreate(BaseModel):
    meter_id: str = Field(..., min_length=1, max_length=50)
    description: str = Field(..., min_length=1, max_length=255)
    meter_type: str = "CONTINUOUS"  # CONTINUOUS | GAUGE | CHARACTERISTIC
    reading_type: str = "ACTUAL"    # ACTUAL | DELTA
    unit_of_measure: Optional[str] = None
    domain_id: Optional[str] = None
    domain_values: Optional[List[str]] = None
    org_id: Optional[str] = None
    site_id: Optional[str] = None
    status: str = "ACTIVE"


class MeterUpdate(BaseModel):
    description: Optional[str] = None
    meter_type: Optional[str] = None
    reading_type: Optional[str] = None
    unit_of_measure: Optional[str] = None
    domain_id: Optional[str] = None
    domain_values: Optional[List[str]] = None
    org_id: Optional[str] = None
    site_id: Optional[str] = None
    status: Optional[str] = None


class MeterGroupCreate(BaseModel):
    group_id: str = Field(..., min_length=1, max_length=50)
    description: str = Field(..., min_length=1, max_length=255)
    org_id: Optional[str] = None
    site_id: Optional[str] = None
    status: str = "ACTIVE"
    meters: Optional[List[Dict[str, Any]]] = None


class MeterGroupUpdate(BaseModel):
    description: Optional[str] = None
    org_id: Optional[str] = None
    site_id: Optional[str] = None
    status: Optional[str] = None


class MeterInGroupAdd(BaseModel):
    meter_id: str
    sequence: int = 1
    default_rollover: Optional[float] = None
    default_avg_method: str = "ALL"
    default_avg_rate: Optional[float] = None


class AssetMeterAttach(BaseModel):
    meter_id: Optional[str] = None
    group_id: Optional[str] = None  # If provided, attaches all meters in this group
    rollover_point: Optional[float] = None
    initial_reading: Optional[float] = 0.0
    initial_reading_aln: Optional[str] = None
    avg_calc_method: str = "ALL"


class LocationMeterAttach(BaseModel):
    meter_id: Optional[str] = None
    group_id: Optional[str] = None
    rollover_point: Optional[float] = None
    initial_reading: Optional[float] = 0.0
    initial_reading_aln: Optional[str] = None
    avg_calc_method: str = "ALL"


class MeterReadingCreate(BaseModel):
    reading_value: Optional[float] = None
    reading_aln: Optional[str] = None
    reading_date: Optional[datetime] = None
    inspector_id: Optional[str] = None
    workorder_id: Optional[str] = None
    remarks: Optional[str] = None
    is_rollover_manual: Optional[bool] = False


class MeterResetInput(BaseModel):
    reset_type: str = "OVERHAUL"  # OVERHAUL | REPAIR | REPLACE_METER
    new_initial_reading: Optional[float] = 0.0
    rollover_point: Optional[float] = None
    remarks: Optional[str] = None


class MeasurePointCreate(BaseModel):
    point_id: str = Field(..., min_length=1, max_length=50)
    description: str = Field(..., min_length=1, max_length=255)
    site_id: str
    asset_id: Optional[str] = None
    location_id: Optional[str] = None
    meter_id: str
    upper_action_limit: Optional[float] = None
    lower_action_limit: Optional[float] = None
    upper_warning_limit: Optional[float] = None
    lower_warning_limit: Optional[float] = None
    action_aln_value: Optional[str] = None
    action_description: Optional[str] = None
    action_job_plan: Optional[str] = None
    action_priority: int = 1
    status: str = "ACTIVE"


class MeasurePointUpdate(BaseModel):
    description: Optional[str] = None
    upper_action_limit: Optional[float] = None
    lower_action_limit: Optional[float] = None
    upper_warning_limit: Optional[float] = None
    lower_warning_limit: Optional[float] = None
    action_aln_value: Optional[str] = None
    action_description: Optional[str] = None
    action_job_plan: Optional[str] = None
    action_priority: Optional[int] = None
    status: Optional[str] = None


# ==============================================================================
# ---- Helper Calculation Functions ----
# ==============================================================================

def _check_condition_monitoring_breach(
    db: Session,
    site_id: str,
    meter_id: str,
    reading_value: Optional[float],
    reading_aln: Optional[str],
    reading_date: datetime,
    asset_id: Optional[str] = None,
    location_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Evaluates active measure points against a new meter reading and registers breaches."""
    query = db.query(MeasurePoint).filter(
        and_(
            MeasurePoint.site_id == site_id,
            MeasurePoint.meter_id == meter_id,
            MeasurePoint.status == "ACTIVE",
        )
    )
    if asset_id:
        query = query.filter(MeasurePoint.asset_id == asset_id)
    elif location_id:
        query = query.filter(MeasurePoint.location_id == location_id)

    points = query.all()
    breaches = []

    for pt in points:
        breach_type = None
        if reading_value is not None:
            if pt.upper_action_limit is not None and reading_value >= pt.upper_action_limit:
                breach_type = "UPPER_ACTION"
            elif pt.lower_action_limit is not None and reading_value <= pt.lower_action_limit:
                breach_type = "LOWER_ACTION"
            elif pt.upper_warning_limit is not None and reading_value >= pt.upper_warning_limit:
                breach_type = "UPPER_WARNING"
            elif pt.lower_warning_limit is not None and reading_value <= pt.lower_warning_limit:
                breach_type = "LOWER_WARNING"
        elif reading_aln and pt.action_aln_value:
            if reading_aln.strip().upper() == pt.action_aln_value.strip().upper():
                breach_type = "CHARACTERISTIC_ACTION"

        if breach_type:
            pt.last_breach_date = reading_date
            pt.last_breach_value = str(reading_value) if reading_value is not None else reading_aln
            pt.last_breach_type = breach_type
            breaches.append({
                "point_id": pt.point_id,
                "breach_type": breach_type,
                "action_description": pt.action_description,
                "action_job_plan": pt.action_job_plan,
                "action_priority": pt.action_priority,
            })

    return breaches[0] if breaches else None


def _recalculate_avg_units_per_day(db: Session, asset_meter: AssetMeter) -> None:
    """Calculates average daily rate of accumulation for a continuous meter."""
    readings = (
        db.query(MeterReading)
        .filter(MeterReading.asset_meter_id == asset_meter.id)
        .order_by(MeterReading.reading_date.asc())
        .all()
    )
    if len(readings) < 2:
        return

    first_rd = readings[0]
    last_rd = readings[-1]

    if not first_rd.reading_date or not last_rd.reading_date:
        return

    t1 = first_rd.reading_date.replace(tzinfo=timezone.utc) if first_rd.reading_date.tzinfo is None else first_rd.reading_date
    t2 = last_rd.reading_date.replace(tzinfo=timezone.utc) if last_rd.reading_date.tzinfo is None else last_rd.reading_date
    days_diff = (t2 - t1).total_seconds() / 86400.0
    if days_diff <= 0.05:  # less than ~1 hour
        return

    # Sum total positive deltas
    total_delta = sum(r.delta_value for r in readings if r.delta_value and r.delta_value > 0)
    if total_delta > 0 and days_diff > 0:
        asset_meter.avg_units_per_day = total_delta / days_diff


# ==============================================================================
# ---- Master Meter Catalog Endpoints (METER) ----
# ==============================================================================

@router.get("/meters")
def list_meters(
    meter_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    org_id: Optional[str] = None,
    site_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Lists all Master Meters in the enterprise catalog."""
    query = db.query(Meter)
    if status:
        query = query.filter(Meter.status == status.strip().upper())
    if meter_type:
        query = query.filter(Meter.meter_type == meter_type.strip().upper())
    if org_id:
        query = query.filter(or_(Meter.org_id == org_id.strip().upper(), Meter.org_id.is_(None)))
    if site_id:
        query = query.filter(or_(Meter.site_id == site_id.strip().upper(), Meter.site_id.is_(None)))

    all_meters = query.order_by(Meter.meter_id.asc()).all()

    if search:
        s = search.strip().lower()
        all_meters = [
            m for m in all_meters
            if s in m.meter_id.lower()
            or s in m.description.lower()
            or (m.unit_of_measure and s in m.unit_of_measure.lower())
        ]

    return [m.to_dict() for m in all_meters]


@router.get("/meters/{meter_id}")
def get_meter(
    meter_id: str,
    db: Session = Depends(get_db),
):
    mid = meter_id.strip().upper()
    meter = db.query(Meter).filter(Meter.meter_id == mid).first()
    if not meter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Meter '{mid}' not found.")
    return meter.to_dict()


@router.post("/meters", status_code=status.HTTP_201_CREATED)
def create_meter(
    data: MeterCreate,
    db: Session = Depends(get_db),
):
    mid = data.meter_id.strip().upper()
    existing = db.query(Meter).filter(Meter.meter_id == mid).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Meter '{mid}' already exists.")

    meter = Meter(
        meter_id=mid,
        description=data.description.strip(),
        meter_type=data.meter_type.upper(),
        reading_type=data.reading_type.upper(),
        unit_of_measure=data.unit_of_measure.strip() if data.unit_of_measure else None,
        domain_id=data.domain_id.strip().upper() if data.domain_id else None,
        domain_values=data.domain_values,
        org_id=data.org_id.strip().upper() if data.org_id else None,
        site_id=data.site_id.strip().upper() if data.site_id else None,
        status=data.status.upper(),
    )
    db.add(meter)
    db.commit()
    db.refresh(meter)
    return meter.to_dict()


@router.put("/meters/{meter_id}")
def update_meter(
    meter_id: str,
    data: MeterUpdate,
    db: Session = Depends(get_db),
):
    mid = meter_id.strip().upper()
    meter = db.query(Meter).filter(Meter.meter_id == mid).first()
    if not meter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Meter '{mid}' not found.")

    if data.description is not None:
        meter.description = data.description.strip()
    if data.meter_type is not None:
        meter.meter_type = data.meter_type.upper()
    if data.reading_type is not None:
        meter.reading_type = data.reading_type.upper()
    if data.unit_of_measure is not None:
        meter.unit_of_measure = data.unit_of_measure.strip() if data.unit_of_measure else None
    if data.domain_id is not None:
        meter.domain_id = data.domain_id.strip().upper() if data.domain_id else None
    if data.domain_values is not None:
        meter.domain_values = data.domain_values
    if data.org_id is not None:
        meter.org_id = data.org_id.strip().upper() if data.org_id else None
    if data.site_id is not None:
        meter.site_id = data.site_id.strip().upper() if data.site_id else None
    if data.status is not None:
        meter.status = data.status.upper()

    db.commit()
    db.refresh(meter)
    return meter.to_dict()


@router.delete("/meters/{meter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meter(
    meter_id: str,
    db: Session = Depends(get_db),
):
    mid = meter_id.strip().upper()
    meter = db.query(Meter).filter(Meter.meter_id == mid).first()
    if not meter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Meter '{mid}' not found.")

    usage = (
        db.query(AssetMeter).filter(AssetMeter.meter_id == mid).count() +
        db.query(LocationMeter).filter(LocationMeter.meter_id == mid).count()
    )
    if usage > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete meter '{mid}' because it is attached to {usage} asset(s) or location(s).",
        )

    db.delete(meter)
    db.commit()
    return None


# ==============================================================================
# ---- Meter Groups Endpoints (METERGROUP & METERINGROUP) ----
# ==============================================================================

@router.get("/meter-groups")
def list_meter_groups(
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(MeterGroup)
    if status:
        query = query.filter(MeterGroup.status == status.strip().upper())
    all_groups = query.order_by(MeterGroup.group_id.asc()).all()

    if search:
        s = search.strip().lower()
        all_groups = [
            g for g in all_groups
            if s in g.group_id.lower() or s in g.description.lower()
        ]

    return [g.to_dict() for g in all_groups]


@router.get("/meter-groups/{group_id}")
def get_meter_group(
    group_id: str,
    db: Session = Depends(get_db),
):
    gid = group_id.strip().upper()
    grp = db.query(MeterGroup).filter(MeterGroup.group_id == gid).first()
    if not grp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Meter group '{gid}' not found.")
    return grp.to_dict()


@router.post("/meter-groups", status_code=status.HTTP_201_CREATED)
def create_meter_group(
    data: MeterGroupCreate,
    db: Session = Depends(get_db),
):
    gid = data.group_id.strip().upper()
    existing = db.query(MeterGroup).filter(MeterGroup.group_id == gid).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Meter group '{gid}' already exists.")

    grp = MeterGroup(
        group_id=gid,
        description=data.description.strip(),
        org_id=data.org_id.strip().upper() if data.org_id else None,
        site_id=data.site_id.strip().upper() if data.site_id else None,
        status=data.status.upper(),
    )
    db.add(grp)
    db.flush()

    if data.meters:
        for idx, m_item in enumerate(data.meters):
            mid = m_item.get("meter_id", "").strip().upper()
            if not mid:
                continue
            item = MeterInGroup(
                id=f"{gid}:{mid}",
                group_id=gid,
                meter_id=mid,
                sequence=m_item.get("sequence", idx + 1),
                default_rollover=m_item.get("default_rollover"),
                default_avg_method=m_item.get("default_avg_method", "ALL"),
                default_avg_rate=m_item.get("default_avg_rate"),
            )
            db.add(item)

    db.commit()
    db.refresh(grp)
    return grp.to_dict()


@router.post("/meter-groups/{group_id}/meters", status_code=status.HTTP_201_CREATED)
def add_meter_to_group(
    group_id: str,
    data: MeterInGroupAdd,
    db: Session = Depends(get_db),
):
    gid = group_id.strip().upper()
    mid = data.meter_id.strip().upper()
    grp = db.query(MeterGroup).filter(MeterGroup.group_id == gid).first()
    if not grp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meter group not found.")

    meter = db.query(Meter).filter(Meter.meter_id == mid).first()
    if not meter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Meter '{mid}' does not exist.")

    item_id = f"{gid}:{mid}"
    existing = db.query(MeterInGroup).filter(MeterInGroup.id == item_id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Meter '{mid}' is already in group '{gid}'.")

    item = MeterInGroup(
        id=item_id,
        group_id=gid,
        meter_id=mid,
        sequence=data.sequence,
        default_rollover=data.default_rollover,
        default_avg_method=data.default_avg_method.upper(),
        default_avg_rate=data.default_avg_rate,
    )
    db.add(item)
    db.commit()
    db.refresh(grp)
    return grp.to_dict()


@router.delete("/meter-groups/{group_id}/meters/{meter_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_meter_from_group(
    group_id: str,
    meter_id: str,
    db: Session = Depends(get_db),
):
    gid = group_id.strip().upper()
    mid = meter_id.strip().upper()
    item_id = f"{gid}:{mid}"
    item = db.query(MeterInGroup).filter(MeterInGroup.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meter item in group not found.")
    db.delete(item)
    db.commit()
    return None


@router.delete("/meter-groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meter_group(
    group_id: str,
    db: Session = Depends(get_db),
):
    gid = group_id.strip().upper()
    grp = db.query(MeterGroup).filter(MeterGroup.group_id == gid).first()
    if not grp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Meter group '{gid}' not found.")
    db.delete(grp)
    db.commit()
    return None


# ==============================================================================
# ---- Asset Meters & Reading Ingestion (ASSETMETER & METERREADING) ----
# ==============================================================================

@router.get("/assets/{site_id}/{asset_id}/meters")
def get_asset_meters(
    site_id: str,
    asset_id: str,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()

    asset = db.query(Asset).filter(and_(Asset.site_id == sid, Asset.asset_id == aid)).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Asset '{aid}' not found.")

    meters = (
        db.query(AssetMeter)
        .filter(and_(AssetMeter.site_id == sid, AssetMeter.asset_id == aid))
        .all()
    )
    return {
        "site_id": sid,
        "asset_id": aid,
        "asset_name": asset.name,
        "meters": [m.to_dict() for m in meters],
    }


@router.post("/assets/{site_id}/{asset_id}/meters", status_code=status.HTTP_201_CREATED)
def attach_meter_to_asset(
    site_id: str,
    asset_id: str,
    data: AssetMeterAttach,
    db: Session = Depends(get_db),
):
    """Attaches an individual meter or an entire Meter Group to an asset."""
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()

    asset = db.query(Asset).filter(and_(Asset.site_id == sid, Asset.asset_id == aid)).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Asset '{aid}' not found.")

    attached_meters = []

    # Case 1: Apply whole Meter Group
    if data.group_id:
        gid = data.group_id.strip().upper()
        grp = db.query(MeterGroup).filter(MeterGroup.group_id == gid).first()
        if not grp:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Meter group '{gid}' not found.")

        for item in grp.items:
            mid = item.meter_id
            pk = f"{sid}:{aid}:{mid}"
            if not db.query(AssetMeter).filter(AssetMeter.id == pk).first():
                am = AssetMeter(
                    id=pk,
                    site_id=sid,
                    asset_id=aid,
                    meter_id=mid,
                    rollover_point=item.default_rollover,
                    avg_calc_method=item.default_avg_method,
                    avg_units_per_day=item.default_avg_rate or 0.0,
                    life_to_date=0.0,
                    since_last_overhaul=0.0,
                    since_last_repair=0.0,
                    active=True,
                )
                db.add(am)
                attached_meters.append(am)

    # Case 2: Attach Single Meter
    elif data.meter_id:
        mid = data.meter_id.strip().upper()
        meter = db.query(Meter).filter(Meter.meter_id == mid).first()
        if not meter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Meter '{mid}' does not exist.")

        pk = f"{sid}:{aid}:{mid}"
        existing = db.query(AssetMeter).filter(AssetMeter.id == pk).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Meter '{mid}' is already attached to asset '{aid}'.")

        init_val = data.initial_reading if meter.meter_type != "CHARACTERISTIC" else None
        init_aln = data.initial_reading_aln if meter.meter_type == "CHARACTERISTIC" else None

        am = AssetMeter(
            id=pk,
            site_id=sid,
            asset_id=aid,
            meter_id=mid,
            last_reading=init_val,
            last_reading_aln=init_aln,
            last_reading_date=utc_now() if (init_val is not None or init_aln is not None) else None,
            rollover_point=data.rollover_point,
            avg_calc_method=data.avg_calc_method.upper(),
            life_to_date=init_val or 0.0,
            since_last_overhaul=init_val or 0.0,
            since_last_repair=init_val or 0.0,
            active=True,
        )
        db.add(am)
        attached_meters.append(am)

        # Log initial reading if provided
        if init_val is not None or init_aln is not None:
            rd = MeterReading(
                site_id=sid,
                asset_id=aid,
                meter_id=mid,
                asset_meter_id=pk,
                reading_date=utc_now(),
                reading_value=init_val,
                reading_aln=init_aln,
                delta_value=0.0,
                remarks="Initial baseline reading on attachment",
            )
            db.add(rd)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Must provide either meter_id or group_id.")

    db.commit()
    return get_asset_meters(sid, aid, db)


@router.post("/assets/{site_id}/{asset_id}/meters/{meter_id}/readings", status_code=status.HTTP_201_CREATED)
def record_asset_meter_reading(
    site_id: str,
    asset_id: str,
    meter_id: str,
    data: MeterReadingCreate,
    db: Session = Depends(get_db),
):
    """Logs a new meter reading with rollover detection, cumulative counter updates, and condition monitoring check."""
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()
    mid = meter_id.strip().upper()
    pk = f"{sid}:{aid}:{mid}"

    am = db.query(AssetMeter).filter(AssetMeter.id == pk).first()
    if not am:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Meter '{mid}' is not attached to asset '{aid}'.")

    meter = am.meter
    rd_date = data.reading_date or utc_now()
    delta = 0.0
    is_rollover = False

    if meter.meter_type == "CONTINUOUS":
        if data.reading_value is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Continuous meters require numeric reading_value.")

        new_val = float(data.reading_value)
        old_val = am.last_reading

        if old_val is not None:
            if new_val < old_val:
                # Check Rollover
                if am.rollover_point and am.rollover_point > 0:
                    delta = (am.rollover_point - old_val) + new_val
                    is_rollover = True
                elif data.is_rollover_manual:
                    delta = new_val
                    is_rollover = True
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Entered reading ({new_val}) is lower than previous reading ({old_val}). Configure rollover point or confirm rollover cycle.",
                    )
            else:
                delta = new_val - old_val
        else:
            delta = new_val

        am.life_to_date = (am.life_to_date or 0.0) + delta
        am.since_last_overhaul = (am.since_last_overhaul or 0.0) + delta
        am.since_last_repair = (am.since_last_repair or 0.0) + delta
        am.last_reading = new_val
        am.last_reading_date = rd_date

    elif meter.meter_type == "GAUGE":
        if data.reading_value is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Gauge meters require numeric reading_value.")
        new_val = float(data.reading_value)
        delta = (new_val - am.last_reading) if am.last_reading is not None else 0.0
        am.last_reading = new_val
        am.last_reading_date = rd_date

    elif meter.meter_type == "CHARACTERISTIC":
        if not data.reading_aln:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Characteristic meters require reading_aln value.")
        am.last_reading_aln = data.reading_aln.strip()
        am.last_reading_date = rd_date

    # Create immutable reading record
    reading_record = MeterReading(
        site_id=sid,
        asset_id=aid,
        meter_id=mid,
        asset_meter_id=am.id,
        reading_date=rd_date,
        reading_value=data.reading_value,
        reading_aln=data.reading_aln,
        delta_value=round(delta, 2),
        is_rollover=is_rollover,
        inspector_id=data.inspector_id,
        workorder_id=data.workorder_id,
        remarks=data.remarks,
    )
    db.add(reading_record)
    db.flush()

    # Recalculate average units/day for continuous meters
    if meter.meter_type == "CONTINUOUS":
        _recalculate_avg_units_per_day(db, am)

    # Check condition monitoring breaches
    breach = _check_condition_monitoring_breach(
        db, sid, mid, data.reading_value, data.reading_aln, rd_date, asset_id=aid
    )

    db.commit()
    db.refresh(am)

    return {
        "reading": reading_record.to_dict(),
        "asset_meter": am.to_dict(),
        "breach_alert": breach,
    }


@router.post("/assets/{site_id}/{asset_id}/meters/{meter_id}/reset")
def reset_asset_meter(
    site_id: str,
    asset_id: str,
    meter_id: str,
    data: MeterResetInput,
    db: Session = Depends(get_db),
):
    """Resets Since-Overhaul/Since-Repair counters or records physical meter dial replacement."""
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()
    mid = meter_id.strip().upper()
    pk = f"{sid}:{aid}:{mid}"

    am = db.query(AssetMeter).filter(AssetMeter.id == pk).first()
    if not am:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset meter not found.")

    if data.reset_type.upper() == "OVERHAUL":
        am.since_last_overhaul = 0.0
    elif data.reset_type.upper() == "REPAIR":
        am.since_last_repair = 0.0
    elif data.reset_type.upper() == "REPLACE_METER":
        new_init = data.new_initial_reading or 0.0
        am.last_reading = new_init
        am.last_reading_date = utc_now()
        if data.rollover_point is not None:
            am.rollover_point = data.rollover_point
        # Log replacement reading
        db.add(MeterReading(
            site_id=sid,
            asset_id=aid,
            meter_id=mid,
            asset_meter_id=am.id,
            reading_date=utc_now(),
            reading_value=new_init,
            delta_value=0.0,
            remarks=f"Meter Replacement / Reset: {data.remarks or 'Physical Dial Reset'}",
        ))

    db.commit()
    db.refresh(am)
    return am.to_dict()


@router.get("/assets/{site_id}/{asset_id}/meters/{meter_id}/readings")
def get_asset_meter_readings(
    site_id: str,
    asset_id: str,
    meter_id: str,
    limit: int = Query(50, le=500),
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()
    mid = meter_id.strip().upper()
    pk = f"{sid}:{aid}:{mid}"

    readings = (
        db.query(MeterReading)
        .filter(MeterReading.asset_meter_id == pk)
        .order_by(MeterReading.reading_date.desc())
        .limit(limit)
        .all()
    )
    return [r.to_dict() for r in readings]


@router.delete("/assets/{site_id}/{asset_id}/meters/{meter_id}", status_code=status.HTTP_204_NO_CONTENT)
def detach_meter_from_asset(
    site_id: str,
    asset_id: str,
    meter_id: str,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()
    mid = meter_id.strip().upper()
    pk = f"{sid}:{aid}:{mid}"

    am = db.query(AssetMeter).filter(AssetMeter.id == pk).first()
    if not am:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset meter not found.")

    db.delete(am)
    db.commit()
    return None


# ==============================================================================
# ---- Location Meters & Reading Ingestion (LOCATIONMETER & METERREADING) ----
# ==============================================================================

@router.get("/locations/{site_id}/{location_id}/meters")
def get_location_meters(
    site_id: str,
    location_id: str,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()

    loc = db.query(Location).filter(and_(Location.site_id == sid, Location.location_id == lid)).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Location '{lid}' not found.")

    meters = (
        db.query(LocationMeter)
        .filter(and_(LocationMeter.site_id == sid, LocationMeter.location_id == lid))
        .all()
    )
    return {
        "site_id": sid,
        "location_id": lid,
        "location_description": loc.description,
        "meters": [m.to_dict() for m in meters],
    }


@router.post("/locations/{site_id}/{location_id}/meters", status_code=status.HTTP_201_CREATED)
def attach_meter_to_location(
    site_id: str,
    location_id: str,
    data: LocationMeterAttach,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()

    loc = db.query(Location).filter(and_(Location.site_id == sid, Location.location_id == lid)).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Location '{lid}' not found.")

    if data.meter_id:
        mid = data.meter_id.strip().upper()
        meter = db.query(Meter).filter(Meter.meter_id == mid).first()
        if not meter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Meter '{mid}' does not exist.")

        pk = f"{sid}:{lid}:{mid}"
        existing = db.query(LocationMeter).filter(LocationMeter.id == pk).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Meter '{mid}' is already attached.")

        init_val = data.initial_reading if meter.meter_type != "CHARACTERISTIC" else None
        init_aln = data.initial_reading_aln if meter.meter_type == "CHARACTERISTIC" else None

        lm = LocationMeter(
            id=pk,
            site_id=sid,
            location_id=lid,
            meter_id=mid,
            last_reading=init_val,
            last_reading_aln=init_aln,
            last_reading_date=utc_now() if (init_val is not None or init_aln is not None) else None,
            rollover_point=data.rollover_point,
            avg_calc_method=data.avg_calc_method.upper(),
            life_to_date=init_val or 0.0,
            active=True,
        )
        db.add(lm)
        db.commit()
    return get_location_meters(sid, lid, db)


@router.post("/locations/{site_id}/{location_id}/meters/{meter_id}/readings", status_code=status.HTTP_201_CREATED)
def record_location_meter_reading(
    site_id: str,
    location_id: str,
    meter_id: str,
    data: MeterReadingCreate,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()
    mid = meter_id.strip().upper()
    pk = f"{sid}:{lid}:{mid}"

    lm = db.query(LocationMeter).filter(LocationMeter.id == pk).first()
    if not lm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Meter '{mid}' is not attached to location '{lid}'.")

    meter = lm.meter
    rd_date = data.reading_date or utc_now()
    delta = 0.0

    if meter.meter_type == "CONTINUOUS":
        if data.reading_value is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Continuous meters require numeric reading_value.")
        new_val = float(data.reading_value)
        old_val = lm.last_reading
        delta = (new_val - old_val) if old_val is not None else new_val
        lm.life_to_date = (lm.life_to_date or 0.0) + max(0.0, delta)
        lm.last_reading = new_val
        lm.last_reading_date = rd_date
    elif meter.meter_type == "GAUGE":
        if data.reading_value is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Gauge meters require numeric reading_value.")
        lm.last_reading = float(data.reading_value)
        lm.last_reading_date = rd_date
    elif meter.meter_type == "CHARACTERISTIC":
        lm.last_reading_aln = data.reading_aln.strip() if data.reading_aln else None
        lm.last_reading_date = rd_date

    reading_record = MeterReading(
        site_id=sid,
        location_id=lid,
        meter_id=mid,
        location_meter_id=lm.id,
        reading_date=rd_date,
        reading_value=data.reading_value,
        reading_aln=data.reading_aln,
        delta_value=round(delta, 2),
        inspector_id=data.inspector_id,
        remarks=data.remarks,
    )
    db.add(reading_record)
    db.commit()
    db.refresh(lm)
    return {"reading": reading_record.to_dict(), "location_meter": lm.to_dict()}


@router.delete("/locations/{site_id}/{location_id}/meters/{meter_id}", status_code=status.HTTP_204_NO_CONTENT)
def detach_meter_from_location(
    site_id: str,
    location_id: str,
    meter_id: str,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()
    mid = meter_id.strip().upper()
    pk = f"{sid}:{lid}:{mid}"

    lm = db.query(LocationMeter).filter(LocationMeter.id == pk).first()
    if not lm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location meter not found.")

    db.delete(lm)
    db.commit()
    return None


# ==============================================================================
# ---- Condition Monitoring & Measure Points (MEASUREPOINT) ----
# ==============================================================================

@router.get("/measure-points")
def list_measure_points(
    site_id: Optional[str] = None,
    asset_id: Optional[str] = None,
    location_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(MeasurePoint)
    if status:
        query = query.filter(MeasurePoint.status == status.strip().upper())
    if site_id:
        query = query.filter(MeasurePoint.site_id == site_id.strip().upper())
    if asset_id:
        query = query.filter(MeasurePoint.asset_id == asset_id.strip().upper())
    if location_id:
        query = query.filter(MeasurePoint.location_id == location_id.strip().upper())

    all_points = query.order_by(MeasurePoint.point_id.asc()).all()

    if search:
        s = search.strip().lower()
        all_points = [
            p for p in all_points
            if s in p.point_id.lower()
            or s in p.description.lower()
            or s in p.meter_id.lower()
            or (p.asset_id and s in p.asset_id.lower())
        ]

    return [p.to_dict() for p in all_points]


@router.get("/measure-points/{point_id}")
def get_measure_point(
    point_id: str,
    db: Session = Depends(get_db),
):
    pid = point_id.strip().upper()
    pt = db.query(MeasurePoint).filter(MeasurePoint.point_id == pid).first()
    if not pt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Measure point '{pid}' not found.")
    return pt.to_dict()


@router.post("/measure-points", status_code=status.HTTP_201_CREATED)
def create_measure_point(
    data: MeasurePointCreate,
    db: Session = Depends(get_db),
):
    pid = data.point_id.strip().upper()
    existing = db.query(MeasurePoint).filter(MeasurePoint.point_id == pid).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Measure point '{pid}' already exists.")

    pt = MeasurePoint(
        point_id=pid,
        description=data.description.strip(),
        site_id=data.site_id.strip().upper(),
        asset_id=data.asset_id.strip().upper() if data.asset_id else None,
        location_id=data.location_id.strip().upper() if data.location_id else None,
        meter_id=data.meter_id.strip().upper(),
        upper_action_limit=data.upper_action_limit,
        lower_action_limit=data.lower_action_limit,
        upper_warning_limit=data.upper_warning_limit,
        lower_warning_limit=data.lower_warning_limit,
        action_aln_value=data.action_aln_value.strip() if data.action_aln_value else None,
        action_description=data.action_description.strip() if data.action_description else None,
        action_job_plan=data.action_job_plan.strip() if data.action_job_plan else None,
        action_priority=data.action_priority,
        status=data.status.upper(),
    )
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return pt.to_dict()


@router.put("/measure-points/{point_id}")
def update_measure_point(
    point_id: str,
    data: MeasurePointUpdate,
    db: Session = Depends(get_db),
):
    pid = point_id.strip().upper()
    pt = db.query(MeasurePoint).filter(MeasurePoint.point_id == pid).first()
    if not pt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Measure point '{pid}' not found.")

    if data.description is not None:
        pt.description = data.description.strip()
    if data.upper_action_limit is not None:
        pt.upper_action_limit = data.upper_action_limit
    if data.lower_action_limit is not None:
        pt.lower_action_limit = data.lower_action_limit
    if data.upper_warning_limit is not None:
        pt.upper_warning_limit = data.upper_warning_limit
    if data.lower_warning_limit is not None:
        pt.lower_warning_limit = data.lower_warning_limit
    if data.action_aln_value is not None:
        pt.action_aln_value = data.action_aln_value.strip() if data.action_aln_value else None
    if data.action_description is not None:
        pt.action_description = data.action_description.strip() if data.action_description else None
    if data.action_job_plan is not None:
        pt.action_job_plan = data.action_job_plan.strip() if data.action_job_plan else None
    if data.action_priority is not None:
        pt.action_priority = data.action_priority
    if data.status is not None:
        pt.status = data.status.upper()

    db.commit()
    db.refresh(pt)
    return pt.to_dict()


@router.delete("/measure-points/{point_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_measure_point(
    point_id: str,
    db: Session = Depends(get_db),
):
    pid = point_id.strip().upper()
    pt = db.query(MeasurePoint).filter(MeasurePoint.point_id == pid).first()
    if not pt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Measure point '{pid}' not found.")
    db.delete(pt)
    db.commit()
    return None
