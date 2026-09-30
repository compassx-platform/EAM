from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.doc_management_service import doc_management_service
from backend.services.compassx_volume_client import compassx_volume_client
from backend.models.doclink import DocFolder, DocInfo
from backend.routers.system import resolve_browser_catalog_url

router = APIRouter(prefix="", tags=["Document Management (Doclinks & Volumes)"])


# -----------------------------------------------------------------------------
# Pydantic Schemas
# -----------------------------------------------------------------------------

class DocFolderCreate(BaseModel):
    folder_name: str = Field(..., description="Document folder code, e.g. ATTACHMENTS, MANUALS")
    description: Optional[str] = None
    volume_id: Optional[str] = None
    default_sub_path: Optional[str] = ""
    allowed_extensions: Optional[List[str]] = None
    max_file_size_mb: float = Field(50.0, gt=0)
    default_print_thru_vendor: bool = False


class DocFolderUpdate(BaseModel):
    description: Optional[str] = None
    volume_id: Optional[str] = None
    default_sub_path: Optional[str] = None
    allowed_extensions: Optional[List[str]] = None
    max_file_size_mb: Optional[float] = None
    is_active: Optional[bool] = None
    default_print_thru_vendor: Optional[bool] = None


class DocUrlCreate(BaseModel):
    title: str = Field(..., description="Document Title")
    url: str = Field(..., description="External Web or Cloud URL")
    description: Optional[str] = None
    folder_id: Optional[str] = None
    tags: Optional[List[str]] = None
    custom_metadata: Optional[Dict[str, Any]] = None
    created_by: Optional[str] = "system"


class DocRenameRequest(BaseModel):
    new_name: str = Field(..., description="New file name with extension")
    new_title: Optional[str] = None
    updated_by: Optional[str] = "system"


class DocMetadataUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    folder_id: Optional[str] = None
    tags: Optional[List[str]] = None
    custom_metadata: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    updated_by: Optional[str] = "system"


class VolumeCreateRequest(BaseModel):
    name: str = Field(..., description="Volume name")
    description: Optional[str] = ""
    catalog_name: Optional[str] = "eam_catalog"
    schema_name: Optional[str] = "documents_schema"


class DirectoryCreateRequest(BaseModel):
    dir_name: str = Field(..., description="Directory name to create")
    sub_path: Optional[str] = ""


# -----------------------------------------------------------------------------
# 1. Document Folders / Categories Endpoints
# -----------------------------------------------------------------------------

@router.get("/document-folders")
def list_document_folders(
    active_only: bool = Query(False, description="Filter only active folders"),
    db: Session = Depends(get_db),
):
    """Lists all document folder categories (Maximo DOCTYPES)."""
    folders = doc_management_service.list_folders(db, is_active_only=active_only)
    return [f.to_dict() for f in folders]


@router.post("/document-folders", status_code=status.HTTP_201_CREATED)
def create_document_folder(
    payload: DocFolderCreate,
    db: Session = Depends(get_db),
):
    """Creates a new document folder category."""
    try:
        folder = doc_management_service.create_folder(
            db=db,
            folder_name=payload.folder_name,
            description=payload.description,
            volume_id=payload.volume_id,
            default_sub_path=payload.default_sub_path or "",
            allowed_extensions=payload.allowed_extensions,
            max_file_size_mb=payload.max_file_size_mb,
            default_print_thru_vendor=payload.default_print_thru_vendor,
        )
        return folder.to_dict()
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.get("/document-folders/{folder_id}")
def get_document_folder(
    folder_id: str,
    db: Session = Depends(get_db),
):
    """Gets details for a specific document folder."""
    folder = doc_management_service.get_folder(db, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail=f"Folder '{folder_id}' not found")
    return folder.to_dict()


@router.put("/document-folders/{folder_id}")
def update_document_folder(
    folder_id: str,
    payload: DocFolderUpdate,
    db: Session = Depends(get_db),
):
    """Updates a document folder category."""
    try:
        folder = doc_management_service.update_folder(
            db=db,
            folder_id=folder_id,
            description=payload.description,
            volume_id=payload.volume_id,
            default_sub_path=payload.default_sub_path,
            allowed_extensions=payload.allowed_extensions,
            max_file_size_mb=payload.max_file_size_mb,
            is_active=payload.is_active,
            default_print_thru_vendor=payload.default_print_thru_vendor,
        )
        return folder.to_dict()
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))


@router.delete("/document-folders/{folder_id}")
def delete_document_folder(
    folder_id: str,
    db: Session = Depends(get_db),
):
    """Deletes a document folder category."""
    try:
        doc_management_service.delete_folder(db, folder_id)
        return {"id": folder_id, "deleted": True}
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))


# -----------------------------------------------------------------------------
# 2. Master Documents Endpoints (Upload / URL / Query / Download)
# -----------------------------------------------------------------------------

@router.get("/documents")
def list_documents(
    folder_id: Optional[str] = Query(None, description="Filter by folder ID"),
    search: Optional[str] = Query(None, description="Keyword search in title, code, filename"),
    url_type: Optional[str] = Query(None, description="FILE or URL"),
    tag: Optional[str] = Query(None, description="Filter by tag"),
    status: Optional[str] = Query(None, description="ACTIVE, ARCHIVED, DEPRECATED"),
    volume_id: Optional[str] = Query(None, description="Filter by CompassX volume ID"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Queries and lists registered documents with filtering and search."""
    docs, total = doc_management_service.list_documents(
        db=db,
        folder_id=folder_id,
        search=search,
        url_type=url_type,
        tag=tag,
        status=status,
        volume_id=volume_id,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [d.to_dict(include_links=True) for d in docs],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("/documents/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    folder_id: Optional[str] = Form(None),
    sub_path: Optional[str] = Form(None),
    volume_id: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    version: Optional[str] = Form("1.0"),
    created_by: Optional[str] = Form("system"),
    db: Session = Depends(get_db),
):
    """Uploads a file directly to CompassX volume storage and creates DocInfo metadata."""
    base_url = resolve_browser_catalog_url(request, db)
    try:
        content = await file.read()
        parsed_tags = []
        if tags:
            try:
                import json
                parsed_tags = json.loads(tags) if tags.startswith("[") else [t.strip() for t in tags.split(",") if t.strip()]
            except Exception:
                parsed_tags = [t.strip() for t in tags.split(",") if t.strip()]

        doc = await doc_management_service.upload_document(
            db=db,
            file_content=content,
            file_name=file.filename or "uploaded_file",
            content_type=file.content_type or "application/octet-stream",
            title=title,
            description=description,
            folder_id=folder_id,
            sub_path=sub_path,
            volume_id=volume_id,
            tags=parsed_tags,
            created_by=created_by,
            version=version or "1.0",
            base_url=base_url,
        )
        return doc.to_dict(include_links=True)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Storage upload error: {exc}")


@router.post("/documents/url", status_code=status.HTTP_201_CREATED)
def create_url_document(
    payload: DocUrlCreate,
    db: Session = Depends(get_db),
):
    """Registers an external web document or cloud URL link."""
    try:
        doc = doc_management_service.create_url_document(
            db=db,
            title=payload.title,
            url=payload.url,
            description=payload.description,
            folder_id=payload.folder_id,
            tags=payload.tags,
            custom_metadata=payload.custom_metadata,
            created_by=payload.created_by,
        )
        return doc.to_dict(include_links=True)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.get("/documents/{doc_id}")
def get_document(
    doc_id: str,
    db: Session = Depends(get_db),
):
    """Gets document metadata by ID or Document Code."""
    doc = doc_management_service.get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")
    return doc.to_dict(include_links=True)


@router.get("/documents/{doc_id}/download")
async def download_document(
    doc_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Streams the raw document binary content from CompassX volume storage."""
    base_url = resolve_browser_catalog_url(request, db)
    try:
        content, content_type, filename = await doc_management_service.download_document(db, doc_id, base_url=base_url)
        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(content)),
            },
        )
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Download error: {exc}")


@router.get("/documents/{doc_id}/presigned-url")
async def get_document_presigned_url(
    doc_id: str,
    request: Request,
    expiry_seconds: int = Query(3600, ge=60, le=86400),
    db: Session = Depends(get_db),
):
    """Generates a temporary scoped SAS / S3 download URL from CompassX volume storage."""
    base_url = resolve_browser_catalog_url(request, db)
    try:
        res = await doc_management_service.get_presigned_url(db, doc_id, expiry_seconds=expiry_seconds, base_url=base_url)
        return res
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))


@router.post("/documents/{doc_id}/rename")
async def rename_document(
    doc_id: str,
    payload: DocRenameRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Renames file in CompassX volume storage and updates DocInfo database record."""
    base_url = resolve_browser_catalog_url(request, db)
    try:
        doc = await doc_management_service.rename_document(
            db=db,
            doc_id=doc_id,
            new_file_name=payload.new_name,
            new_title=payload.new_title,
            updated_by=payload.updated_by,
            base_url=base_url,
        )
        return doc.to_dict(include_links=True)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.put("/documents/{doc_id}")
def update_document_metadata(
    doc_id: str,
    payload: DocMetadataUpdate,
    db: Session = Depends(get_db),
):
    """Updates document metadata, tags, folder, and status."""
    try:
        doc = doc_management_service.update_document_metadata(
            db=db,
            doc_id=doc_id,
            title=payload.title,
            description=payload.description,
            folder_id=payload.folder_id,
            tags=payload.tags,
            custom_metadata=payload.custom_metadata,
            status=payload.status,
            updated_by=payload.updated_by,
        )
        return doc.to_dict(include_links=True)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    request: Request,
    purge_storage: bool = Query(True, description="Also delete underlying file from CompassX Volume"),
    db: Session = Depends(get_db),
):
    """Deletes document metadata and removes file from CompassX volume storage."""
    base_url = resolve_browser_catalog_url(request, db)
    try:
        await doc_management_service.delete_document(db, doc_id, purge_storage=purge_storage, base_url=base_url)
        return {"id": doc_id, "deleted": True}
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))


# -----------------------------------------------------------------------------
# 3. Direct CompassX Volume Explorer Operations
# -----------------------------------------------------------------------------

@router.get("/documents-volume/volumes")
async def list_volumes(
    request: Request,
    catalog: Optional[str] = Query(None),
    schema_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Lists available CompassX storage volumes using browser base URL."""
    base_url = resolve_browser_catalog_url(request, db)
    return await compassx_volume_client.list_volumes(
        catalog=catalog,
        schema_name=schema_name,
        base_url=base_url,
    )


@router.post("/documents-volume/volumes", status_code=status.HTTP_201_CREATED)
async def create_volume(
    payload: VolumeCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Creates a new CompassX storage volume using browser base URL."""
    base_url = resolve_browser_catalog_url(request, db)
    return await compassx_volume_client.create_volume(
        catalog_name=payload.catalog_name or "eam_catalog",
        schema_name=payload.schema_name or "documents_schema",
        name=payload.name,
        description=payload.description or "",
        base_url=base_url,
    )


@router.post("/documents-volume/volumes/{volume_id}/directories")
async def create_directory(
    volume_id: str,
    payload: DirectoryCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Creates a directory folder inside a CompassX storage volume."""
    base_url = resolve_browser_catalog_url(request, db)
    return await compassx_volume_client.create_directory(
        volume_id=volume_id,
        dir_name=payload.dir_name,
        sub_path=payload.sub_path or "",
        base_url=base_url,
    )


@router.get("/documents-volume/volumes/{volume_id}/files")
async def list_volume_files(
    volume_id: str,
    request: Request,
    sub_path: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Directly lists files and folders inside a CompassX storage volume."""
    base_url = resolve_browser_catalog_url(request, db)
    return await compassx_volume_client.list_files(
        volume_id=volume_id,
        sub_path=sub_path,
        base_url=base_url,
    )

