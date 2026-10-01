import React, { useState, useEffect } from 'react';
import {
  X,
  Edit2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { DocFolder, DocInfo } from '../../types';
import { updateDocumentFolder, renameDocument } from '../../api/documents';

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemToRename: { type: 'folder' | 'document'; data: DocFolder | DocInfo } | null;
  onSuccess: () => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  onClose,
  itemToRename,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && itemToRename) {
      if (itemToRename.type === 'folder') {
        setName((itemToRename.data as DocFolder).folder_name);
        setTitle('');
      } else {
        const doc = itemToRename.data as DocInfo;
        setName(doc.file_name);
        setTitle(doc.title);
      }
      setError(null);
    }
  }, [isOpen, itemToRename]);

  if (!isOpen || !itemToRename) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name cannot be empty.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      if (itemToRename.type === 'folder') {
        await updateDocumentFolder(itemToRename.data.id, {
          folder_name: name.trim(),
        });
      } else {
        await renameDocument(itemToRename.data.id, name.trim(), title.trim() || undefined);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to rename.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-gray-100 px-5 bg-gray-50/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white shadow-xs">
              <Edit2 className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-gray-900">
              Rename {itemToRename.type === 'folder' ? 'Folder' : 'File'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200/60 hover:text-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/80 p-2.5 text-red-700 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {itemToRename.type === 'folder' ? 'Folder Name' : 'File Name'}
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 shadow-2xs"
            />
          </div>

          {itemToRename.type === 'document' && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Display Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 shadow-2xs"
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50 shadow-xs transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{isSubmitting ? 'Saving...' : 'Rename'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
