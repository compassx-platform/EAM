import logging
from typing import Optional, Dict, Any, List, Tuple
import httpx
from backend.config import settings

logger = logging.getLogger("compassx.volumes")


class CompassXVolumeClient:
    """Client for CompassX Volume Object/Blob Storage Services (/api/v1/catalog).

    Dynamically targets CompassX Catalog & Volumes endpoints (using the browser origin,
    request host, or configured system endpoint) for creating volumes,
    directories, multipart file uploads, stream downloads, presigned SAS/S3 URLs,
    file renames, and deletions.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
    ):
        self.base_url = (base_url or settings.COMPASSX_CATALOG_URL or "").rstrip("/")
        self.auth_token = auth_token or settings.COMPASSX_CATALOG_TOKEN

    @property
    def headers(self) -> Dict[str, str]:
        return self.get_headers()

    def get_headers(self, auth_token: Optional[str] = None) -> Dict[str, str]:
        token = auth_token if auth_token is not None else self.auth_token
        hdr: Dict[str, str] = {
            "Accept": "application/json",
        }
        if token and token.strip() and token.lower() != "none":
            clean = token.strip()
            hdr["Authorization"] = clean if clean.lower().startswith("bearer ") else f"Bearer {clean}"
        return hdr

    def _build_url(self, path: str, base_url_override: Optional[str] = None) -> str:
        base = (base_url_override or self.base_url or "").rstrip("/")
        if not base:
            base = "http://localhost:8000/api/v1/catalog"
        elif not base.startswith("http://") and not base.startswith("https://"):
            base = f"http://localhost:8000{base}" if base.startswith("/") else f"http://localhost:8000/{base}"
        clean_path = path.lstrip("/")
        return f"{base}/{clean_path}"

    # -------------------------------------------------------------------------
    # 1. Volume & Catalog Lifecycle & Discovery
    # -------------------------------------------------------------------------

    async def list_catalogs(
        self,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Lists all accessible catalogs and their nested schemas.
        Endpoint: GET /api/v1/catalog/catalogs
        """
        url = self._build_url("catalogs", base_url)
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=self.get_headers(auth_token))
            resp.raise_for_status()
            return resp.json()

    async def create_volume(
        self,
        catalog_name: str,
        schema_name: str,
        name: str,
        description: str = "",
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Creates a new volume backed by configured storage backend.
        Endpoint: POST /api/v1/catalog/catalogs/{catalog_name}/schemas/{schema_name}/volumes
        """
        url = self._build_url(f"catalogs/{catalog_name}/schemas/{schema_name}/volumes", base_url)
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.post(
                url,
                json={"name": name, "description": description},
                headers=self.get_headers(auth_token),
            )
            resp.raise_for_status()
            return resp.json()

    async def list_volumes(
        self,
        catalog: Optional[str] = None,
        schema_name: Optional[str] = None,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Lists existing volumes.
        Endpoint: GET /api/v1/catalog/volumes?catalog=<name>&schema_name=<name>
        """
        url = self._build_url("volumes", base_url)
        params = {}
        if catalog:
            params["catalog"] = catalog
        if schema_name:
            params["schema_name"] = schema_name

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(url, params=params, headers=self.get_headers(auth_token))
            resp.raise_for_status()
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
    ) -> Dict[str, Any]:
        """Creates a folder in blob storage and indexes it in Postgres.
        Endpoint: POST /api/v1/catalog/volumes/{volume_id}/directories
        """
        clean_sub = sub_path.strip("/").strip()
        clean_name = dir_name.strip("/").strip()

        url = self._build_url(f"volumes/{volume_id}/directories", base_url)
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                json={"dir_name": clean_name, "sub_path": clean_sub},
                headers=self.headers,
            )
            resp.raise_for_status()
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
    ) -> Dict[str, Any]:
        """Standard multipart file upload directly through CompassX Volume API.
        Endpoint: POST /api/v1/catalog/volumes/{volume_id}/files
        """
        clean_sub = sub_path.strip("/").strip()
        url = self._build_url(f"volumes/{volume_id}/files", base_url)
        files = {"file": (file_name, file_content, content_type)}
        data = {"sub_path": clean_sub} if clean_sub else {}

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                files=files,
                data=data,
                headers={"Authorization": f"Bearer {self.auth_token}"},
            )
            resp.raise_for_status()
            return resp.json()

    async def record_external_upload(
        self,
        volume_id: str,
        file_path: str,
        file_name: str,
        size_bytes: int,
        content_type: str = "application/octet-stream",
        base_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Index a file in Postgres that an external app wrote directly to cloud storage.
        Endpoint: POST /api/v1/catalog/volumes/record-file
        """
        url = self._build_url("volumes/record-file", base_url)
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                json={
                    "volume_id": volume_id,
                    "file_path": file_path,
                    "file_name": file_name,
                    "size_bytes": size_bytes,
                    "content_type": content_type,
                },
                headers=self.headers,
            )
            resp.raise_for_status()
            return resp.json()

    async def resolve_credentials(
        self,
        volume_id: str,
        operation: str = "write",
        base_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generates temporary scoped cloud credentials (AWS STS / Azure SAS) for direct cloud uploads.
        Endpoint: POST /api/v1/catalog/volumes/resolve
        """
        url = self._build_url("volumes/resolve", base_url)
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                json={"volume_id": volume_id, "operation": operation},
                headers=self.headers,
            )
            resp.raise_for_status()
            return resp.json()

    # -------------------------------------------------------------------------
    # 4. Retrieving & Downloading Files
    # -------------------------------------------------------------------------

    async def list_files(
        self,
        volume_id: str,
        sub_path: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Returns list of all indexed files and directories in the volume.
        Endpoint: GET /api/v1/catalog/volumes/{volume_id}/files
        """
        url = self._build_url(f"volumes/{volume_id}/files", base_url)
        params = {"sub_path": sub_path} if sub_path else {}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, params=params, headers=self.headers)
            resp.raise_for_status()
            return resp.json()

    async def download_file(
        self,
        volume_id: str,
        file_path: str,
        base_url: Optional[str] = None,
    ) -> Tuple[bytes, str]:
        """Streams the raw file content directly from CompassX API.
        Endpoint: GET /api/v1/catalog/volumes/{volume_id}/files/download?file_path=<path>
        """
        url = self._build_url(f"volumes/{volume_id}/files/download", base_url)
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(
                url,
                params={"file_path": file_path},
                headers=self.headers,
            )
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "application/octet-stream")
            return resp.content, content_type

    async def get_presigned_url(
        self,
        volume_id: str,
        file_path: str,
        expiry_seconds: int = 3600,
        base_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Returns a temporary direct-download URL from S3/Azure Blob.
        Endpoint: GET /api/v1/catalog/volumes/{volume_id}/files/url?file_path=<path>&expiry_seconds=3600
        """
        url = self._build_url(f"volumes/{volume_id}/files/url", base_url)
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                url,
                params={"file_path": file_path, "expiry_seconds": expiry_seconds},
                headers=self.headers,
            )
            resp.raise_for_status()
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
    ) -> Dict[str, Any]:
        """Renames a file or folder in blob storage & updates DB.
        Endpoint: POST /api/v1/catalog/volumes/{volume_id}/files/rename
        """
        url = self._build_url(f"volumes/{volume_id}/files/rename", base_url)
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                json={"old_path": old_path, "new_name": new_name},
                headers=self.headers,
            )
            resp.raise_for_status()
            return resp.json()

    async def delete_file(
        self,
        volume_id: str,
        file_path: str,
        base_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Deletes the file from storage backend and removes the index.
        Endpoint: DELETE /api/v1/catalog/volumes/{volume_id}/files?file_path=<path>
        """
        url = self._build_url(f"volumes/{volume_id}/files", base_url)
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.delete(
                url,
                params={"file_path": file_path},
                headers=self.headers,
            )
            resp.raise_for_status()
            return resp.json()


# Global Singleton Instance
compassx_volume_client = CompassXVolumeClient()
