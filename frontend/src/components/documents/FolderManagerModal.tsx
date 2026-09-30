import React, { useState } from 'react';
import {
  X,
  FolderPlus,
  Folder,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  FileCheck,
} from 'lucide-react';
import type { DocFolder } from '../../types';
import {
  createDocumentFolder,
  updateDocumentFolder,
  deleteDocumentFolder,
} from '../../api/documents';

interface FolderManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: DocFolder[];
  onFoldersChanged: () => void;
}

export const FolderManagerModal: React.FC<FolderManagerModalProps> = ({
  isOpen,
  onClose,
  folders,
  onFoldersChanged,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultSubPath, setDefaultSubPath] = useState('');
  const [allowedExtensions, setAllowedExtensions] = useState('');
  const [maxSizeMb, setMaxSizeMb] = useState(50);
  const [printThruVendor, setPrintThruVendor] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setFolderName('');
    setDescription('');
    setDefaultSubPath('');
    setAllowedExtensions('');
    setMaxSizeMb(50);
    setPrintThruVendor(false);
    setIsCreating(false);
    setEditingFolderId(null);
    setError(null);
  };

  const handleStartEdit = (f: DocFolder) => {
    setEditingFolderId(f.id);
    setFolderName(f.folder_name);
    setDescription(f.description || '');
    setDefaultSubPath(f.default_sub_path || '');
    setAllowedExtensions(f.allowed_extensions ? f.allowed_extensions.join(', ') : '');
    setMaxSizeMb(f.max_file_size_mb || 50);
    setPrintThruVendor(f.default_print_thru_vendor || false);
    setIsCreating(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const extList = allowedExtensions
      .split(',')
      .map((e) => e.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean);

    try {
      if (editingFolderId) {
        await updateDocumentFolder(editingFolderId, {
          description: description.trim() || undefined,
          default_sub_path: defaultSubPath.trim() || undefined,
          allowed_extensions: extList.length > 0 ? extList : undefined,
          max_file_size_mb: Number(maxSizeMb),
          default_print_thru_vendor: printThruVendor,
        });
      } else {
        if (!folderName.trim()) {
          throw new Error('Please specify a folder name code.');
        }
        await createDocumentFolder({
          folder_name: folderName.trim().toUpperCase(),
          description: description.trim() || undefined,
          default_sub_path: defaultSubPath.trim() || undefined,
          allowed_extensions: extList.length > 0 ? extList : undefined,
          max_file_size_mb: Number(maxSizeMb),
          default_print_thru_vendor: printThruVendor,
        });
      }
      onFoldersChanged();
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Failed to save folder');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (f: DocFolder) => {
    if (!window.confirm(`Delete folder category '${f.folder_name}'?`)) return;
    try {
      await deleteDocumentFolder(f.id);
      onFoldersChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to delete folder');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white">
              <Folder className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Document Folder Categories</h3>
              <p className="text-xs text-gray-500">
                Configure Maximo DOCTYPES, Volume Storage subpaths, and attachment size policies
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Form when Creating or Editing */}
          {(isCreating || editingFolderId) && (
            <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-900">
                  {editingFolderId ? `Edit Folder: ${folderName}` : 'Create New Document Folder'}
                </span>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Folder Code (DOCTYPE)
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingFolderId}
                    placeholder="e.g. INSPECTION_REPORTS"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900 bg-white uppercase font-mono disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Volume Sub-path
                  </label>
                  <input
                    type="text"
                    placeholder="eam/inspections"
                    value={defaultSubPath}
                    onChange={(e) => setDefaultSubPath(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900 bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ultrasonic inspection and non-destructive testing reports"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Allowed Extensions (Comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="pdf, png, jpg, dwg"
                    value={allowedExtensions}
                    onChange={(e) => setAllowedExtensions(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Max File Size (MB)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={maxSizeMb}
                    onChange={(e) => setMaxSizeMb(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900 bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="printThruVendor"
                  checked={printThruVendor}
                  onChange={(e) => setPrintThruVendor(e.target.checked)}
                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                />
                <label htmlFor="printThruVendor" className="text-xs text-gray-700 cursor-pointer">
                  Default Print Through Vendor (Include in Purchase Orders / RFQs)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-200/60">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{editingFolderId ? 'Save Changes' : 'Create Folder'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Folder List Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">Existing Categories ({folders.length})</span>
              {!isCreating && !editingFolderId && (
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 shadow-2xs"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  <span>New Category</span>
                </button>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50/75 text-gray-500 font-semibold border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2.5">Folder Code</th>
                    <th className="px-3 py-2.5">Volume Subpath</th>
                    <th className="px-3 py-2.5">Allowed Extensions</th>
                    <th className="px-3 py-2.5">Max Size</th>
                    <th className="px-3 py-2.5">Docs</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {folders.map((f) => (
                    <tr key={f.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <Folder className="h-4 w-4 text-gray-400" />
                          <div>
                            <span className="font-mono font-bold text-[11px] text-gray-900">
                              {f.folder_name}
                            </span>
                            {f.description && (
                              <p className="text-[10px] text-gray-500 truncate max-w-[180px]">
                                {f.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-gray-600">
                        {f.default_sub_path || 'eam/documents'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10px] text-gray-600">
                        {f.allowed_extensions && f.allowed_extensions.length > 0
                          ? f.allowed_extensions.join(', ')
                          : 'Any'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{f.max_file_size_mb} MB</td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                          {f.document_count ?? 0}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleStartEdit(f)}
                            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            title="Edit folder"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(f)}
                            className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Delete folder"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
