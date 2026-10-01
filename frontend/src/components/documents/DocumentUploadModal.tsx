import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Link as LinkIcon,
  FileText,
  AlertCircle,
  CheckCircle2,
  Folder,
  Tag,
  Hash,
} from 'lucide-react';
import type { DocFolder, DocInfo } from '../../types';
import { uploadDocument, createUrlDocument } from '../../api/documents';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: DocFolder[];
  selectedFolderId?: string | null;
  volumeId?: string | null;
  initialMode?: 'upload' | 'url';
  onSuccess: (doc: DocInfo) => void;
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  folders,
  selectedFolderId,
  volumeId,
  initialMode = 'upload',
  onSuccess,
}) => {
  const [mode, setMode] = useState<'upload' | 'url'>(initialMode);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [folderId, setFolderId] = useState<string>(selectedFolderId || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [version, setVersion] = useState('1.0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setFolderId(selectedFolderId || '');
      setSelectedFile(null);
      setTitle('');
      setDescription('');
      setUrl('');
      setTagsInput('');
      setVersion('1.0');
      setError(null);
    }
  }, [isOpen, selectedFolderId, folders, initialMode]);

  if (!isOpen) return null;

  const currentFolder = folders.find((f) => f.id === folderId);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setError(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'upload') {
        if (!selectedFile) {
          throw new Error('Please select a file to upload.');
        }

        const formData = new FormData();
        formData.append('file', selectedFile);
        if (title.trim()) formData.append('title', title.trim());
        if (description.trim()) formData.append('description', description.trim());
        if (folderId) formData.append('folder_id', folderId);
        if (tagsInput.trim()) formData.append('tags', tagsInput.trim());
        if (version.trim()) formData.append('version', version.trim());
        formData.append('created_by', 'current_user');

        const selectedFolder = folders.find((f) => f.id === folderId);
        const effectiveVol = selectedFolder?.volume_id || volumeId;
        if (effectiveVol) {
          formData.append('volume_id', effectiveVol);
        }
        const effectiveSubPath = selectedFolder?.default_sub_path || selectedFolder?.folder_name;
        if (effectiveSubPath) {
          formData.append('sub_path', effectiveSubPath);
        }

        const doc = await uploadDocument(formData);
        onSuccess(doc);
        onClose();
      } else {
        if (!url.trim()) {
          throw new Error('Please enter a valid URL.');
        }
        if (!title.trim()) {
          throw new Error('Please provide a document title.');
        }

        const tags = tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        const doc = await createUrlDocument({
          title: title.trim(),
          url: url.trim(),
          description: description.trim() || undefined,
          folder_id: folderId || undefined,
          tags,
        });
        onSuccess(doc);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-gray-50/50">
          <div>
            <h3 className="text-base font-bold text-gray-900">Add New Document</h3>
            <p className="text-xs text-gray-500">
              Upload files to CompassX Blob Volume or register external reference links
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Selector */}
        <div className="flex border-b border-gray-100 bg-gray-50/30 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
              mode === 'upload'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload File to Volume</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
              mode === 'url'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            <span>External Web / Cloud URL</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'upload' ? (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Select File
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-gray-900 bg-gray-50'
                    : selectedFile
                    ? 'border-gray-300 bg-gray-50/50'
                    : 'border-gray-200 hover:border-gray-400 bg-gray-50/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {selectedFile ? (
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-bold text-gray-900 truncate max-w-[260px]">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Click or drop to replace
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                      <Upload className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-medium text-gray-700">
                      Drag & drop your file here, or{' '}
                      <span className="font-semibold text-gray-900 underline">browse</span>
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Supports PDF, CAD/DWG, Images, Office Docs & Archives
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                External Web / Cloud URL <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="url"
                  required
                  placeholder="https://cloud.storage.enterprise/drawings/schematic.pdf"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (!title && e.target.value) {
                      const parts = e.target.value.split('/');
                      setTitle(parts[parts.length - 1] || '');
                    }
                  }}
                  className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-hidden"
                />
              </div>
            </div>
          )}

          {/* Folder / Category Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Document Folder / Category
              </label>
              <div className="relative">
                <Folder className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-hidden bg-white"
                >
                  <option value="">Volume Root</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.folder_name} {f.description ? `(${f.description})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Version
              </label>
              <div className="relative">
                <Hash className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="1.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-hidden"
                />
              </div>
            </div>
          </div>

          {currentFolder && (
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5 text-[11px] text-gray-600 space-y-1">
              <div className="flex items-center justify-between">
                <span>Default Target Path:</span>
                <span className="font-mono font-medium text-gray-800">
                  {currentFolder.default_sub_path || 'eam/documents'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Max Size Limit:</span>
                <span className="font-medium text-gray-800">{currentFolder.max_file_size_mb} MB</span>
              </div>
              {currentFolder.allowed_extensions && currentFolder.allowed_extensions.length > 0 && (
                <div className="flex items-center justify-between">
                  <span>Allowed Types:</span>
                  <span className="font-mono text-[10px] text-gray-700">
                    {currentFolder.allowed_extensions.join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Title & Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Document Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Pump Overhaul Standard Operating Procedure"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Description / Remarks (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Provide context or notes about this document..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-hidden"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Tags (Comma-separated)
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="safety, manual, pump, 2026"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-hidden"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || (mode === 'upload' && !selectedFile) || (mode === 'url' && !url.trim())}
            className="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? (
              <span>Uploading to Volume...</span>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{mode === 'upload' ? 'Upload to CompassX' : 'Register Link'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
