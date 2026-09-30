import hashlib
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc, func

from backend.models.doclink import DocFolder, DocInfo, DocLink, DocAppFolder
from backend.services.compassx_volume_client import compassx_volume_client, CompassXVolumeClient
from backend.config import settings

logger = logging.getLogger("compassx.doc_management")

DEFAULT_FOLDERS = [
    {
        "folder_name": "ATTACHMENTS",
        "description": "General Work and Operational Attachments",
        "default_sub_path": "eam/attachments",
        "allowed_extensions": ["pdf", "png", "jpg", "jpeg", "docx", "xlsx", "txt", "zip"],
        "max_file_size_mb": 50.0,
        "default_print_thru_vendor": False,
    },
    {
        "folder_name": "MANUALS",
        "description": "Equipment Manuals and Standard Operating Procedures (SOPs)",
        "default_sub_path": "eam/manuals",
        "allowed_extensions": ["pdf", "docx", "epub"],
        "max_file_size_mb": 100.0,
        "default_print_thru_vendor": False,
    },
    {
        "folder_name": "DRAWINGS",
        "description": "Engineering CAD Drawings & Schematic Blueprints",
        "default_sub_path": "eam/drawings",
        "allowed_extensions": ["dwg", "dxf", "pdf", "svg", "png"],
        "max_file_size_mb": 100.0,
        "default_print_thru_vendor": True,
    },
    {
        "folder_name": "CERTIFICATES",
        "description": "Compliance, Safety & Calibration Certificates",
        "default_sub_path": "eam/certificates",
        "allowed_extensions": ["pdf", "png", "jpg"],
        "max_file_size_mb": 25.0,
        "default_print_thru_vendor": True,
    },
    {
        "folder_name": "INVOICES",
        "description": "Vendor Invoices, Receipts & Financial Documents",
        "default_sub_path": "eam/invoices",
        "allowed_extensions": ["pdf", "xlsx", "csv", "png", "jpg"],
        "max_file_size_mb": 25.0,
        "default_print_thru_vendor": False,
    },
    {
        "folder_name": "PHOTOS",
        "description": "Site Inspection and Equipment Condition Photos",
        "default_sub_path": "eam/photos",
        "allowed_extensions": ["png", "jpg", "jpeg", "webp", "heic"],
        "max_file_size_mb": 30.0,
        "default_print_thru_vendor": False,
    },
    {
        "folder_name": "SAFETY_PERMITS",
        "description": "Permit-to-Work, Isolation Certificates & Hazard Assessments",
        "default_sub_path": "eam/safety",
        "allowed_extensions": ["pdf", "png", "jpg", "docx"],
        "max_file_size_mb": 50.0,
        "default_print_thru_vendor": True,
    },
]


def generate_doc_code(db: Session, prefix: str = "DOC") -> str:
    """Generates a sequential human-readable document code like DOC-2026-0001"""
    year = datetime.now(timezone.utc).year
    count = db.query(func.count(DocInfo.id)).scalar() or 0
    return f"{prefix}-{year}-{(count + 1):04d}"


class DocManagementService:
    """Enterprise Document Management Service integrated with CompassX Volume Storage.
    Implements Maximo-style Doclinks metadata architecture backed by CompassX Volumes.
    """

    def __init__(self, volume_client: Optional[CompassXVolumeClient] = None):
        self.client = volume_client or compassx_volume_client

    # -------------------------------------------------------------------------
    # 1. Folder / Category Management
    # -------------------------------------------------------------------------

    def seed_default_folders(self, db: Session) -> List[DocFolder]:
        """Seeds default document folder categories if they do not exist."""
        created = []
        for f_def in DEFAULT_FOLDERS:
            existing = db.query(DocFolder).filter(DocFolder.folder_name == f_def["folder_name"]).first()
            if not existing:
                folder = DocFolder(
                    folder_name=f_def["folder_name"],
                    description=f_def["description"],
                    volume_id=None,  # Will resolve to default volume
                    default_sub_path=f_def["default_sub_path"],
                    allowed_extensions=f_def["allowed_extensions"],
                    max_file_size_mb=f_def["max_file_size_mb"],
                    is_active=True,
                    default_print_thru_vendor=f_def["default_print_thru_vendor"],
                )
                db.add(folder)
                created.append(folder)
        if created:
            db.commit()
            for f in created:
                db.refresh(f)
        return created

    def list_folders(self, db: Session, is_active_only: bool = False) -> List[DocFolder]:
        query = db.query(DocFolder)
        if is_active_only:
            query = query.filter(DocFolder.is_active == True)
        return query.order_by(DocFolder.folder_name).all()

    def get_folder(self, db: Session, folder_id_or_name: str) -> Optional[DocFolder]:
        return db.query(DocFolder).filter(
            or_(DocFolder.id == folder_id_or_name, DocFolder.folder_name == folder_id_or_name)
        ).first()

    def create_folder(
        self,
        db: Session,
        folder_name: str,
        description: Optional[str] = None,
        volume_id: Optional[str] = None,
        default_sub_path: str = "",
        allowed_extensions: Optional[List[str]] = None,
        max_file_size_mb: float = 50.0,
        default_print_thru_vendor: bool = False,
    ) -> DocFolder:
        clean_name = folder_name.strip().upper()
        existing = db.query(DocFolder).filter(DocFolder.folder_name == clean_name).first()
        if existing:
            raise ValueError(f"Document folder with name '{clean_name}' already exists.")

        folder = DocFolder(
            folder_name=clean_name,
            description=description,
            volume_id=volume_id,
            default_sub_path=default_sub_path.strip("/"),
            allowed_extensions=[ext.lower().strip(".") for ext in allowed_extensions] if allowed_extensions else None,
            max_file_size_mb=max_file_size_mb,
            is_active=True,
            default_print_thru_vendor=default_print_thru_vendor,
        )
        db.add(folder)
        db.commit()
        db.refresh(folder)
        return folder

    def update_folder(
        self,
        db: Session,
        folder_id: str,
        description: Optional[str] = None,
        volume_id: Optional[str] = None,
        default_sub_path: Optional[str] = None,
        allowed_extensions: Optional[List[str]] = None,
        max_file_size_mb: Optional[float] = None,
        is_active: Optional[bool] = None,
        default_print_thru_vendor: Optional[bool] = None,
    ) -> DocFolder:
        folder = db.query(DocFolder).filter(DocFolder.id == folder_id).first()
        if not folder:
            raise ValueError(f"Document folder with ID '{folder_id}' not found.")

        if description is not None:
            folder.description = description
        if volume_id is not None:
            folder.volume_id = volume_id
        if default_sub_path is not None:
            folder.default_sub_path = default_sub_path.strip("/")
        if allowed_extensions is not None:
            folder.allowed_extensions = [ext.lower().strip(".") for ext in allowed_extensions]
        if max_file_size_mb is not None:
            folder.max_file_size_mb = max_file_size_mb
        if is_active is not None:
            folder.is_active = is_active
        if default_print_thru_vendor is not None:
            folder.default_print_thru_vendor = default_print_thru_vendor

        db.commit()
        db.refresh(folder)
        return folder

    def delete_folder(self, db: Session, folder_id: str) -> bool:
        folder = db.query(DocFolder).filter(DocFolder.id == folder_id).first()
        if not folder:
            raise ValueError(f"Document folder with ID '{folder_id}' not found.")
        db.delete(folder)
        db.commit()
        return True

    # -------------------------------------------------------------------------
    # 2. Document Upload & Registration
    # -------------------------------------------------------------------------

    async def upload_document(
        self,
        db: Session,
        file_content: bytes,
        file_name: str,
        content_type: str = "application/octet-stream",
        title: Optional[str] = None,
        description: Optional[str] = None,
        folder_id: Optional[str] = None,
        sub_path: Optional[str] = None,
        volume_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        custom_metadata: Optional[Dict[str, Any]] = None,
        created_by: Optional[str] = None,
        version: str = "1.0",
        base_url: Optional[str] = None,
    ) -> DocInfo:
        """Uploads binary file to CompassX volume storage and persists DocInfo record."""
        # 1. Resolve folder and constraints
        target_folder = None
        if folder_id:
            target_folder = self.get_folder(db, folder_id)
            if not target_folder:
                raise ValueError(f"Target document folder '{folder_id}' not found.")

        # 2. File size validation
        size_bytes = len(file_content)
        size_mb = size_bytes / (1024 * 1024)
        max_allowed_mb = target_folder.max_file_size_mb if target_folder else 50.0
        if size_mb > max_allowed_mb:
            raise ValueError(
                f"File size ({size_mb:.2f} MB) exceeds maximum allowed limit ({max_allowed_mb:.2f} MB)."
            )

        # 3. File extension validation
        ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
        if target_folder and target_folder.allowed_extensions:
            if ext not in target_folder.allowed_extensions:
                raise ValueError(
                    f"File extension '.{ext}' is not allowed in folder '{target_folder.folder_name}'. "
                    f"Allowed: {', '.join(target_folder.allowed_extensions)}"
                )

        # 4. SHA-256 Checksum computation
        sha256_hash = hashlib.sha256(file_content).hexdigest()

        # 5. Resolve target volume & sub-path
        system_volume_id = None
        try:
            from backend.models.system_setting import SystemSetting
            setting = db.query(SystemSetting).filter(SystemSetting.key == "storage_config").first()
            if setting and isinstance(setting.value, dict) and setting.value.get("volume_id"):
                system_volume_id = setting.value.get("volume_id")
        except Exception:
            pass

        resolved_volume_id = volume_id or (target_folder.volume_id if target_folder else None) or system_volume_id or "3fa85f64-5717-4562-b3fc-2c963f66afa6"
        resolved_sub_path = sub_path or (target_folder.default_sub_path if target_folder else "eam/documents")

        # 6. Upload file directly via CompassX Volume Client
        upload_res = await self.client.upload_file(
            volume_id=resolved_volume_id,
            file_content=file_content,
            file_name=file_name,
            content_type=content_type,
            sub_path=resolved_sub_path,
            base_url=base_url,
        )

        storage_file_path = upload_res.get("file_path", f"{resolved_sub_path}/{file_name}")

        # 7. Generate unique document code and persist DocInfo
        doc_code = generate_doc_code(db)
        doc_title = title.strip() if title else file_name

        doc_info = DocInfo(
            document_code=doc_code,
            title=doc_title,
            description=description,
            folder_id=target_folder.id if target_folder else None,
            url_name=storage_file_path,
            url_type="FILE",
            file_name=file_name,
            file_size_bytes=size_bytes,
            content_type=content_type,
            volume_id=resolved_volume_id,
            sub_path=resolved_sub_path,
            version=version,
            sha256_hash=sha256_hash,
            status="ACTIVE",
            tags=tags or [],
            custom_metadata=custom_metadata or {},
            created_by=created_by or "system",
            updated_by=created_by or "system",
        )
        db.add(doc_info)
        db.flush()

        # Create default standalone DocLink
        standalone_link = DocLink(
            doc_info_id=doc_info.id,
            owner_table="STANDALONE",
            owner_id=doc_info.id,
            folder_id=doc_info.folder_id,
            get_latest_version=True,
            print_thru_vendor=target_folder.default_print_thru_vendor if target_folder else False,
            copy_to_target=True,
            created_by=created_by or "system",
        )
        db.add(standalone_link)
        db.commit()
        db.refresh(doc_info)
        return doc_info

    def create_url_document(
        self,
        db: Session,
        title: str,
        url: str,
        description: Optional[str] = None,
        folder_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        custom_metadata: Optional[Dict[str, Any]] = None,
        created_by: Optional[str] = None,
    ) -> DocInfo:
        """Registers an external web document or cloud URL reference."""
        target_folder = None
        if folder_id:
            target_folder = self.get_folder(db, folder_id)

        doc_code = generate_doc_code(db)
        file_name = url.rsplit("/", 1)[-1] or title

        doc_info = DocInfo(
            document_code=doc_code,
            title=title.strip(),
            description=description,
            folder_id=target_folder.id if target_folder else None,
            url_name=url.strip(),
            url_type="URL",
            file_name=file_name,
            file_size_bytes=0,
            content_type="text/uri-list",
            volume_id=None,
            sub_path=None,
            version="1.0",
            sha256_hash=None,
            status="ACTIVE",
            tags=tags or [],
            custom_metadata=custom_metadata or {},
            created_by=created_by or "system",
            updated_by=created_by or "system",
        )
        db.add(doc_info)
        db.flush()

        standalone_link = DocLink(
            doc_info_id=doc_info.id,
            owner_table="STANDALONE",
            owner_id=doc_info.id,
            folder_id=doc_info.folder_id,
            get_latest_version=True,
            print_thru_vendor=False,
            copy_to_target=True,
            created_by=created_by or "system",
        )
        db.add(standalone_link)
        db.commit()
        db.refresh(doc_info)
        return doc_info

    # -------------------------------------------------------------------------
    # 3. Document Querying & Search
    # -------------------------------------------------------------------------

    def list_documents(
        self,
        db: Session,
        folder_id: Optional[str] = None,
        search: Optional[str] = None,
        url_type: Optional[str] = None,
        tag: Optional[str] = None,
        status: Optional[str] = None,
        volume_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Tuple[List[DocInfo], int]:
        """Lists and filters documents with total count pagination."""
        query = db.query(DocInfo)

        if folder_id:
            query = query.filter(DocInfo.folder_id == folder_id)

        if url_type:
            query = query.filter(DocInfo.url_type == url_type.upper())

        if status:
            query = query.filter(DocInfo.status == status.upper())

        if volume_id:
            query = query.filter(DocInfo.volume_id == volume_id)

        if search:
            search_pattern = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    DocInfo.title.ilike(search_pattern),
                    DocInfo.document_code.ilike(search_pattern),
                    DocInfo.file_name.ilike(search_pattern),
                    DocInfo.description.ilike(search_pattern),
                )
            )

        total = query.count()
        docs = query.order_by(desc(DocInfo.created_at)).offset(offset).limit(limit).all()
        return docs, total

    def get_document(self, db: Session, doc_id_or_code: str) -> Optional[DocInfo]:
        return db.query(DocInfo).filter(
            or_(DocInfo.id == doc_id_or_code, DocInfo.document_code == doc_id_or_code)
        ).first()

    # -------------------------------------------------------------------------
    # 4. Download & Presigned SAS URL Generation
    # -------------------------------------------------------------------------

    async def download_document(
        self,
        db: Session,
        doc_id: str,
        base_url: Optional[str] = None,
    ) -> Tuple[bytes, str, str]:
        """Streams the file content from CompassX volume storage."""
        doc = self.get_document(db, doc_id)
        if not doc:
            raise ValueError(f"Document with ID '{doc_id}' not found.")
        if doc.url_type != "FILE":
            raise ValueError(f"Document is of type '{doc.url_type}' and cannot be streamed directly.")

        volume_id = doc.volume_id or "3fa85f64-5717-4562-b3fc-2c963f66afa6"
        content, content_type = await self.client.download_file(
            volume_id=volume_id,
            file_path=doc.url_name,
            base_url=base_url,
        )
        return content, doc.content_type or content_type, doc.file_name

    async def get_presigned_url(
        self,
        db: Session,
        doc_id: str,
        expiry_seconds: int = 3600,
        base_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generates temporary scoped SAS/S3 presigned download link from CompassX."""
        doc = self.get_document(db, doc_id)
        if not doc:
            raise ValueError(f"Document with ID '{doc_id}' not found.")

        if doc.url_type == "URL":
            return {"url": doc.url_name, "expires_in_seconds": expiry_seconds, "is_direct_url": True}

        volume_id = doc.volume_id or "3fa85f64-5717-4562-b3fc-2c963f66afa6"
        return await self.client.get_presigned_url(
            volume_id=volume_id,
            file_path=doc.url_name,
            expiry_seconds=expiry_seconds,
            base_url=base_url,
        )

    # -------------------------------------------------------------------------
    # 5. Maintenance (Rename / Metadata Update / Delete)
    # -------------------------------------------------------------------------

    async def rename_document(
        self,
        db: Session,
        doc_id: str,
        new_file_name: str,
        new_title: Optional[str] = None,
        updated_by: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> DocInfo:
        """Renames file in CompassX volume storage and updates DocInfo database record."""
        doc = self.get_document(db, doc_id)
        if not doc:
            raise ValueError(f"Document with ID '{doc_id}' not found.")

        clean_new_name = new_file_name.strip()
        if doc.url_type == "FILE" and doc.volume_id:
            rename_res = await self.client.rename_file(
                volume_id=doc.volume_id,
                old_path=doc.url_name,
                new_name=clean_new_name,
                base_url=base_url,
            )
            doc.url_name = rename_res.get("new_path", doc.url_name)

        doc.file_name = clean_new_name
        if new_title:
            doc.title = new_title.strip()
        doc.updated_by = updated_by or "system"
        doc.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(doc)
        return doc

    def update_document_metadata(
        self,
        db: Session,
        doc_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        folder_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        custom_metadata: Optional[Dict[str, Any]] = None,
        status: Optional[str] = None,
        updated_by: Optional[str] = None,
    ) -> DocInfo:
        doc = self.get_document(db, doc_id)
        if not doc:
            raise ValueError(f"Document with ID '{doc_id}' not found.")

        if title is not None:
            doc.title = title.strip()
        if description is not None:
            doc.description = description
        if folder_id is not None:
            folder = self.get_folder(db, folder_id) if folder_id else None
            doc.folder_id = folder.id if folder else None
        if tags is not None:
            doc.tags = tags
        if custom_metadata is not None:
            doc.custom_metadata = custom_metadata
        if status is not None:
            doc.status = status.upper()

        doc.updated_by = updated_by or "system"
        doc.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(doc)
        return doc

    async def delete_document(
        self,
        db: Session,
        doc_id: str,
        purge_storage: bool = True,
        base_url: Optional[str] = None,
    ) -> bool:
        """Deletes file from CompassX volume storage backend and removes database record."""
        doc = self.get_document(db, doc_id)
        if not doc:
            raise ValueError(f"Document with ID '{doc_id}' not found.")

        if purge_storage and doc.url_type == "FILE" and doc.volume_id:
            try:
                await self.client.delete_file(
                    volume_id=doc.volume_id,
                    file_path=doc.url_name,
                    base_url=base_url,
                )
            except Exception as exc:
                logger.warning(f"Could not delete physical file '{doc.url_name}' from CompassX Volume: {exc}")

        db.delete(doc)
        db.commit()
        return True


# Global Service Instance
doc_management_service = DocManagementService()
