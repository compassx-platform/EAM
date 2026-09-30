from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from backend.database import get_db
from backend.models.organization import Site, Organization
from backend.models.asset_hierarchy import Location, Asset

router = APIRouter(prefix="/api", tags=["Asset Hierarchy & Locations"])


# ---- Pydantic Schemas ----

class LocationCreate(BaseModel):
    location_id: str = Field(..., min_length=1, max_length=50)
    site_id: str = Field(..., min_length=1, max_length=50)
    org_id: Optional[str] = None
    parent_location_id: Optional[str] = None
    description: Optional[str] = None
    type: str = "OPERATING"  # OPERATING | STOREROOM | SALVAGE | HOLDING | VENDOR | REPAIR
    status: str = "OPERATING"  # OPERATING | NOT_READY | DECOMMISSIONED
    gl_account: Optional[str] = None


class LocationUpdate(BaseModel):
    description: Optional[str] = None
    parent_location_id: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    gl_account: Optional[str] = None


class AssetCreate(BaseModel):
    asset_id: str = Field(..., min_length=1, max_length=50)
    site_id: str = Field(..., min_length=1, max_length=50)
    org_id: Optional[str] = None
    location_id: Optional[str] = None
    parent_asset_id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    item_num: Optional[str] = None
    serial_num: Optional[str] = None
    status: str = "OPERATING"  # OPERATING | NOT_READY | IN_REPAIR | DECOMMISSIONED
    vendor: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    purchase_cost: float = 0.0
    install_date: Optional[datetime] = None
    priority: int = 3


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    location_id: Optional[str] = None
    parent_asset_id: Optional[str] = None
    item_num: Optional[str] = None
    serial_num: Optional[str] = None
    status: Optional[str] = None
    vendor: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    purchase_cost: Optional[float] = None
    install_date: Optional[datetime] = None
    priority: Optional[int] = None


# ---- Location Endpoints ----

@router.get("/locations")
def list_locations(
    site_id: Optional[str] = None,
    org_id: Optional[str] = None,
    type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Location)
    if site_id:
        query = query.filter(Location.site_id == site_id.strip().upper())
    if org_id:
        query = query.filter(Location.org_id == org_id.strip().upper())
    if type:
        query = query.filter(Location.type == type.strip().upper())
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Location.location_id.ilike(s),
                Location.description.ilike(s),
            )
        )
    locations = query.order_by(Location.location_id.asc()).all()
    return [l.to_dict() for l in locations]


@router.post("/locations", status_code=status.HTTP_201_CREATED)
def create_location(
    data: LocationCreate,
    db: Session = Depends(get_db),
):
    sid = data.site_id.strip().upper()
    lid = data.location_id.strip().upper()

    # Verify site exists
    site = db.query(Site).filter(Site.site_id == sid).first()
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Site '{sid}' does not exist.",
        )

    # Check duplicate
    existing = db.query(Location).filter(
        and_(Location.site_id == sid, Location.location_id == lid)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Location '{lid}' already exists in Site '{sid}'.",
        )

    # Check parent location in same site
    ploc_id = data.parent_location_id.strip().upper() if data.parent_location_id else None
    if ploc_id:
        parent = db.query(Location).filter(
            and_(Location.site_id == sid, Location.location_id == ploc_id)
        ).first()
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Parent location '{ploc_id}' does not exist in Site '{sid}'.",
            )

    loc = Location(
        location_id=lid,
        site_id=sid,
        org_id=data.org_id or site.org_id,
        parent_location_id=ploc_id,
        description=data.description,
        type=data.type.upper(),
        status=data.status.upper(),
        gl_account=data.gl_account,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc.to_dict()


@router.get("/locations/{site_id}/{location_id}")
def get_location(
    site_id: str,
    location_id: str,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()

    loc = db.query(Location).filter(
        and_(Location.site_id == sid, Location.location_id == lid)
    ).first()
    if not loc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location '{lid}' not found in Site '{sid}'.",
        )
    data = loc.to_dict()
    # Fetch installed assets
    assets = db.query(Asset).filter(
        and_(Asset.site_id == sid, Asset.location_id == lid)
    ).all()
    data["installed_assets"] = [a.to_dict() for a in assets]
    return data


@router.put("/locations/{site_id}/{location_id}")
def update_location(
    site_id: str,
    location_id: str,
    data: LocationUpdate,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()

    loc = db.query(Location).filter(
        and_(Location.site_id == sid, Location.location_id == lid)
    ).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found.")

    if data.description is not None:
        loc.description = data.description
    if data.parent_location_id is not None:
        p_id = data.parent_location_id.strip().upper() if data.parent_location_id else None
        if p_id == lid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Location cannot be its own parent.")
        loc.parent_location_id = p_id
    if data.type is not None:
        loc.type = data.type.upper()
    if data.status is not None:
        loc.status = data.status.upper()
    if data.gl_account is not None:
        loc.gl_account = data.gl_account

    db.commit()
    db.refresh(loc)
    return loc.to_dict()


@router.delete("/locations/{site_id}/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(
    site_id: str,
    location_id: str,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()

    loc = db.query(Location).filter(
        and_(Location.site_id == sid, Location.location_id == lid)
    ).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found.")

    db.delete(loc)
    db.commit()
    return None


# ---- Asset Endpoints ----

@router.get("/assets")
def list_assets(
    site_id: Optional[str] = None,
    org_id: Optional[str] = None,
    location_id: Optional[str] = None,
    parent_asset_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Asset)
    if site_id:
        query = query.filter(Asset.site_id == site_id.strip().upper())
    if org_id:
        query = query.filter(Asset.org_id == org_id.strip().upper())
    if location_id:
        query = query.filter(Asset.location_id == location_id.strip().upper())
    if parent_asset_id:
        query = query.filter(Asset.parent_asset_id == parent_asset_id.strip().upper())
    if status:
        query = query.filter(Asset.status == status.strip().upper())
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Asset.asset_id.ilike(s),
                Asset.name.ilike(s),
                Asset.serial_num.ilike(s),
                Asset.manufacturer.ilike(s),
            )
        )
    assets = query.order_by(Asset.asset_id.asc()).all()
    return [a.to_dict() for a in assets]


@router.post("/assets", status_code=status.HTTP_201_CREATED)
def create_asset(
    data: AssetCreate,
    db: Session = Depends(get_db),
):
    sid = data.site_id.strip().upper()
    aid = data.asset_id.strip().upper()

    # Verify site
    site = db.query(Site).filter(Site.site_id == sid).first()
    if not site:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Site '{sid}' does not exist.",
        )

    # Check duplicate
    existing = db.query(Asset).filter(
        and_(Asset.site_id == sid, Asset.asset_id == aid)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Asset '{aid}' already exists in Site '{sid}'.",
        )

    # Check parent asset
    past_id = data.parent_asset_id.strip().upper() if data.parent_asset_id else None
    if past_id:
        if past_id == aid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Asset cannot be its own parent.")
        parent = db.query(Asset).filter(
            and_(Asset.site_id == sid, Asset.asset_id == past_id)
        ).first()
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Parent asset '{past_id}' not found in Site '{sid}'.",
            )

    # Check location
    loc_id = data.location_id.strip().upper() if data.location_id else None
    if loc_id:
        loc = db.query(Location).filter(
            and_(Location.site_id == sid, Location.location_id == loc_id)
        ).first()
        if not loc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Location '{loc_id}' not found in Site '{sid}'.",
            )

    asset = Asset(
        asset_id=aid,
        site_id=sid,
        org_id=data.org_id or site.org_id,
        location_id=loc_id,
        parent_asset_id=past_id,
        name=data.name,
        description=data.description,
        item_num=data.item_num,
        serial_num=data.serial_num,
        status=data.status.upper(),
        vendor=data.vendor,
        manufacturer=data.manufacturer,
        model=data.model,
        purchase_cost=data.purchase_cost,
        install_date=data.install_date,
        priority=data.priority,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset.to_dict()


@router.get("/assets/{site_id}/{asset_id}")
def get_asset(
    site_id: str,
    asset_id: str,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()

    asset = db.query(Asset).filter(
        and_(Asset.site_id == sid, Asset.asset_id == aid)
    ).first()
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Asset '{aid}' not found in Site '{sid}'.",
        )
    data = asset.to_dict()
    # Fetch child assets
    children = db.query(Asset).filter(
        and_(Asset.site_id == sid, Asset.parent_asset_id == aid)
    ).all()
    data["child_assets"] = [c.to_dict() for c in children]
    return data


@router.put("/assets/{site_id}/{asset_id}")
def update_asset(
    site_id: str,
    asset_id: str,
    data: AssetUpdate,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()

    asset = db.query(Asset).filter(
        and_(Asset.site_id == sid, Asset.asset_id == aid)
    ).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")

    if data.name is not None:
        asset.name = data.name
    if data.description is not None:
        asset.description = data.description
    if data.location_id is not None:
        asset.location_id = data.location_id.strip().upper() if data.location_id else None
    if data.parent_asset_id is not None:
        p_id = data.parent_asset_id.strip().upper() if data.parent_asset_id else None
        if p_id == aid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Asset cannot be its own parent.")
        asset.parent_asset_id = p_id
    if data.item_num is not None:
        asset.item_num = data.item_num
    if data.serial_num is not None:
        asset.serial_num = data.serial_num
    if data.status is not None:
        asset.status = data.status.upper()
    if data.vendor is not None:
        asset.vendor = data.vendor
    if data.manufacturer is not None:
        asset.manufacturer = data.manufacturer
    if data.model is not None:
        asset.model = data.model
    if data.purchase_cost is not None:
        asset.purchase_cost = data.purchase_cost
    if data.install_date is not None:
        asset.install_date = data.install_date
    if data.priority is not None:
        asset.priority = data.priority

    db.commit()
    db.refresh(asset)
    return asset.to_dict()


@router.delete("/assets/{site_id}/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    site_id: str,
    asset_id: str,
    db: Session = Depends(get_db),
):
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()

    asset = db.query(Asset).filter(
        and_(Asset.site_id == sid, Asset.asset_id == aid)
    ).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")

    db.delete(asset)
    db.commit()
    return None


# ---- Multi-Level Drilldown Hierarchy API ----

@router.get("/hierarchy/drilldown")
def get_drilldown_tree(
    site_id: Optional[str] = None,
    org_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Returns the complete nested hierarchy tree of Locations, Parent Assets, and Child Assets.

    Structure:
    - Sites
      - Location Hierarchy (Roots -> Sub-locations)
        - Installed Assets (Roots -> Sub-assemblies)
      - Unassigned Assets in Site
    """
    # Find sites
    site_query = db.query(Site)
    if site_id:
        site_query = site_query.filter(Site.site_id == site_id.strip().upper())
    if org_id:
        site_query = site_query.filter(Site.org_id == org_id.strip().upper())
    sites = site_query.order_by(Site.site_id.asc()).all()

    drilldown_result = []

    for s in sites:
        # Fetch all locations for this site
        all_locations = [
            l.to_dict()
            for l in db.query(Location)
            .filter(Location.site_id == s.site_id)
            .order_by(Location.location_id.asc())
            .all()
        ]

        # Fetch all assets for this site
        all_assets = [
            a.to_dict()
            for a in db.query(Asset)
            .filter(Asset.site_id == s.site_id)
            .order_by(Asset.asset_id.asc())
            .all()
        ]

        # 1. Build Asset Trees (Parent-Child)
        assets_by_id: Dict[str, Dict[str, Any]] = {a["asset_id"]: {**a, "children": []} for a in all_assets}
        root_assets_by_location: Dict[str, List[Dict[str, Any]]] = {}
        unassigned_assets: List[Dict[str, Any]] = []

        for a_id, a_data in assets_by_id.items():
            parent_id = a_data.get("parent_asset_id")
            if parent_id and parent_id in assets_by_id:
                assets_by_id[parent_id]["children"].append(a_data)
            else:
                loc_id = a_data.get("location_id")
                if loc_id:
                    if loc_id not in root_assets_by_location:
                        root_assets_by_location[loc_id] = []
                    root_assets_by_location[loc_id].append(a_data)
                else:
                    unassigned_assets.append(a_data)

        # 2. Build Location Trees (Parent-Child)
        locations_by_id: Dict[str, Dict[str, Any]] = {
            l["location_id"]: {
                **l,
                "children_locations": [],
                "assets": root_assets_by_location.get(l["location_id"], []),
            }
            for l in all_locations
        }

        root_locations = []
        for l_id, l_data in locations_by_id.items():
            p_loc_id = l_data.get("parent_location_id")
            if p_loc_id and p_loc_id in locations_by_id:
                locations_by_id[p_loc_id]["children_locations"].append(l_data)
            else:
                root_locations.append(l_data)

        drilldown_result.append({
            "site_id": s.site_id,
            "site_name": s.name,
            "org_id": s.org_id,
            "status": s.status,
            "locations_tree": root_locations,
            "unassigned_assets": unassigned_assets,
            "total_locations": len(all_locations),
            "total_assets": len(all_assets),
        })

    return drilldown_result
