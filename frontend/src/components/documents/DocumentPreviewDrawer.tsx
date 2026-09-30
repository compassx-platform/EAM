import React, { useState } from 'react';
import {
  X,
  Download,
  ExternalLink,
  Copy,
  Check,
  Edit2,
  Trash2,
  Folder,
  Tag,
  ShieldCheck,
  Clock,
  HardDrive,
  FileCode,
  Link as LinkIcon,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import type { DocInfo, DocFolder } from '../../types';
import {
  getDownloadUrl,
  getDocumentPresignedUrl,
  renameDocument,
  updateDocumentMetadata,
  deleteDocument,
} from '../../api/documents';

interface DocumentPreviewDrawerProps {
  document: DocInfo | null;
  folders: DocFolder[];
  onClose: () => void;
  onUpdate: (updatedDoc: DocInfo) => void;
  onDelete: (docId: string) => void;
}

export const DocumentPreviewDrawer: React.FC<DocumentPreviewDrawerProps> = ({
  document: doc,
  folders,
  onClose,
  onUpdate,
  onDelete,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [presignedExpiry, setPresignedExpiry] = useState<number>(3600);
  const [isGeneratingPresigned, setIsGeneratingPresigned] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editFileName, setEditFileName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFolderId, setEditFolderId] = useState('');
  const [editTags, setEditTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!doc) return null;

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleGeneratePresigned = async (seconds: number) => {
    try {
      setIsGeneratingPresigned(true);
      setError(null);
      const res = await getDocumentPresignedUrl(doc.id, seconds);
      setPresignedUrl(res.url);
      setPresignedExpiry(seconds);
    } catch (err: any) {
      setError(err.message || 'Failed to generate presigned URL');
    } finally {
      setIsGeneratingPresigned(false);
    }
  };

  const startEditing = () => {
    setEditTitle(doc.title);
    setEditFileName(doc.file_name);
    setEditDescription(doc.description || '');
    setEditFolderId(doc.folder_id || '');
    setEditTags(doc.tags ? doc.tags.join(', ') : '');
    setIsEditing(true);
    setError(null);
  };

  const handleSaveEdit = async () => {
    try {
      setIsSaving(true);
      setError(null);

      let currentDoc = doc;

      // 1. Rename if file name changed
      if (editFileName.trim() !== doc.file_name || editTitle.trim() !== doc.title) {
        currentDoc = await renameDocument(
          doc.id,
          editFileName.trim() || doc.file_name,
          editTitle.trim() || doc.title
        );
      }

      // 2. Update metadata
      const tags = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const finalDoc = await updateDocumentMetadata(doc.id, {
        title: editTitle.trim() || doc.title,
        description: editDescription.trim() || undefined,
        folder_id: editFolderId || undefined,
        tags,
      });

      onUpdate(finalDoc);
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setError(null);
      await deleteDocument(doc.id, true);
      onDelete(doc.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete document');
      setIsDeleting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl border-l border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg border border-gray-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-gray-700 shadow-2xs">
            {doc.document_code}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              doc.status === 'ACTIVE'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}
          >
            {doc.status}
          </span>
          <span className="text-[11px] font-mono text-gray-400">v{doc.version}</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Title & Description */}
        {isEditing ? (
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/30 p-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Document Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                File Name
              </label>
              <input
                type="text"
                value={editFileName}
                onChange={(e) => setEditFileName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900 bg-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Folder Category
              </label>
              <select
                value={editFolderId}
                onChange={(e) => setEditFolderId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900 bg-white"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.folder_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Description
              </label>
              <textarea
                rows={2}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Tags (Comma-separated)
              </label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900 bg-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-bold text-gray-900 leading-snug">{doc.title}</h2>
              <button
                onClick={startEditing}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-900 shadow-2xs"
              >
                <Edit2 className="h-3 w-3" />
                <span>Edit</span>
              </button>
            </div>
            {doc.description ? (
              <p className="mt-1 text-xs text-gray-600 leading-relaxed">{doc.description}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-400 italic">No description provided</p>
            )}
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="grid grid-cols-2 gap-2.5">
          {doc.url_type === 'FILE' ? (
            <a
              href={getDownloadUrl(doc.id)}
              download={doc.file_name}
              className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Direct Download</span>
            </a>
          ) : (
            <a
              href={doc.url_name}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open External URL</span>
            </a>
          )}

          <button
            onClick={() => handleGeneratePresigned(presignedExpiry)}
            disabled={isGeneratingPresigned}
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
          >
            <LinkIcon className="h-3.5 w-3.5 text-gray-500" />
            <span>{isGeneratingPresigned ? 'Generating...' : 'Get Presigned Link'}</span>
          </button>
        </div>

        {/* Presigned SAS URL Section */}
        {presignedUrl && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
                Temporary Direct Cloud Link
              </span>
              <div className="flex items-center gap-1">
                {[900, 3600, 14400, 86400].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => handleGeneratePresigned(sec)}
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                      presignedExpiry === sec
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-blue-800 hover:bg-blue-100'
                    }`}
                  >
                    {sec === 900 ? '15m' : sec === 3600 ? '1h' : sec === 14400 ? '4h' : '24h'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={presignedUrl}
                className="flex-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-[11px] font-mono text-gray-700 outline-hidden select-all"
              />
              <button
                onClick={() => handleCopy(presignedUrl, 'presigned')}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                {copiedField === 'presigned' ? (
                  <>
                    <Check className="h-3 w-3" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Storage & Volume Architecture Details */}
        <div className="rounded-xl border border-gray-200/80 bg-gray-50/40 p-4 space-y-3">
          <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5 text-gray-600" />
            <span>CompassX Volume Object Storage</span>
          </h4>

          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="flex items-start justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">Volume Storage Path:</span>
              <div className="flex items-center gap-1 max-w-[280px]">
                <span className="font-mono text-[11px] text-gray-800 truncate" title={doc.url_name}>
                  {doc.url_name}
                </span>
                <button
                  onClick={() => handleCopy(doc.url_name, 'path')}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {copiedField === 'path' ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">Volume UUID:</span>
              <span className="font-mono text-[11px] text-gray-700">
                {doc.volume_id || 'Global CompassX Catalog'}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">File Name & Size:</span>
              <span className="font-medium text-gray-800">
                {doc.file_name} ({formatBytes(doc.file_size_bytes)})
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">MIME Content-Type:</span>
              <span className="font-mono text-[11px] text-gray-700">{doc.content_type}</span>
            </div>

            {doc.sha256_hash && (
              <div className="flex items-start justify-between py-1">
                <span className="text-gray-500">SHA-256 Checksum:</span>
                <div className="flex items-center gap-1 max-w-[260px]">
                  <span className="font-mono text-[10px] text-gray-600 truncate" title={doc.sha256_hash}>
                    {doc.sha256_hash}
                  </span>
                  <button
                    onClick={() => handleCopy(doc.sha256_hash!, 'hash')}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    {copiedField === 'hash' ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Metadata & Tagging */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
              <Folder className="h-3.5 w-3.5 text-gray-500" />
              Folder Category
            </span>
            <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-semibold text-gray-800">
              {doc.folder_name || 'UNASSIGNED'}
            </span>
          </div>

          <div>
            <span className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-gray-500" />
              Tags
            </span>
            {doc.tags && doc.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {doc.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-gray-200/80 bg-gray-100/80 px-2 py-0.5 text-[11px] font-medium text-gray-700"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-gray-400 italic">No tags assigned</span>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 text-[11px] text-gray-500 space-y-1">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Created:
              </span>
              <span>{doc.created_at ? new Date(doc.created_at).toLocaleString() : 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Created By:</span>
              <span className="font-medium text-gray-700">{doc.created_by || 'system'}</span>
            </div>
            {doc.updated_at && (
              <div className="flex items-center justify-between">
                <span>Last Updated:</span>
                <span>{new Date(doc.updated_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Danger Zone: Deletion */}
        <div className="pt-4 border-t border-gray-100">
          {showDeleteConfirm ? (
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-red-900">Confirm Document Deletion</h4>
                  <p className="text-[11px] text-red-700 mt-0.5">
                    This will permanently delete document metadata and purge the physical file from the
                    CompassX Volume storage backend.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete Permanently'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Document from Volume</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
