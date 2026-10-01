import os
import time
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
        "allowed_extensions": ["pdf", "png", "jpg", "jpeg", "docx", "doc", "pptx", "ppt", "pps", "ppsx", "xlsx", "xls", "csv", "txt", "zip", "rar", "7z"],
        "max_file_size_mb": 50.0,
        "default_print_thru_vendor": False,
    },
    {
        "folder_name": "MANUALS",
        "description": "Equipment Manuals and Standard Operating Procedures (SOPs)",
        "default_sub_path": "eam/manuals",
        "allowed_extensions": ["pdf", "docx", "doc", "pptx", "ppt", "epub", "txt"],
        "max_file_size_mb": 100.0,
        "default_print_thru_vendor": False,
    },
    {
        "folder_name": "DRAWINGS",
        "description": "Engineering CAD Drawings & Schematic Blueprints",
        "default_sub_path": "eam/drawings",
        "allowed_extensions": ["dwg", "dxf", "pdf", "svg", "png", "jpg", "jpeg", "tif", "tiff"],
        "max_file_size_mb": 100.0,
        "default_print_thru_vendor": True,
    },
    {
        "folder_name": "CERTIFICATES",
        "description": "Compliance, Safety & Calibration Certificates",
        "default_sub_path": "eam/certificates",
        "allowed_extensions": ["pdf", "png", "jpg", "jpeg", "docx", "doc"],
        "max_file_size_mb": 25.0,
        "default_print_thru_vendor": True,
    },
    {
        "folder_name": "INVOICES",
        "description": "Vendor Invoices, Receipts & Financial Documents",
        "default_sub_path": "eam/invoices",
        "allowed_extensions": ["pdf", "xlsx", "xls", "csv", "png", "jpg", "jpeg", "docx", "doc"],
        "max_file_size_mb": 25.0,
        "default_print_thru_vendor": False,
    },
    {
        "folder_name": "PHOTOS",
        "description": "Site Inspection and Equipment Condition Photos",
        "default_sub_path": "eam/photos",
        "allowed_extensions": ["png", "jpg", "jpeg", "webp", "heic", "gif", "bmp", "svg"],
        "max_file_size_mb": 30.0,
        "default_print_thru_vendor": False,
    },
    {
        "folder_name": "SAFETY_PERMITS",
        "description": "Permit-to-Work, Isolation Certificates & Hazard Assessments",
        "default_sub_path": "eam/safety",
        "allowed_extensions": ["pdf", "png", "jpg", "jpeg", "docx", "doc", "pptx", "ppt"],
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

    @property
    def _storage_root(self) -> str:
        root = os.getcwd()
        if os.path.basename(root) == "backend":
            return os.path.join(root, "data", "storage")
        return os.path.join(root, "backend", "data", "storage")

    def _save_local_file(self, volume_id: str, sub_path: str, file_name: str, content: bytes) -> str:
        base_dir = os.path.join(self._storage_root, volume_id, sub_path.strip("/"))
        os.makedirs(base_dir, exist_ok=True)
        file_path = os.path.join(base_dir, file_name)
        with open(file_path, "wb") as f:
            f.write(content)
        return file_path

    def _get_local_file(self, volume_id: str, sub_path: str, file_name: str) -> Optional[bytes]:
        file_path = os.path.join(self._storage_root, volume_id, sub_path.strip("/"), file_name)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            with open(file_path, "rb") as f:
                return f.read()
        return None

    # -------------------------------------------------------------------------
    # 1. Folder / Category Management
    # -------------------------------------------------------------------------

    def seed_default_folders(self, db: Session) -> List[DocFolder]:
        """Seeds default document folder categories if they do not exist, and ensures current whitelists are present."""
        created = []
        updated = False
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
            else:
                # Merge missing standard extensions (e.g. ppt, pptx) into existing database folders
                if existing.allowed_extensions and isinstance(existing.allowed_extensions, list):
                    current_set = set(ext.lower().strip(".") for ext in existing.allowed_extensions)
                    to_add = [ext for ext in f_def["allowed_extensions"] if ext.lower().strip(".") not in current_set]
                    if to_add:
                        existing.allowed_extensions = existing.allowed_extensions + to_add
                        updated = True
        if created or updated:
            db.commit()
            for f in created:
                db.refresh(f)
        return created

    def list_folders(
        self,
        db: Session,
        is_active_only: bool = False,
        parent_id: Optional[str] = None,
        volume_id: Optional[str] = None,
    ) -> List[DocFolder]:
        query = db.query(DocFolder)
        if is_active_only:
            query = query.filter(DocFolder.is_active == True)
        if volume_id:
            if volume_id == "__unconfigured__":
                query = query.filter(or_(DocFolder.volume_id.is_(None), DocFolder.volume_id == "__unconfigured__"))
            elif volume_id.lower() != "all":
                query = query.filter(DocFolder.volume_id == volume_id)
        if parent_id is not None:
            if parent_id == "root":
                query = query.filter(DocFolder.parent_id.is_(None))
            elif parent_id != "all":
                query = query.filter(DocFolder.parent_id == parent_id)
        return query.order_by(DocFolder.folder_name).all()

    def get_folder(self, db: Session, folder_id_or_name: str) -> Optional[DocFolder]:
        return db.query(DocFolder).filter(
            or_(DocFolder.id == folder_id_or_name, DocFolder.folder_name == folder_id_or_name)
        ).first()

    def get_folder_path(self, db: Session, folder_id: str) -> List[Dict[str, str]]:
        """Returns ordered path list from root to target folder."""
        path = []
        curr_id: Optional[str] = folder_id
        visited = set()
        while curr_id and curr_id not in visited:
            visited.add(curr_id)
            folder = db.query(DocFolder).filter(DocFolder.id == curr_id).first()
            if not folder:
                break
            path.append({"id": folder.id, "folder_name": folder.folder_name})
            curr_id = folder.parent_id
        path.reverse()
        return path

    def get_folder_tree(
        self,
        db: Session,
        is_active_only: bool = False,
        volume_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Returns recursive hierarchical folder tree."""
        all_folders = self.list_folders(db, is_active_only=is_active_only, volume_id=volume_id)
        folder_dict = {f.id: {**f.to_dict(include_counts=True), "subfolders": []} for f in all_folders}
        tree = []

        for f in all_folders:
            node = folder_dict[f.id]
            if f.parent_id and f.parent_id in folder_dict:
                folder_dict[f.parent_id]["subfolders"].append(node)
            else:
                tree.append(node)
        return tree

    async def create_folder(
        self,
        db: Session,
        folder_name: str,
        parent_id: Optional[str] = None,
        description: Optional[str] = None,
        volume_id: Optional[str] = None,
        default_sub_path: str = "",
        allowed_extensions: Optional[List[str]] = None,
        max_file_size_mb: float = 50.0,
        default_print_thru_vendor: bool = False,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> DocFolder:
        clean_name = folder_name.strip()
        if not clean_name:
            raise ValueError("Folder name is required.")

        parent = None
        target_sub_path = ""
        if parent_id:
            parent = db.query(DocFolder).filter(DocFolder.id == parent_id).first()
            if not parent:
                raise ValueError(f"Parent folder with ID '{parent_id}' does not exist.")
            existing = db.query(DocFolder).filter(
                DocFolder.parent_id == parent_id,
                DocFolder.folder_name == clean_name
            ).first()
            if existing:
                raise ValueError(f"A subfolder named '{clean_name}' already exists in this folder.")
            target_sub_path = (parent.default_sub_path or parent.folder_name).strip("/")
            if not default_sub_path or default_sub_path.strip("/") == target_sub_path:
                default_sub_path = f"{target_sub_path}/{clean_name}"
            elif not default_sub_path.strip("/").endswith(clean_name):
                default_sub_path = f"{default_sub_path.strip('/')}/{clean_name}"
            else:
                default_sub_path = default_sub_path.strip("/")
            if not volume_id and parent.volume_id:
                volume_id = parent.volume_id
        else:
            if not default_sub_path:
                default_sub_path = clean_name
            else:
                default_sub_path = default_sub_path.strip("/")
            target_sub_path = ""
            existing = db.query(DocFolder).filter(
                DocFolder.parent_id.is_(None),
                DocFolder.folder_name == clean_name
            )
            if volume_id:
                existing = existing.filter(DocFolder.volume_id == volume_id)
            if existing.first():
                raise ValueError(f"A root folder named '{clean_name}' already exists.")

        # Resolve volume if not provided
        resolved_volume_id = volume_id
        if not resolved_volume_id:
            try:
                from backend.models.system_setting import SystemSetting
                setting = db.query(SystemSetting).filter(SystemSetting.key == "storage_config").first()
                if setting and isinstance(setting.value, dict) and setting.value.get("volume_id"):
                    resolved_volume_id = setting.value.get("volume_id")
                if not resolved_volume_id:
                    first_folder_vol = db.query(DocFolder.volume_id).filter(
                        DocFolder.volume_id.isnot(None),
                        DocFolder.volume_id != "",
                        DocFolder.volume_id != "__unconfigured__",
                    ).first()
                    if first_folder_vol and first_folder_vol[0]:
                        resolved_volume_id = first_folder_vol[0]
            except Exception:
                pass

        # Create folder in CompassX volume storage if a volume is active
        if resolved_volume_id and resolved_volume_id != "__unconfigured__":
            try:
                dir_res = await self.client.create_directory(
                    volume_id=resolved_volume_id,
                    dir_name=clean_name,
                    sub_path=target_sub_path,
                    base_url=base_url,
                    auth_token=auth_token,
                    workload_identity=workload_identity,
                    workspace_id=workspace_id,
                )
                if isinstance(dir_res, dict):
                    ret_path = dir_res.get("file_path") or dir_res.get("dir_path")
                    if ret_path:
                        default_sub_path = ret_path.strip("/")
            except Exception as exc:
                logger.warning(f"CompassX Volume create_directory notification ({exc}). Continuing with database registration.")

        folder = DocFolder(
            folder_name=clean_name,
            parent_id=parent_id,
            description=description,
            volume_id=resolved_volume_id,
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

    async def sync_volume_with_db(
        self,
        db: Session,
        volume_id: str,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
        force: bool = False,
    ) -> Dict[str, Any]:
        """Synchronizes CompassX Volume directory structure and files with DocFolder and DocInfo database tables."""
        if not volume_id or volume_id == "__unconfigured__":
            return {"synced": False, "reason": "No volume configured"}

        # Throttle sync requests to at most once every 5 seconds unless force=True
        now = time.time()
        last_sync = getattr(self, "_last_volume_sync", {}).get(volume_id, 0.0)
        if not force and (now - last_sync) < 5.0:
            return {"synced": True, "cached": True}

        try:
            items = await self.client.list_volume_files(
                volume_id=volume_id,
                base_url=base_url,
                auth_token=auth_token,
                workload_identity=workload_identity,
                workspace_id=workspace_id,
            )
        except Exception as exc:
            logger.warning(f"Failed to fetch volume contents for sync ({volume_id}): {exc}")
            return {"synced": False, "error": str(exc)}

        if not hasattr(self, "_last_volume_sync"):
            self._last_volume_sync = {}
        self._last_volume_sync[volume_id] = now

        if not isinstance(items, list):
            items = []

        # Remove dummy local folders/docs that have volume_id is None or __unconfigured__
        db.query(DocFolder).filter(
            or_(DocFolder.volume_id.is_(None), DocFolder.volume_id == "__unconfigured__")
        ).delete(synchronize_session=False)
        db.query(DocInfo).filter(
            or_(DocInfo.volume_id.is_(None), DocInfo.volume_id == "__unconfigured__")
        ).delete(synchronize_session=False)

        valid_folder_ids = set()
        valid_doc_ids = set()

        # Step 1: Collect directories and files from volume response
        dir_paths = set()
        file_entries = []

        for item in items:
            raw_path = (item.get("file_path") or item.get("path") or "").strip()
            raw_name = (item.get("file_name") or item.get("name") or "").strip()
            size = item.get("size_bytes", 0)
            ctype = item.get("content_type", "")

            # Check if this item represents a directory marker
            is_dir = (
                ctype == "application/x-directory"
                or raw_path.endswith("/")
                or raw_name.endswith("/")
                or (size == 0 and not ("." in raw_name) and not raw_name.endswith(".txt") and not raw_name.endswith(".csv"))
            )

            clean_path = raw_path.strip("/")
            clean_name = raw_name.strip("/")

            if not clean_path and not clean_name:
                continue

            if is_dir:
                dir_path = clean_path if clean_path else clean_name
                if dir_path:
                    dir_paths.add(dir_path)
            else:
                # File entry
                file_entries.append((clean_path, clean_name, size, ctype))
                if "/" in clean_path:
                    parent_dir = clean_path.rsplit("/", 1)[0]
                    dir_paths.add(parent_dir)

        # Step 2: Ensure all parent directory paths exist in dir_paths
        expanded_dirs = set()
        for d in dir_paths:
            parts = [p for p in d.split("/") if p]
            for i in range(1, len(parts) + 1):
                expanded_dirs.add("/".join(parts[:i]))

        # Sort directories by depth (shallowest first)
        sorted_dirs = sorted(expanded_dirs, key=lambda p: (p.count("/"), p))

        # Map sub_path -> DocFolder.id for this volume
        path_to_folder_id: Dict[str, str] = {}

        for dir_path in sorted_dirs:
            parts = dir_path.split("/")
            folder_name = parts[-1]
            parent_path = "/".join(parts[:-1]) if len(parts) > 1 else ""
            parent_id = path_to_folder_id.get(parent_path)

            folder = db.query(DocFolder).filter(
                DocFolder.volume_id == volume_id,
                or_(
                    DocFolder.default_sub_path == dir_path,
                    DocFolder.default_sub_path == f"{dir_path}/",
                    DocFolder.default_sub_path == f"/{dir_path}",
                ),
            ).first()

            if not folder:
                folder = db.query(DocFolder).filter(
                    DocFolder.volume_id == volume_id,
                    DocFolder.parent_id == parent_id,
                    DocFolder.folder_name == folder_name,
                ).first()

            if not folder:
                folder = DocFolder(
                    folder_name=folder_name,
                    parent_id=parent_id,
                    volume_id=volume_id,
                    default_sub_path=dir_path,
                    is_active=True,
                    max_file_size_mb=100.0,
                )
                db.add(folder)
                db.flush()
            else:
                folder.parent_id = parent_id
                folder.default_sub_path = dir_path
                folder.is_active = True
                db.flush()

            path_to_folder_id[dir_path] = folder.id
            path_to_folder_id[f"{dir_path}/"] = folder.id
            path_to_folder_id[folder_name] = folder.id
            valid_folder_ids.add(folder.id)

        # Step 3: Sync files
        for fpath, fname, size, ctype in file_entries:
            if "/" in fpath:
                dir_path, actual_fname = fpath.rsplit("/", 1)
            else:
                dir_path, actual_fname = "", fpath
            if not actual_fname:
                actual_fname = fname or "file"

            folder_id = path_to_folder_id.get(dir_path)

            doc = db.query(DocInfo).filter(
                DocInfo.volume_id == volume_id,
                DocInfo.url_name == fpath,
            ).first()

            if not doc:
                doc = db.query(DocInfo).filter(
                    DocInfo.volume_id == volume_id,
                    DocInfo.file_name == actual_fname,
                    DocInfo.sub_path == dir_path,
                ).first()

            if not doc and not dir_path:
                doc = db.query(DocInfo).filter(
                    DocInfo.volume_id == volume_id,
                    DocInfo.file_name == actual_fname,
                    DocInfo.folder_id.is_(None),
                ).first()

            if doc:
                doc.file_size_bytes = size
                if ctype:
                    doc.content_type = ctype
                doc.folder_id = folder_id
                doc.sub_path = dir_path
                doc.url_name = fpath
                doc.status = "ACTIVE"
                valid_doc_ids.add(doc.id)
            else:
                doc_code = generate_doc_code(db)
                doc = DocInfo(
                    document_code=doc_code,
                    title=actual_fname,
                    url_name=fpath,
                    url_type="FILE",
                    file_name=actual_fname,
                    file_size_bytes=size,
                    content_type=ctype or "application/octet-stream",
                    volume_id=volume_id,
                    sub_path=dir_path,
                    folder_id=folder_id,
                    status="ACTIVE",
                    tags=[],
                    custom_metadata={},
                    created_by="system",
                    updated_by="system",
                )
                db.add(doc)
                db.flush()
                valid_doc_ids.add(doc.id)

        # Step 4: Clean up stale records in this volume that are no longer in volume
        now_utc = datetime.now(timezone.utc)
        stale_docs = db.query(DocInfo).filter(
            DocInfo.volume_id == volume_id,
            ~DocInfo.id.in_(valid_doc_ids) if valid_doc_ids else True,
        ).all()
        for s_doc in stale_docs:
            is_recent = False
            if s_doc.created_at:
                try:
                    c_at = s_doc.created_at
                    if c_at.tzinfo is None:
                        c_at = c_at.replace(tzinfo=timezone.utc)
                    if (now_utc - c_at).total_seconds() < 30:
                        is_recent = True
                except Exception:
                    pass
            if not is_recent:
                db.delete(s_doc)

        if valid_folder_ids:
            db.query(DocFolder).filter(
                DocFolder.volume_id == volume_id,
                ~DocFolder.id.in_(valid_folder_ids),
            ).delete(synchronize_session=False)
        elif not sorted_dirs:
            # All folders were deleted in volume
            db.query(DocFolder).filter(
                DocFolder.volume_id == volume_id,
            ).delete(synchronize_session=False)

        db.commit()
        return {
            "synced": True,
            "volume_id": volume_id,
            "folders_synced": len(valid_folder_ids),
            "files_synced": len(valid_doc_ids),
        }

    def update_folder(
        self,
        db: Session,
        folder_id: str,
        folder_name: Optional[str] = None,
        parent_id: Optional[str] = None,
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

        if folder_name is not None:
            clean_name = folder_name.strip()
            if clean_name:
                folder.folder_name = clean_name
        if parent_id is not None:
            if parent_id == folder_id:
                raise ValueError("Cannot move folder into itself.")
            folder.parent_id = None if parent_id == "root" or not parent_id else parent_id
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

    def move_folder(self, db: Session, folder_id: str, target_parent_id: Optional[str] = None) -> DocFolder:
        folder = db.query(DocFolder).filter(DocFolder.id == folder_id).first()
        if not folder:
            raise ValueError(f"Folder with ID '{folder_id}' not found.")
        if target_parent_id:
            if target_parent_id == folder_id:
                raise ValueError("Cannot move a folder into itself.")
            # Cycle detection
            ancestors = self.get_folder_path(db, target_parent_id)
            if any(a["id"] == folder_id for a in ancestors):
                raise ValueError("Cannot move a folder into one of its subfolders.")
            target_parent = db.query(DocFolder).filter(DocFolder.id == target_parent_id).first()
            if not target_parent:
                raise ValueError(f"Target parent folder with ID '{target_parent_id}' not found.")
            folder.parent_id = target_parent_id
        else:
            folder.parent_id = None
        db.commit()
        db.refresh(folder)
        return folder

    def move_document(self, db: Session, doc_id: str, target_folder_id: Optional[str] = None) -> DocInfo:
        doc = db.query(DocInfo).filter(DocInfo.id == doc_id).first()
        if not doc:
            raise ValueError(f"Document with ID '{doc_id}' not found.")
        if target_folder_id:
            target_folder = db.query(DocFolder).filter(DocFolder.id == target_folder_id).first()
            if not target_folder:
                raise ValueError(f"Target folder with ID '{target_folder_id}' not found.")
            doc.folder_id = target_folder_id
        else:
            doc.folder_id = None
        db.commit()
        db.refresh(doc)
        return doc

    async def delete_folder(
        self,
        db: Session,
        folder_id: str,
        purge_storage: bool = True,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> bool:
        folder = db.query(DocFolder).filter(DocFolder.id == folder_id).first()
        if not folder:
            raise ValueError(f"Document folder with ID '{folder_id}' not found.")

        if purge_storage and folder.volume_id and folder.volume_id != "__unconfigured__" and folder.default_sub_path:
            try:
                await self.client.delete_file(
                    volume_id=folder.volume_id,
                    file_path=f"{folder.default_sub_path}/",
                    base_url=base_url,
                    auth_token=auth_token,
                    workload_identity=workload_identity,
                    workspace_id=workspace_id,
                )
            except Exception as exc:
                logger.warning(f"CompassX Volume folder delete notification ({exc}). Continuing with DB removal.")

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
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
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
            if not system_volume_id:
                first_folder_vol = db.query(DocFolder.volume_id).filter(
                    DocFolder.volume_id.isnot(None),
                    DocFolder.volume_id != "",
                    DocFolder.volume_id != "__unconfigured__",
                ).first()
                if first_folder_vol and first_folder_vol[0]:
                    system_volume_id = first_folder_vol[0]
                else:
                    first_doc_vol = db.query(DocInfo.volume_id).filter(
                        DocInfo.volume_id.isnot(None),
                        DocInfo.volume_id != "",
                        DocInfo.volume_id != "__unconfigured__",
                    ).first()
                    if first_doc_vol and first_doc_vol[0]:
                        system_volume_id = first_doc_vol[0]
        except Exception:
            pass

        resolved_volume_id = volume_id or (target_folder.volume_id if target_folder else None) or system_volume_id
        if sub_path and sub_path.strip():
            resolved_sub_path = sub_path.strip().strip("/")
        elif target_folder:
            resolved_sub_path = (target_folder.default_sub_path or target_folder.folder_name or "").strip().strip("/")
            if not resolved_sub_path:
                path_trail = self.get_folder_path(db, target_folder.id)
                resolved_sub_path = "/".join(p["folder_name"] for p in path_trail).strip("/")
        else:
            resolved_sub_path = ""

        # 6. Upload file directly via CompassX Volume Client with local fallback
        storage_file_path = f"{resolved_sub_path}/{file_name}" if resolved_sub_path else file_name
        if resolved_volume_id:
            try:
                upload_res = await self.client.upload_file(
                    volume_id=resolved_volume_id,
                    file_content=file_content,
                    file_name=file_name,
                    content_type=content_type,
                    sub_path=resolved_sub_path,
                    base_url=base_url,
                    auth_token=auth_token,
                    workload_identity=workload_identity,
                    workspace_id=workspace_id,
                )
                if isinstance(upload_res, dict):
                    ret_fp = upload_res.get("file_path") or ""
                    if ret_fp:
                        if resolved_sub_path and not ret_fp.startswith(f"{resolved_sub_path}/") and "/" not in ret_fp:
                            storage_file_path = f"{resolved_sub_path}/{ret_fp}"
                        else:
                            storage_file_path = ret_fp
                    else:
                        storage_file_path = f"{resolved_sub_path}/{file_name}" if resolved_sub_path else file_name
            except Exception as exc:
                logger.warning(
                    f"CompassX Volume upload notification ({exc}). Persisting file in local storage buffer."
                )

            # Always store in local file storage buffer for instant reliable retrieval
            try:
                self._save_local_file(resolved_volume_id, resolved_sub_path, file_name, file_content)
            except Exception:
                pass
        else:
            try:
                self._save_local_file("unconfigured", resolved_sub_path, file_name, file_content)
            except Exception:
                pass

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
            if folder_id == "root":
                query = query.filter(DocInfo.folder_id.is_(None))
            elif folder_id != "all":
                query = query.filter(DocInfo.folder_id == folder_id)

        if url_type:
            query = query.filter(DocInfo.url_type == url_type.upper())

        if status:
            query = query.filter(DocInfo.status == status.upper())

        if volume_id:
            if volume_id == "__unconfigured__":
                query = query.filter(or_(DocInfo.volume_id.is_(None), DocInfo.volume_id == ""))
            else:
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
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> Tuple[bytes, str, str]:
        """Streams the file content from CompassX volume storage."""
        doc = self.get_document(db, doc_id)
        if not doc:
            raise ValueError(f"Document with ID '{doc_id}' not found.")
        if doc.url_type != "FILE":
            raise ValueError(f"Document is of type '{doc.url_type}' and cannot be streamed directly.")

        volume_id = doc.volume_id or "unconfigured"

        # 1. Check local storage buffer first
        local_content = self._get_local_file(volume_id, doc.sub_path or "", doc.file_name)
        if local_content is not None:
            return local_content, doc.content_type or "application/octet-stream", doc.file_name

        # 2. Stream from CompassX volume storage
        if doc.volume_id:
            try:
                content, content_type = await self.client.download_file(
                    volume_id=doc.volume_id,
                    file_path=doc.url_name,
                    base_url=base_url,
                    auth_token=auth_token,
                    workload_identity=workload_identity,
                    workspace_id=workspace_id,
                )
                return content, doc.content_type or content_type, doc.file_name
            except Exception:
                # Fallback by checking filename alone in storage
                raw_fallback = self._get_local_file(volume_id, "", doc.file_name)
                if raw_fallback is not None:
                    return raw_fallback, doc.content_type or "application/octet-stream", doc.file_name
                raise
        else:
            raw_fallback = self._get_local_file(volume_id, "", doc.file_name)
            if raw_fallback is not None:
                return raw_fallback, doc.content_type or "application/octet-stream", doc.file_name
            raise ValueError(f"File content for document '{doc.id}' not found in storage.")

    async def get_presigned_url(
        self,
        db: Session,
        doc_id: str,
        expiry_seconds: int = 3600,
        base_url: Optional[str] = None,
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generates temporary scoped SAS/S3 presigned download link from CompassX."""
        doc = self.get_document(db, doc_id)
        if not doc:
            raise ValueError(f"Document with ID '{doc_id}' not found.")

        if doc.url_type == "URL":
            return {"url": doc.url_name, "expires_in_seconds": expiry_seconds, "is_direct_url": True}

        if not doc.volume_id:
            return {
                "url": f"/api/documents/{doc.id}/download",
                "expires_in_seconds": expiry_seconds,
                "is_direct_url": True,
            }

        return await self.client.get_presigned_url(
            volume_id=doc.volume_id,
            file_path=doc.url_name,
            expiry_seconds=expiry_seconds,
            base_url=base_url,
            auth_token=auth_token,
            workload_identity=workload_identity,
            workspace_id=workspace_id,
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
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
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
                auth_token=auth_token,
                workload_identity=workload_identity,
                workspace_id=workspace_id,
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
        auth_token: Optional[str] = None,
        workload_identity: Optional[str] = None,
        workspace_id: Optional[str] = None,
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
                    auth_token=auth_token,
                    workload_identity=workload_identity,
                    workspace_id=workspace_id,
                )
            except Exception as exc:
                logger.warning(f"Could not delete physical file '{doc.url_name}' from CompassX Volume: {exc}")

        db.delete(doc)
        db.commit()
        return True


# Global Service Instance
doc_management_service = DocManagementService()
