import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Search,
  Folder,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileCode,
  File,
  Check,
  Filter,
  Loader2,
  AlertCircle,
  FolderOpen,
} from 'lucide-react';
import type { DocFolder, DocInfo } from '../../types';
import { listDocumentFolders, listDocuments } from '../../api/documents';

export interface DocumentPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (selectedDocs: DocInfo[]) => void;
  allowMultiple?: boolean;
  maxSelectable?: number;
  initialFolderId?: string | null;
  accept?: string | null;
  maxFileSizeMb?: number | null;
  alreadyAttachedDocIds?: string[];
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(contentType?: string, fileName?: string) {
  const ct = (contentType || '').toLowerCase();
  const fn = (fileName || '').toLowerCase();

  if (ct.includes('image') || /\.(png|jpe?g|gif|svg|webp|bmp)$/.test(fn)) {
    return <FileImage className="h-4 w-4 text-emerald-600" />;
  }
  if (ct.includes('sheet') || ct.includes('excel') || ct.includes('csv') || /\.(xlsx?|csv)$/.test(fn)) {
    return <FileSpreadsheet className="h-4 w-4 text-emerald-700" />;
  }
  if (ct.includes('pdf') || /\.pdf$/.test(fn)) {
    return <FileText className="h-4 w-4 text-rose-600" />;
  }
  if (ct.includes('json') || ct.includes('javascript') || ct.includes('html') || /\.(json|js|ts|tsx|jsx|py|html|css)$/.test(fn)) {
    return <FileCode className="h-4 w-4 text-indigo-600" />;
  }
  return <File className="h-4 w-4 text-slate-500" />;
}

function matchesAccept(doc: DocInfo, accept?: string | null): boolean {
  if (!accept || !accept.trim()) return true;
  const parts = accept.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return true;

  const fn = (doc.file_name || doc.title || '').toLowerCase();
  const ct = (doc.content_type || '').toLowerCase();

  return parts.some((p) => {
    if (p.startsWith('.')) {
      return fn.endsWith(p);
    }
    if (p.endsWith('/*')) {
      const prefix = p.slice(0, -2);
      return ct.startsWith(prefix);
    }
    return ct === p || fn.endsWith(`.${p}`);
  });
}

export function DocumentPickerModal({
  isOpen,
  onClose,
  onSelect,
  allowMultiple = false,
  maxSelectable,
  initialFolderId = null,
  accept = null,
  maxFileSizeMb = null,
  alreadyAttachedDocIds = [],
}: DocumentPickerModalProps) {
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(initialFolderId || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState<DocInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Load available folders on open
  useEffect(() => {
    if (!isOpen) return;
    let isSubscribed = true;
    listDocumentFolders()
      .then((data) => {
        if (isSubscribed) setFolders(data);
      })
      .catch((err) => {
        console.warn('Failed to load folders for document picker:', err);
      });
    return () => {
      isSubscribed = false;
    };
  }, [isOpen]);

  // Load documents whenever folder or search query changes
  const fetchDocuments = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const folderParam = selectedFolderId !== 'all' ? selectedFolderId : undefined;
      const res = await listDocuments({
        folder_id: folderParam,
        search: searchQuery.trim() || undefined,
        status: 'ACTIVE',
        limit: 150,
      });
      setDocuments(res.items || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [isOpen, selectedFolderId, searchQuery]);

  useEffect(() => {
    if (isOpen) {
      fetchDocuments();
    }
  }, [isOpen, fetchDocuments]);

  // Reset selection on open
  useEffect(() => {
    if (isOpen) {
      setSelectedDocIds(new Set());
      setSelectedFolderId(initialFolderId || 'all');
      setSearchQuery('');
      setError(null);
    }
  }, [isOpen, initialFolderId]);

  const maxBytes = maxFileSizeMb ? maxFileSizeMb * 1024 * 1024 : null;

  // Determine eligibility of each document
  const docEligibility = useMemo(() => {
    const map = new Map<string, { eligible: boolean; reason?: string }>();
    const attachedSet = new Set(alreadyAttachedDocIds);

    for (const doc of documents) {
      if (attachedSet.has(doc.id)) {
        map.set(doc.id, { eligible: false, reason: 'Already attached' });
        continue;
      }
      if (maxBytes !== null && doc.file_size_bytes > maxBytes) {
        map.set(doc.id, { eligible: false, reason: `Exceeds max ${maxFileSizeMb} MB` });
        continue;
      }
      if (!matchesAccept(doc, accept)) {
        map.set(doc.id, { eligible: false, reason: `Format not accepted (${accept})` });
        continue;
      }
      map.set(doc.id, { eligible: true });
    }
    return map;
  }, [documents, alreadyAttachedDocIds, maxBytes, maxFileSizeMb, accept]);

  const toggleSelect = (doc: DocInfo) => {
    const eligibility = docEligibility.get(doc.id);
    if (!eligibility?.eligible) return;

    if (!allowMultiple) {
      setSelectedDocIds(new Set([doc.id]));
      return;
    }

    const next = new Set(selectedDocIds);
    if (next.has(doc.id)) {
      next.delete(doc.id);
    } else {
      if (maxSelectable && next.size >= maxSelectable) {
        return;
      }
      next.add(doc.id);
    }
    setSelectedDocIds(next);
  };

  const handleConfirm = () => {
    const selected = documents.filter((d) => selectedDocIds.has(d.id));
    if (selected.length > 0) {
      onSelect(selected);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 bg-gray-50/50">
          <div>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Attach from Document Library</h3>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              Select existing documents from CompassX storage to attach to this form.
              {accept && <span className="ml-1.5 font-mono text-[11px] text-gray-600">({accept})</span>}
              {maxFileSizeMb && <span className="ml-1.5 font-mono text-[11px] text-gray-600">· Max {maxFileSizeMb}MB</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 bg-white px-5 py-2.5">
          {/* Search bar */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, filename, code, or tag…"
              className="w-full rounded-md border border-gray-200 bg-gray-50/50 pl-8 pr-7 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Folder filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <select
              value={selectedFolderId}
              onChange={(e) => setSelectedFolderId(e.target.value)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Folders ({folders.length})</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.folder_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Document List View */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[260px] max-h-[50vh]">
          {loading ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <span className="text-xs">Loading documents…</span>
            </div>
          ) : error ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-xs text-red-500">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => fetchDocuments()}
                className="mt-1 text-xs text-blue-600 underline hover:text-blue-700"
              >
                Try again
              </button>
            </div>
          ) : documents.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-gray-400">
              <Folder className="h-8 w-8 text-gray-300 stroke-[1.5]" />
              <p className="text-xs font-medium text-gray-600">No documents found</p>
              <p className="text-[11px] text-gray-400 max-w-xs">
                {searchQuery
                  ? 'No documents matched your search criteria.'
                  : 'This folder has no active documents registered in CompassX.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {documents.map((doc) => {
                const eligibility = docEligibility.get(doc.id) || { eligible: true };
                const isSelected = selectedDocIds.has(doc.id);
                const isEligible = eligibility.eligible;

                return (
                  <div
                    key={doc.id}
                    onClick={() => isEligible && toggleSelect(doc)}
                    className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 transition-colors ${
                      !isEligible
                        ? 'cursor-not-allowed border-gray-100 bg-gray-50/60 opacity-60'
                        : isSelected
                        ? 'cursor-pointer border-blue-300 bg-blue-50/50 shadow-2xs'
                        : 'cursor-pointer border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                    }`}
                  >
                    {/* Left: Checkbox/Radio + Icon + Title/Code */}
                    <div className="flex min-w-0 items-center gap-3">
                      {/* Selection box / radio indicator */}
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center transition-colors ${
                          allowMultiple ? 'rounded border' : 'rounded-full border'
                        } ${
                          isSelected
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                      </div>

                      {/* File Icon */}
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100">
                        {getFileIcon(doc.content_type, doc.file_name)}
                      </div>

                      {/* Text metadata */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`truncate text-xs font-semibold ${
                              isSelected ? 'text-blue-900' : 'text-gray-800'
                            }`}
                            title={doc.title || doc.file_name}
                          >
                            {doc.title || doc.file_name}
                          </span>
                          <span className="shrink-0 rounded bg-gray-100 px-1 py-0.2 font-mono text-[9px] font-medium text-gray-600">
                            {doc.document_code}
                          </span>
                          {doc.version && (
                            <span className="shrink-0 text-[10px] text-gray-400">
                              v{doc.version}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
                          <span className="truncate max-w-[200px]" title={doc.file_name}>
                            {doc.file_name}
                          </span>
                          {doc.folder_name && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1 text-gray-500">
                                <Folder className="h-3 w-3 text-gray-400" />
                                {doc.folder_name}
                              </span>
                            </>
                          )}
                          <span>·</span>
                          <span className="font-mono">{formatBytes(doc.file_size_bytes)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Ineligible reason badge or selection indicator */}
                    <div className="shrink-0">
                      {!isEligible ? (
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200/60">
                          {eligibility.reason}
                        </span>
                      ) : isSelected ? (
                        <span className="text-[11px] font-semibold text-blue-600">Selected</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-5 py-3">
          <div className="text-xs text-gray-600">
            {selectedDocIds.size === 0 ? (
              <span className="text-gray-400">No document selected</span>
            ) : (
              <span className="font-semibold text-gray-800">
                {selectedDocIds.size} {selectedDocIds.size === 1 ? 'document' : 'documents'} selected
                {allowMultiple && maxSelectable ? ` (max ${maxSelectable})` : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedDocIds.size === 0}
              onClick={handleConfirm}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 transition-colors"
            >
              {selectedDocIds.size > 1 ? `Attach Selected (${selectedDocIds.size})` : 'Attach Document'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
