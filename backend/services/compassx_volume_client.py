import os
import logging
from typing import Optional, Dict, Any, List, Tuple
import httpx
from backend.config import settings

logger = logging.getLogger("compassx.volumes")


class CompassXVolumeClient:
    """Client for CompassX Platform REST APIs (Catalog, Storage, Volumes, Compute).

    Connects to the CompassX Platform API using configured backend URL, Workspace ID,
    and Workload Identity headers (or dynamic per-request overrides):
        - X-Workspace-Id
        - X-Workload-Identity / Authorization Bearer
        - Content-Type / Accept: application/json
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        workspace_id: Optional[str] = None,
        workload_identity: Optional[str] = None,
        auth_token: Optional[str] = None,
    ):
        raw_url = (
            base_url
            or os.getenv("COMPASSX_BACKEND_URL")
            or os.getenv("COMPASSX_API_URL")
            or settings.COMPASSX_BACKEND_URL
            or settings.COMPASSX_CATALOG_URL
            or "http://compassx-backend.compassx.svc.cluster.local:8000"
        )
        self.base_url = raw_url.rstrip("/")
        self.workspace_id = workspace_id or os.getenv("WORKSPACE_ID") or settings.WORKSPACE_ID or ""
        self.workload_identity = (
            workload_identity
            or os.getenv("COMPASSX_WORKLOAD_IDENTITY")
            or settings.COMPASSX_WORKLOAD_IDENTITY
            or ""
        )
        self.auth_token = auth_token or settings.COMPASSX_CATALOG_TOKEN

    @property
    def headers(self) -> Dict[str, str]:
        return self.get_headers()

    def get_headers(
        self,
        auth_token: Optional[str] = None,
        workspace_id: Optional[str] = None,
        workload_identity: Optional[str] = None,
        content_type: Optional[str] = "application/json",
    ) -> Dict[str, str]:
        ws_id = (
            workspace_id
            or os.getenv("WORKSPACE_ID")
            or self.workspace_id
            or settings.WORKSPACE_ID
            or ""
        )
        workload_id = (
            workload_identity
            or os.getenv("COMPASSX_WORKLOAD_IDENTITY")
            or self.workload_identity
            or settings.COMPASSX_WORKLOAD_IDENTITY
            or ""
        )
        token = (
            auth_token
            if auth_token is not None
            else (self.auth_token or os.getenv("COMPASSX_CATALOG_TOKEN") or settings.COMPASSX_CATALOG_TOKEN or "")
        )

        hdr: Dict[str, str] = {
            "Accept": "application/json",
        }
        if content_type:
            hdr["Content-Type"] = content_type
        if ws_id:
            hdr["X-Workspace-Id"] = ws_id
            hdr["x-workspace-id"] = ws_id
        if workload_id:
            hdr["X-Workload-Identity"] = workload_id
            hdr["x-workload-identity"] = workload_id
            hdr["X-CompassX-Workload-Identity"] = workload_id
            hdr["workload-identity"] = workload_id
            hdr["COMPASSX_WORKLOAD_IDENTITY"] = workload_id

        # Determine Authorization:
        if token and token.strip() and token.lower() != "none":
            clean = token.strip()
            hdr["Authorization"] = clean if clean.lower().startswith("bearer ") else f"Bearer {clean}"
        elif workload_id and workload_id.strip():
            clean_wid = workload_id.strip()
            hdr["Authorization"] = clean_wid if clean_wid.lower().startswith("bearer ") else f"Bearer {clean_wid}"
        return hdr

    def _build_url(self, path: str, base_url_override: Optional[str] = None) -> str:
        base = (base_url_override or self.base_url or "").rstrip("/")
        if not base:
            base = "http://compassx-backend.compassx.svc.cluster.local:8000"
        elif not base.startswith("http://") and not base.startswith("https://"):
            base = f"http://{base}"

        clean_path = path.lstrip("/")
        if "/api/v1/catalog" in base:
            return f"{base}/{clean_path}"
        elif "/api/v1" in base:
            return f"{base}/catalog/{clean_path}"
        else:
            return f"{base}/api/v1/catalog/{clean_path}"

    async def _execute_with_auth_fallback(
        self,
        method: str,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        files: Optional[Dict[str, Any]] = None,
        content_type: Optional[str] = "application/json",
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
        timeout: float = 30.0,
    ) -> httpx.Response:
        """Executes HTTP request to CompassX with automatic retry across auth permutations if 401 occurs."""
        header_variants: List[Dict[str, str]] = []

        # 1. Primary candidate
        primary_headers = self.get_headers(
            auth_token=auth_token,
            workspace_id=workspace_id,
            workload_identity=workload_identity,
            content_type=content_type,
        )
        header_variants.append(primary_headers)

        workload_id = (
            workload_identity
            or os.getenv("COMPASSX_WORKLOAD_IDENTITY")
            or self.workload_identity
            or settings.COMPASSX_WORKLOAD_IDENTITY
            or ""
        )

        # 2. Candidate 2: Force workload_identity as Bearer Authorization
        if workload_id:
            h2 = dict(primary_headers)
            clean_wid = workload_id.strip()
            h2["Authorization"] = clean_wid if clean_wid.lower().startswith("bearer ") else f"Bearer {clean_wid}"
            h2["X-Workload-Identity"] = clean_wid
            if h2 not in header_variants:
                header_variants.append(h2)

        # 3. Candidate 3: Without Authorization header (pure X-Workload-Identity)
        if workload_id:
            h3 = dict(primary_headers)
            h3.pop("Authorization", None)
            h3["X-Workload-Identity"] = workload_id.strip()
            if h3 not in header_variants:
                header_variants.append(h3)

        last_resp: Optional[httpx.Response] = None
        last_exc: Optional[Exception] = None

        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            for headers in header_variants:
                try:
                    resp = await client.request(
                        method=method,
                        url=url,
                        params=params,
                        json=json_data,
                        data=data,
                        files=files,
                        headers=headers,
                    )
                    if resp.status_code != 401:
                        resp.raise_for_status()
                        return resp
                    last_resp = resp
                except httpx.HTTPStatusError as err:
                    if err.response.status_code == 401:
                        last_resp = err.response
                        continue
                    raise
                except Exception as exc:
                    last_exc = exc
                    continue

        if last_resp is not None:
            last_resp.raise_for_status()
            return last_resp
        if last_exc:
            raise last_exc
        raise RuntimeError("CompassX API request failed with no response")

    # -------------------------------------------------------------------------
    # 1. Volume & Catalog Lifecycle & Discovery
    # -------------------------------------------------------------------------

    async def list_catalogs(
        self,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Lists all accessible catalogs and their nested schemas.
        Endpoint: GET /api/v1/catalog/catalogs
        """
        url = self._build_url("catalogs", base_url)
        ws_id = workspace_id or os.getenv("WORKSPACE_ID") or self.workspace_id or settings.WORKSPACE_ID or ""
        params = {"workspace_id": ws_id} if ws_id else {}

        resp = await self._execute_with_auth_fallback(
            method="GET",
            url=url,
            params=params,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
            timeout=20.0,
        )
        return resp.json()

    async def create_volume(
        self,
        catalog_name: str,
        schema_name: str,
        name: str,
        description: str = "",
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Creates a new volume backed by configured storage backend.
        Endpoint: POST /api/v1/catalog/catalogs/{catalog_name}/schemas/{schema_name}/volumes
        """
        url = self._build_url(f"catalogs/{catalog_name}/schemas/{schema_name}/volumes", base_url)
        resp = await self._execute_with_auth_fallback(
            method="POST",
            url=url,
            json_data={"name": name, "description": description},
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
            timeout=30.0,
        )
        return resp.json()

    async def list_volumes(
        self,
        catalog: Optional[str] = None,
        schema_name: Optional[str] = None,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Lists existing volumes.
        Endpoint: GET /api/v1/catalog/volumes?catalog=<name>&schema_name=<name>
        """
        url = self._build_url("volumes", base_url)
        ws_id = workspace_id or os.getenv("WORKSPACE_ID") or self.workspace_id or settings.WORKSPACE_ID or ""
        params = {}
        if ws_id:
            params["workspace_id"] = ws_id
        if catalog:
            params["catalog"] = catalog
        if schema_name:
            params["schema_name"] = schema_name

        resp = await self._execute_with_auth_fallback(
            method="GET",
            url=url,
            params=params,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
            timeout=15.0,
        )
        return resp.json()

    # -------------------------------------------------------------------------
    # 2. Creating Folders / Directories
    # -------------------------------------------------------------------------

    async def create_directory(
        self,
        volume_id: str,
        dir_name: str,
        sub_path: str = "",
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Creates a folder in blob storage and indexes it in Postgres.
        Endpoint: POST /api/v1/catalog/volumes/{volume_id}/directories
        """
        clean_sub = sub_path.strip("/").strip()
        clean_name = dir_name.strip("/").strip()

        url = self._build_url(f"volumes/{volume_id}/directories", base_url)
        params = {"sub_path": clean_sub} if clean_sub else {}
        resp = await self._execute_with_auth_fallback(
            method="POST",
            url=url,
            params=params,
            json_data={"dir_name": clean_name},
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
            timeout=30.0,
        )
        return resp.json()

    # -------------------------------------------------------------------------
    # 3. Uploading Files
    # -------------------------------------------------------------------------

    async def upload_file(
        self,
        volume_id: str,
        file_content: bytes,
        file_name: str,
        content_type: str = "application/octet-stream",
        sub_path: str = "",
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Standard multipart file upload directly through CompassX Volume API.
        Endpoint: POST /api/v1/catalog/volumes/{volume_id}/files
        """
        clean_sub = sub_path.strip("/").strip()
        url = self._build_url(f"volumes/{volume_id}/files", base_url)
        files = {"file": (file_name, file_content, content_type)}
        params = {"sub_path": clean_sub} if clean_sub else {}
        data = {"sub_path": clean_sub} if clean_sub else {}

        resp = await self._execute_with_auth_fallback(
            method="POST",
            url=url,
            params=params,
            data=data,
            files=files,
            content_type=None,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
            timeout=60.0,
        )
        return resp.json()

    async def record_external_upload(
        self,
        volume_id: str,
        file_path: str,
        file_name: str,
        size_bytes: int,
        content_type: str = "application/octet-stream",
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Index a file in Postgres that an external app wrote directly to cloud storage.
        Endpoint: POST /api/v1/catalog/volumes/record-file
        """
        url = self._build_url("volumes/record-file", base_url)
        payload = {
            "volume_id": volume_id,
            "file_path": file_path,
            "file_name": file_name,
            "size_bytes": size_bytes,
            "content_type": content_type,
        }

        resp = await self._execute_with_auth_fallback(
            method="POST",
            url=url,
            json_data=payload,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
            timeout=30.0,
        )
        return resp.json()

    async def resolve_storage(
        self,
        volume_id: str,
        file_path: str,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Resolves target volume credentials (e.g. S3 credentials or direct storage url).
        Endpoint: POST /api/v1/catalog/volumes/resolve
        """
        url = self._build_url("volumes/resolve", base_url)
        payload = {
            "volume_id": volume_id,
            "file_path": file_path,
        }

        resp = await self._execute_with_auth_fallback(
            method="POST",
            url=url,
            json_data=payload,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
            timeout=30.0,
        )
        return resp.json()

    # -------------------------------------------------------------------------
    # 4. Downloading Files & Listing Contents
    # -------------------------------------------------------------------------

    async def list_volume_files(
        self,
        volume_id: str,
        sub_path: str = "",
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Returns list of all indexed files and directories in the volume.
        Endpoint: GET /api/v1/catalog/volumes/{volume_id}/files
        """
        url = self._build_url(f"volumes/{volume_id}/files", base_url)
        params = {"sub_path": sub_path} if sub_path else {}

        resp = await self._execute_with_auth_fallback(
            method="GET",
            url=url,
            params=params,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
            timeout=30.0,
        )
        return resp.json()

    list_files = list_volume_files

    async def download_file(
        self,
        volume_id: str,
        file_path: str,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> Tuple[bytes, str]:
        """Streams the raw file content directly from CompassX API.
        Endpoint: GET /api/v1/catalog/volumes/{volume_id}/files/download?file_path=<path>
        """
        url = self._build_url(f"volumes/{volume_id}/files/download", base_url)
        resp = await self._execute_with_auth_fallback(
            method="GET",
            url=url,
            params={"file_path": file_path},
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
            timeout=60.0,
        )
        content_type = resp.headers.get("content-type", "application/octet-stream")
        return resp.content, content_type

    async def get_presigned_url(
        self,
        volume_id: str,
        file_path: str,
        expiry_seconds: int = 3600,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Returns a temporary direct-download URL from S3/Azure Blob.
        Endpoint: GET /api/v1/catalog/volumes/{volume_id}/files/url?file_path=<path>&expiry_seconds=3600
        """
        url = self._build_url(f"volumes/{volume_id}/files/url", base_url)
        resp = await self._execute_with_auth_fallback(
            method="GET",
            url=url,
            params={"file_path": file_path, "expiry_seconds": expiry_seconds},
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
            timeout=30.0,
        )
        return resp.json()

    # -------------------------------------------------------------------------
    # 5. File & Folder Maintenance (Rename / Delete)
    # -------------------------------------------------------------------------

    async def rename_file(
        self,
        volume_id: str,
        old_path: str,
        new_name: str,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Renames a file or folder in blob storage & updates DB.
        Endpoint: POST /api/v1/catalog/volumes/{volume_id}/files/rename
        """
        url = self._build_url(f"volumes/{volume_id}/files/rename", base_url)
        resp = await self._execute_with_auth_fallback(
            method="POST",
            url=url,
            json_data={"old_path": old_path, "new_name": new_name},
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
            timeout=30.0,
        )
        return resp.json()

    async def delete_file(
        self,
        volume_id: str,
        file_path: str,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Deletes the file from storage backend and removes the index.
        Endpoint: DELETE /api/v1/catalog/volumes/{volume_id}/files?file_path=<path>
        """
        url = self._build_url(f"volumes/{volume_id}/files", base_url)
        resp = await self._execute_with_auth_fallback(
            method="DELETE",
            url=url,
            params={"file_path": file_path},
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
            timeout=30.0,
        )
        return resp.json()


# Global Singleton Instance
compassx_volume_client = CompassXVolumeClient()
