from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.doc_management_service import doc_management_service
from backend.services.compassx_volume_client import compassx_volume_client
from backend.models.doclink import DocFolder, DocInfo
from backend.models.system_setting import SystemSetting
from backend.routers.system import (
    resolve_browser_catalog_url,
    resolve_auth_token,
    resolve_workload_identity,
    resolve_workspace_id,
)

router = APIRouter(prefix="", tags=["Document Management (Doclinks & Volumes)"])


# -----------------------------------------------------------------------------
# Pydantic Schemas
# -----------------------------------------------------------------------------

class DocFolderCreate(BaseModel):
    folder_name: str = Field(..., description="Document folder code or name, e.g. ATTACHMENTS, MANUALS, SUBFOLDER")
    parent_id: Optional[str] = Field(None, description="Parent folder UUID for nested folder hierarchy")
    description: Optional[str] = None
    volume_id: Optional[str] = None
    default_sub_path: Optional[str] = ""
    allowed_extensions: Optional[List[str]] = None
    max_file_size_mb: float = Field(50.0, gt=0)
    default_print_thru_vendor: bool = False


class DocFolderUpdate(BaseModel):
    folder_name: Optional[str] = None
    parent_id: Optional[str] = None
    description: Optional[str] = None
    volume_id: Optional[str] = None
    default_sub_path: Optional[str] = None
    allowed_extensions: Optional[List[str]] = None
    max_file_size_mb: Optional[float] = None
    is_active: Optional[bool] = None
    default_print_thru_vendor: Optional[bool] = None


class DocFolderMoveRequest(BaseModel):
    target_parent_id: Optional[str] = None


class DocMoveRequest(BaseModel):
    target_folder_id: Optional[str] = None


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


def resolve_effective_volume_id(db: Session, volume_id: Optional[str] = None) -> Optional[str]:
    """Resolves target volume ID: explicit param, active storage_config setting, or active DB volume."""
    if volume_id is not None:
        clean = volume_id.strip()
        if clean.lower() == "all":
            return None
        if clean:
            return clean

    # 1. Check storage_config setting
    setting = db.query(SystemSetting).filter(SystemSetting.key == "storage_config").first()
    if setting and isinstance(setting.value, dict) and setting.value.get("volume_id"):
        return setting.value.get("volume_id")

    # 2. Check active volume present in DocFolder or DocInfo
    first_folder_vol = db.query(DocFolder.volume_id).filter(
        DocFolder.volume_id.isnot(None),
        DocFolder.volume_id != "",
        DocFolder.volume_id != "__unconfigured__",
    ).first()
    if first_folder_vol and first_folder_vol[0]:
        return first_folder_vol[0]

    first_doc_vol = db.query(DocInfo.volume_id).filter(
        DocInfo.volume_id.isnot(None),
        DocInfo.volume_id != "",
        DocInfo.volume_id != "__unconfigured__",
    ).first()
    if first_doc_vol and first_doc_vol[0]:
        return first_doc_vol[0]

    return None


# -----------------------------------------------------------------------------
# 1. Document Folders / Categories Endpoints
# -----------------------------------------------------------------------------

@router.get("/document-folders")
async def list_document_folders(
    request: Request,
    active_only: bool = Query(False, description="Filter only active folders"),
    parent_id: Optional[str] = Query(None, description="Filter by parent folder UUID or 'root'"),
    volume_id: Optional[str] = Query(None, description="Filter by volume ID"),
    sync: bool = Query(True, description="Sync with volume before returning"),
    db: Session = Depends(get_db),
):
    """Lists all document folder categories (Maximo DOCTYPES and nested folders)."""
    filter_volume_id = resolve_effective_volume_id(db, volume_id)

    if sync and filter_volume_id:
        base_url = resolve_browser_catalog_url(request, db)
        auth_token = resolve_auth_token(request, db)
        workload_identity = resolve_workload_identity(request, db)
        workspace_id = resolve_workspace_id(request, db)
        try:
            await doc_management_service.sync_volume_with_db(
                db=db,
                volume_id=filter_volume_id,
                base_url=base_url,
                auth_token=auth_token,
                workload_identity=workload_identity,
                workspace_id=workspace_id,
            )
        except Exception:
            pass

    folders = doc_management_service.list_folders(
        db,
        is_active_only=active_only,
        parent_id=parent_id,
        volume_id=filter_volume_id,
    )
    return [f.to_dict() for f in folders]


@router.get("/document-folders/tree")
async def get_document_folder_tree(
    request: Request,
    active_only: bool = Query(False, description="Filter only active folders"),
    volume_id: Optional[str] = Query(None, description="Filter by volume ID"),
    sync: bool = Query(True, description="Sync with volume before returning"),
    db: Session = Depends(get_db),
):
    """Returns the full recursive folder hierarchy tree for Databricks-style explorer."""
    filter_volume_id = resolve_effective_volume_id(db, volume_id)

    if sync and filter_volume_id:
        base_url = resolve_browser_catalog_url(request, db)
        auth_token = resolve_auth_token(request, db)
        workload_identity = resolve_workload_identity(request, db)
        workspace_id = resolve_workspace_id(request, db)
        try:
            await doc_management_service.sync_volume_with_db(
                db=db,
                volume_id=filter_volume_id,
                base_url=base_url,
                auth_token=auth_token,
                workload_identity=workload_identity,
                workspace_id=workspace_id,
            )
        except Exception:
            pass

    return doc_management_service.get_folder_tree(
        db,
        is_active_only=active_only,
        volume_id=filter_volume_id,
    )


@router.get("/document-folders/{folder_id}/path")
def get_document_folder_path(
    folder_id: str,
    db: Session = Depends(get_db),
):
    """Returns the ordered breadcrumb path from root down to the target folder."""
    return doc_management_service.get_folder_path(db, folder_id)


@router.post("/document-folders", status_code=status.HTTP_201_CREATED)
async def create_document_folder(
    payload: DocFolderCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """Creates a new document folder (root or nested subfolder) directly in CompassX volume storage."""
    base_url = resolve_browser_catalog_url(request, db)
    auth_token = resolve_auth_token(request, db)
    workload_identity = resolve_workload_identity(request, db)
    workspace_id = resolve_workspace_id(request, db)
    try:
        folder = await doc_management_service.create_folder(
            db=db,
            folder_name=payload.folder_name,
            parent_id=payload.parent_id,
            description=payload.description,
            volume_id=payload.volume_id,
            default_sub_path=payload.default_sub_path or "",
            allowed_extensions=payload.allowed_extensions,
            max_file_size_mb=payload.max_file_size_mb,
            default_print_thru_vendor=payload.default_print_thru_vendor,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
        )
        return folder.to_dict()
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.post("/document-folders/sync")
@router.post("/documents/sync")
async def sync_volume_documents(
    request: Request,
    volume_id: Optional[str] = Query(None, description="Volume ID to sync (defaults to active volume)"),
    db: Session = Depends(get_db),
):
    """Explicitly triggers full bidirectional sync between CompassX Volume and Document module."""
    filter_volume_id = resolve_effective_volume_id(db, volume_id)
    if not filter_volume_id:
        raise HTTPException(status_code=400, detail="No active CompassX Volume configured to sync.")

    base_url = resolve_browser_catalog_url(request, db)
    auth_token = resolve_auth_token(request, db)
    workload_identity = resolve_workload_identity(request, db)
    workspace_id = resolve_workspace_id(request, db)

    res = await doc_management_service.sync_volume_with_db(
        db=db,
        volume_id=filter_volume_id,
        base_url=base_url,
        auth_token=auth_token,
        workload_identity=workload_identity,
        workspace_id=workspace_id,
        force=True,
    )
    return res


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
            folder_name=payload.folder_name,
            parent_id=payload.parent_id,
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


@router.put("/document-folders/{folder_id}/move")
def move_document_folder(
    folder_id: str,
    payload: DocFolderMoveRequest,
    db: Session = Depends(get_db),
):
    """Moves a folder to another parent directory in the hierarchy."""
    try:
        folder = doc_management_service.move_folder(
            db=db,
            folder_id=folder_id,
            target_parent_id=payload.target_parent_id,
        )
        return folder.to_dict()
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.delete("/document-folders/{folder_id}")
async def delete_document_folder(
    folder_id: str,
    request: Request,
    purge_storage: bool = Query(True, description="Also delete underlying directory marker from CompassX Volume"),
    db: Session = Depends(get_db),
):
    """Deletes a document folder category and its nested descendants."""
    base_url = resolve_browser_catalog_url(request, db)
    auth_token = resolve_auth_token(request, db)
    workload_identity = resolve_workload_identity(request, db)
    workspace_id = resolve_workspace_id(request, db)
    try:
        await doc_management_service.delete_folder(
            db=db,
            folder_id=folder_id,
            purge_storage=purge_storage,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
        )
        return {"id": folder_id, "deleted": True}
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))


# -----------------------------------------------------------------------------
# 2. Master Documents Endpoints (Upload / URL / Query / Download)
# -----------------------------------------------------------------------------

@router.get("/documents")
async def list_documents(
    request: Request,
    folder_id: Optional[str] = Query(None, description="Filter by folder ID"),
    search: Optional[str] = Query(None, description="Keyword search in title, code, filename"),
    url_type: Optional[str] = Query(None, description="FILE or URL"),
    tag: Optional[str] = Query(None, description="Filter by tag"),
    status: Optional[str] = Query(None, description="ACTIVE, ARCHIVED, DEPRECATED"),
    volume_id: Optional[str] = Query(None, description="Filter by CompassX volume ID. Pass 'all' to show all volumes"),
    sync: bool = Query(False, description="Sync with volume before returning"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Queries and lists registered documents with filtering and search."""
    filter_volume_id = resolve_effective_volume_id(db, volume_id)

    if sync and filter_volume_id:
        base_url = resolve_browser_catalog_url(request, db)
        auth_token = resolve_auth_token(request, db)
        workload_identity = resolve_workload_identity(request, db)
        workspace_id = resolve_workspace_id(request, db)
        try:
            await doc_management_service.sync_volume_with_db(
                db=db,
                volume_id=filter_volume_id,
                base_url=base_url,
                auth_token=auth_token,
                workload_identity=workload_identity,
                workspace_id=workspace_id,
            )
        except Exception:
            pass

    docs, total = doc_management_service.list_documents(
        db=db,
        folder_id=folder_id,
        search=search,
        url_type=url_type,
        tag=tag,
        status=status,
        volume_id=filter_volume_id,
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
    auth_token = resolve_auth_token(request, db)
    workload_identity = resolve_workload_identity(request, db)
    workspace_id = resolve_workspace_id(request, db)
    effective_vol_id = resolve_effective_volume_id(db, volume_id)
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
            volume_id=effective_vol_id,
            tags=parsed_tags,
            created_by=created_by,
            version=version or "1.0",
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
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
    auth_token = resolve_auth_token(request, db)
    workload_identity = resolve_workload_identity(request, db)
    workspace_id = resolve_workspace_id(request, db)
    try:
        content, content_type, filename = await doc_management_service.download_document(
            db,
            doc_id,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
        )
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
    auth_token = resolve_auth_token(request, db)
    workload_identity = resolve_workload_identity(request, db)
    workspace_id = resolve_workspace_id(request, db)
    try:
        res = await doc_management_service.get_presigned_url(
            db,
            doc_id,
            expiry_seconds=expiry_seconds,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
        )
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
    auth_token = resolve_auth_token(request, db)
    workload_identity = resolve_workload_identity(request, db)
    workspace_id = resolve_workspace_id(request, db)
    try:
        doc = await doc_management_service.rename_document(
            db=db,
            doc_id=doc_id,
            new_file_name=payload.new_name,
            new_title=payload.new_title,
            updated_by=payload.updated_by,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
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


@router.put("/documents/{doc_id}/move")
def move_document(
    doc_id: str,
    payload: DocMoveRequest,
    db: Session = Depends(get_db),
):
    """Moves a document to another folder or root."""
    try:
        doc = doc_management_service.move_document(
            db=db,
            doc_id=doc_id,
            target_folder_id=payload.target_folder_id,
        )
        return doc.to_dict(include_links=True)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    request: Request,
    purge_storage: bool = Query(True, description="Also delete underlying file from CompassX Volume"),
    db: Session = Depends(get_db),
):
    """Deletes document metadata and removes file from CompassX volume storage."""
    base_url = resolve_browser_catalog_url(request, db)
    auth_token = resolve_auth_token(request, db)
    workload_identity = resolve_workload_identity(request, db)
    workspace_id = resolve_workspace_id(request, db)
    try:
        await doc_management_service.delete_document(
            db,
            doc_id,
            purge_storage=purge_storage,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
        )
        return {"id": doc_id, "deleted": True}
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))

