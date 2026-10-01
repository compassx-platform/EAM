import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Layers,
  HardDrive,
  Plus,
  Check,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Info,
  X,
  ShieldAlert,
} from 'lucide-react';
import {
  getSystemStorageConfig,
  updateSystemStorageConfig,
  getCompassXCatalogs,
  getCompassXVolumes,
  createCompassXVolume,
  type CompassXCatalog,
  type CompassXVolumeItem,
  type SystemStorageConfig,
} from '../../api/system';

export function StorageSettingsTab() {
  const [activeConfig, setActiveConfig] = useState<SystemStorageConfig | null>(null);
  const [catalogs, setCatalogs] = useState<CompassXCatalog[]>([]);
  const [volumes, setVolumes] = useState<CompassXVolumeItem[]>([]);

  const [selectedCatalogName, setSelectedCatalogName] = useState<string>('');
  const [selectedSchemaName, setSelectedSchemaName] = useState<string>('');
  const [selectedVolumeId, setSelectedVolumeId] = useState<string>('');

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [loadingVolumes, setLoadingVolumes] = useState(false);
  const [saving, setSaving] = useState(false);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // New Volume Creation Inline Form State
  const [isCreatingVolume, setIsCreatingVolume] = useState(false);
  const [newVolumeName, setNewVolumeName] = useState('');
  const [newVolumeDesc, setNewVolumeDesc] = useState('');
  const [creatingVolumeLoading, setCreatingVolumeLoading] = useState(false);
  const [createVolumeError, setCreateVolumeError] = useState<string | null>(null);

  // 1. Fetch catalogs from CompassX Platform
  const fetchCatalogs = useCallback(async () => {
    try {
      setLoadingCatalogs(true);
      setErrorMessage(null);
      const list = await getCompassXCatalogs();
      setCatalogs(list);

      // Only maintain selected catalog if it still exists in the fetched list, otherwise leave unselected
      setSelectedCatalogName((prev) => {
        if (prev && list.some((c) => c.name === prev)) return prev;
        return '';
      });
    } catch (err: any) {
      console.warn('Failed to fetch catalogs from CompassX:', err);
      setCatalogs([]);
    } finally {
      setLoadingCatalogs(false);
    }
  }, []);

  // 2. Fetch volumes for selected catalog & schema
  const fetchVolumes = useCallback(async (catName: string, schName: string) => {
    if (!catName || !schName) {
      setVolumes([]);
      setSelectedVolumeId('');
      return;
    }
    try {
      setLoadingVolumes(true);
      const list = await getCompassXVolumes(catName, schName);
      setVolumes(list);

      setSelectedVolumeId((prev) => {
        if (prev && list.some((v) => v.id === prev || v.name === prev)) {
          return prev;
        }
        if (activeConfig && activeConfig.is_configured && activeConfig.catalog_name === catName && activeConfig.schema_name === schName) {
          const match = list.find((v) => v.id === activeConfig.volume_id || v.name === activeConfig.volume_name);
          if (match) return match.id;
        }
        return '';
      });
    } catch (err: any) {
      console.error('Failed to fetch volumes:', err);
      setVolumes([]);
    } finally {
      setLoadingVolumes(false);
    }
  }, [activeConfig]);

  // 3. Load active system configuration on mount
  useEffect(() => {
    let isMounted = true;
    async function loadInitial() {
      try {
        setLoadingConfig(true);
        const [cfg, catList] = await Promise.all([
          getSystemStorageConfig(),
          getCompassXCatalogs().catch(() => []),
        ]);
        if (!isMounted) return;

        setActiveConfig(cfg);
        setCatalogs(catList);

        // Only select catalog, schema, volume if already configured!
        if (cfg.is_configured && cfg.catalog_name) {
          setSelectedCatalogName(cfg.catalog_name);
          setSelectedSchemaName(cfg.schema_name || '');
          setSelectedVolumeId(cfg.volume_id || '');
        } else {
          setSelectedCatalogName('');
          setSelectedSchemaName('');
          setSelectedVolumeId('');
        }
      } catch (err: any) {
        console.error('Failed to load system storage config:', err);
      } finally {
        if (isMounted) setLoadingConfig(false);
      }
    }
    loadInitial();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch volumes when catalog or schema changes
  useEffect(() => {
    if (selectedCatalogName && selectedSchemaName) {
      fetchVolumes(selectedCatalogName, selectedSchemaName);
    } else {
      setVolumes([]);
      setSelectedVolumeId('');
    }
  }, [selectedCatalogName, selectedSchemaName, fetchVolumes]);

  const currentCatalog = catalogs.find((c) => c.name === selectedCatalogName);
  const availableSchemas = currentCatalog?.schemas || [];
  const currentSchema = availableSchemas.find((s) => s.name === selectedSchemaName);
  const currentVolume = volumes.find((v) => v.id === selectedVolumeId || v.name === selectedVolumeId);

  const handleCatalogChange = (catName: string) => {
    setSelectedCatalogName(catName);
    setSelectedSchemaName('');
    setSelectedVolumeId('');
  };

  const handleSchemaChange = (schName: string) => {
    setSelectedSchemaName(schName);
    setSelectedVolumeId('');
  };

  // Determine if active volume is already configured and user is currently changing it
  const isCurrentlyConfigured = Boolean(activeConfig?.is_configured && activeConfig.volume_id);
  const isChangingConfiguredVolume = Boolean(
    isCurrentlyConfigured &&
    selectedVolumeId &&
    (selectedVolumeId !== activeConfig?.volume_id ||
     selectedCatalogName !== activeConfig?.catalog_name ||
     selectedSchemaName !== activeConfig?.schema_name)
  );

  const executeSaveConfig = async () => {
    if (!selectedCatalogName || !selectedSchemaName || !currentVolume) {
      setErrorMessage('Please select a catalog, schema, and document volume before saving.');
      return;
    }
    try {
      setSaving(true);
      setErrorMessage(null);
      const updated = await updateSystemStorageConfig({
        catalog_name: selectedCatalogName,
        schema_name: selectedSchemaName,
        volume_id: currentVolume.id,
        volume_name: currentVolume.name,
        storage_location: currentVolume.storage_location,
      });
      setActiveConfig(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save storage settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = () => {
    if (isChangingConfiguredVolume) {
      setShowConfirmModal(true);
    } else {
      executeSaveConfig();
    }
  };

  const handleCreateVolume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVolumeName.trim()) {
      setCreateVolumeError('Volume name is required.');
      return;
    }
    if (!selectedCatalogName || !selectedSchemaName) {
      setCreateVolumeError('Please select a target catalog and schema first.');
      return;
    }

    try {
      setCreatingVolumeLoading(true);
      setCreateVolumeError(null);
      const created = await createCompassXVolume({
        catalog_name: selectedCatalogName,
        schema_name: selectedSchemaName,
        name: newVolumeName.trim(),
        description: newVolumeDesc.trim(),
      });

      await fetchVolumes(selectedCatalogName, selectedSchemaName);
      setSelectedVolumeId(created.id);
      setIsCreatingVolume(false);
      setNewVolumeName('');
      setNewVolumeDesc('');
    } catch (err: any) {
      setCreateVolumeError(err.message || 'Failed to create volume');
    } finally {
      setCreatingVolumeLoading(false);
    }
  };

  const isCurrentActive =
    activeConfig?.catalog_name === selectedCatalogName &&
    activeConfig?.schema_name === selectedSchemaName &&
    (activeConfig?.volume_id === currentVolume?.id || activeConfig?.volume_name === currentVolume?.name);

  return (
    <div className="space-y-0 text-gray-800">
      {/* 0. Current Active Storage Status Banner */}
      <div className="mb-6">
        {isCurrentlyConfigured && activeConfig ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-gray-900">Active Storage Volume Configured</span>
              </div>
              <span className="text-[11px] text-gray-500 font-medium">
                {activeConfig.updated_at
                  ? `Configured ${new Date(activeConfig.updated_at).toLocaleDateString()}`
                  : 'Active'}
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="rounded-lg bg-white p-2.5 border border-gray-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wide">Catalog</span>
                <span className="font-semibold text-gray-900 mt-0.5 block truncate">{activeConfig.catalog_name}</span>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-gray-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wide">Schema</span>
                <span className="font-semibold text-gray-900 mt-0.5 block truncate">{activeConfig.schema_name}</span>
              </div>
              <div className="rounded-lg bg-white p-2.5 border border-gray-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wide">Volume</span>
                <span className="font-semibold text-gray-900 mt-0.5 block truncate">{activeConfig.volume_name || activeConfig.volume_id}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-gray-400" />
                <span className="text-xs font-semibold text-gray-800">Storage Volume Not Configured</span>
              </div>
              <span className="text-[11px] font-medium text-gray-600 bg-gray-200/60 px-2 py-0.5 rounded">
                Unconfigured
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
              No storage volume is currently linked. Document uploads and volume files require an active CompassX catalog, schema, and document volume to be selected and applied below.
            </p>
          </div>
        )}
      </div>

      {/* 1. Catalog Selection */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
        <div className="md:col-span-4">
          <h4 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-gray-500" />
            <span>Catalog</span>
          </h4>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Select an enterprise data catalog available from CompassX Platform
          </p>
        </div>
        <div className="md:col-span-8 max-w-lg">
          {loadingCatalogs ? (
            <div className="flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500">
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin text-gray-600" /> Loading catalogs from CompassX...
            </div>
          ) : catalogs.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-600 flex items-center justify-between">
              <span>No catalogs available from CompassX.</span>
              <button
                type="button"
                onClick={fetchCatalogs}
                className="text-xs font-medium text-gray-700 hover:text-gray-900 flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <select
                value={selectedCatalogName}
                onChange={(e) => handleCatalogChange(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 font-semibold focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 shadow-2xs"
              >
                <option value="">-- Select a catalog from CompassX --</option>
                {catalogs.map((cat) => (
                  <option key={cat.id || cat.name} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 2. Schema Selection */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
        <div className="md:col-span-4">
          <h4 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-gray-500" />
            <span>Schema</span>
          </h4>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Select the schema namespace under <span className="font-semibold text-gray-800">{selectedCatalogName || 'catalog'}</span>
          </p>
        </div>
        <div className="md:col-span-8 max-w-lg">
          {!selectedCatalogName ? (
            <div className="flex h-9 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400">
              Select a catalog first
            </div>
          ) : availableSchemas.length === 0 ? (
            <div className="flex h-9 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400">
              No schemas found under {selectedCatalogName}
            </div>
          ) : (
            <div className="space-y-1.5">
              <select
                value={selectedSchemaName}
                onChange={(e) => handleSchemaChange(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 font-semibold focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 shadow-2xs"
              >
                <option value="">-- Select a schema --</option>
                {availableSchemas.map((sch) => (
                  <option key={sch.id || sch.name} value={sch.name}>
                    {sch.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 3. Document Volume Selection & Add Volume Option */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
        <div className="md:col-span-4">
          <h4 className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5 text-gray-500" />
            <span>Document Volume</span>
          </h4>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Select or create storage volume for document attachments
          </p>
        </div>
        <div className="md:col-span-8 space-y-3 max-w-xl">
          {!selectedSchemaName ? (
            <div className="flex h-9 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400">
              Select a catalog and schema first
            </div>
          ) : loadingVolumes ? (
            <div className="flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500">
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin text-gray-600" /> Loading volumes from CompassX...
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={selectedVolumeId}
                  onChange={(e) => setSelectedVolumeId(e.target.value)}
                  disabled={volumes.length === 0}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 font-semibold focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 shadow-2xs disabled:opacity-50"
                >
                  <option value="">
                    {volumes.length === 0 ? '-- No volumes found in this schema --' : '-- Select a storage volume --'}
                  </option>
                  {volumes.map((vol) => (
                    <option key={vol.id || vol.name} value={vol.id}>
                      {vol.name}
                    </option>
                  ))}
                </select>

                {!isCreatingVolume && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingVolume(true);
                      setCreateVolumeError(null);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-2xs shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5 text-gray-600" />
                    <span>Add Volume</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Inline Volume Creation Form */}
          {isCreatingVolume && (
            <form onSubmit={handleCreateVolume} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 text-xs space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-gray-700" />
                  New Storage Volume under {selectedCatalogName} / {selectedSchemaName}
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreatingVolume(false)}
                  className="text-gray-400 hover:text-gray-600 text-xs p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {createVolumeError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
                  {createVolumeError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Volume Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. eam_production_documents"
                    value={newVolumeName}
                    onChange={(e) => setNewVolumeName(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Storage for plant files and attachments"
                    value={newVolumeDesc}
                    onChange={(e) => setNewVolumeDesc(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:border-gray-900 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreatingVolume(false)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingVolumeLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {creatingVolumeLoading ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  <span>Create Volume</span>
                </button>
              </div>
            </form>
          )}

          {/* Volume Change Warning Banner */}
          {isChangingConfiguredVolume && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-900 shadow-2xs space-y-1.5 animate-in fade-in">
              <div className="flex items-center gap-2 font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Warning: Changing Active Storage Volume</span>
              </div>
              <p className="text-[12px] text-amber-800 leading-relaxed">
                You are changing the active volume from{' '}
                <span className="font-semibold text-gray-900">{activeConfig?.volume_name || activeConfig?.volume_id}</span> to{' '}
                <span className="font-semibold text-gray-900">{currentVolume?.name || selectedVolumeId}</span>.
              </p>
              <p className="text-[12px] text-amber-800 leading-relaxed font-semibold">
                Changing this volume will stop showing all documents previously stored in{' '}
                {activeConfig?.volume_name || activeConfig?.volume_id} within the Documents module.
              </p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Previously uploaded files will remain stored in CompassX, but will no longer be visible or accessible within this workspace unless this volume is switched back.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Notifications / Feedback */}
      {errorMessage && (
        <div className="py-3">
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="py-3">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 animate-in fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="font-medium">Storage configuration updated and applied successfully!</span>
          </div>
        </div>
      )}

      {/* 4. Save Action */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 items-center">
        <div className="md:col-span-4">
          <h4 className="text-xs font-semibold text-gray-900">Save Changes</h4>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Apply selected catalog, schema, and document volume
          </p>
        </div>
        <div className="md:col-span-8 flex items-center justify-between">
          <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>Document uploads and viewing will be routed to the selected volume.</span>
          </div>

          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving || !selectedCatalogName || !selectedSchemaName || !selectedVolumeId || isCurrentActive}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs disabled:opacity-40 transition-all shrink-0 ml-4 ${
              isChangingConfiguredVolume
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-gray-900 hover:bg-gray-800'
            }`}
          >
            {saving ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : isChangingConfiguredVolume ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span>
              {isCurrentActive
                ? 'Active Storage Configured'
                : isChangingConfiguredVolume
                ? 'Switch Storage Volume'
                : 'Apply Storage Settings'}
            </span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal when Changing Active Volume */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-gray-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-100 p-2 text-amber-600 shrink-0 mt-0.5">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Confirm Storage Volume Switch
                </h3>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Changing the active volume will stop showing documents previously stored in{' '}
                  <span className="font-semibold text-gray-900">{activeConfig?.volume_name || activeConfig?.volume_id}</span>.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-gray-500">
                <span>Previous Active Volume:</span>
                <span className="font-medium text-gray-800">{activeConfig?.volume_name || activeConfig?.volume_id}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>New Target Volume:</span>
                <span className="font-semibold text-gray-900">{currentVolume?.name || selectedVolumeId}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Target Catalog / Schema:</span>
                <span className="font-medium text-gray-700">{selectedCatalogName} / {selectedSchemaName}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  executeSaveConfig();
                }}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors shadow-2xs"
              >
                {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                <span>Confirm & Switch Volume</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StorageSettingsTab;
