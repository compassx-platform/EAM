import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  FileText,
  FileCode,
  Image as ImageIcon,
  FileSpreadsheet,
  Link as LinkIcon,
  Archive,
  Download,
  Eye,
  Edit2,
  Trash2,
  ArrowRight,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  Search,
  Upload,
  Plus,
  RefreshCw,
  Columns,
  Share2,
  MessageSquare,
  File,
  Presentation,
  ExternalLink,
  GitBranch,
  X,
  Check,
  LayoutDashboard,
  FlaskConical,
  Database,
  BookOpen,
  AlertTriangle,
  HardDrive,
} from 'lucide-react';
import type { DocInfo, DocFolder } from '../../types';
import {
  listDocumentFolders,
  getDocumentFolderTree,
  getDocumentFolderPath,
  listDocuments,
  deleteDocumentFolder,
  deleteDocument,
  getDownloadUrl,
  syncVolumeDocuments,
} from '../../api/documents';
import { getSystemStorageConfig, type SystemStorageConfig } from '../../api/system';
import { CreateFolderModal } from './CreateFolderModal';
import { DocumentUploadModal } from './DocumentUploadModal';
import { MoveItemModal } from './MoveItemModal';
import { RenameModal } from './RenameModal';
import { DocumentPreviewDrawer } from './DocumentPreviewDrawer';

type NavCategory = 'home' | 'shared' | 'workspace' | 'favorites' | 'trash';

// Helper to format timestamps to Databricks standard: "Jan 08, 2026, 05:56 PM"
function formatDatabricksDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = String(hours).padStart(2, '0');
    return `${month} ${day}, ${year}, ${formattedHours}:${minutes} ${ampm}`;
  } catch {
    return '-';
  }
}

export const DocumentsModule: React.FC = () => {
  // Navigation & Folder State
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<DocFolder | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; folder_name: string }>>([]);

  // Data State
  const [folderTree, setFolderTree] = useState<DocFolder[]>([]);
  const [allFolders, setAllFolders] = useState<DocFolder[]>([]);
  const [subfolders, setSubfolders] = useState<DocFolder[]>([]);
  const [documents, setDocuments] = useState<DocInfo[]>([]);
  const [storageConfig, setStorageConfig] = useState<SystemStorageConfig | null>(null);

  // Sidebar tree expand state
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  // Filters & Sorting State
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'type' | 'owner' | 'created_at' | 'updated_at'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Filter Dropdown Open State
  const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);
  const [isOwnerMenuOpen, setIsOwnerMenuOpen] = useState(false);
  const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);

  // Modals & UI State
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [activeItemMenuId, setActiveItemMenuId] = useState<string | null>(null);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadInitialMode, setUploadInitialMode] = useState<'upload' | 'url'>('upload');
  const [moveModalItem, setMoveModalItem] = useState<{ type: 'folder' | 'document'; data: DocFolder | DocInfo } | null>(null);
  const [renameModalItem, setRenameModalItem] = useState<{ type: 'folder' | 'document'; data: DocFolder | DocInfo } | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocInfo | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Loading & Drag
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current logged in user info (Databricks style default)
  const defaultUser = useMemo(() => {
    return (
      localStorage.getItem('compassx_user_name') ||
      localStorage.getItem('user_email') ||
      'Vishalkumar Vora'
    );
  }, []);

  const currentUserEmail = useMemo(() => {
    return (
      localStorage.getItem('user_email') ||
      localStorage.getItem('compassx_user_email') ||
      'vishalkumar.vora@jsw.in'
    );
  }, []);

  // 1. Load Folder Tree & Flat Folders
  const loadFolderHierarchy = useCallback(async () => {
    try {
      const [tree, flat] = await Promise.all([
        getDocumentFolderTree(true),
        listDocumentFolders(),
      ]);
      setFolderTree(tree);
      setAllFolders(flat);
    } catch (err: any) {
      console.error('Failed to load folder tree:', err);
    }
  }, []);

  // 2. Load Contents of Current View
  const loadCurrentFolderContents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (currentFolderId) {
        const [path, folderData] = await Promise.all([
          getDocumentFolderPath(currentFolderId),
          listDocumentFolders().then((list) => list.find((f) => f.id === currentFolderId) || null),
        ]);
        setBreadcrumbs(path);
        setCurrentFolder(folderData);
      } else {
        setBreadcrumbs([]);
        setCurrentFolder(null);
      }

      const [foldersList, docsRes] = await Promise.all([
        listDocumentFolders({ parentId: currentFolderId ? currentFolderId : 'root' }),
        listDocuments({
          folder_id: currentFolderId ? currentFolderId : searchQuery ? undefined : 'root',
          search: searchQuery.trim() || undefined,
          limit: 200,
        }),
      ]);

      setSubfolders(foldersList);
      setDocuments(docsRes.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load volume contents.');
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, searchQuery]);

  const handleSyncVolume = useCallback(async () => {
    try {
      setIsSyncing(true);
      await syncVolumeDocuments(storageConfig?.volume_id || undefined);
      await Promise.all([loadFolderHierarchy(), loadCurrentFolderContents()]);
    } catch (err: any) {
      console.warn('Volume sync notification:', err);
      await Promise.all([loadFolderHierarchy(), loadCurrentFolderContents()]);
    } finally {
      setIsSyncing(false);
    }
  }, [storageConfig, loadFolderHierarchy, loadCurrentFolderContents]);

  useEffect(() => {
    loadFolderHierarchy();
  }, [loadFolderHierarchy]);

  useEffect(() => {
    loadCurrentFolderContents();
  }, [loadCurrentFolderContents]);

  // Load storage config to display active volume status
  useEffect(() => {
    getSystemStorageConfig()
      .then((cfg) => setStorageConfig(cfg))
      .catch(() => {});
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = () => {
      setIsCreateMenuOpen(false);
      setIsTypeMenuOpen(false);
      setIsOwnerMenuOpen(false);
      setIsDateMenuOpen(false);
      setActiveItemMenuId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Navigation Helpers
  const navigateToFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    if (folderId) {
      setExpandedFolderIds((prev) => new Set([...prev, folderId]));
    }
  };

  const toggleFolderExpand = (folderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setUploadInitialMode('upload');
      setIsUploadOpen(true);
    }
  };

  // Delete Handlers
  const handleDeleteFolder = async (folder: DocFolder, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.confirm(`Delete folder '${folder.folder_name}' and all its contents?`)) {
      try {
        await deleteDocumentFolder(folder.id);
        if (currentFolderId === folder.id) {
          navigateToFolder(folder.parent_id || null);
        }
        await Promise.all([loadFolderHierarchy(), loadCurrentFolderContents()]);
      } catch (err: any) {
        alert(err.message || 'Failed to delete folder.');
      }
    }
  };

  const handleDeleteDocument = async (doc: DocInfo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.confirm(`Delete '${doc.file_name || doc.title}'?`)) {
      try {
        await deleteDocument(doc.id);
        if (selectedDoc?.id === doc.id) {
          setSelectedDoc(null);
        }
        await loadCurrentFolderContents();
      } catch (err: any) {
        alert(err.message || 'Failed to delete document.');
      }
    }
  };

  // Classification & Icons helper
  const getItemDetails = (doc: DocInfo) => {
    const ext = doc.file_name ? doc.file_name.split('.').pop()?.toLowerCase() : '';
    const titleLower = (doc.title || '').toLowerCase();
    const nameLower = (doc.file_name || '').toLowerCase();

    if (nameLower.endsWith('.ipynb') || titleLower.includes('notebook') || titleLower.includes('generation') || titleLower.includes('governance')) {
      return {
        typeLabel: 'Notebook',
        icon: <BookOpen className="h-4 w-4 text-blue-500 shrink-0" />,
      };
    }
    if (titleLower.includes('dashboard') || titleLower.includes('dictionary')) {
      return {
        typeLabel: 'Dashboard',
        icon: <LayoutDashboard className="h-4 w-4 text-blue-500 shrink-0" />,
      };
    }
    if (titleLower.includes('experiment') || nameLower.includes('experiment')) {
      return {
        typeLabel: 'Experiment',
        icon: <FlaskConical className="h-4 w-4 text-blue-500 shrink-0" />,
      };
    }
    if (titleLower.includes('function') || titleLower.includes('query') || titleLower.includes('hosted')) {
      return {
        typeLabel: 'Query',
        icon: <Database className="h-4 w-4 text-blue-500 shrink-0" />,
      };
    }

    if (doc.url_type === 'URL') {
      return {
        typeLabel: 'Link',
        icon: <LinkIcon className="h-4 w-4 text-blue-600 shrink-0" />,
      };
    }

    if (ext === 'pdf') {
      return {
        typeLabel: 'PDF Document',
        icon: <FileText className="h-4 w-4 text-red-500 shrink-0" />,
      };
    }
    if (['ppt', 'pptx', 'pps', 'ppsx', 'odp'].includes(ext || '')) {
      return {
        typeLabel: 'Presentation',
        icon: <Presentation className="h-4 w-4 text-amber-500 shrink-0" />,
      };
    }
    if (['xls', 'xlsx', 'csv', 'tsv'].includes(ext || '')) {
      return {
        typeLabel: 'Spreadsheet',
        icon: <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />,
      };
    }
    if (['doc', 'docx', 'txt', 'rtf', 'md'].includes(ext || '')) {
      return {
        typeLabel: 'Document',
        icon: <FileText className="h-4 w-4 text-blue-600 shrink-0" />,
      };
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext || '')) {
      return {
        typeLabel: 'Image',
        icon: <ImageIcon className="h-4 w-4 text-purple-600 shrink-0" />,
      };
    }
    if (['py', 'js', 'ts', 'jsx', 'tsx', 'sql', 'sh', 'json', 'yaml', 'yml'].includes(ext || '')) {
      return {
        typeLabel: 'Code',
        icon: <FileCode className="h-4 w-4 text-amber-600 shrink-0" />,
      };
    }
    if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext || '')) {
      return {
        typeLabel: 'Archive',
        icon: <Archive className="h-4 w-4 text-amber-700 shrink-0" />,
      };
    }

    return {
      typeLabel: 'File',
      icon: <File className="h-4 w-4 text-gray-500 shrink-0" />,
    };
  };

  // Filter Subfolders and Documents
  const filteredSubfolders = useMemo(() => {
    return subfolders.filter((folder) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!folder.folder_name.toLowerCase().includes(q)) return false;
      }
      // Type filter
      if (typeFilter !== 'all' && typeFilter !== 'Folder' && typeFilter !== 'Git folder') {
        return false;
      }
      if (typeFilter === 'Git folder') {
        const nameLower = folder.folder_name.toLowerCase();
        if (!nameLower.includes('git') && !nameLower.includes('backend') && !nameLower.includes('databricks')) {
          return false;
        }
      }
      // Date filter
      if (dateFilter !== 'all' && folder.created_at) {
        const createdTime = new Date(folder.created_at).getTime();
        const now = Date.now();
        if (dateFilter === '24h' && now - createdTime > 24 * 60 * 60 * 1000) return false;
        if (dateFilter === '7d' && now - createdTime > 7 * 24 * 60 * 60 * 1000) return false;
        if (dateFilter === '30d' && now - createdTime > 30 * 24 * 60 * 60 * 1000) return false;
        if (dateFilter === '1y' && now - createdTime > 365 * 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });
  }, [subfolders, searchQuery, typeFilter, dateFilter]);

  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (doc.file_name || '').toLowerCase().includes(q);
        const matchesTitle = (doc.title || '').toLowerCase().includes(q);
        if (!matchesName && !matchesTitle) return false;
      }
      // Type filter
      if (typeFilter !== 'all') {
        const details = getItemDetails(doc);
        if (details.typeLabel.toLowerCase() !== typeFilter.toLowerCase()) return false;
      }
      // Owner filter
      if (ownerFilter !== 'all') {
        const owner = doc.created_by || defaultUser;
        if (owner.toLowerCase() !== ownerFilter.toLowerCase()) return false;
      }
      // Date filter
      if (dateFilter !== 'all' && (doc.updated_at || doc.created_at)) {
        const itemTime = new Date(doc.updated_at || doc.created_at!).getTime();
        const now = Date.now();
        if (dateFilter === '24h' && now - itemTime > 24 * 60 * 60 * 1000) return false;
        if (dateFilter === '7d' && now - itemTime > 7 * 24 * 60 * 60 * 1000) return false;
        if (dateFilter === '30d' && now - itemTime > 30 * 24 * 60 * 60 * 1000) return false;
        if (dateFilter === '1y' && now - itemTime > 365 * 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });
  }, [documents, searchQuery, typeFilter, ownerFilter, dateFilter, defaultUser]);

  // Sorting
  const sortedSubfolders = useMemo(() => {
    return [...filteredSubfolders].sort((a, b) => {
      if (sortBy === 'name') {
        return sortOrder === 'asc'
          ? a.folder_name.localeCompare(b.folder_name)
          : b.folder_name.localeCompare(a.folder_name);
      }
      if (sortBy === 'created_at') {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      }
      if (sortBy === 'updated_at') {
        const dateA = a.updated_at || a.created_at ? new Date(a.updated_at || a.created_at!).getTime() : 0;
        const dateB = b.updated_at || b.created_at ? new Date(b.updated_at || b.created_at!).getTime() : 0;
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      }
      return 0;
    });
  }, [filteredSubfolders, sortBy, sortOrder]);

  const sortedDocuments = useMemo(() => {
    return [...filteredDocuments].sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = a.file_name || a.title;
        const nameB = b.file_name || b.title;
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }
      if (sortBy === 'type') {
        const typeA = getItemDetails(a).typeLabel;
        const typeB = getItemDetails(b).typeLabel;
        return sortOrder === 'asc' ? typeA.localeCompare(typeB) : typeB.localeCompare(typeA);
      }
      if (sortBy === 'created_at') {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      }
      if (sortBy === 'updated_at') {
        const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      }
      return 0;
    });
  }, [filteredDocuments, sortBy, sortOrder]);

  // Title Display Name
  const currentTitle = useMemo(() => {
    if (currentFolder) return currentFolder.folder_name;
    return storageConfig?.volume_name || 'Volume Root';
  }, [currentFolder, storageConfig?.volume_name]);

  // Recursive Tree renderer for left sidebar
  const renderSidebarFolderTree = (nodes: DocFolder[], depth = 0) => {
    return nodes.map((node) => {
      const isSelected = currentFolderId === node.id;
      const isExpanded = expandedFolderIds.has(node.id);
      const hasChildren = node.subfolders && node.subfolders.length > 0;

      return (
        <div key={node.id} className="select-none">
          <div
            onClick={() => navigateToFolder(node.id)}
            style={{ paddingLeft: `${depth * 14 + 18}px` }}
            className={`group flex items-center justify-between rounded-md py-1.5 pr-2 text-[13px] transition-colors cursor-pointer ${
              isSelected
                ? 'bg-[#EBF3FC] text-[#1B6AC9] font-medium'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => toggleFolderExpand(node.id, e)}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-700"
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
              ) : (
                <span className="w-3.5" />
              )}

              <Folder className="h-4 w-4 text-[#1B6AC9] shrink-0" />
              <span className="truncate">{node.folder_name}</span>
            </div>
          </div>

          {hasChildren && isExpanded && (
            <div className="space-y-0.5">{renderSidebarFolderTree(node.subfolders!, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  const handleShareClick = () => {
    setIsShareModalOpen(true);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex h-full w-full overflow-hidden bg-white text-gray-900 font-sans"
    >
      {/* Drag & Drop Surface Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gray-900/40 backdrop-blur-xs text-white pointer-events-none animate-in fade-in">
          <Upload className="h-12 w-12 animate-bounce mb-2 text-white" />
          <p className="text-sm font-semibold">Drop files to upload</p>
          <p className="text-xs text-gray-200">
            Files will be placed into{' '}
            <span className="font-semibold underline">
              {currentFolder ? currentFolder.folder_name : (storageConfig?.volume_name || 'Volume Root')}
            </span>
          </p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. LEFT SIDEBAR: DIRECT VOLUME FOLDER TREE                                */}
      {/* ========================================================================= */}
      <aside className="w-60 shrink-0 border-r border-gray-200 bg-[#FAFAFA] flex flex-col h-full overflow-hidden select-none">
        {/* Volume Header */}
        <div className="px-4 py-3.5 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <HardDrive className="h-4 w-4 text-blue-600 shrink-0" />
            <h2 className="text-[13px] font-semibold text-gray-900 truncate" title={storageConfig?.volume_name || 'Volume'}>
              {storageConfig?.volume_name || 'Volume'}
            </h2>
          </div>
        </div>

        {/* Volume Root & Directory Tree */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 text-[13px]">
          {/* Root Directory Item */}
          <div
            onClick={() => setCurrentFolderId(null)}
            className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors cursor-pointer ${
              currentFolderId === null
                ? 'bg-[#EBF3FC] text-[#1B6AC9] font-medium'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Folder className="h-4 w-4 text-[#1B6AC9] shrink-0" />
            <span className="truncate">{storageConfig?.volume_name ? `${storageConfig.volume_name} (Root)` : 'Volume Root'}</span>
          </div>

          {/* Direct Folder Tree */}
          <div className="space-y-0.5 pt-0.5">
            {renderSidebarFolderTree(folderTree)}
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MAIN EXPLORER SURFACE: VOLUME CONTENTS LAYOUT                           */}
      {/* ========================================================================= */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white">
        {/* Top Breadcrumbs and Title Bar */}
        <div className="px-6 pt-3 pb-2 space-y-2 border-b border-gray-100">
          {/* Breadcrumb Path Trail */}
          <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
            <button
              type="button"
              onClick={() => {
                setCurrentFolderId(null);
              }}
              className="hover:text-blue-600 hover:underline cursor-pointer"
            >
              {storageConfig?.volume_name || 'Volume Root'}
            </button>

            {breadcrumbs.map((bc, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={bc.id}>
                  <span>&gt;</span>
                  {isLast ? (
                    <span className="text-gray-700 font-medium">{bc.folder_name}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigateToFolder(bc.id)}
                      className="hover:text-blue-600 hover:underline cursor-pointer"
                    >
                      {bc.folder_name}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Title and Top-Right Action Controls */}
          <div className="flex items-center justify-between gap-4">
            {/* Folder Title + Active Volume */}
            <div className="flex items-center gap-2.5">
              <h1 className="text-[20px] font-semibold text-gray-900 tracking-tight">
                {currentTitle}
              </h1>

              {storageConfig?.is_configured && storageConfig.volume_name && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700 border border-gray-200"
                  title={`Active CompassX Volume: ${storageConfig.volume_name} (${storageConfig.catalog_name}/${storageConfig.schema_name})`}
                >
                  <HardDrive className="h-3 w-3 text-gray-500" />
                  <span>{storageConfig.volume_name}</span>
                </span>
              )}
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center gap-3">
              {/* Send feedback */}
              <button
                type="button"
                onClick={() => setIsFeedbackModalOpen(true)}
                className="flex items-center gap-1.5 text-[13px] text-gray-600 hover:text-gray-900 transition-colors"
              >
                <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
                <span>Send feedback</span>
              </button>

              {/* Share */}
              <button
                type="button"
                onClick={handleShareClick}
                className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1 text-[13px] font-medium text-gray-700 hover:bg-gray-50 shadow-2xs transition-colors"
              >
                <span>Share</span>
              </button>

              {/* Sync Volume */}
              <button
                type="button"
                onClick={handleSyncVolume}
                disabled={isSyncing}
                title="Sync folder structure and files with CompassX Volume"
                className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[13px] font-medium text-gray-700 hover:bg-gray-50 shadow-2xs transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
              </button>

              {/* Create ▾ Blue Primary Dropdown */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)}
                  className="flex items-center gap-1.5 rounded-md bg-[#1B6AC9] hover:bg-[#1558A6] px-3.5 py-1 text-[13px] font-medium text-white shadow-sm transition-colors"
                >
                  <span>Create</span>
                  <ChevronDown className="h-3.5 w-3.5 text-white/80" />
                </button>

                {isCreateMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg z-30 text-[13px]">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreateMenuOpen(false);
                        setIsCreateFolderOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    >
                      <Folder className="h-4 w-4 text-[#1B6AC9]" />
                      <span>Folder</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreateMenuOpen(false);
                        setUploadInitialMode('upload');
                        setIsUploadOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    >
                      <Upload className="h-4 w-4 text-gray-500" />
                      <span>Upload file</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreateMenuOpen(false);
                        setUploadInitialMode('url');
                        setIsUploadOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    >
                      <LinkIcon className="h-4 w-4 text-gray-500" />
                      <span>Link URL</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 pt-1 pb-1">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 rounded-md border border-gray-300 bg-white pl-8 pr-2.5 py-1 text-[13px] text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Type ▾ Dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setIsTypeMenuOpen(!isTypeMenuOpen);
                  setIsOwnerMenuOpen(false);
                  setIsDateMenuOpen(false);
                }}
                className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[13px] font-normal transition-colors ${
                  typeFilter !== 'all'
                    ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{typeFilter === 'all' ? 'Type' : typeFilter}</span>
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </button>

              {isTypeMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg z-30 text-[13px]">
                  {['all', 'Folder', 'Git folder', 'File', 'PDF Document', 'Document', 'Spreadsheet', 'Presentation', 'Image', 'Notebook', 'Dashboard'].map(
                    (t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setTypeFilter(t);
                          setIsTypeMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-gray-100 ${
                          typeFilter === t ? 'font-semibold text-blue-600' : 'text-gray-700'
                        }`}
                      >
                        <span>{t === 'all' ? 'All Types' : t}</span>
                        {typeFilter === t && <Check className="h-3.5 w-3.5 text-blue-600" />}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Owner ▾ Dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setIsOwnerMenuOpen(!isOwnerMenuOpen);
                  setIsTypeMenuOpen(false);
                  setIsDateMenuOpen(false);
                }}
                className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[13px] font-normal transition-colors ${
                  ownerFilter !== 'all'
                    ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{ownerFilter === 'all' ? 'Owner' : ownerFilter}</span>
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </button>

              {isOwnerMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg z-30 text-[13px]">
                  {[
                    { key: 'all', label: 'All Owners' },
                    { key: defaultUser, label: `${defaultUser} (Me)` },
                    { key: 'system', label: 'system' },
                  ].map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => {
                        setOwnerFilter(o.key);
                        setIsOwnerMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-gray-100 ${
                        ownerFilter === o.key ? 'font-semibold text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      <span className="truncate">{o.label}</span>
                      {ownerFilter === o.key && <Check className="h-3.5 w-3.5 text-blue-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Last modified ▾ Dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setIsDateMenuOpen(!isDateMenuOpen);
                  setIsTypeMenuOpen(false);
                  setIsOwnerMenuOpen(false);
                }}
                className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[13px] font-normal transition-colors ${
                  dateFilter !== 'all'
                    ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>
                  {dateFilter === 'all'
                    ? 'Last modified'
                    : dateFilter === '24h'
                    ? 'Past 24 hours'
                    : dateFilter === '7d'
                    ? 'Past 7 days'
                    : dateFilter === '30d'
                    ? 'Past 30 days'
                    : 'Past year'}
                </span>
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </button>

              {isDateMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg z-30 text-[13px]">
                  {[
                    { key: 'all', label: 'Any time' },
                    { key: '24h', label: 'Past 24 hours' },
                    { key: '7d', label: 'Past 7 days' },
                    { key: '30d', label: 'Past 30 days' },
                    { key: '1y', label: 'Past year' },
                  ].map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => {
                        setDateFilter(d.key);
                        setIsDateMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-gray-100 ${
                        dateFilter === d.key ? 'font-semibold text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      <span>{d.label}</span>
                      {dateFilter === d.key && <Check className="h-3.5 w-3.5 text-blue-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Clear filters if active */}
            {(typeFilter !== 'all' || ownerFilter !== 'all' || dateFilter !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('all');
                  setOwnerFilter('all');
                  setDateFilter('all');
                  setSearchQuery('');
                }}
                className="text-xs text-gray-400 hover:text-gray-700 px-1 py-1"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mx-6 my-2 p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Unconfigured Storage Banner */}
        {storageConfig && !storageConfig.is_configured && (
          <div className="mx-6 my-2 p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Storage volume not configured. Documents in external CompassX volumes will appear once an active storage volume is configured in Settings.</span>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. EXPLORER TABLE (Databricks Studio Columns Layout)                       */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto">
          {loading && subfolders.length === 0 && documents.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-xs text-gray-400">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin text-gray-400" /> Loading...
            </div>
          ) : sortedSubfolders.length === 0 && sortedDocuments.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Folder className="h-10 w-10 text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-700">This folder is empty</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Use the Create button above to add new folders or upload files.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-[13px] border-collapse">
              <thead className="text-gray-500 font-medium border-b border-gray-200 bg-white sticky top-0 z-10 select-none">
                <tr>
                  <th
                    className="pl-6 pr-4 py-2 cursor-pointer hover:text-gray-900 w-[38%]"
                    onClick={() => {
                      if (sortBy === 'name') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else {
                        setSortBy('name');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Name</span>
                      {sortBy === 'name' && (
                        <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-4 py-2 cursor-pointer hover:text-gray-900 w-[15%]"
                    onClick={() => {
                      if (sortBy === 'type') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else {
                        setSortBy('type');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Type</span>
                      {sortBy === 'type' && (
                        <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-4 py-2 cursor-pointer hover:text-gray-900 w-[18%]"
                    onClick={() => {
                      if (sortBy === 'owner') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else {
                        setSortBy('owner');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    <span>Owner</span>
                  </th>
                  <th
                    className="px-4 py-2 cursor-pointer hover:text-gray-900 w-[16%]"
                    onClick={() => {
                      if (sortBy === 'created_at') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else {
                        setSortBy('created_at');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Created at</span>
                      {sortBy === 'created_at' && (
                        <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-4 py-2 cursor-pointer hover:text-gray-900 w-[18%]"
                    onClick={() => {
                      if (sortBy === 'updated_at') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else {
                        setSortBy('updated_at');
                        setSortOrder('asc');
                      }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Last updated at</span>
                      {sortBy === 'updated_at' && (
                        <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="pr-6 pl-2 py-2 text-right w-[50px]">
                    <Columns className="h-3.5 w-3.5 text-gray-400 inline-block" />
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 text-gray-700">
                {/* 1. Folders Rows */}
                {sortedSubfolders.map((folder) => {
                  const isGitFolder =
                    folder.folder_name.toLowerCase().includes('git') ||
                    folder.folder_name.toLowerCase().includes('backend') ||
                    folder.folder_name.toLowerCase().includes('ds_');
                  const gitBranch = isGitFolder
                    ? folder.folder_name.includes('master')
                      ? 'master'
                      : 'development'
                    : null;
                  return (
                    <tr
                      key={folder.id}
                      onClick={() => navigateToFolder(folder.id)}
                      className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                    >
                      <td className="pl-6 pr-4 py-2 text-gray-900 font-normal">
                        <div className="flex items-center gap-2.5">
                          <Folder className="h-4 w-4 text-[#1B6AC9] shrink-0" />
                          <span className="hover:text-blue-600 hover:underline">
                            {folder.folder_name}
                          </span>

                          {/* Git branch badge like Databricks UI */}
                          {gitBranch && (
                            <span className="inline-flex items-center gap-1 rounded-sm border border-gray-200 bg-gray-50 px-1.5 py-0.2 text-[11px] text-gray-600 font-normal">
                              <GitBranch className="h-3 w-3 text-gray-500" />
                              <span>{gitBranch}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-2 text-gray-600 text-[13px]">
                        {isGitFolder ? 'Git folder' : 'Folder'}
                      </td>

                      <td className="px-4 py-2 text-gray-600 text-[13px]">
                        {defaultUser}
                      </td>

                      <td className="px-4 py-2 text-gray-600 text-[13px]">
                        {formatDatabricksDate(folder.created_at)}
                      </td>

                      <td className="px-4 py-2 text-gray-600 text-[13px]">
                        {formatDatabricksDate(folder.updated_at || folder.created_at)}
                      </td>

                      <td className="pr-6 pl-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveItemMenuId(activeItemMenuId === folder.id ? null : folder.id)
                            }
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>

                          {activeItemMenuId === folder.id && (
                            <div className="absolute right-0 top-full mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg z-30 text-left text-[12px]">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveItemMenuId(null);
                                  navigateToFolder(folder.id);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
                              >
                                <FolderOpen className="h-3.5 w-3.5 text-gray-500" />
                                <span>Open</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveItemMenuId(null);
                                  setRenameModalItem({ type: 'folder', data: folder });
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-gray-500" />
                                <span>Rename</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveItemMenuId(null);
                                  setMoveModalItem({ type: 'folder', data: folder });
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
                              >
                                <ArrowRight className="h-3.5 w-3.5 text-gray-500" />
                                <span>Move</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  setActiveItemMenuId(null);
                                  handleDeleteFolder(folder, e);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* 2. Documents / Files Rows */}
                {sortedDocuments.map((doc) => {
                  const details = getItemDetails(doc);

                  return (
                    <tr
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                    >
                      <td className="pl-6 pr-4 py-2 text-gray-900 font-normal">
                        <div className="flex items-center gap-2.5">
                          {details.icon}
                          <span className="hover:text-blue-600 hover:underline">
                            {doc.file_name || doc.title}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-2 text-gray-600 text-[13px]">
                        {details.typeLabel}
                      </td>

                      <td className="px-4 py-2 text-gray-600 text-[13px]">
                        {doc.created_by || defaultUser}
                      </td>

                      <td className="px-4 py-2 text-gray-600 text-[13px]">
                        {formatDatabricksDate(doc.created_at)}
                      </td>

                      <td className="px-4 py-2 text-gray-600 text-[13px]">
                        {formatDatabricksDate(doc.updated_at)}
                      </td>

                      <td className="pr-6 pl-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveItemMenuId(activeItemMenuId === doc.id ? null : doc.id)
                            }
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>

                          {activeItemMenuId === doc.id && (
                            <div className="absolute right-0 top-full mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-lg z-30 text-left text-[12px]">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveItemMenuId(null);
                                  setSelectedDoc(doc);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
                              >
                                <Eye className="h-3.5 w-3.5 text-gray-500" />
                                <span>Preview / Info</span>
                              </button>
                              {doc.url_type === 'FILE' ? (
                                <a
                                  href={getDownloadUrl(doc.id)}
                                  download
                                  onClick={() => setActiveItemMenuId(null)}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
                                >
                                  <Download className="h-3.5 w-3.5 text-gray-500" />
                                  <span>Download</span>
                                </a>
                              ) : (
                                <a
                                  href={doc.url_name}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => setActiveItemMenuId(null)}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
                                >
                                  <ExternalLink className="h-3.5 w-3.5 text-gray-500" />
                                  <span>Open URL</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveItemMenuId(null);
                                  setRenameModalItem({ type: 'document', data: doc });
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-gray-500" />
                                <span>Rename</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveItemMenuId(null);
                                  setMoveModalItem({ type: 'document', data: doc });
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50"
                              >
                                <ArrowRight className="h-3.5 w-3.5 text-gray-500" />
                                <span>Move</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  setActiveItemMenuId(null);
                                  handleDeleteDocument(doc, e);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* ========================================================================= */}
      {/* 4. MODALS & DRAWERS                                                       */}
      {/* ========================================================================= */}

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        parentFolder={currentFolder}
        volumeId={currentFolder?.volume_id || storageConfig?.volume_id || null}
        onFolderCreated={() => {
          loadFolderHierarchy();
          loadCurrentFolderContents();
        }}
      />

      {/* Upload Document / URL Modal */}
      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        folders={allFolders}
        selectedFolderId={currentFolderId}
        volumeId={currentFolder?.volume_id || storageConfig?.volume_id || null}
        initialMode={uploadInitialMode}
        onSuccess={() => {
          loadFolderHierarchy();
          loadCurrentFolderContents();
        }}
      />

      {/* Move Item Modal */}
      <MoveItemModal
        isOpen={!!moveModalItem}
        onClose={() => setMoveModalItem(null)}
        itemToMove={moveModalItem}
        onSuccess={() => {
          loadFolderHierarchy();
          loadCurrentFolderContents();
        }}
      />

      {/* Rename Modal */}
      <RenameModal
        isOpen={!!renameModalItem}
        onClose={() => setRenameModalItem(null)}
        itemToRename={renameModalItem}
        onSuccess={() => {
          loadFolderHierarchy();
          loadCurrentFolderContents();
        }}
      />

      {/* Document Preview Drawer */}
      <DocumentPreviewDrawer
        document={selectedDoc}
        folders={allFolders}
        onClose={() => setSelectedDoc(null)}
        onUpdate={(updated) => {
          setSelectedDoc(updated);
          loadCurrentFolderContents();
        }}
        onDelete={() => {
          setSelectedDoc(null);
          loadFolderHierarchy();
          loadCurrentFolderContents();
        }}
      />

      {/* Share Modal Dialog */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900">Share Workspace Link</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="rounded p-1 text-gray-400 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Anyone with access to this workspace will be able to view documents in this directory:
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={window.location.href}
                className="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="rounded-md bg-[#1B6AC9] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1558A6] flex items-center gap-1 shrink-0"
              >
                {copySuccess ? <Check className="h-3.5 w-3.5" /> : null}
                <span>{copySuccess ? 'Copied' : 'Copy link'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal Dialog */}
      {isFeedbackModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900">Send feedback</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsFeedbackModalOpen(false);
                  setFeedbackSent(false);
                }}
                className="rounded p-1 text-gray-400 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {feedbackSent ? (
              <div className="py-6 text-center space-y-2">
                <Check className="h-8 w-8 text-emerald-500 mx-auto" />
                <p className="text-sm font-medium text-gray-900">Thank you for your feedback!</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  Help us improve your workspace experience. What would you like to share?
                </p>
                <textarea
                  rows={4}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Tell us what you like or what could be better..."
                  className="w-full rounded-md border border-gray-300 p-2.5 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsFeedbackModalOpen(false)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!feedbackText.trim()}
                    onClick={() => {
                      setFeedbackSent(true);
                      setTimeout(() => {
                        setIsFeedbackModalOpen(false);
                        setFeedbackSent(false);
                        setFeedbackText('');
                      }, 1500);
                    }}
                    className="rounded-md bg-[#1B6AC9] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#1558A6] disabled:opacity-50"
                  >
                    Submit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsModule;
