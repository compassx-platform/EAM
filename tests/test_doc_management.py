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
            sub_path = request.url.params.get("sub_path", "") or data.get("sub_path", "")
            full_dir = f"{sub_path}/{dir_name}".strip("/") if sub_path else dir_name
            self.directories.add((vol_id, full_dir))
            return httpx.Response(201, json={
                "volume_id": vol_id,
                "dir_name": dir_name,
                "sub_path": sub_path,
                "dir_path": full_dir,
                "file_path": f"{full_dir}/",
                "file_name": f"{dir_name}/",
                "size_bytes": 0,
                "content_type": "application/x-directory",
                "status": "created",
            })

        # 4. POST /api/v1/catalog/volumes/{vol_id}/files (Upload)
        if method == "POST" and path.endswith("/files"):
            vol_id = path.split("/volumes/")[1].split("/files")[0]
            content = request.content
            content_type = request.headers.get("content-type", "")
            file_name = "uploaded_file"
            sub_path = request.url.params.get("sub_path", "")
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
            for (d_vol, d_path) in self.directories:
                if d_vol == vol_id:
                    if sub_path is None or d_path.startswith(sub_path):
                        dir_name = d_path.split("/")[-1]
                        matched.append({
                            "file_name": f"{dir_name}/",
                            "file_path": f"{d_path}/",
                            "size_bytes": 0,
                            "content_type": "application/x-directory",
                        })
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


def test_compassx_platform_headers(monkeypatch):
    monkeypatch.setenv("WORKSPACE_ID", "ws-tenant-prod-99")
    monkeypatch.setenv("COMPASSX_WORKLOAD_IDENTITY", "sp-eam-service-account")

    client = CompassXVolumeClient()
    headers = client.get_headers()
    assert headers["X-Workspace-Id"] == "ws-tenant-prod-99"
    assert headers["X-Workload-Identity"] == "sp-eam-service-account"
    assert headers["Accept"] == "application/json"
    assert headers["Content-Type"] == "application/json"


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


def test_system_storage_settings_and_discovery_api(client):
    # 1. List catalogs and nested schemas from CompassX
    cat_resp = client.get("/api/system/storage/catalogs")
    assert cat_resp.status_code == 200
    catalogs = cat_resp.json()
    assert len(catalogs) >= 2
    assert any(c["name"] == "default_default" for c in catalogs)
    assert any(len(c.get("schemas", [])) > 0 for c in catalogs)

    # 2. Get active system storage configuration (initially unconfigured)
    cfg_resp = client.get("/api/system/settings/storage")
    assert cfg_resp.status_code == 200
    cfg = cfg_resp.json()
    assert "catalog_name" in cfg
    assert "schema_name" in cfg
    assert "volume_id" in cfg
    assert cfg["is_configured"] is False
    assert cfg["volume_id"] == ""

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


def test_nested_folders_and_file_system_operations(client):
    # 1. Create root folder
    root_res = client.post(
        "/api/document-folders",
        json={"folder_name": "Projects_2026", "description": "2026 Engineering Projects"},
    )
    assert root_res.status_code == 201
    root_id = root_res.json()["id"]

    # 2. Create nested subfolder
    sub_res = client.post(
        "/api/document-folders",
        json={
            "folder_name": "Turbine_Maintenance",
            "parent_id": root_id,
            "description": "Gas Turbine Maintenance Blueprints",
        },
    )
    assert sub_res.status_code == 201
    sub_id = sub_res.json()["id"]
    assert sub_res.json()["parent_id"] == root_id

    # 3. Create second-level nested subfolder
    sub2_res = client.post(
        "/api/document-folders",
        json={
            "folder_name": "Q3_Inspections",
            "parent_id": sub_id,
        },
    )
    assert sub2_res.status_code == 201
    sub2_id = sub2_res.json()["id"]

    # 4. Get breadcrumb path
    path_res = client.get(f"/api/document-folders/{sub2_id}/path")
    assert path_res.status_code == 200
    path = path_res.json()
    assert len(path) == 3
    assert [p["folder_name"] for p in path] == ["Projects_2026", "Turbine_Maintenance", "Q3_Inspections"]

    # 5. Get folder tree
    tree_res = client.get("/api/document-folders/tree")
    assert tree_res.status_code == 200
    tree = tree_res.json()
    root_in_tree = next((f for f in tree if f["id"] == root_id), None)
    assert root_in_tree is not None
    assert len(root_in_tree["subfolders"]) >= 1

    # 6. Upload document to nested subfolder
    doc_res = client.post(
        "/api/documents/url",
        json={
            "title": "Inspection Report PDF",
            "url": "https://storage.enterprise.io/reports/q3_turbine.pdf",
            "folder_id": sub2_id,
        },
    )
    assert doc_res.status_code == 201
    doc_id = doc_res.json()["id"]

    # 7. Move document to root folder
    move_doc_res = client.put(
        f"/api/documents/{doc_id}/move",
        json={"target_folder_id": root_id},
    )
    assert move_doc_res.status_code == 200
    assert move_doc_res.json()["folder_id"] == root_id

    # 8. Move subfolder
    move_folder_res = client.put(
        f"/api/document-folders/{sub2_id}/move",
        json={"target_parent_id": root_id},
    )
    assert move_folder_res.status_code == 200
    assert move_folder_res.json()["parent_id"] == root_id


def test_workload_identity_and_nip_io_subdomain_stripping(client, monkeypatch):
    from backend.routers.system import extract_main_domain

    # 1. Test nip.io domain stripping: eam-dev.135.13.180.167.nip.io -> 135.13.180.167.nip.io
    assert extract_main_domain("eam-dev.135.13.180.167.nip.io") == "135.13.180.167.nip.io"
    assert extract_main_domain("eam-dev.135.13.180.167.nip.io:8000") == "135.13.180.167.nip.io"
    assert extract_main_domain("app.staging.135.13.180.167.nip.io") == "135.13.180.167.nip.io"
    assert extract_main_domain("135.13.180.167.nip.io") == "135.13.180.167.nip.io"

    # 2. Test Workload Identity resolution from environment variable
    monkeypatch.setenv("COMPASSX_WORKLOAD_IDENTITY", "sp-compassx-eam-identity")

    # 3. Test API endpoint with eam-dev.135.13.180.167.nip.io in X-Forwarded-Host
    resp = client.get(
        "/api/system/settings/storage",
        headers={
            "x-forwarded-proto": "https",
            "x-forwarded-host": "eam-dev.135.13.180.167.nip.io",
            "x-workload-identity": "sp-compassx-eam-identity",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "https://135.13.180.167.nip.io" in data["endpoint_url"]
    assert "eam-dev" not in data["endpoint_url"]


def test_system_storage_no_hardcoded_fallback_on_error(client, monkeypatch):
    """Verifies that no mock or hardcoded catalogs/volumes are returned when CompassX fails."""
    from backend.services.compassx_volume_client import compassx_volume_client

    async def fail_list_catalogs(*args, **kwargs):
        raise RuntimeError("CompassX catalog unreachable")

    async def fail_list_volumes(*args, **kwargs):
        raise RuntimeError("CompassX volumes unreachable")

    monkeypatch.setattr(compassx_volume_client, "list_catalogs", fail_list_catalogs)
    monkeypatch.setattr(compassx_volume_client, "list_volumes", fail_list_volumes)

    cat_resp = client.get("/api/system/storage/catalogs")
    assert cat_resp.status_code == 200
    assert cat_resp.json() == []

    vol_resp = client.get("/api/system/storage/volumes?catalog=nonexistent&schema_name=nonexistent")
    assert vol_resp.status_code == 200
    assert vol_resp.json() == []


def test_changing_storage_volume_stops_showing_documents(client):
    """Verifies that changing active storage volume stops showing documents stored in previous volume."""
    import io

    # 1. Configure Volume 1
    vol1_id = "vol-1111-aaaa"
    up1 = client.put(
        "/api/system/settings/storage",
        json={
            "catalog_name": "default_default",
            "schema_name": "default",
            "volume_id": vol1_id,
            "volume_name": "vault_alpha",
            "storage_location": f"workspaces/default/default_default/default/volumes/vault_alpha/",
        },
    )
    assert up1.status_code == 200
    assert up1.json()["volume_id"] == vol1_id

    # 2. Upload document under Volume 1
    file_bytes1 = b"Content for Volume 1 file"
    up_resp1 = client.post(
        "/api/documents/upload",
        files={"file": ("alpha_file.txt", io.BytesIO(file_bytes1), "text/plain")},
        data={"title": "Alpha Document", "version": "1.0"},
    )
    assert up_resp1.status_code == 201
    doc1 = up_resp1.json()
    assert doc1["volume_id"] == vol1_id
    doc1_id = doc1["id"]

    # 3. Query documents -> should contain doc1
    list1 = client.get("/api/documents").json()["items"]
    assert any(d["id"] == doc1_id for d in list1)

    # 4. Switch active volume to Volume 2
    vol2_id = "vol-2222-bbbb"
    up2 = client.put(
        "/api/system/settings/storage",
        json={
            "catalog_name": "default_default",
            "schema_name": "default",
            "volume_id": vol2_id,
            "volume_name": "vault_beta",
            "storage_location": f"workspaces/default/default_default/default/volumes/vault_beta/",
        },
    )
    assert up2.status_code == 200
    assert up2.json()["volume_id"] == vol2_id

    # 5. Query documents under Volume 2 -> doc1 MUST NO LONGER BE RETURNED
    list2 = client.get("/api/documents").json()["items"]
    assert not any(d["id"] == doc1_id for d in list2), "doc1 from previous volume must stop showing!"

    # 6. Upload document under Volume 2
    file_bytes2 = b"Content for Volume 2 file"
    up_resp2 = client.post(
        "/api/documents/upload",
        files={"file": ("beta_file.txt", io.BytesIO(file_bytes2), "text/plain")},
        data={"title": "Beta Document", "version": "1.0"},
    )
    assert up_resp2.status_code == 201
    doc2 = up_resp2.json()
    assert doc2["volume_id"] == vol2_id
    doc2_id = doc2["id"]

    # 7. Query documents -> should contain doc2, NOT doc1
    list3 = client.get("/api/documents").json()["items"]
    assert any(d["id"] == doc2_id for d in list3)
    assert not any(d["id"] == doc1_id for d in list3)

    # 8. Query with volume_id='all' -> should return both
    list_all = client.get("/api/documents?volume_id=all").json()["items"]
    assert any(d["id"] == doc1_id for d in list_all)
    assert any(d["id"] == doc2_id for d in list_all)

    # 9. Switch back to Volume 1 -> doc1 should show, doc2 should not show
    client.put(
        "/api/system/settings/storage",
        json={
            "catalog_name": "default_default",
            "schema_name": "default",
            "volume_id": vol1_id,
            "volume_name": "vault_alpha",
            "storage_location": f"workspaces/default/default_default/default/volumes/vault_alpha/",
        },
    )
    list4 = client.get("/api/documents").json()["items"]
    assert any(d["id"] == doc1_id for d in list4)
    assert not any(d["id"] == doc2_id for d in list4)


def test_create_folder_in_volume_root_and_nested(client, mock_compassx_api):
    """Verifies that creating a folder creates the directory in the volume using POST /api/v1/catalog/volumes/{vol}/directories."""
    vol_id = "eb1def3b-df4c-4fa4-9b70-97bbe2eb3d48"
    mock_compassx_api.volumes.append({
        "id": vol_id,
        "name": "sample_data",
        "catalog_name": "default_default",
        "schema_name": "default",
        "description": "Sample Data Volume",
    })

    # 1. Configure active storage volume
    client.put(
        "/api/system/settings/storage",
        json={
            "catalog_name": "default_default",
            "schema_name": "default",
            "volume_id": vol_id,
            "volume_name": "sample_data",
            "storage_location": "workspaces/default/default_default/default/volumes/sample_data/",
        },
    )

    # 2. Create Root-level folder "reports"
    root_resp = client.post(
        "/api/document-folders",
        json={
            "folder_name": "reports",
            "volume_id": vol_id,
        },
    )
    assert root_resp.status_code == 201
    root_folder = root_resp.json()
    assert root_folder["folder_name"] == "reports"
    assert root_folder["default_sub_path"] == "reports"
    assert root_folder["volume_id"] == vol_id
    assert root_folder["parent_id"] is None
    root_id = root_folder["id"]

    # Verify directory created in mock volume
    assert (vol_id, "reports") in mock_compassx_api.directories

    # 3. Create Nested subfolder "invoices" inside "reports"
    nested_resp = client.post(
        "/api/document-folders",
        json={
            "folder_name": "invoices",
            "parent_id": root_id,
            "volume_id": vol_id,
        },
    )
    assert nested_resp.status_code == 201
    nested_folder = nested_resp.json()
    assert nested_folder["folder_name"] == "invoices"
    assert nested_folder["default_sub_path"] == "reports/invoices"
    assert nested_folder["volume_id"] == vol_id
    assert nested_folder["parent_id"] == root_id

    # Verify nested directory created in mock volume
    assert (vol_id, "reports/invoices") in mock_compassx_api.directories


def test_volume_sync_removes_dummy_folders_and_syncs_files(client, mock_compassx_api):
    """Verifies that volume sync imports volume folders and files and purges dummy unconfigured folders."""
    vol_id = "eb1def3b-df4c-4fa4-9b70-97bbe2eb3d48"

    # 1. Add directories and files directly to mock volume
    mock_compassx_api.directories.add((vol_id, "finance"))
    mock_compassx_api.directories.add((vol_id, "finance/2026"))
    mock_compassx_api.directories.add((vol_id, "finance/2026/invoices"))

    file_bytes = b"Sample Invoice #1042"
    mock_compassx_api.files[f"{vol_id}:finance/2026/invoices/inv_1042.pdf"] = {
        "content": file_bytes,
        "content_type": "application/pdf",
        "file_name": "inv_1042.pdf",
        "file_path": "finance/2026/invoices/inv_1042.pdf",
    }

    # Root level file
    mock_compassx_api.files[f"{vol_id}:readme.txt"] = {
        "content": b"Welcome to storage",
        "content_type": "text/plain",
        "file_name": "readme.txt",
        "file_path": "readme.txt",
    }

    # 2. Trigger sync endpoint
    sync_resp = client.post(f"/api/documents/sync?volume_id={vol_id}")
    assert sync_resp.status_code == 200
    sync_data = sync_resp.json()
    assert sync_data["synced"] is True
    assert sync_data["volume_id"] == vol_id
    assert sync_data["folders_synced"] >= 3
    assert sync_data["files_synced"] >= 2

    # 3. Query folders for this volume -> should contain finance, 2026, invoices
    folders_resp = client.get(f"/api/document-folders?volume_id={vol_id}")
    assert folders_resp.status_code == 200
    folders = folders_resp.json()
    folder_names = [f["folder_name"] for f in folders]
    assert "finance" in folder_names
    assert "2026" in folder_names
    assert "invoices" in folder_names

    # Check dummy folders (like ATTACHMENTS, MANUALS with volume_id is None) are not present for this volume
    assert "ATTACHMENTS" not in folder_names
    assert "MANUALS" not in folder_names

    # 4. Check folder tree hierarchy
    tree_resp = client.get(f"/api/document-folders/tree?volume_id={vol_id}")
    assert tree_resp.status_code == 200
    tree = tree_resp.json()
    finance_node = next((n for n in tree if n["folder_name"] == "finance"), None)
    assert finance_node is not None
    assert len(finance_node["subfolders"]) == 1
    sub_node = finance_node["subfolders"][0]
    assert sub_node["folder_name"] == "2026"
    assert len(sub_node["subfolders"]) == 1
    assert sub_node["subfolders"][0]["folder_name"] == "invoices"

    # 5. Check documents synced
    docs_resp = client.get(f"/api/documents?volume_id={vol_id}")
    assert docs_resp.status_code == 200
    docs = docs_resp.json()["items"]
    filenames = [d["file_name"] for d in docs]
    assert "readme.txt" in filenames
    assert "inv_1042.pdf" in filenames


def test_upload_file_into_folder_persists_in_volume_and_ui(client, mock_compassx_api):
    """Verifies that uploading a file inside a folder persists the file with sub_path in CompassX and shows in folder UI."""
    vol_id = "eb1def3b-df4c-4fa4-9b70-97bbe2eb3d48"
    mock_compassx_api.volumes.append({
        "id": vol_id,
        "name": "sample_data",
        "catalog_name": "default_default",
        "schema_name": "default",
        "description": "Sample Data Volume",
    })

    # 1. Configure storage
    client.put(
        "/api/system/settings/storage",
        json={
            "catalog_name": "default_default",
            "schema_name": "default",
            "volume_id": vol_id,
            "volume_name": "sample_data",
            "storage_location": "workspaces/default/default_default/default/volumes/sample_data/",
        },
    )

    # 2. Create folder "manuals"
    folder_resp = client.post(
        "/api/document-folders",
        json={"folder_name": "manuals", "volume_id": vol_id},
    )
    assert folder_resp.status_code == 201
    folder = folder_resp.json()
    folder_id = folder["id"]
    assert folder["default_sub_path"] == "manuals"

    # 3. Upload file inside the folder
    file_bytes = b"Turbine Operation SOP Manual 2026"
    up_resp = client.post(
        "/api/documents/upload",
        files={"file": ("turbine_manual.pdf", io.BytesIO(file_bytes), "application/pdf")},
        data={"title": "Turbine Operation SOP", "folder_id": folder_id, "volume_id": vol_id},
    )
    assert up_resp.status_code == 201
    doc = up_resp.json()
    assert doc["folder_id"] == folder_id
    assert doc["url_name"] == "manuals/turbine_manual.pdf"
    assert doc["file_name"] == "turbine_manual.pdf"

    # Verify physical file stored in volume under manuals/
    assert f"{vol_id}:manuals/turbine_manual.pdf" in mock_compassx_api.files

    # 4. Trigger volume sync
    sync_resp = client.post(f"/api/documents/sync?volume_id={vol_id}")
    assert sync_resp.status_code == 200

    # 5. Query documents by folder_id -> file MUST be returned
    folder_docs_resp = client.get(f"/api/documents?folder_id={folder_id}&volume_id={vol_id}")
    assert folder_docs_resp.status_code == 200
    folder_docs = folder_docs_resp.json()["items"]
    assert len(folder_docs) == 1
    assert folder_docs[0]["file_name"] == "turbine_manual.pdf"
    assert folder_docs[0]["folder_id"] == folder_id

    # 6. Query root documents -> file MUST NOT be returned at root
    root_docs_resp = client.get(f"/api/documents?folder_id=root&volume_id={vol_id}")
    assert root_docs_resp.status_code == 200
    root_docs = root_docs_resp.json()["items"]
    assert not any(d["file_name"] == "turbine_manual.pdf" for d in root_docs)






