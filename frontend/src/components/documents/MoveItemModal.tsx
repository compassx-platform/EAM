import React, { useState, useEffect } from 'react';
import {
  X,
  Folder,
  FolderRoot,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import type { DocFolder, DocInfo } from '../../types';
import { getDocumentFolderTree, moveDocumentFolder, moveDocument } from '../../api/documents';

interface MoveItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemToMove: { type: 'folder' | 'document'; data: DocFolder | DocInfo } | null;
  onSuccess: () => void;
}

export const MoveItemModal: React.FC<MoveItemModalProps> = ({
  isOpen,
  onClose,
  itemToMove,
  onSuccess,
}) => {
  const [folderTree, setFolderTree] = useState<DocFolder[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [loadingTree, setLoadingTree] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && itemToMove) {
      setError(null);
      setSelectedTargetId(null);
      loadTree();
    }
  }, [isOpen, itemToMove]);

  const loadTree = async () => {
    try {
      setLoadingTree(true);
      const tree = await getDocumentFolderTree(true);
      setFolderTree(tree);
      // Auto expand root level
      const rootIds = new Set<string>();
      tree.forEach((t) => rootIds.add(t.id));
      setExpandedFolderIds(rootIds);
    } catch (err: any) {
      setError('Failed to load folder hierarchy.');
    } finally {
      setLoadingTree(false);
    }
  };

  if (!isOpen || !itemToMove) return null;

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const isFolderDisabled = (folderId: string): boolean => {
    if (itemToMove.type === 'folder') {
      const currentFolder = itemToMove.data as DocFolder;
      if (folderId === currentFolder.id || folderId === currentFolder.parent_id) {
        return true;
      }
    }
    return false;
  };

  const renderTreeNodes = (nodes: DocFolder[], depth = 0) => {
    return nodes.map((node) => {
      const isExpanded = expandedFolderIds.has(node.id);
      const hasChildren = node.subfolders && node.subfolders.length > 0;
      const isSelected = selectedTargetId === node.id;
      const disabled = isFolderDisabled(node.id);

      return (
        <div key={node.id} className="space-y-0.5">
          <div
            onClick={() => {
              if (!disabled) setSelectedTargetId(node.id);
            }}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer ${
              disabled
                ? 'opacity-40 cursor-not-allowed bg-transparent text-gray-400'
                : isSelected
                ? 'bg-gray-900 text-white font-semibold shadow-xs'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => toggleExpand(node.id, e)}
                  className={`p-0.5 rounded hover:bg-black/10 ${isSelected ? 'text-white' : 'text-gray-400'}`}
                >
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              ) : (
                <span className="w-4.5" />
              )}
              <Folder className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-gray-500'}`} />
              <span className="truncate">{node.folder_name}</span>
            </div>
            {node.subfolders && node.subfolders.length > 0 && (
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
                {node.subfolders.length}
              </span>
            )}
          </div>

          {hasChildren && isExpanded && (
            <div className="space-y-0.5">
              {renderTreeNodes(node.subfolders!, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const handleMove = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      if (itemToMove.type === 'folder') {
        await moveDocumentFolder(itemToMove.data.id, selectedTargetId);
      } else {
        await moveDocument(itemToMove.data.id, selectedTargetId);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to move item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemName =
    itemToMove.type === 'folder'
      ? (itemToMove.data as DocFolder).folder_name
      : (itemToMove.data as DocInfo).file_name || (itemToMove.data as DocInfo).title;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-gray-100 px-5 bg-gray-50/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white shadow-xs shrink-0">
              <ArrowRight className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900 truncate">
                Move {itemToMove.type === 'folder' ? 'Folder' : 'File'}
              </h3>
              <p className="text-[11px] text-gray-500 truncate">
                Moving <span className="font-semibold text-gray-800 font-mono">{itemName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200/60 hover:text-gray-700 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tree Container */}
        <div className="p-5 flex-1 overflow-y-auto space-y-3">
          <p className="text-xs text-gray-600 font-medium">
            Select the destination folder in the workspace:
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/80 p-2.5 text-red-700 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Root Workspace Option */}
          <div
            onClick={() => setSelectedTargetId(null)}
            className={`flex items-center justify-between rounded-xl border p-2.5 text-xs transition-colors cursor-pointer ${
              selectedTargetId === null
                ? 'border-gray-900 bg-gray-900 text-white font-semibold shadow-xs'
                : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <FolderRoot className={`h-4 w-4 ${selectedTargetId === null ? 'text-white' : 'text-gray-600'}`} />
              <span>Workspace Root (Top Level)</span>
            </div>
            {selectedTargetId === null && <CheckCircle2 className="h-4 w-4 text-white" />}
          </div>

          {/* Hierarchy Folders Tree */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-2 max-h-64 overflow-y-auto space-y-0.5">
            {loadingTree ? (
              <div className="py-6 text-center text-xs text-gray-400">Loading folder tree...</div>
            ) : folderTree.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">No folders found.</div>
            ) : (
              renderTreeNodes(folderTree)
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-100 bg-gray-50/40 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleMove}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50 shadow-xs transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{isSubmitting ? 'Moving...' : 'Move Here'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
