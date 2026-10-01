import React, { useState, useEffect } from 'react';
import {
  X,
  FolderPlus,
  Folder,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sliders,
} from 'lucide-react';
import type { DocFolder } from '../../types';
import { createDocumentFolder } from '../../api/documents';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentFolder?: DocFolder | null;
  volumeId?: string | null;
  onFolderCreated: (newFolder: DocFolder) => void;
}

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  parentFolder,
  volumeId,
  onFolderCreated,
}) => {
  const [folderName, setFolderName] = useState('');
  const [description, setDescription] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [defaultSubPath, setDefaultSubPath] = useState('');
  const [allowedExtensions, setAllowedExtensions] = useState('');
  const [maxSizeMb, setMaxSizeMb] = useState(50);
  const [printThruVendor, setPrintThruVendor] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFolderName('');
      setDescription('');
      setShowAdvanced(false);
      setDefaultSubPath(parentFolder?.default_sub_path ? `${parentFolder.default_sub_path}/` : '');
      setAllowedExtensions('');
      setMaxSizeMb(parentFolder?.max_file_size_mb || 50);
      setPrintThruVendor(parentFolder?.default_print_thru_vendor || false);
      setError(null);
    }
  }, [isOpen, parentFolder]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) {
      setError('Folder name is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const extList = allowedExtensions
        .split(',')
        .map((ext) => ext.trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean);

      const created = await createDocumentFolder({
        folder_name: folderName.trim(),
        parent_id: parentFolder?.id || null,
        volume_id: volumeId || parentFolder?.volume_id || undefined,
        description: description.trim() || undefined,
        default_sub_path: showAdvanced && defaultSubPath.trim() ? defaultSubPath.trim() : undefined,
        allowed_extensions: extList.length > 0 ? extList : undefined,
        max_file_size_mb: Number(maxSizeMb),
        default_print_thru_vendor: printThruVendor,
      });

      onFolderCreated(created);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create folder.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-gray-100 px-5 bg-gray-50/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white shadow-xs">
              <FolderPlus className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                {parentFolder ? `New Subfolder in ${parentFolder.folder_name}` : 'New Root Folder'}
              </h3>
              <p className="text-[11px] text-gray-500">
                {parentFolder ? `Path: /${parentFolder.folder_name}/` : 'Root Workspace Directory'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200/60 hover:text-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50/80 p-3 text-red-700 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Folder Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Folder className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. Mechanical_Drawings or 2026_Q3"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2 text-xs font-medium text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 shadow-2xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Storage for equipment maintenance records"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 shadow-2xs"
            />
          </div>

          {/* Progressive Disclosure: Advanced Settings */}
          <div className="border-t border-gray-100 pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-900 transition-colors"
            >
              {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>Advanced Storage Policies & Whitelists</span>
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3 rounded-xl border border-gray-100 bg-gray-50/50 p-3.5 animate-in fade-in">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Default Storage Sub-Path
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. eam/drawings/cad"
                    value={defaultSubPath}
                    onChange={(e) => setDefaultSubPath(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Allowed Extensions
                    </label>
                    <input
                      type="text"
                      placeholder="pdf, png, dwg"
                      value={allowedExtensions}
                      onChange={(e) => setAllowedExtensions(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                      Max File Size (MB)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={maxSizeMb}
                      onChange={(e) => setMaxSizeMb(Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="printVendor"
                    checked={printThruVendor}
                    onChange={(e) => setPrintThruVendor(e.target.checked)}
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                  />
                  <label htmlFor="printVendor" className="text-[11px] text-gray-600 select-none">
                    Print / Dispatch through Vendor (PO / Contract Attachments)
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !folderName.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50 shadow-xs transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{isSubmitting ? 'Creating...' : 'Create Folder'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
