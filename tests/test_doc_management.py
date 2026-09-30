import io
import json
import re
import uuid
from typing import Dict, Any
import httpx
import pytest

from backend.services.compassx_volume_client import CompassXVolumeClient
from backend.services.doc_management_service import DocManagementService
from backend.models.doclink import DocFolder, DocInfo, DocLink


# -----------------------------------------------------------------------------
# Mock CompassX Catalog API Engine for Hermetic Unit Tests
# -----------------------------------------------------------------------------

class MockCompassXCatalog:
    def __init__(self):
        self.volumes = [
            {
                "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
                "name": "eam_documents_volume",
                "catalog_name": "eam_catalog",
                "schema_name": "documents_schema",
                "description": "Default EAM storage volume",
            }
        ]
        self.directories = set()
        self.files: Dict[str, Dict[str, Any]] = {}

    def handle(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method

        # Catalogs & Schemas: GET /api/v1/catalog/catalogs
        if method == "GET" and path.endswith("/catalogs"):
            return httpx.Response(200, json=[
                {
                    "id": "071a880b-3f9c-4bc7-8b55-ee1e3b659cfc",
                    "name": "default_default",
                    "description": "Default catalog for the workspace",
                    "catalog_type": "postgres",
                    "connection_id": None,
                    "database_name": None,
                    "schema_count": 1,
                    "table_count": 0,
                    "schemas": [
                        {
                            "id": "78e4d5ac-ded8-4875-b05e-160d4d520070",
                            "name": "default",
                            "description": "Default schema",
                            "table_count": 0,
                        }
                    ],
                },
                {
                    "id": "0d642538-c08f-4e2c-af19-9ad2fc8710f2",
                    "name": "eam_catalog",
                    "description": "Enterprise Asset Management storage catalog",
                    "catalog_type": "iceberg",
                    "connection_id": None,
                    "database_name": None,
                    "schema_count": 1,
                    "table_count": 0,
                    "schemas": [
                        {
                            "id": "99e4d5ac-ded8-4875-b05e-160d4d520099",
                            "name": "documents_schema",
                            "description": "Documents schema",
                            "table_count": 0,
                        }
                    ],
                },
            ])

        # 1. POST /api/v1/catalog/catalogs/{cat}/schemas/{sch}/volumes
        if method == "POST" and "/catalogs/" in path and "/schemas/" in path and path.endswith("/volumes"):
            data = json.loads(request.content.decode("utf-8")) if request.content else {}
            parts = path.split("/")
            cat = parts[parts.index("catalogs") + 1]
            sch = parts[parts.index("schemas") + 1]
            vol_id = str(uuid.uuid4())
            vol = {
                "id": vol_id,
                "name": data.get("name", "new_volume"),
                "catalog_name": cat,
                "schema_name": sch,
                "description": data.get("description", ""),
            }
            self.volumes.append(vol)
            return httpx.Response(201, json=vol)

        # 2. GET /api/v1/catalog/volumes
        if method == "GET" and path.endswith("/volumes"):
            cat = request.url.params.get("catalog")
            sch = request.url.params.get("schema_name")
            res = self.volumes
            if cat:
                res = [v for v in res if v.get("catalog_name") == cat]
            if sch:
                res = [v for v in res if v.get("schema_name") == sch]
            return httpx.Response(200, json=res)

        # 3. POST /api/v1/catalog/volumes/{vol_id}/directories
        if method == "POST" and "/directories" in path:
            vol_id = path.split("/volumes/")[1].split("/directories")[0]
            data = json.loads(request.content.decode("utf-8")) if request.content else {}
            dir_name = data.get("dir_name", "")
            sub_path = data.get("sub_path", "")
            full_dir = f"{sub_path}/{dir_name}".strip("/") if sub_path else dir_name
            self.directories.add((vol_id, full_dir))
            return httpx.Response(200, json={
                "volume_id": vol_id,
                "dir_name": dir_name,
                "sub_path": sub_path,
                "dir_path": full_dir,
                "status": "created",
            })

        # 4. POST /api/v1/catalog/volumes/{vol_id}/files (Upload)
        if method == "POST" and path.endswith("/files"):
            vol_id = path.split("/volumes/")[1].split("/files")[0]
            content = request.content
            content_type = request.headers.get("content-type", "")
            file_name = "uploaded_file"
            sub_path = ""
            file_bytes = b""
            ctype = "application/octet-stream"

            if "multipart/form-data" in content_type:
                boundary = content_type.split("boundary=")[-1].strip().split(";")[0].encode()
                parts = content.split(b"--" + boundary)
                for part in parts:
                    if b'name="file"' in part:
                        header_part, _, body = part.partition(b"\r\n\r\n")
                        body = body.rstrip(b"\r\n").rstrip(b"--")
                        m = re.search(r'filename="([^"]+)"', header_part.decode("utf-8", errors="ignore"))
                        if m:
                            file_name = m.group(1)
                        m_ct = re.search(r'Content-Type: ([^\r\n]+)', header_part.decode("utf-8", errors="ignore"))
                        if m_ct:
                            ctype = m_ct.group(1).strip()
                        file_bytes = body
                    elif b'name="sub_path"' in part:
                        _, _, body = part.partition(b"\r\n\r\n")
                        sub_path = body.rstrip(b"\r\n").rstrip(b"--").decode("utf-8").strip()
            else:
                file_bytes = content

            file_path = f"{sub_path}/{file_name}".strip("/") if sub_path else file_name
            self.files[f"{vol_id}:{file_path}"] = {
                "content": file_bytes,
                "content_type": ctype,
                "file_name": file_name,
                "file_path": file_path,
            }
            return httpx.Response(200, json={
                "volume_id": vol_id,
                "file_name": file_name,
                "file_path": file_path,
                "size_bytes": len(file_bytes),
                "content_type": ctype,
            })

        # 5. GET /api/v1/catalog/volumes/{vol_id}/files/download
        if method == "GET" and "/download" in path:
            vol_id = path.split("/volumes/")[1].split("/files/download")[0]
            file_path = request.url.params.get("file_path", "")
            key = f"{vol_id}:{file_path}"
            item = self.files.get(key)
            if item:
                return httpx.Response(200, content=item["content"], headers={"content-type": item["content_type"]})
            return httpx.Response(200, content=b"Simulated CompassX File Content", headers={"content-type": "application/octet-stream"})

        # 6. GET /api/v1/catalog/volumes/{vol_id}/files/url
        if method == "GET" and "/url" in path:
            vol_id = path.split("/volumes/")[1].split("/files/url")[0]
            file_path = request.url.params.get("file_path", "")
            expiry = int(request.url.params.get("expiry_seconds", 3600))
            return httpx.Response(200, json={
                "url": f"https://mock-storage.blob.core.windows.net/{vol_id}/{file_path}?sas=mock_token_2026",
                "expires_in_seconds": expiry,
            })

        # 7. GET /api/v1/catalog/volumes/{vol_id}/files
        if method == "GET" and path.endswith("/files"):
            vol_id = path.split("/volumes/")[1].split("/files")[0]
            sub_path = request.url.params.get("sub_path")
            matched = []
            prefix = f"{vol_id}:"
            for k, val in self.files.items():
                if k.startswith(prefix):
                    if sub_path is None or val["file_path"].startswith(sub_path):
                        matched.append({
                            "file_name": val["file_name"],
                            "file_path": val["file_path"],
                            "size_bytes": len(val["content"]),
                            "content_type": val["content_type"],
                        })
            return httpx.Response(200, json=matched)

        # 8. POST /api/v1/catalog/volumes/{vol_id}/files/rename
        if method == "POST" and "/rename" in path:
            vol_id = path.split("/volumes/")[1].split("/files/rename")[0]
            data = json.loads(request.content.decode("utf-8")) if request.content else {}
            old_path = data.get("old_path", "")
            new_name = data.get("new_name", "")
            parts = old_path.split("/")
            parent = "/".join(parts[:-1]) if len(parts) > 1 else ""
            new_path = f"{parent}/{new_name}".strip("/") if parent else new_name
            old_key = f"{vol_id}:{old_path}"
            new_key = f"{vol_id}:{new_path}"
            if old_key in self.files:
                val = self.files.pop(old_key)
                val["file_name"] = new_name
                val["file_path"] = new_path
                self.files[new_key] = val
            return httpx.Response(200, json={
                "status": "success",
                "old_path": old_path,
                "new_path": new_path,
            })

        # 9. DELETE /api/v1/catalog/volumes/{vol_id}/files
        if method == "DELETE" and path.endswith("/files"):
            vol_id = path.split("/volumes/")[1].split("/files")[0]
            file_path = request.url.params.get("file_path", "")
            self.files.pop(f"{vol_id}:{file_path}", None)
            return httpx.Response(200, json={"deleted": True, "volume_id": vol_id, "file_path": file_path})

        # 10. POST /api/v1/catalog/volumes/record-file
        if method == "POST" and path.endswith("/record-file"):
            data = json.loads(request.content.decode("utf-8")) if request.content else {}
            return httpx.Response(200, json=data)

        # 11. POST /api/v1/catalog/volumes/resolve
        if method == "POST" and path.endswith("/resolve"):
            data = json.loads(request.content.decode("utf-8")) if request.content else {}
            return httpx.Response(200, json={
                "storage_type": "azure_blob",
                "container_url": "https://compassxstorage.blob.core.windows.net/eam",
                "sas_token": "?sv=2024-05-04&ss=b&srt=co&sp=rwlacupx",
                "volume_id": data.get("volume_id"),
            })

        return httpx.Response(404, json={"detail": f"Mock endpoint not found: {method} {path}"})


@pytest.fixture(autouse=True)
def mock_compassx_api(monkeypatch):
    mock_catalog = MockCompassXCatalog()
    mock_transport = httpx.MockTransport(mock_catalog.handle)

    orig_async_client_init = httpx.AsyncClient.__init__

    def patched_init(self, *args, **kwargs):
        kwargs["transport"] = mock_transport
        orig_async_client_init(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched_init)
    return mock_catalog


# -----------------------------------------------------------------------------
# 1. CompassX Volume Client Unit Tests
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_compassx_volume_client_lifecycle():
    client = CompassXVolumeClient()

    # 1. Create volume
    vol = await client.create_volume(
        catalog_name="eam_catalog",
        schema_name="documents_schema",
        name="project_documents",
        description="Storage volume for external document uploads",
    )
    assert vol["id"] is not None
    assert vol["name"] == "project_documents"
    vol_id = vol["id"]

    # 2. List volumes
    volumes = await client.list_volumes(catalog="eam_catalog")
    assert any(v["id"] == vol_id for v in volumes)

    # 3. Create directory
    dir_res = await client.create_directory(
        volume_id=vol_id,
        dir_name="invoices",
        sub_path="finance/2026",
    )
    assert dir_res["dir_path"] == "finance/2026/invoices"
    assert dir_res["dir_name"] == "invoices"

    # 4. Upload file
    sample_content = b"PDF Contract Header Content for Testing 2026"
    file_res = await client.upload_file(
        volume_id=vol_id,
        file_content=sample_content,
        file_name="contract.pdf",
        content_type="application/pdf",
        sub_path="finance/2026/invoices",
    )
    assert file_res["file_name"] == "contract.pdf"
    assert file_res["file_path"] == "finance/2026/invoices/contract.pdf"
    assert file_res["size_bytes"] == len(sample_content)

    # 5. List files in volume
    file_list = await client.list_files(volume_id=vol_id, sub_path="finance/2026")
    assert any(f["file_name"] == "contract.pdf" for f in file_list)

    # 6. Download file
    downloaded_content, c_type = await client.download_file(
        volume_id=vol_id,
        file_path="finance/2026/invoices/contract.pdf",
    )
    assert downloaded_content == sample_content
    assert c_type == "application/pdf"

    # 7. Get Presigned URL
    url_res = await client.get_presigned_url(
        volume_id=vol_id,
        file_path="finance/2026/invoices/contract.pdf",
        expiry_seconds=1800,
    )
    assert "url" in url_res
    assert url_res["expires_in_seconds"] == 1800

    # 8. Rename file
    rename_res = await client.rename_file(
        volume_id=vol_id,
        old_path="finance/2026/invoices/contract.pdf",
        new_name="signed_contract.pdf",
    )
    assert rename_res["status"] == "success"
    assert rename_res["new_path"] == "finance/2026/invoices/signed_contract.pdf"

    # 9. Delete file
    del_res = await client.delete_file(
        volume_id=vol_id,
        file_path="finance/2026/invoices/signed_contract.pdf",
    )
    assert del_res["deleted"] is True


# -----------------------------------------------------------------------------
# 2. Document Management Service Tests
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_doc_management_service_upload_and_lifecycle(test_db):
    svc = DocManagementService()
    svc.seed_default_folders(test_db)

    # Get ATTACHMENTS folder
    att_folder = svc.get_folder(test_db, "ATTACHMENTS")
    assert att_folder is not None

    # Upload document
    pdf_bytes = b"%PDF-1.4 Test Equipment Service Manual Attachment Content"
    doc = await svc.upload_document(
        db=test_db,
        file_content=pdf_bytes,
        file_name="pump_overhaul_guide.pdf",
        content_type="application/pdf",
        title="Pump Overhaul Guide",
        description="Official OEM overhaul procedures",
        folder_id=att_folder.id,
        tags=["manual", "pump", "oem"],
        created_by="engineer_alice",
        version="1.0",
    )
    assert doc.id is not None
    assert doc.document_code.startswith("DOC-")
    assert doc.title == "Pump Overhaul Guide"
    assert doc.sha256_hash is not None
    assert doc.file_size_bytes == len(pdf_bytes)
    assert "manual" in doc.tags

    # Verify query and search
    docs, total = svc.list_documents(test_db, search="overhaul")
    assert total >= 1
    assert any(d.id == doc.id for d in docs)

    # Download
    content, ctype, fname = await svc.download_document(test_db, doc.id)
    assert content == pdf_bytes
    assert fname == "pump_overhaul_guide.pdf"

    # Presigned SAS URL
    url_info = await svc.get_presigned_url(test_db, doc.id, expiry_seconds=3600)
    assert "url" in url_info

    # Rename
    renamed_doc = await svc.rename_document(
        test_db,
        doc_id=doc.id,
        new_file_name="pump_overhaul_guide_v2.pdf",
        new_title="Pump Overhaul Guide (Revised)",
    )
    assert renamed_doc.file_name == "pump_overhaul_guide_v2.pdf"
    assert renamed_doc.title == "Pump Overhaul Guide (Revised)"

    # Metadata update
    updated_doc = svc.update_document_metadata(
        test_db,
        doc_id=doc.id,
        tags=["manual", "pump", "critical"],
        status="ACTIVE",
    )
    assert "critical" in updated_doc.tags

    # Delete
    deleted = await svc.delete_document(test_db, doc.id)
    assert deleted is True
    assert svc.get_document(test_db, doc.id) is None


@pytest.mark.asyncio
async def test_doc_management_url_document(test_db):
    svc = DocManagementService()
    doc = svc.create_url_document(
        db=test_db,
        title="Corporate Safety Portal",
        url="https://safety.compassx.enterprise/policies/2026",
        description="External health and safety policy portal",
        tags=["safety", "compliance"],
        created_by="safety_officer",
    )
    assert doc.url_type == "URL"
    assert doc.url_name == "https://safety.compassx.enterprise/policies/2026"

    presigned = await svc.get_presigned_url(test_db, doc.id)
    assert presigned["url"] == "https://safety.compassx.enterprise/policies/2026"


# -----------------------------------------------------------------------------
# 3. FastAPI REST Endpoints Tests
# -----------------------------------------------------------------------------

def test_document_folders_api(client):
    # 1. List folders
    resp = client.get("/api/document-folders")
    assert resp.status_code == 200
    folders = resp.json()
    assert len(folders) >= 5
    folder_names = [f["folder_name"] for f in folders]
    assert "ATTACHMENTS" in folder_names
    assert "MANUALS" in folder_names
    assert "DRAWINGS" in folder_names

    # 2. Create custom folder
    new_folder_data = {
        "folder_name": "TEST_AUDIT_LOGS",
        "description": "System and Security Audit Logs",
        "default_sub_path": "eam/audit",
        "allowed_extensions": ["log", "txt", "json", "pdf"],
        "max_file_size_mb": 20.0,
        "default_print_thru_vendor": False,
    }
    create_resp = client.post("/api/document-folders", json=new_folder_data)
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["folder_name"] == "TEST_AUDIT_LOGS"
    folder_id = created["id"]

    # 3. Update folder
    up_resp = client.put(f"/api/document-folders/{folder_id}", json={"max_file_size_mb": 30.0})
    assert up_resp.status_code == 200
    assert up_resp.json()["max_file_size_mb"] == 30.0

    # 4. Delete folder
    del_resp = client.delete(f"/api/document-folders/{folder_id}")
    assert del_resp.status_code == 200


def test_documents_upload_and_operations_api(client):
    # 1. Upload multipart file
    file_bytes = b"Sample Calibration Certificate 2026 Content"
    upload_file = io.BytesIO(file_bytes)
    
    resp = client.post(
        "/api/documents/upload",
        files={"file": ("calibration_cert.pdf", upload_file, "application/pdf")},
        data={
            "title": "Pressure Sensor Calibration Certificate",
            "description": "Annual NIST-traceable calibration",
            "tags": "calibration,pressure,nist",
            "version": "1.0",
        },
    )
    assert resp.status_code == 201
    doc = resp.json()
    assert doc["title"] == "Pressure Sensor Calibration Certificate"
    assert doc["file_name"] == "calibration_cert.pdf"
    assert "calibration" in doc["tags"]
    doc_id = doc["id"]

    # 2. Get document metadata
    get_resp = client.get(f"/api/documents/{doc_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == doc_id

    # 3. Download document
    down_resp = client.get(f"/api/documents/{doc_id}/download")
    assert down_resp.status_code == 200
    assert down_resp.content == file_bytes

    # 4. Get Presigned URL
    url_resp = client.get(f"/api/documents/{doc_id}/presigned-url?expiry_seconds=1800")
    assert url_resp.status_code == 200
    assert "url" in url_resp.json()

    # 5. Rename document
    rename_resp = client.post(
        f"/api/documents/{doc_id}/rename",
        json={"new_name": "calibration_cert_2026.pdf", "new_title": "2026 Calibration Certificate"},
    )
    assert rename_resp.status_code == 200
    assert rename_resp.json()["file_name"] == "calibration_cert_2026.pdf"
    assert rename_resp.json()["title"] == "2026 Calibration Certificate"

    # 6. Query list
    list_resp = client.get("/api/documents?search=Calibration")
    assert list_resp.status_code == 200
    items = list_resp.json()["items"]
    assert any(i["id"] == doc_id for i in items)

    # 7. Delete document
    del_resp = client.delete(f"/api/documents/{doc_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted"] is True


def test_compassx_volume_explorer_api(client):
    # 1. List volumes
    vols_resp = client.get("/api/documents-volume/volumes")
    assert vols_resp.status_code == 200
    assert isinstance(vols_resp.json(), list)

    # 2. Create volume
    new_vol = client.post(
        "/api/documents-volume/volumes",
        json={"name": "test_cad_drawings", "description": "CAD Blueprints Volume"},
    )
    assert new_vol.status_code == 201
    vol_id = new_vol.json()["id"]

    # 3. Create directory
    dir_resp = client.post(
        f"/api/documents-volume/volumes/{vol_id}/directories",
        json={"dir_name": "electrical", "sub_path": "blueprints/2026"},
    )
    assert dir_resp.status_code == 200
    assert dir_resp.json()["dir_path"] == "blueprints/2026/electrical"

    # 4. List files inside volume
    files_resp = client.get(f"/api/documents-volume/volumes/{vol_id}/files")
    assert files_resp.status_code == 200
    assert isinstance(files_resp.json(), list)


def test_system_storage_settings_and_discovery_api(client):
    # 1. List catalogs and nested schemas from CompassX
    cat_resp = client.get("/api/system/storage/catalogs")
    assert cat_resp.status_code == 200
    catalogs = cat_resp.json()
    assert len(catalogs) >= 2
    assert any(c["name"] == "default_default" for c in catalogs)
    assert any(len(c.get("schemas", [])) > 0 for c in catalogs)

    # 2. Get active system storage configuration (default fallback)
    cfg_resp = client.get("/api/system/settings/storage")
    assert cfg_resp.status_code == 200
    cfg = cfg_resp.json()
    assert "catalog_name" in cfg
    assert "schema_name" in cfg
    assert "volume_id" in cfg

    # 3. Create a new storage volume via system endpoint
    create_vol_resp = client.post(
        "/api/system/storage/volumes",
        json={
            "catalog_name": "default_default",
            "schema_name": "default",
            "name": "enterprise_vault_2026",
            "description": "Production storage volume for EAM records",
        },
    )
    assert create_vol_resp.status_code == 201
    new_vol = create_vol_resp.json()
    assert new_vol["name"] == "enterprise_vault_2026"
    new_vol_id = new_vol["id"]

    # 4. Update system-wide active storage configuration
    update_resp = client.put(
        "/api/system/settings/storage",
        json={
            "catalog_name": "default_default",
            "schema_name": "default",
            "volume_id": new_vol_id,
            "volume_name": "enterprise_vault_2026",
            "storage_location": f"workspaces/default/default_default/default/volumes/enterprise_vault_2026/",
        },
    )
    assert update_resp.status_code == 200
    saved_cfg = update_resp.json()
    assert saved_cfg["is_configured"] is True
    assert saved_cfg["volume_id"] == new_vol_id
    assert saved_cfg["volume_name"] == "enterprise_vault_2026"

    # 5. Verify GET reflects updated configuration
    verify_resp = client.get("/api/system/settings/storage")
    assert verify_resp.status_code == 200
    assert verify_resp.json()["volume_name"] == "enterprise_vault_2026"
    assert verify_resp.json()["is_configured"] is True


def test_main_domain_resolution_and_subdomain_stripping(client):
    from backend.routers.system import extract_main_domain, normalize_to_main_domain_url

    # 1. Test extract_main_domain unit cases
    assert extract_main_domain("app.compassx.io") == "compassx.io"
    assert extract_main_domain("sub.tenant.compassx.io") == "compassx.io"
    assert extract_main_domain("compassx.io") == "compassx.io"
    assert extract_main_domain("app.example.co.uk") == "example.co.uk"
    assert extract_main_domain("staging.app.example.com.au") == "example.com.au"
    assert extract_main_domain("localhost") == "localhost"
    assert extract_main_domain("localhost:8000") == "localhost"
    assert extract_main_domain("127.0.0.1") == "127.0.0.1"
    assert extract_main_domain("192.168.1.100:3000") == "192.168.1.100"
    assert extract_main_domain("135.13.180.167.nip.io") == "135.13.180.167.nip.io"
    assert extract_main_domain("10-0-0-1.sslip.io:8080") == "10-0-0-1.sslip.io"

    # 2. Test normalize_to_main_domain_url
    assert normalize_to_main_domain_url("https://app.compassx.io/api/v1/catalog") == "https://compassx.io/api/v1/catalog"
    assert normalize_to_main_domain_url("http://sub.company.co.uk:8080/api/v1/catalog") == "http://company.co.uk:8080/api/v1/catalog"
    assert normalize_to_main_domain_url("http://135.13.180.167.nip.io/api/v1/catalog") == "http://135.13.180.167.nip.io/api/v1/catalog"

    # 3. Test API endpoint with subdomain in Host / X-Forwarded-Host header
    resp_subdomain = client.get(
        "/api/system/settings/storage",
        headers={
            "x-forwarded-proto": "https",
            "x-forwarded-host": "subdomain.compassx.io",
        },
    )
    assert resp_subdomain.status_code == 200
    data = resp_subdomain.json()
    # The endpoint URL should use the main domain, not the subdomain
    assert "https://compassx.io" in data["endpoint_url"]
    assert "subdomain" not in data["endpoint_url"]

    # 4. Test API endpoint with custom X-CompassX-Catalog-Url header containing subdomain
    resp_header = client.get(
        "/api/system/settings/storage",
        headers={
            "x-compassx-catalog-url": "https://tenant-prod.compassx.io/api/v1/catalog",
        },
    )
    assert resp_header.status_code == 200
    assert resp_header.json()["endpoint_url"] == "https://compassx.io/api/v1/catalog"

    # 5. Test API endpoint with custom X-CompassX-Catalog-Url header with nip.io
    resp_nipio = client.get(
        "/api/system/settings/storage",
        headers={
            "x-compassx-catalog-url": "http://135.13.180.167.nip.io/api/v1/catalog",
        },
    )
    assert resp_nipio.status_code == 200
    assert resp_nipio.json()["endpoint_url"] == "http://135.13.180.167.nip.io/api/v1/catalog"


