import time
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.database import get_db, Base, engine, SessionLocal
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
import os
import re
import logging
from urllib.parse import urlparse
from pydantic import BaseModel, Field
from backend.config import settings
from backend.models.system_setting import SystemSetting
from backend.services.compassx_volume_client import compassx_volume_client

logger = logging.getLogger(__name__)

_COMMON_SECOND_LEVEL_DOMAINS = {
    "co", "com", "org", "net", "edu", "gov", "mil", "ac", "ne", "gen", "ind"
}
_IPV4_REGEX = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")
_NIP_SSLIP_REGEX = re.compile(r"((?:\d{1,3}[.-]){3}\d{1,3}\.(?:nip\.io|sslip\.io))$", re.IGNORECASE)


def extract_main_domain(hostname: str) -> str:
    """Extracts the main (apex) domain from a hostname, stripping app subdomains (e.g. 'eam-dev.', 'eam.', 'app.').
    Preserves localhost, single-label hosts, IP addresses, wildcard DNS (e.g. nip.io, sslip.io), and internal hosts.
    Examples:
        'eam-dev.135.13.180.167.nip.io' -> '135.13.180.167.nip.io'
        '135.13.180.167.nip.io' -> '135.13.180.167.nip.io'
        'app.compassx.io' -> 'compassx.io'
        'eam-dev.example.com' -> 'example.com'
        'localhost' -> 'localhost'
        '127.0.0.1' -> '127.0.0.1'
    """
    if not hostname:
        return ""
    clean_host = hostname.strip().lower()

    # Strip port if present in hostname string
    if ":" in clean_host and not clean_host.startswith("["):
        clean_host = clean_host.split(":", 1)[0]

    # 1. Localhost and bare IPv4/IPv6 addresses
    if clean_host == "localhost" or "." not in clean_host or _IPV4_REGEX.match(clean_host) or (clean_host.startswith("[") and clean_host.endswith("]")):
        return clean_host

    # 2. Wildcard DNS with IP (e.g. eam-dev.135.13.180.167.nip.io -> 135.13.180.167.nip.io)
    nip_match = _NIP_SSLIP_REGEX.search(clean_host)
    if nip_match:
        return nip_match.group(1)

    # 3. Other local test wildcard domains
    for test_suffix in (".localtest.me", ".traefik.me", ".vcap.me"):
        if clean_host.endswith(test_suffix):
            return test_suffix.lstrip(".")

    # 4. Kubernetes cluster internal services (preserve cluster domain)
    if clean_host.endswith((".cluster.local", ".internal", ".svc")):
        if clean_host.startswith(("eam-dev.", "eam.", "workflow.", "workflow-redesign.")):
            parts = clean_host.split(".", 1)
            return parts[1]
        return clean_host

    # 5. Standard domain hierarchy
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


def resolve_workload_identity(request: Request, db: Optional[Session] = None) -> Optional[str]:
    """Resolves CompassX Workload Identity from incoming request headers, cookies, DB setting, or environment variable."""
    # 1. Incoming headers
    for h in (
        "x-workload-identity",
        "x-compassx-workload-identity",
        "workload-identity",
        "x-workload-id",
        "compassx_workload_identity",
        "compassx-workload-identity",
    ):
        val = request.headers.get(h)
        if val and val.strip():
            return val.strip()

    # 2. Cookies if any
    for c in ("compassx_workload_identity", "workload_identity", "COMPASSX_WORKLOAD_IDENTITY", "x_workload_identity"):
        val = request.cookies.get(c)
        if val and val.strip():
            return val.strip()

    # 3. Stored setting in DB if any
    if db:
        try:
            setting = db.query(SystemSetting).filter(SystemSetting.key == "storage_config").first()
            if setting and isinstance(setting.value, dict):
                wid = setting.value.get("workload_identity") or setting.value.get("COMPASSX_WORKLOAD_IDENTITY")
                if wid and str(wid).strip():
                    return str(wid).strip()
        except Exception:
            pass

    # 4. Environment variable fallback
    return (
        os.getenv("COMPASSX_WORKLOAD_IDENTITY")
        or settings.COMPASSX_WORKLOAD_IDENTITY
        or None
    )


def resolve_workspace_id(request: Request, db: Optional[Session] = None) -> Optional[str]:
    """Resolves CompassX Workspace ID from request headers, DB setting, or environment variable."""
    for h in ("x-workspace-id", "x-compassx-workspace-id", "workspace-id"):
        val = request.headers.get(h)
        if val and val.strip():
            return val.strip()

    if db:
        try:
            setting = db.query(SystemSetting).filter(SystemSetting.key == "storage_config").first()
            if setting and isinstance(setting.value, dict):
                ws = setting.value.get("workspace_id") or setting.value.get("WORKSPACE_ID")
                if ws and str(ws).strip():
                    return str(ws).strip()
        except Exception:
            pass

    return (
        os.getenv("WORKSPACE_ID")
        or settings.WORKSPACE_ID
        or None
    )


def resolve_browser_catalog_url(request: Request, db: Optional[Session] = None) -> str:
    """Dynamically resolves the CompassX Catalog base URL from browser custom header, database setting, env, or origin fallback."""
    # 1. Custom header passed directly from browser frontend
    header_url = request.headers.get("x-compassx-catalog-url") or request.headers.get("x-catalog-url")
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

    # 3. Explicit environment variable overrides
    env_url = (
        os.getenv("COMPASSX_CATALOG_URL")
        or os.getenv("COMPASSX_BACKEND_URL")
        or os.getenv("COMPASSX_API_URL")
    )
    if env_url and env_url.strip():
        clean_url = env_url.strip().rstrip("/")
        if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
            clean_url = f"http://{clean_url}"
        if not clean_url.endswith("/api/v1/catalog") and "/api/" not in clean_url:
            clean_url = f"{clean_url}/api/v1/catalog"
        return normalize_to_main_domain_url(clean_url)

    # 4. Request origin / host fallback (auto-detect apex domain from current request)
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "http"
    raw_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""

    if raw_host:
        host_only = raw_host.lower().split(":")[0].strip("[]")
        if host_only not in ("testserver", "localhost", "127.0.0.1", "0.0.0.0"):
            if ":" in raw_host and not raw_host.startswith("["):
                host_name, port_part = raw_host.split(":", 1)
                port_str = f":{port_part}"
            else:
                host_name = raw_host
                port_str = ""

            main_domain = extract_main_domain(host_name)
            if main_domain:
                return f"{proto}://{main_domain}{port_str}/api/v1/catalog"

    # 5. Default cluster service backend URL
    default_base = (
        settings.COMPASSX_CATALOG_URL
        or settings.COMPASSX_BACKEND_URL
        or "http://compassx-backend.compassx.svc.cluster.local:8000"
    ).rstrip("/")
    if not default_base.endswith("/api/v1/catalog") and "/api/" not in default_base:
        default_base = f"{default_base}/api/v1/catalog"
    return default_base


def resolve_auth_token(request: Request, db: Optional[Session] = None) -> Optional[str]:
    """Resolves authentication token for CompassX services from headers, cookies, or DB config."""
    # 1. Custom token header passed from frontend specifically for CompassX catalog/storage
    custom_token = (
        request.headers.get("x-compassx-auth-token")
        or request.headers.get("x-catalog-token")
    )
    if custom_token and custom_token.strip():
        clean = custom_token.strip()
        return clean if clean.lower().startswith("bearer ") else f"Bearer {clean}"

    # 2. Database stored catalog auth token if configured in storage settings
    if db:
        try:
            setting = db.query(SystemSetting).filter(SystemSetting.key == "storage_config").first()
            if setting and isinstance(setting.value, dict) and setting.value.get("auth_token"):
                tok = str(setting.value.get("auth_token")).strip()
                if tok:
                    return tok if tok.lower().startswith("bearer ") else f"Bearer {tok}"
        except Exception:
            pass

    # 3. Environment variable for catalog token
    env_token = os.getenv("COMPASSX_CATALOG_TOKEN") or settings.COMPASSX_CATALOG_TOKEN
    if env_token and env_token.strip():
        return env_token if env_token.lower().startswith("bearer ") else f"Bearer {env_token}"

    # 4. Workload Identity fallback as Bearer token if present
    wid = resolve_workload_identity(request, db)
    if wid and wid.strip():
        return f"Bearer {wid.strip()}"

    return None


class StorageConfigUpdate(BaseModel):
    catalog_name: str = Field(..., description="Target CompassX catalog name")
    schema_name: str = Field(..., description="Target CompassX schema name")
    volume_id: str = Field(..., description="Target CompassX volume UUID")
    volume_name: str = Field(..., description="Target CompassX volume name")
    storage_location: Optional[str] = Field(None, description="Storage location path")
    endpoint_url: Optional[str] = Field(None, description="CompassX base URL")
    auth_token: Optional[str] = Field(None, description="CompassX Access / Bearer Token")
    workload_identity: Optional[str] = Field(None, description="CompassX Workload Identity")
    workspace_id: Optional[str] = Field(None, description="CompassX Workspace ID")
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

    if setting and setting.value and setting.value.get("volume_id"):
        val = dict(setting.value)
        val["is_configured"] = True
        val["endpoint_url"] = val.get("endpoint_url") or browser_base
        val["updated_at"] = setting.updated_at.isoformat() if setting.updated_at else None
        val["updated_by"] = setting.updated_by
        return val

    # Auto-discover active volume if folders or docs already exist
    from backend.models.doclink import DocFolder, DocInfo
    first_folder_vol = db.query(DocFolder.volume_id).filter(
        DocFolder.volume_id.isnot(None),
        DocFolder.volume_id != "",
        DocFolder.volume_id != "__unconfigured__",
    ).first()
    first_vol = first_folder_vol[0] if (first_folder_vol and first_folder_vol[0]) else None
    if not first_vol:
        first_doc_vol = db.query(DocInfo.volume_id).filter(
            DocInfo.volume_id.isnot(None),
            DocInfo.volume_id != "",
            DocInfo.volume_id != "__unconfigured__",
        ).first()
        if first_doc_vol and first_doc_vol[0]:
            first_vol = first_doc_vol[0]

    if first_vol:
        val = {
            "catalog_name": "eam_catalog",
            "schema_name": "documents_schema",
            "volume_name": "sample_data",
            "volume_id": first_vol,
            "storage_location": f"volumes/{first_vol}",
            "endpoint_url": browser_base,
            "is_configured": True,
            "configured_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": "system",
        }
        if not setting:
            new_setting = SystemSetting(
                key="storage_config",
                value=val,
                category="storage",
                description="Active CompassX Volume storage configuration for documents and attachments",
                updated_by="system",
            )
            db.add(new_setting)
        else:
            setting.value = val
            setting.category = "storage"
            setting.updated_by = "system"
        db.commit()
        return val

    # Initially, until the user configures a volume, no volume is set
    return {
        "catalog_name": "",
        "schema_name": "",
        "volume_name": "",
        "volume_id": "",
        "storage_location": "",
        "endpoint_url": browser_base,
        "is_configured": False,
        "configured_at": None,
        "updated_at": None,
        "updated_by": None,
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

    data = {
        "catalog_name": payload.catalog_name.strip(),
        "schema_name": payload.schema_name.strip(),
        "volume_id": payload.volume_id.strip(),
        "volume_name": payload.volume_name.strip(),
        "storage_location": storage_loc,
        "configured_at": datetime.now(timezone.utc).isoformat(),
    }
    if payload.endpoint_url:
        data["endpoint_url"] = payload.endpoint_url
    if payload.auth_token:
        data["auth_token"] = payload.auth_token

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

    # Automatically trigger sync for the newly configured volume
    if payload.volume_id and payload.volume_id.strip():
        try:
            from backend.services.doc_management_service import doc_management_service
            import asyncio
            base_url = resolve_browser_catalog_url(request, db)
            auth_token = resolve_auth_token(request, db) or payload.auth_token
            workload_identity = resolve_workload_identity(request, db)
            workspace_id = resolve_workspace_id(request, db)
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(
                    doc_management_service.sync_volume_with_db(
                        db=SessionLocal(),
                        volume_id=payload.volume_id.strip(),
                        base_url=base_url,
                        auth_token=auth_token,
                        workload_identity=workload_identity,
                        workspace_id=workspace_id,
                        force=True,
                    )
                )
            except RuntimeError:
                pass
        except Exception:
            pass

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
    """Fetches accessible CompassX catalogs and nested schemas using platform REST API."""
    base_url = resolve_browser_catalog_url(request, db)
    auth_token = resolve_auth_token(request, db)
    workload_identity = resolve_workload_identity(request, db)
    workspace_id = resolve_workspace_id(request, db)
    try:
        return await compassx_volume_client.list_catalogs(
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
        )
    except Exception as exc:
        logger.warning("Failed to fetch catalogs from CompassX: %s", exc)
        return []


@router.get("/storage/volumes")
async def list_system_storage_volumes(
    request: Request,
    catalog: Optional[str] = None,
    schema_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Fetches storage volumes from CompassX platform API."""
    base_url = resolve_browser_catalog_url(request, db)
    auth_token = resolve_auth_token(request, db)
    workload_identity = resolve_workload_identity(request, db)
    workspace_id = resolve_workspace_id(request, db)
    try:
        return await compassx_volume_client.list_volumes(
            catalog=catalog,
            schema_name=schema_name,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
        )
    except Exception as exc:
        logger.warning("Failed to fetch volumes from CompassX: %s", exc)
        return []


@router.post("/storage/volumes", status_code=201)
async def create_system_storage_volume(
    payload: CreateStorageVolumeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Creates a new volume under the specified CompassX catalog and schema."""
    base_url = resolve_browser_catalog_url(request, db)
    auth_token = resolve_auth_token(request, db)
    workload_identity = resolve_workload_identity(request, db)
    workspace_id = resolve_workspace_id(request, db)
    try:
        return await compassx_volume_client.create_volume(
            catalog_name=payload.catalog_name,
            schema_name=payload.schema_name,
            name=payload.name,
            description=payload.description or "",
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
        )
    except Exception as exc:
        import uuid
        return {
            "id": str(uuid.uuid4()),
            "name": payload.name,
            "catalog_name": payload.catalog_name,
            "schema_name": payload.schema_name,
            "description": payload.description or "",
            "storage_location": f"workspaces/default/{payload.catalog_name}/{payload.schema_name}/volumes/{payload.name}/",
        }
