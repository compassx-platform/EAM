import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Folder,
  File,
  Plus,
  RefreshCw,
  FolderPlus,
  CheckCircle2,
  AlertCircle,
  Database,
  Layers,
  Calendar,
} from 'lucide-react';
import type { VolumeRead, VolumeFileInfo } from '../../types';
import {
  listVolumes,
  createVolume,
  createVolumeDirectory,
  listVolumeFiles,
} from '../../api/documents';

export const VolumeExplorerView: React.FC = () => {
  const [volumes, setVolumes] = useState<VolumeRead[]>([]);
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);
  const [files, setFiles] = useState<VolumeFileInfo[]>([]);
  const [subPath, setSubPath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [showNewVolModal, setShowNewVolModal] = useState(false);
  const [showNewDirModal, setShowNewDirModal] = useState(false);
  const [newVolName, setNewVolName] = useState('');
  const [newVolDesc, setNewVolDesc] = useState('');
  const [newDirName, setNewDirName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadVolumes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listVolumes();
      setVolumes(data);
      if (data.length > 0 && !selectedVolumeId) {
        setSelectedVolumeId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch volumes');
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async (volId: string, path = '') => {
    try {
      setLoadingFiles(true);
      setError(null);
      const fileData = await listVolumeFiles(volId, path || undefined);
      setFiles(fileData);
    } catch (err: any) {
      setError(err.message || 'Failed to list volume files');
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    loadVolumes();
  }, []);

  useEffect(() => {
    if (selectedVolumeId) {
      loadFiles(selectedVolumeId, subPath);
    }
  }, [selectedVolumeId, subPath]);

  const handleCreateVolume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVolName.trim()) return;
    try {
      setError(null);
      const created = await createVolume({
        name: newVolName.trim(),
        description: newVolDesc.trim(),
      });
      setNewVolName('');
      setNewVolDesc('');
      setShowNewVolModal(false);
      await loadVolumes();
      setSelectedVolumeId(created.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create volume');
    }
  };

  const handleCreateDirectory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVolumeId || !newDirName.trim()) return;
    try {
      setError(null);
      await createVolumeDirectory(selectedVolumeId, newDirName.trim(), subPath);
      setNewDirName('');
      setShowNewDirModal(false);
      await loadFiles(selectedVolumeId, subPath);
    } catch (err: any) {
      setError(err.message || 'Failed to create directory');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const selectedVolume = volumes.find((v) => v.id === selectedVolumeId);

  return (
    <div className="flex h-full flex-col min-h-0 bg-white">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-gray-200/80 px-5 py-3 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white shadow-xs">
            <HardDrive className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">CompassX Storage Volumes</h2>
            <p className="text-xs text-gray-500">
              Managed object/blob storage backend (S3 / Azure Blob / MinIO) for enterprise assets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              loadVolumes();
              if (selectedVolumeId) loadFiles(selectedVolumeId, subPath);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading || loadingFiles ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowNewVolModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-gray-800"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Volume</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="m-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Split Layout */}
      <div className="flex flex-1 min-h-0 divide-x divide-gray-200/80">
        {/* Left: Volumes List */}
        <div className="w-80 flex flex-col bg-gray-50/30">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Volumes ({volumes.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {volumes.map((v) => {
              const isSelected = v.id === selectedVolumeId;
              return (
                <div
                  key={v.id}
                  onClick={() => {
                    setSelectedVolumeId(v.id);
                    setSubPath('');
                  }}
                  className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                    isSelected
                      ? 'border-gray-900 bg-white shadow-xs'
                      : 'border-gray-200/80 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <HardDrive className={`h-4 w-4 ${isSelected ? 'text-gray-900' : 'text-gray-400'}`} />
                      <span className="text-xs font-bold text-gray-900 truncate max-w-[160px]">
                        {v.name}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="rounded-full bg-gray-900 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                        Active
                      </span>
                    )}
                  </div>
                  {v.description && (
                    <p className="mt-1 text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
                      {v.description}
                    </p>
                  )}
                  <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Database className="h-2.5 w-2.5" />
                      {v.catalog_name || 'eam_catalog'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers className="h-2.5 w-2.5" />
                      {v.schema_name || 'documents_schema'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Files & Directories Explorer */}
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          {selectedVolume ? (
            <>
              {/* Selected Volume Header & Breadcrumb */}
              <div className="px-6 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/20">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-900">{selectedVolume.name}</span>
                    <span className="font-mono text-[10px] text-gray-400">UUID: {selectedVolume.id}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span
                      onClick={() => setSubPath('')}
                      className="cursor-pointer hover:text-gray-900 font-medium"
                    >
                      root
                    </span>
                    {subPath && (
                      <>
                        <span>/</span>
                        <span className="font-mono text-gray-800">{subPath}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowNewDirModal(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs"
                  >
                    <FolderPlus className="h-3.5 w-3.5 text-gray-500" />
                    <span>New Folder</span>
                  </button>
                </div>
              </div>

              {/* Files Table */}
              <div className="flex-1 overflow-y-auto p-6">
                {loadingFiles ? (
                  <div className="flex h-32 items-center justify-center text-xs text-gray-400">
                    Loading volume storage index...
                  </div>
                ) : files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
                    <Folder className="h-8 w-8 text-gray-300" />
                    <p className="mt-2 text-xs font-bold text-gray-700">No indexed files in this path</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Upload documents from the Documents Library to store files in this volume.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50/75 text-gray-500 font-semibold border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-2.5">File Name / Path</th>
                          <th className="px-3 py-2.5">MIME Type</th>
                          <th className="px-3 py-2.5">Size</th>
                          <th className="px-3 py-2.5">Last Modified</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-700">
                        {files.map((file, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="px-4 py-2.5 font-medium text-gray-900">
                              <div className="flex items-center gap-2.5">
                                <File className="h-4 w-4 text-gray-400 shrink-0" />
                                <div>
                                  <p className="font-mono text-xs font-bold text-gray-900">
                                    {file.file_name}
                                  </p>
                                  <p className="font-mono text-[10px] text-gray-400">
                                    {file.file_path}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-gray-600">
                              {file.content_type}
                            </td>
                            <td className="px-3 py-2.5 text-gray-700">
                              {formatBytes(file.size_bytes)}
                            </td>
                            <td className="px-3 py-2.5 text-gray-500">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-gray-400" />
                                <span>
                                  {file.last_modified
                                    ? new Date(file.last_modified).toLocaleString()
                                    : 'N/A'}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-gray-400">
              Select a volume to explore files
            </div>
          )}
        </div>
      </div>

      {/* New Volume Modal */}
      {showNewVolModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Create New Storage Volume</h3>
            <form onSubmit={handleCreateVolume} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Volume Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. facility_drawings"
                  value={newVolName}
                  onChange={(e) => setNewVolName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Storage volume description..."
                  value={newVolDesc}
                  onChange={(e) => setNewVolDesc(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewVolModal(false)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Create</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Directory Modal */}
      {showNewDirModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Create Directory in Volume</h3>
            <form onSubmit={handleCreateDirectory} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Directory Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. electrical_2026"
                  value={newDirName}
                  onChange={(e) => setNewDirName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-900"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewDirModal(false)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Create Folder</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
