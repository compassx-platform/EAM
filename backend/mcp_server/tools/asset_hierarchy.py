"""
Asset Hierarchy module MCP tools for CompassX EAM.

Provides tools for managing physical/operating Locations, Assets, multi-level
parent-child equipment/machinery sub-assemblies, and multi-level drilldown hierarchy trees.
"""

from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from sqlalchemy import and_, or_

from backend.mcp_server.context import get_db_session
from backend.models.organization import Site
from backend.models.asset_hierarchy import Location, Asset


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        raise ValueError(f"Invalid ISO datetime format: '{value}'")


# ==============================================================================
# 1. Location Tools
# ==============================================================================

def location_list(
    site_id: Optional[str] = None,
    org_id: Optional[str] = None,
    type: Optional[str] = None,
    search: Optional[str] = None,
) -> Dict[str, Any]:
    """
    List physical or functional locations within sites/organizations.

    Args:
        site_id: Optional site identifier filter (e.g. 'BEDFORD')
        org_id: Optional organization identifier filter (e.g. 'EAGLE')
        type: Optional location type filter ('OPERATING', 'STOREROOM', 'SALVAGE', 'HOLDING', 'VENDOR', 'REPAIR')
        search: Optional text filter matching location_id or description
    """
    with get_db_session() as db:
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
        return {
            "success": True,
            "count": len(locations),
            "locations": [l.to_dict() for l in locations],
        }


def location_get(
    site_id: str,
    location_id: str,
) -> Dict[str, Any]:
    """
    Get detailed information about a location, including all installed assets.

    Args:
        site_id: Site identifier (e.g. 'BEDFORD')
        location_id: Location identifier (e.g. 'MECH_ROOM_101')
    """
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()

    with get_db_session() as db:
        loc = db.query(Location).filter(
            and_(Location.site_id == sid, Location.location_id == lid)
        ).first()
        if not loc:
            return {
                "success": False,
                "error": f"Location '{lid}' not found in Site '{sid}'.",
            }

        data = loc.to_dict()
        assets = db.query(Asset).filter(
            and_(Asset.site_id == sid, Asset.location_id == lid)
        ).order_by(Asset.asset_id.asc()).all()
        data["installed_assets"] = [a.to_dict() for a in assets]

        return {
            "success": True,
            "location": data,
        }


def location_create(
    location_id: str,
    site_id: str,
    description: Optional[str] = None,
    parent_location_id: Optional[str] = None,
    type: str = "OPERATING",
    status: str = "OPERATING",
    gl_account: Optional[str] = None,
    org_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a new physical or functional location under a Site.

    Args:
        location_id: Unique location identifier (e.g. 'BOILER_ROOM_02')
        site_id: Site identifier (e.g. 'BEDFORD')
        description: Location description or human-readable title
        parent_location_id: Optional parent location ID within the same site (hierarchical tree)
        type: Location type ('OPERATING', 'STOREROOM', 'SALVAGE', 'HOLDING', 'VENDOR', 'REPAIR')
        status: Status ('OPERATING', 'NOT_READY', 'DECOMMISSIONED')
        gl_account: General ledger accounting code
        org_id: Optional organization ID (defaults to parent site's org_id)
    """
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()

    with get_db_session() as db:
        site = db.query(Site).filter(Site.site_id == sid).first()
        if not site:
            return {"success": False, "error": f"Site '{sid}' does not exist."}

        existing = db.query(Location).filter(
            and_(Location.site_id == sid, Location.location_id == lid)
        ).first()
        if existing:
            return {"success": False, "error": f"Location '{lid}' already exists in Site '{sid}'."}

        ploc_id = parent_location_id.strip().upper() if parent_location_id and parent_location_id.strip() else None
        if ploc_id:
            if ploc_id == lid:
                return {"success": False, "error": "Location cannot be its own parent."}
            parent = db.query(Location).filter(
                and_(Location.site_id == sid, Location.location_id == ploc_id)
            ).first()
            if not parent:
                return {"success": False, "error": f"Parent location '{ploc_id}' does not exist in Site '{sid}'."}

        loc = Location(
            location_id=lid,
            site_id=sid,
            org_id=(org_id.strip().upper() if org_id else site.org_id),
            parent_location_id=ploc_id,
            description=description,
            type=type.strip().upper(),
            status=status.strip().upper(),
            gl_account=gl_account,
        )
        db.add(loc)
        db.commit()
        db.refresh(loc)

        return {
            "success": True,
            "location": loc.to_dict(),
        }


def location_update(
    site_id: str,
    location_id: str,
    description: Optional[str] = None,
    parent_location_id: Optional[str] = None,
    type: Optional[str] = None,
    status: Optional[str] = None,
    gl_account: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update attributes or hierarchy placement of an existing location.

    Args:
        site_id: Site identifier (e.g. 'BEDFORD')
        location_id: Location identifier (e.g. 'MECH_ROOM_101')
        description: New description
        parent_location_id: New parent location ID, or empty string to detach from parent
        type: New location type ('OPERATING', 'STOREROOM', 'SALVAGE', 'HOLDING', 'VENDOR', 'REPAIR')
        status: New status ('OPERATING', 'NOT_READY', 'DECOMMISSIONED')
        gl_account: New general ledger code
    """
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()

    with get_db_session() as db:
        loc = db.query(Location).filter(
            and_(Location.site_id == sid, Location.location_id == lid)
        ).first()
        if not loc:
            return {"success": False, "error": f"Location '{lid}' not found in Site '{sid}'."}

        if description is not None:
            loc.description = description

        if parent_location_id is not None:
            p_id = parent_location_id.strip().upper() if parent_location_id.strip() else None
            if p_id == lid:
                return {"success": False, "error": "Location cannot be its own parent."}
            if p_id:
                parent = db.query(Location).filter(
                    and_(Location.site_id == sid, Location.location_id == p_id)
                ).first()
                if not parent:
                    return {"success": False, "error": f"Parent location '{p_id}' does not exist in Site '{sid}'."}

                # Ancestry cycle check
                curr = parent
                visited = {lid}
                while curr and curr.parent_location_id:
                    next_p = curr.parent_location_id.strip().upper()
                    if next_p in visited:
                        return {
                            "success": False,
                            "error": f"Circular location hierarchy detected: '{lid}' cannot be an ancestor of itself.",
                        }
                    visited.add(next_p)
                    curr = db.query(Location).filter(
                        and_(Location.site_id == sid, Location.location_id == next_p)
                    ).first()

            loc.parent_location_id = p_id

        if type is not None:
            loc.type = type.strip().upper()
        if status is not None:
            loc.status = status.strip().upper()
        if gl_account is not None:
            loc.gl_account = gl_account

        db.commit()
        db.refresh(loc)
        return {
            "success": True,
            "location": loc.to_dict(),
        }


def location_delete(
    site_id: str,
    location_id: str,
) -> Dict[str, Any]:
    """
    Delete a location from a site.

    Args:
        site_id: Site identifier (e.g. 'BEDFORD')
        location_id: Location identifier to delete
    """
    sid = site_id.strip().upper()
    lid = location_id.strip().upper()

    with get_db_session() as db:
        loc = db.query(Location).filter(
            and_(Location.site_id == sid, Location.location_id == lid)
        ).first()
        if not loc:
            return {"success": False, "error": f"Location '{lid}' not found in Site '{sid}'."}

        db.delete(loc)
        db.commit()
        return {
            "success": True,
            "deleted_location_id": lid,
            "site_id": sid,
        }


# ==============================================================================
# 2. Asset Tools
# ==============================================================================

def asset_list(
    site_id: Optional[str] = None,
    org_id: Optional[str] = None,
    location_id: Optional[str] = None,
    parent_asset_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
) -> Dict[str, Any]:
    """
    List assets with optional filtering by site, location, parent asset, or status.

    Args:
        site_id: Optional site filter (e.g. 'BEDFORD')
        org_id: Optional organization filter (e.g. 'EAGLE')
        location_id: Optional location filter (e.g. 'MECH_ROOM_101')
        parent_asset_id: Optional parent asset filter to retrieve direct sub-assemblies
        status: Optional status filter ('OPERATING', 'NOT_READY', 'IN_REPAIR', 'DECOMMISSIONED')
        search: Optional search term matching asset_id, name, serial_num, or manufacturer
    """
    with get_db_session() as db:
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
        return {
            "success": True,
            "count": len(assets),
            "assets": [a.to_dict() for a in assets],
        }


def asset_get(
    site_id: str,
    asset_id: str,
) -> Dict[str, Any]:
    """
    Get detailed asset record, including its direct child sub-assembly assets.

    Args:
        site_id: Site identifier (e.g. 'BEDFORD')
        asset_id: Asset identifier (e.g. 'PUMP_SYS_100')
    """
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()

    with get_db_session() as db:
        asset = db.query(Asset).filter(
            and_(Asset.site_id == sid, Asset.asset_id == aid)
        ).first()
        if not asset:
            return {"success": False, "error": f"Asset '{aid}' not found in Site '{sid}'."}

        data = asset.to_dict()
        children = db.query(Asset).filter(
            and_(Asset.site_id == sid, Asset.parent_asset_id == aid)
        ).order_by(Asset.asset_id.asc()).all()
        data["child_assets"] = [c.to_dict() for c in children]

        return {
            "success": True,
            "asset": data,
        }


def asset_create(
    asset_id: str,
    site_id: str,
    name: str,
    org_id: Optional[str] = None,
    location_id: Optional[str] = None,
    parent_asset_id: Optional[str] = None,
    description: Optional[str] = None,
    item_num: Optional[str] = None,
    serial_num: Optional[str] = None,
    status: str = "OPERATING",
    vendor: Optional[str] = None,
    manufacturer: Optional[str] = None,
    model: Optional[str] = None,
    purchase_cost: float = 0.0,
    install_date: Optional[str] = None,
    priority: int = 3,
) -> Dict[str, Any]:
    """
    Create a new machinery or equipment asset record with optional parent-child assembly hierarchy.

    Args:
        asset_id: Unique asset identifier (e.g. 'MOTOR_50HP_02')
        site_id: Site identifier (e.g. 'BEDFORD')
        name: Asset display name
        org_id: Optional organization ID (defaults to parent site's org_id)
        location_id: Optional operating location ID where asset is installed
        parent_asset_id: Optional parent asset ID for sub-assembly components
        description: Detailed asset technical description
        item_num: Inventory rotating item reference
        serial_num: Manufacturer serial number
        status: Asset lifecycle status ('OPERATING', 'NOT_READY', 'IN_REPAIR', 'DECOMMISSIONED')
        vendor: Supplier or vendor code
        manufacturer: Equipment manufacturer name
        model: Manufacturer model number
        purchase_cost: Capital purchase cost
        install_date: Installation date in ISO 8601 format (e.g. '2026-05-15T00:00:00Z')
        priority: Priority rating from 1 (Critical) to 5 (Low), default 3
    """
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()

    with get_db_session() as db:
        site = db.query(Site).filter(Site.site_id == sid).first()
        if not site:
            return {"success": False, "error": f"Site '{sid}' does not exist."}

        existing = db.query(Asset).filter(
            and_(Asset.site_id == sid, Asset.asset_id == aid)
        ).first()
        if existing:
            return {"success": False, "error": f"Asset '{aid}' already exists in Site '{sid}'."}

        past_id = parent_asset_id.strip().upper() if parent_asset_id and parent_asset_id.strip() else None
        if past_id:
            if past_id == aid:
                return {"success": False, "error": "Asset cannot be its own parent."}
            parent = db.query(Asset).filter(
                and_(Asset.site_id == sid, Asset.asset_id == past_id)
            ).first()
            if not parent:
                return {"success": False, "error": f"Parent asset '{past_id}' not found in Site '{sid}'."}

        loc_id = location_id.strip().upper() if location_id and location_id.strip() else None
        if loc_id:
            loc = db.query(Location).filter(
                and_(Location.site_id == sid, Location.location_id == loc_id)
            ).first()
            if not loc:
                return {"success": False, "error": f"Location '{loc_id}' not found in Site '{sid}'."}

        try:
            dt = _parse_iso(install_date)
        except ValueError as err:
            return {"success": False, "error": str(err)}

        asset = Asset(
            asset_id=aid,
            site_id=sid,
            org_id=(org_id.strip().upper() if org_id else site.org_id),
            location_id=loc_id,
            parent_asset_id=past_id,
            name=name.strip(),
            description=description,
            item_num=item_num,
            serial_num=serial_num,
            status=status.strip().upper(),
            vendor=vendor,
            manufacturer=manufacturer,
            model=model,
            purchase_cost=float(purchase_cost or 0.0),
            install_date=dt,
            priority=int(priority or 3),
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)

        return {
            "success": True,
            "asset": asset.to_dict(),
        }


def asset_update(
    site_id: str,
    asset_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    location_id: Optional[str] = None,
    parent_asset_id: Optional[str] = None,
    item_num: Optional[str] = None,
    serial_num: Optional[str] = None,
    status: Optional[str] = None,
    vendor: Optional[str] = None,
    manufacturer: Optional[str] = None,
    model: Optional[str] = None,
    purchase_cost: Optional[float] = None,
    install_date: Optional[str] = None,
    priority: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Update an existing asset record, move location, or change parent-child hierarchy.

    Args:
        site_id: Site identifier (e.g. 'BEDFORD')
        asset_id: Asset identifier (e.g. 'PUMP_SYS_100')
        name: New display name
        description: New description
        location_id: New location ID (or empty string to unassign from location)
        parent_asset_id: New parent asset ID (or empty string to unassign from parent asset)
        item_num: Rotating inventory reference
        serial_num: Serial number
        status: Lifecycle status ('OPERATING', 'NOT_READY', 'IN_REPAIR', 'DECOMMISSIONED')
        vendor: Vendor or supplier code
        manufacturer: Manufacturer name
        model: Model number
        purchase_cost: Purchase price
        install_date: Installation date in ISO 8601 format
        priority: Priority rating 1-5
    """
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()

    with get_db_session() as db:
        asset = db.query(Asset).filter(
            and_(Asset.site_id == sid, Asset.asset_id == aid)
        ).first()
        if not asset:
            return {"success": False, "error": f"Asset '{aid}' not found in Site '{sid}'."}

        if name is not None:
            asset.name = name.strip()
        if description is not None:
            asset.description = description

        if location_id is not None:
            loc_id = location_id.strip().upper() if location_id.strip() else None
            if loc_id:
                loc = db.query(Location).filter(
                    and_(Location.site_id == sid, Location.location_id == loc_id)
                ).first()
                if not loc:
                    return {"success": False, "error": f"Location '{loc_id}' not found in Site '{sid}'."}
            asset.location_id = loc_id

        if parent_asset_id is not None:
            past_id = parent_asset_id.strip().upper() if parent_asset_id.strip() else None
            if past_id == aid:
                return {"success": False, "error": "Asset cannot be its own parent."}
            if past_id:
                parent = db.query(Asset).filter(
                    and_(Asset.site_id == sid, Asset.asset_id == past_id)
                ).first()
                if not parent:
                    return {"success": False, "error": f"Parent asset '{past_id}' not found in Site '{sid}'."}

                # Ancestry cycle check
                curr = parent
                visited = {aid}
                while curr and curr.parent_asset_id:
                    next_p = curr.parent_asset_id.strip().upper()
                    if next_p in visited:
                        return {
                            "success": False,
                            "error": f"Circular asset hierarchy detected: '{aid}' cannot be an ancestor of itself.",
                        }
                    visited.add(next_p)
                    curr = db.query(Asset).filter(
                        and_(Asset.site_id == sid, Asset.asset_id == next_p)
                    ).first()

            asset.parent_asset_id = past_id

        if item_num is not None:
            asset.item_num = item_num
        if serial_num is not None:
            asset.serial_num = serial_num
        if status is not None:
            asset.status = status.strip().upper()
        if vendor is not None:
            asset.vendor = vendor
        if manufacturer is not None:
            asset.manufacturer = manufacturer
        if model is not None:
            asset.model = model
        if purchase_cost is not None:
            asset.purchase_cost = float(purchase_cost)
        if install_date is not None:
            try:
                asset.install_date = _parse_iso(install_date)
            except ValueError as err:
                return {"success": False, "error": str(err)}
        if priority is not None:
            asset.priority = int(priority)

        db.commit()
        db.refresh(asset)
        return {
            "success": True,
            "asset": asset.to_dict(),
        }


def asset_delete(
    site_id: str,
    asset_id: str,
) -> Dict[str, Any]:
    """
    Delete an asset record from a site.

    Args:
        site_id: Site identifier (e.g. 'BEDFORD')
        asset_id: Asset identifier to delete
    """
    sid = site_id.strip().upper()
    aid = asset_id.strip().upper()

    with get_db_session() as db:
        asset = db.query(Asset).filter(
            and_(Asset.site_id == sid, Asset.asset_id == aid)
        ).first()
        if not asset:
            return {"success": False, "error": f"Asset '{aid}' not found in Site '{sid}'."}

        db.delete(asset)
        db.commit()
        return {
            "success": True,
            "deleted_asset_id": aid,
            "site_id": sid,
        }


# ==============================================================================
# 3. Drilldown Hierarchy & Tree Tools
# ==============================================================================

def asset_hierarchy_drilldown(
    site_id: Optional[str] = None,
    org_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Retrieve the complete multi-level nested hierarchy drilldown tree across sites.

    Structure returned:
    - Sites
      - Location Hierarchy (Roots -> Sub-locations)
        - Installed Assets (Roots -> Sub-assemblies)
      - Unassigned Assets (Staged / Spare assets not installed in a location)

    Args:
        site_id: Optional site filter (e.g. 'BEDFORD')
        org_id: Optional organization filter (e.g. 'EAGLE')
    """
    with get_db_session() as db:
        site_query = db.query(Site)
        if site_id:
            site_query = site_query.filter(Site.site_id == site_id.strip().upper())
        if org_id:
            site_query = site_query.filter(Site.org_id == org_id.strip().upper())
        sites = site_query.order_by(Site.site_id.asc()).all()

        drilldown_result = []

        for s in sites:
            all_locations = [
                l.to_dict()
                for l in db.query(Location)
                .filter(Location.site_id == s.site_id)
                .order_by(Location.location_id.asc())
                .all()
            ]

            all_assets = [
                a.to_dict()
                for a in db.query(Asset)
                .filter(Asset.site_id == s.site_id)
                .order_by(Asset.asset_id.asc())
                .all()
            ]

            # 1. Build Asset Trees (Parent-Child)
            assets_by_id: Dict[str, Dict[str, Any]] = {
                a["asset_id"]: {**a, "children": []} for a in all_assets
            }
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

        return {
            "success": True,
            "count": len(drilldown_result),
            "sites": drilldown_result,
        }


def hierarchy_drilldown(
    site_id: Optional[str] = None,
    org_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Convenience alias for asset_hierarchy_drilldown.
    Retrieve the complete multi-level nested hierarchy drilldown tree across sites.

    Args:
        site_id: Optional site filter (e.g. 'BEDFORD')
        org_id: Optional organization filter (e.g. 'EAGLE')
    """
    return asset_hierarchy_drilldown(site_id=site_id, org_id=org_id)

