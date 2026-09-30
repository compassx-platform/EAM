import React, { useState, useEffect } from 'react';
import {
  FolderClosed,
  Search,
  Upload,
  FolderPlus,
  RefreshCw,
  HardDrive,
  FileText,
  FileCode,
  Image,
  FileSpreadsheet,
  Link as LinkIcon,
  Download,
  Eye,
  SlidersHorizontal,
  LayoutGrid,
  List,
  ShieldCheck,
  Tag,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import type { DocInfo, DocFolder } from '../../types';
import { listDocumentFolders, listDocuments, getDownloadUrl } from '../../api/documents';
import { DocumentUploadModal } from './DocumentUploadModal';
import { DocumentPreviewDrawer } from './DocumentPreviewDrawer';
import { FolderManagerModal } from './FolderManagerModal';
import { VolumeExplorerView } from './VolumeExplorerView';

export const DocumentsModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'documents' | 'volumes' | 'folders'>('documents');
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocInfo[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals & Drawers
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFolderManagerOpen, setIsFolderManagerOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocInfo | null>(null);

  const loadFolders = async () => {
    try {
      const data = await listDocumentFolders();
      setFolders(data);
    } catch (err: any) {
      console.error('Error fetching folders:', err);
    }
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await listDocuments({
        folder_id: selectedFolderId || undefined,
        search: searchQuery.trim() || undefined,
        status: statusFilter || undefined,
      });
      setDocuments(res.items);
      setTotalDocs(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (activeTab === 'documents') {
      loadDocuments();
    }
  }, [activeTab, selectedFolderId, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDocuments();
  };

  const getFileIcon = (doc: DocInfo) => {
    if (doc.url_type === 'URL') {
      return <LinkIcon className="h-4 w-4 text-blue-600" />;
    }
    const ext = doc.file_name ? doc.file_name.split('.').pop()?.toLowerCase() : '';
    if (ext === 'pdf') return <FileText className="h-4 w-4 text-rose-600" />;
    if (['dwg', 'dxf', 'svg'].includes(ext || '')) return <FileCode className="h-4 w-4 text-amber-600" />;
    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) return <Image className="h-4 w-4 text-purple-600" />;
    if (['xlsx', 'csv'].includes(ext || '')) return <FileSpreadsheet className="h-4 w-4 text-emerald-600" />;
    return <FileText className="h-4 w-4 text-gray-500" />;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex h-full flex-col min-h-0 bg-white">
      {/* Module Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 px-6 py-3.5 bg-gray-50/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white shadow-xs">
              <FolderClosed className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">Document Management</h1>
              <p className="text-xs text-gray-500">
                Maximo-style Doclinks & Attached Documents backed by CompassX Blob Volumes
              </p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-1 rounded-xl border border-gray-200/80 bg-gray-100/90 p-1 text-xs">
            <button
              onClick={() => setActiveTab('documents')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-semibold transition-all ${
                activeTab === 'documents'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Documents Repository</span>
            </button>
            <button
              onClick={() => setActiveTab('volumes')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-semibold transition-all ${
                activeTab === 'volumes'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span>Storage Volumes</span>
            </button>
            <button
              onClick={() => setActiveTab('folders')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-semibold transition-all ${
                activeTab === 'folders'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Folder Categories</span>
            </button>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          {activeTab === 'documents' && (
            <>
              <button
                onClick={() => setIsFolderManagerOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
              >
                <FolderPlus className="h-3.5 w-3.5 text-gray-500" />
                <span>Manage Folders</span>
              </button>
              <button
                onClick={() => setIsUploadOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Upload Document</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Body per Tab */}
      {activeTab === 'volumes' ? (
        <VolumeExplorerView />
      ) : activeTab === 'folders' ? (
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Document Folder Categories (DOCTYPES)</h2>
                <p className="text-xs text-gray-500">
                  Manage attachment folder classifications, storage paths in CompassX volumes, and extension whitelists
                </p>
              </div>
              <button
                onClick={() => setIsFolderManagerOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 shadow-xs"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span>New Category</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {folders.map((f) => (
                <div key={f.id} className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-800">
                        <FolderClosed className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-gray-900">{f.folder_name}</h3>
                        <p className="text-[11px] text-gray-500 line-clamp-1">{f.description}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">
                      {f.document_count ?? 0} docs
                    </span>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 text-[11px] text-gray-600 space-y-1.5 font-mono">
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-sans">Storage Subpath:</span>
                      <span className="text-gray-800">{f.default_sub_path || 'eam/documents'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-sans">Max Size:</span>
                      <span className="text-gray-800 font-sans">{f.max_file_size_mb} MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 font-sans">Extensions:</span>
                      <span className="text-gray-700">
                        {f.allowed_extensions && f.allowed_extensions.length > 0
                          ? f.allowed_extensions.join(', ')
                          : 'Any'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 divide-x divide-gray-200/80">
          {/* Left Sidebar: Folder Filters */}
          <div className="w-64 flex flex-col bg-gray-50/30 p-3 space-y-2">
            <div className="px-2 py-1 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                Categories
              </span>
              <span className="text-[11px] font-bold text-gray-400">{totalDocs} total</span>
            </div>

            <button
              onClick={() => setSelectedFolderId(null)}
              className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                selectedFolderId === null
                  ? 'bg-gray-900 text-white shadow-xs'
                  : 'text-gray-700 hover:bg-gray-100/80'
              }`}
            >
              <div className="flex items-center gap-2">
                <FolderClosed className="h-3.5 w-3.5" />
                <span>All Documents</span>
              </div>
              <span className={`text-[10px] ${selectedFolderId === null ? 'text-gray-300' : 'text-gray-400'}`}>
                {totalDocs}
              </span>
            </button>

            <div className="space-y-1 pt-1 overflow-y-auto">
              {folders.map((f) => {
                const isSelected = selectedFolderId === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFolderId(f.id)}
                    className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-gray-900 text-white font-semibold shadow-xs'
                        : 'text-gray-700 hover:bg-gray-100/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FolderClosed className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{f.folder_name}</span>
                    </div>
                    <span className={`text-[10px] ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>
                      {f.document_count ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Area: Search, Filters, and Documents List */}
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            {/* Search & Tool Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-3 bg-gray-50/20">
              <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by code, title, file name, or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-gray-200/90 pl-9 pr-3 py-1.5 text-xs text-gray-900 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-hidden bg-white shadow-2xs"
                />
              </form>

              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-gray-200/90 px-3 py-1.5 text-xs text-gray-700 bg-white outline-hidden shadow-2xs"
                >
                  <option value="">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                  <option value="DEPRECATED">Deprecated</option>
                </select>

                <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 p-0.5">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`rounded-lg p-1 transition-all ${
                      viewMode === 'table' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-400'
                    }`}
                    title="Table View"
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`rounded-lg p-1 transition-all ${
                      viewMode === 'grid' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-400'
                    }`}
                    title="Grid Cards View"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                </div>

                <button
                  onClick={loadDocuments}
                  className="rounded-xl border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700 shadow-2xs"
                  title="Refresh documents"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Document Content Viewport */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex h-48 items-center justify-center text-xs text-gray-400">
                  Loading documents repository...
                </div>
              ) : documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
                  <FolderClosed className="h-9 w-9 text-gray-300" />
                  <p className="mt-2 text-xs font-bold text-gray-700">No documents found</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Upload new attachments or register external links to get started.
                  </p>
                  <button
                    onClick={() => setIsUploadOpen(true)}
                    className="mt-4 flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-gray-800"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload Document</span>
                  </button>
                </div>
              ) : viewMode === 'table' ? (
                <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50/75 text-gray-500 font-semibold border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-3">Document Code & Title</th>
                        <th className="px-3 py-3">Category</th>
                        <th className="px-3 py-3">File / Storage Path</th>
                        <th className="px-3 py-3">Size</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Modified</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {documents.map((doc) => (
                        <tr
                          key={doc.id}
                          onClick={() => setSelectedDoc(doc)}
                          className="cursor-pointer hover:bg-gray-50/60 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 border border-gray-200/60 shrink-0">
                                {getFileIcon(doc)}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                    {doc.document_code}
                                  </span>
                                  <span className="font-bold text-gray-900 text-xs">
                                    {doc.title}
                                  </span>
                                </div>
                                {doc.description && (
                                  <p className="text-[11px] text-gray-500 truncate max-w-[220px]">
                                    {doc.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="rounded-md border border-gray-200/80 bg-gray-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-gray-700">
                              {doc.folder_name || 'GENERAL'}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-mono text-[11px] text-gray-800 truncate max-w-[180px]">
                              {doc.file_name}
                            </p>
                            <p className="font-mono text-[10px] text-gray-400 truncate max-w-[180px]">
                              {doc.url_name}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-gray-600 font-medium">
                            {doc.url_type === 'FILE' ? formatBytes(doc.file_size_bytes) : 'URL Link'}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                doc.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {doc.status}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-gray-500 text-[11px]">
                            {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {doc.url_type === 'FILE' ? (
                                <a
                                  href={getDownloadUrl(doc.id)}
                                  download={doc.file_name}
                                  className="rounded-lg border border-gray-200 bg-white p-1 text-gray-600 hover:bg-gray-50 shadow-2xs"
                                  title="Download File"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                              ) : (
                                <a
                                  href={doc.url_name}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg border border-gray-200 bg-white p-1 text-gray-600 hover:bg-gray-50 shadow-2xs"
                                  title="Open Link"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </a>
                              )}
                              <button
                                onClick={() => setSelectedDoc(doc)}
                                className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs"
                              >
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Grid Cards View */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className="group cursor-pointer rounded-2xl border border-gray-200/80 bg-white p-4 shadow-xs hover:border-gray-900 transition-all space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 border border-gray-200/60">
                            {getFileIcon(doc)}
                          </div>
                          <div>
                            <span className="font-mono text-[10px] font-bold text-gray-500">
                              {doc.document_code}
                            </span>
                            <h3 className="text-xs font-bold text-gray-900 line-clamp-1">
                              {doc.title}
                            </h3>
                          </div>
                        </div>
                        <span className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-gray-700">
                          {doc.folder_name || 'DOC'}
                        </span>
                      </div>

                      {doc.description && (
                        <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
                          {doc.description}
                        </p>
                      )}

                      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-2.5 text-[11px] text-gray-600 font-mono space-y-1">
                        <p className="truncate text-gray-800">{doc.file_name}</p>
                        <div className="flex items-center justify-between text-[10px] text-gray-400">
                          <span>{doc.url_type === 'FILE' ? formatBytes(doc.file_size_bytes) : 'URL'}</span>
                          <span>v{doc.version}</span>
                        </div>
                      </div>

                      {doc.tags && doc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {doc.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                            >
                              #{t}
                            </span>
                          ))}
                          {doc.tags.length > 3 && (
                            <span className="text-[10px] text-gray-400">+{doc.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSuccess={() => {
          loadFolders();
          loadDocuments();
        }}
      />

      {/* Folder Manager Modal */}
      <FolderManagerModal
        isOpen={isFolderManagerOpen}
        onClose={() => setIsFolderManagerOpen(false)}
        folders={folders}
        onFoldersChanged={() => {
          loadFolders();
          loadDocuments();
        }}
      />

      {/* Document Preview Drawer */}
      <DocumentPreviewDrawer
        document={selectedDoc}
        folders={folders}
        onClose={() => setSelectedDoc(null)}
        onUpdate={(updated) => {
          setSelectedDoc(updated);
          loadDocuments();
        }}
        onDelete={() => {
          setSelectedDoc(null);
          loadFolders();
          loadDocuments();
        }}
      />
    </div>
  );
};
