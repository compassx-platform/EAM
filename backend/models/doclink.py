import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Float, Integer, Text, JSON
from sqlalchemy.orm import relationship
from backend.database import Base
from backend.models.base import utc_now, generate_uuid


class DocFolder(Base):
    """Document Folder / Category Definition (corresponds to Maximo DOCTYPES).

    Categorizes documents (e.g. ATTACHMENTS, MANUALS, DRAWINGS, CERTIFICATES, INVOICES, PHOTOS)
    and maps default storage directories and policy constraints.
    """
    __tablename__ = "doc_folder"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    folder_name = Column(String(50), unique=True, nullable=False, index=True)  # e.g. ATTACHMENTS, MANUALS, DRAWINGS
    description = Column(String(255), nullable=True)
    volume_id = Column(String(36), nullable=True, index=True)  # Target CompassX Volume UUID
    default_sub_path = Column(String(255), default="", nullable=False)  # e.g. eam/attachments
    allowed_extensions = Column(JSON, nullable=True)  # e.g. ["pdf", "png", "jpg", "dwg", "docx"]
    max_file_size_mb = Column(Float, default=50.0, nullable=False)  # Max upload size in megabytes
    is_active = Column(Boolean, default=True, nullable=False)
    default_print_thru_vendor = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    documents = relationship("DocInfo", back_populates="folder", cascade="all, delete-orphan", lazy="selectin")
    app_mappings = relationship("DocAppFolder", back_populates="folder", cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self, include_counts: bool = True):
        return {
            "id": self.id,
            "folder_name": self.folder_name,
            "description": self.description,
            "volume_id": self.volume_id,
            "default_sub_path": self.default_sub_path,
            "allowed_extensions": self.allowed_extensions or [],
            "max_file_size_mb": self.max_file_size_mb,
            "is_active": self.is_active,
            "default_print_thru_vendor": self.default_print_thru_vendor,
            "document_count": len(self.documents) if self.documents else 0 if include_counts else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class DocInfo(Base):
    """Document Master Record (corresponds to Maximo DOCINFO).

    Stores metadata, checksum, versioning, and storage locator path for uploaded files,
    blob objects, or registered external web URLs.
    """
    __tablename__ = "doc_info"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_code = Column(String(100), unique=True, nullable=False, index=True)  # e.g. DOC-2026-0001
    title = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    folder_id = Column(String(36), ForeignKey("doc_folder.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Storage and URL pointers
    url_name = Column(String(1024), nullable=False)  # Storage path inside CompassX volume or external URL
    url_type = Column(String(20), default="FILE", nullable=False)  # FILE (Volume Blob) | URL (External Web)
    file_name = Column(String(255), nullable=False, index=True)
    file_size_bytes = Column(Integer, default=0, nullable=False)
    content_type = Column(String(100), default="application/octet-stream", nullable=False)
    
    # CompassX Volume Reference
    volume_id = Column(String(36), nullable=True, index=True)
    sub_path = Column(String(255), nullable=True)
    
    # Versioning & Deduplication
    version = Column(String(30), default="1.0", nullable=False)
    sha256_hash = Column(String(64), nullable=True, index=True)
    status = Column(String(30), default="ACTIVE", nullable=False)  # ACTIVE | ARCHIVED | DEPRECATED
    
    # Metadata & Tags
    tags = Column(JSON, default=list, nullable=False)
    custom_metadata = Column(JSON, default=dict, nullable=False)
    
    # Audit Trail
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_by = Column(String(100), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    folder = relationship("DocFolder", back_populates="documents", lazy="joined")
    links = relationship("DocLink", back_populates="document", cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self, include_links: bool = False):
        return {
            "id": self.id,
            "document_code": self.document_code,
            "title": self.title,
            "description": self.description,
            "folder_id": self.folder_id,
            "folder_name": self.folder.folder_name if self.folder else None,
            "url_name": self.url_name,
            "url_type": self.url_type,
            "file_name": self.file_name,
            "file_size_bytes": self.file_size_bytes,
            "content_type": self.content_type,
            "volume_id": self.volume_id,
            "sub_path": self.sub_path,
            "version": self.version,
            "sha256_hash": self.sha256_hash,
            "status": self.status,
            "tags": self.tags or [],
            "custom_metadata": self.custom_metadata or {},
            "links_count": len(self.links) if self.links else 0,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_by": self.updated_by,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "links": [link.to_dict() for link in self.links] if include_links and self.links else []
        }


class DocLink(Base):
    """Polymorphic Document Link (corresponds to Maximo DOCLINKS).

    Junction record linking a DocInfo master document to any target entity row (OWNERTABLE, OWNERID).
    Ready for standalone use or entity attachment.
    """
    __tablename__ = "doc_link"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    doc_info_id = Column(String(36), ForeignKey("doc_info.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_table = Column(String(50), nullable=False, default="STANDALONE", index=True)  # e.g. WORKORDER, ASSET, LOCATION, PO
    owner_id = Column(String(100), nullable=False, default="STANDALONE", index=True)    # Target Record PK / UUID
    folder_id = Column(String(36), ForeignKey("doc_folder.id", ondelete="SET NULL"), nullable=True)
    get_latest_version = Column(Boolean, default=True, nullable=False)
    print_thru_vendor = Column(Boolean, default=False, nullable=False)
    copy_to_target = Column(Boolean, default=True, nullable=False)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    document = relationship("DocInfo", back_populates="links", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "doc_info_id": self.doc_info_id,
            "owner_table": self.owner_table,
            "owner_id": self.owner_id,
            "folder_id": self.folder_id,
            "get_latest_version": self.get_latest_version,
            "print_thru_vendor": self.print_thru_vendor,
            "copy_to_target": self.copy_to_target,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "document": self.document.to_dict() if self.document else None
        }


class DocAppFolder(Base):
    """Application to Document Folder Mapping (corresponds to Maximo DOCAPPLINK).

    Determines which folders are exposed within specific applications.
    """
    __tablename__ = "doc_app_folder"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    app_name = Column(String(50), nullable=False, index=True)  # e.g. ASSET, WORKORDER, INVENTORY, GENERAL
    folder_id = Column(String(36), ForeignKey("doc_folder.id", ondelete="CASCADE"), nullable=False)
    default_print_thru_vendor = Column(Boolean, default=False, nullable=False)

    folder = relationship("DocFolder", back_populates="app_mappings", lazy="joined")

    def to_dict(self):
        return {
            "id": self.id,
            "app_name": self.app_name,
            "folder_id": self.folder_id,
            "folder_name": self.folder.folder_name if self.folder else None,
            "default_print_thru_vendor": self.default_print_thru_vendor,
        }
