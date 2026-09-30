import time
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.database import get_db, Base, engine
from backend.models.entities import DynamicEntity, DynamicEntityEvent
from backend.models.entity_type import EntityTypeDefinition
from backend.models.workflow import WorkflowDefinition
from backend.models.conditions import ConditionDefinition
from backend.models.field_registry import EntityField
from backend.models.users import AppUser, AppRole
from backend.services.expiry_worker import check_and_expire_permits

router = APIRouter(prefix="/system", tags=["System & Admin"])
_start_time = time.time()


@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    registered = [et.name for et in db.query(EntityTypeDefinition).order_by(EntityTypeDefinition.name.asc()).all()]
    return {
        "status": "healthy",
        "service": "compassx-eam-backend",
        "version": "1.0.0",
        "uptime_seconds": round(time.time() - _start_time, 2),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "registered_entities": registered,
    }


@router.get("/stats")
def get_system_stats(db: Session = Depends(get_db)):
    entities_count = db.query(DynamicEntity).count()
    total_events = db.query(DynamicEntityEvent).count()
    entity_types_count = db.query(EntityTypeDefinition).count()
    workflows_count = db.query(WorkflowDefinition).count()
    conditions_count = db.query(ConditionDefinition).count()
    fields_count = db.query(EntityField).count()
    users_count = db.query(AppUser).count()

    return {
        "entities_count": entities_count,
        "entity_types_count": entity_types_count,
        "total_events": total_events,
        "workflows_count": workflows_count,
        "conditions_count": conditions_count,
        "fields_count": fields_count,
        "users_count": users_count,
    }


@router.get("/events")
def list_all_events(limit: int = 50, db: Session = Depends(get_db)):
    """Returns unified recent event audit stream across all entities."""
    events = db.query(DynamicEntityEvent).order_by(DynamicEntityEvent.transaction_time.desc()).limit(limit).all()
    return [e.to_dict() for e in events]


@router.post("/check-expiry")
def trigger_expiry_check(db: Session = Depends(get_db)):
    """Manually triggers the permit expiry checker (Section 7.4)."""
    expired = check_and_expire_permits(db)
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "expired_count": len(expired),
        "expired_permits": expired,
    }


# -----------------------------------------------------------------------------
# System Settings & CompassX Storage Discovery Endpoints
# -----------------------------------------------------------------------------

import re
from urllib.parse import urlparse
from pydantic import BaseModel, Field
from backend.config import settings
from backend.models.system_setting import SystemSetting
from backend.services.compassx_volume_client import compassx_volume_client

_COMMON_SECOND_LEVEL_DOMAINS = {
    "co", "com", "org", "net", "edu", "gov", "mil", "ac", "ne", "gen", "ind"
}
_IPV4_REGEX = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")


def extract_main_domain(hostname: str) -> str:
    """Extracts the main (apex) domain from a hostname, stripping subdomains.
    Preserves localhost, single-label hosts, IP addresses, wildcard DNS (e.g. nip.io, sslip.io), and internal hosts.
    Examples:
        'app.compassx.io' -> 'compassx.io'
        'staging.workflow.compassx.io' -> 'compassx.io'
        '135.13.180.167.nip.io' -> '135.13.180.167.nip.io'
        'sub.example.co.uk' -> 'example.co.uk'
        'localhost' -> 'localhost'
        '127.0.0.1' -> '127.0.0.1'
    """
    if not hostname:
        return ""
    clean_host = hostname.strip().lower()

    # Strip port if present in hostname string
    if ":" in clean_host and not clean_host.startswith("["):
        clean_host = clean_host.split(":", 1)[0]

    if (
        clean_host == "localhost"
        or "." not in clean_host
        or _IPV4_REGEX.match(clean_host)
        or bool(re.search(r"\d+\.\d+\.\d+\.\d+", clean_host))
        or clean_host.endswith((".nip.io", ".sslip.io", ".localtest.me", ".traefik.me", ".vcap.me", ".cluster.local", ".internal"))
        or (clean_host.startswith("[") and clean_host.endswith("]"))
    ):
        return clean_host

    parts = clean_host.split(".")
    if len(parts) <= 2:
        return clean_host

    second_to_last = parts[-2]
    last = parts[-1]

    if len(last) == 2 and second_to_last in _COMMON_SECOND_LEVEL_DOMAINS:
        if len(parts) == 3:
            return clean_host
        return ".".join(parts[-3:])

    return ".".join(parts[-2:])


def normalize_to_main_domain_url(raw_url: str, default_path: str = "/api/v1/catalog") -> str:
    """Normalizes any URL to use its main domain instead of standard corporate subdomains."""
    if not raw_url or not raw_url.strip():
        return ""
    trimmed = raw_url.strip().rstrip("/")
    try:
        parsed = urlparse(trimmed if "://" in trimmed else f"http://{trimmed}")
        hostname = parsed.hostname or "localhost"
        main_host = extract_main_domain(hostname)
        port_suffix = f":{parsed.port}" if parsed.port else ""
        scheme = parsed.scheme or "http"
        path = parsed.path if parsed.path and parsed.path != "/" else default_path
        return f"{scheme}://{main_host}{port_suffix}{path}".rstrip("/")
    except Exception:
        return trimmed


def resolve_browser_catalog_url(request: Request, db: Optional[Session] = None) -> str:
    """Dynamically resolves the CompassX Catalog base URL from browser custom header, database setting, or origin fallback."""
    # 1. Custom header passed directly from browser frontend
    header_url = request.headers.get("x-compassx-catalog-url")
    if header_url and header_url.strip():
        clean_url = header_url.strip().rstrip("/")
        if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
            proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "http"
            clean_url = f"{proto}://{clean_url}"
        if not clean_url.endswith("/api/v1/catalog") and "/api/" not in clean_url:
            clean_url = f"{clean_url}/api/v1/catalog"
        return normalize_to_main_domain_url(clean_url)

    # 2. Database system setting if configured
    if db:
        try:
            setting = db.query(SystemSetting).filter(SystemSetting.key == "storage_config").first()
            if setting and isinstance(setting.value, dict) and setting.value.get("endpoint_url"):
                clean_url = str(setting.value.get("endpoint_url")).strip().rstrip("/")
                if clean_url:
                    if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
                        proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "http"
                        clean_url = f"{proto}://{clean_url}"
                    if not clean_url.endswith("/api/v1/catalog") and "/api/" not in clean_url:
                        clean_url = f"{clean_url}/api/v1/catalog"
                    return normalize_to_main_domain_url(clean_url)
        except Exception:
            pass

    # 3. Request origin / host fallback (auto-detect apex domain from current request)
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "http"
    raw_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost:8000"

    if ":" in raw_host and not raw_host.startswith("["):
        host_name, port_part = raw_host.split(":", 1)
        port_str = f":{port_part}"
    else:
        host_name = raw_host
        port_str = ""

    main_domain = extract_main_domain(host_name)
    return f"{proto}://{main_domain}{port_str}/api/v1/catalog"


def resolve_auth_token(request: Request, db: Optional[Session] = None) -> Optional[str]:
    """Resolves authentication token for CompassX services from headers, cookies, or DB config."""
    # 1. Custom token header passed from frontend
    custom_token = request.headers.get("x-compassx-auth-token") or request.headers.get("x-catalog-token")
    if custom_token and custom_token.strip():
        return custom_token.strip()

    # 2. Authorization header from current request
    auth_hdr = request.headers.get("authorization")
    if auth_hdr and auth_hdr.strip():
        return auth_hdr.strip()

    # 3. Cookies if any
    cookie_token = request.cookies.get("access_token") or request.cookies.get("auth_token") or request.cookies.get("token")
    if cookie_token and cookie_token.strip():
        return f"Bearer {cookie_token.strip()}"

    # 4. Stored setting in DB if any
    if db:
        try:
            setting = db.query(SystemSetting).filter(SystemSetting.key == "storage_config").first()
            if setting and isinstance(setting.value, dict) and setting.value.get("auth_token"):
                return str(setting.value.get("auth_token")).strip()
        except Exception:
            pass

    return settings.COMPASSX_CATALOG_TOKEN


class StorageConfigUpdate(BaseModel):
    catalog_name: str = Field(..., description="Target CompassX catalog name")
    schema_name: str = Field(..., description="Target CompassX schema name")
    volume_id: str = Field(..., description="Target CompassX volume UUID")
    volume_name: str = Field(..., description="Target CompassX volume name")
    storage_location: Optional[str] = Field(None, description="Storage location path")
    endpoint_url: Optional[str] = Field(None, description="CompassX base URL from browser")
    auth_token: Optional[str] = Field(None, description="Optional CompassX Access / Bearer Token")
    updated_by: Optional[str] = "admin"


class CreateStorageVolumeRequest(BaseModel):
    catalog_name: str = Field(..., description="Target CompassX catalog name")
    schema_name: str = Field(..., description="Target CompassX schema name")
    name: str = Field(..., description="Volume name")
    description: Optional[str] = ""


@router.get("/settings/storage")
def get_system_storage_setting(request: Request, db: Session = Depends(get_db)):
    """Gets the active system-level CompassX storage configuration."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == "storage_config").first()
    browser_base = resolve_browser_catalog_url(request, db)

    if setting and setting.value:
        val = dict(setting.value)
        val["is_configured"] = True
        val["endpoint_url"] = val.get("endpoint_url") or browser_base
        val["updated_at"] = setting.updated_at.isoformat() if setting.updated_at else None
        val["updated_by"] = setting.updated_by
        return val

    # Default fallback when not explicitly saved yet
    default_cat = settings.COMPASSX_DEFAULT_CATALOG
    default_sch = settings.COMPASSX_DEFAULT_SCHEMA
    default_vol = settings.COMPASSX_DEFAULT_VOLUME_NAME
    default_vol_id = "3fa85f64-5717-4562-b3fc-2c963f66afa6"

    return {
        "catalog_name": default_cat,
        "schema_name": default_sch,
        "volume_name": default_vol,
        "volume_id": default_vol_id,
        "storage_location": f"workspaces/default/{default_cat}/{default_sch}/volumes/{default_vol}/",
        "endpoint_url": browser_base,
        "is_configured": False,
        "configured_at": None,
        "updated_at": None,
        "updated_by": "system",
    }


@router.put("/settings/storage")
def update_system_storage_setting(
    payload: StorageConfigUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    """Updates the active system-level CompassX storage configuration."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == "storage_config").first()
    storage_loc = payload.storage_location or f"workspaces/default/{payload.catalog_name}/{payload.schema_name}/volumes/{payload.volume_name}/"
    endpoint_url = payload.endpoint_url or resolve_browser_catalog_url(request, db)

    data = {
        "catalog_name": payload.catalog_name.strip(),
        "schema_name": payload.schema_name.strip(),
        "volume_id": payload.volume_id.strip(),
        "volume_name": payload.volume_name.strip(),
        "storage_location": storage_loc,
        "endpoint_url": endpoint_url,
        "auth_token": payload.auth_token.strip() if payload.auth_token else None,
        "configured_at": datetime.now(timezone.utc).isoformat(),
    }

    if not setting:
        setting = SystemSetting(
            key="storage_config",
            value=data,
            category="storage",
            description="Active CompassX storage catalog, schema and volume configuration",
            updated_by=payload.updated_by or "admin",
        )
        db.add(setting)
    else:
        setting.value = data
        setting.updated_at = datetime.now(timezone.utc)
        setting.updated_by = payload.updated_by or "admin"

    db.commit()
    db.refresh(setting)

    res = dict(setting.value)
    res["is_configured"] = True
    res["updated_at"] = setting.updated_at.isoformat() if setting.updated_at else None
    res["updated_by"] = setting.updated_by
    return res


@router.get("/storage/catalogs")
async def list_system_storage_catalogs(
    request: Request,
    db: Session = Depends(get_db),
):
    """Fetches accessible CompassX catalogs and nested schemas using browser base URL."""
    base_url = resolve_browser_catalog_url(request, db)
    auth_token = resolve_auth_token(request, db)
    try:
        return await compassx_volume_client.list_catalogs(base_url=base_url, auth_token=auth_token)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Unable to fetch catalogs from CompassX API at {base_url}: {exc}",
        )


@router.get("/storage/volumes")
async def list_system_storage_volumes(
    request: Request,
    catalog: Optional[str] = None,
    schema_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Fetches storage volumes from CompassX using browser base URL."""
    base_url = resolve_browser_catalog_url(request, db)
    auth_token = resolve_auth_token(request, db)
    try:
        return await compassx_volume_client.list_volumes(
            catalog=catalog,
            schema_name=schema_name,
            base_url=base_url,
            auth_token=auth_token,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Unable to fetch volumes from CompassX API at {base_url}: {exc}",
        )


@router.post("/storage/volumes", status_code=201)
async def create_system_storage_volume(
    payload: CreateStorageVolumeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Creates a new volume under the specified CompassX catalog and schema."""
    base_url = resolve_browser_catalog_url(request, db)
    auth_token = resolve_auth_token(request, db)
    try:
        return await compassx_volume_client.create_volume(
            catalog_name=payload.catalog_name,
            schema_name=payload.schema_name,
            name=payload.name,
            description=payload.description or "",
            base_url=base_url,
            auth_token=auth_token,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to create volume in CompassX at {base_url}: {exc}",
        )
