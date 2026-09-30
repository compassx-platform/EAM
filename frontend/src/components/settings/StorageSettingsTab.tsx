import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  FolderTree,
  HardDrive,
  Plus,
  Check,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Globe,
  Sparkles,
  Info,
  RotateCcw,
  Layers,
  Pencil,
  Trash2,
  Lock,
  Key,
} from 'lucide-react';
import {
  getSystemStorageConfig,
  updateSystemStorageConfig,
  getCompassXCatalogs,
  getCompassXVolumes,
  createCompassXVolume,
  getCompassXBaseUrl,
  type CompassXCatalog,
  type CompassXSchema,
  type CompassXVolumeItem,
  type SystemStorageConfig,
} from '../../api/system';

const LOCAL_STORAGE_OVERRIDE_KEY = 'compassx_custom_base_url';
const LOCAL_STORAGE_TOKEN_KEY = 'compassx_auth_token';

/**
 * Strips any trailing /api/v1/catalog path from an input URL so the user only sees and provides the Base URL.
 */
function cleanBaseUrl(url: string): string {
  if (!url) return '';
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v1\/catalog$/, '')
    .replace(/\/api\/v1$/, '')
    .replace(/\/api$/, '');
}

export function StorageSettingsTab() {
  const autoDetectedBaseUrl = useMemo(() => getCompassXBaseUrl(), []);

  // Read stored custom URL & Token from localStorage if any
  const initialCustomUrl = useMemo(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_OVERRIDE_KEY) || '';
    } catch {
      return '';
    }
  }, []);

  const initialAuthToken = useMemo(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }, []);

  const [activeConfig, setActiveConfig] = useState<SystemStorageConfig | null>(null);
  const [catalogs, setCatalogs] = useState<CompassXCatalog[]>([]);
  const [volumes, setVolumes] = useState<CompassXVolumeItem[]>([]);

  const [isOverriding, setIsOverriding] = useState<boolean>(Boolean(initialCustomUrl));
  const [baseUrlInput, setBaseUrlInput] = useState<string>(initialCustomUrl || autoDetectedBaseUrl);
  const [authTokenInput, setAuthTokenInput] = useState<string>(initialAuthToken);
  const [showTokenField, setShowTokenField] = useState<boolean>(Boolean(initialAuthToken));

  const [selectedCatalogName, setSelectedCatalogName] = useState<string>('');
  const [selectedSchemaName, setSelectedSchemaName] = useState<string>('');
  const [selectedVolumeId, setSelectedVolumeId] = useState<string>('');

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [loadingVolumes, setLoadingVolumes] = useState(false);
  const [saving, setSaving] = useState(false);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // New Volume Creation Modal / Inline Form State
  const [isCreatingVolume, setIsCreatingVolume] = useState(false);
  const [newVolumeName, setNewVolumeName] = useState('');
  const [newVolumeDesc, setNewVolumeDesc] = useState('');
  const [creatingVolumeLoading, setCreatingVolumeLoading] = useState(false);
  const [createVolumeError, setCreateVolumeError] = useState<string | null>(null);

  // 1. Load catalogs from the Base URL
  const fetchCatalogs = useCallback(async (targetBaseUrl?: string, targetToken?: string) => {
    const effectiveBase = cleanBaseUrl(targetBaseUrl || (isOverriding ? baseUrlInput : autoDetectedBaseUrl)) || autoDetectedBaseUrl;
    const effectiveToken = targetToken !== undefined ? targetToken : authTokenInput;
    try {
      setLoadingCatalogs(true);
      setCatalogError(null);
      setErrorMessage(null);
      const list = await getCompassXCatalogs(effectiveBase, effectiveToken);
      setCatalogs(list);

      // If current selected catalog not in list, auto-select first catalog
      if (list.length > 0) {
        setSelectedCatalogName((prev) => {
          const match = list.find((c) => c.name === prev);
          if (match) return match.name;
          const first = list[0];
          if (first.schemas && first.schemas.length > 0) {
            setSelectedSchemaName(first.schemas[0].name);
          } else {
            setSelectedSchemaName('');
          }
          return first.name;
        });
      }
    } catch (err: any) {
      console.warn('Failed to fetch catalogs from Base URL:', effectiveBase, err);
      setCatalogs([]);
      const msg = err.message || `Unable to reach CompassX catalog API at ${effectiveBase}`;
      setCatalogError(msg);
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
        setShowTokenField(true);
      }
      // NOTE: baseUrlInput is preserved! We NEVER reset the user's custom URL!
    } finally {
      setLoadingCatalogs(false);
    }
  }, [isOverriding, baseUrlInput, autoDetectedBaseUrl, authTokenInput]);

  // 2. Load volumes for selected catalog & schema
  const fetchVolumes = useCallback(async (catName: string, schName: string, targetBaseUrl?: string, targetToken?: string) => {
    if (!catName || !schName) {
      setVolumes([]);
      setSelectedVolumeId('');
      return;
    }
    const effectiveBase = cleanBaseUrl(targetBaseUrl || (isOverriding ? baseUrlInput : autoDetectedBaseUrl)) || autoDetectedBaseUrl;
    const effectiveToken = targetToken !== undefined ? targetToken : authTokenInput;
    try {
      setLoadingVolumes(true);
      const list = await getCompassXVolumes(catName, schName, effectiveBase, effectiveToken);
      setVolumes(list);

      // If previously selected volume exists in this list, retain it; otherwise select first or match active
      setSelectedVolumeId((prev) => {
        if (prev && list.some((v) => v.id === prev || v.name === prev)) {
          return prev;
        }
        if (activeConfig && activeConfig.catalog_name === catName && activeConfig.schema_name === schName) {
          const match = list.find((v) => v.id === activeConfig.volume_id || v.name === activeConfig.volume_name);
          if (match) return match.id;
        }
        return list.length > 0 ? list[0].id : '';
      });
    } catch (err: any) {
      console.error('Failed to fetch volumes:', err);
    } finally {
      setLoadingVolumes(false);
    }
  }, [isOverriding, baseUrlInput, autoDetectedBaseUrl, authTokenInput, activeConfig]);

  // 3. Load active config once on mount
  useEffect(() => {
    let isMounted = true;
    async function loadInitial() {
      try {
        setLoadingConfig(true);
        const cfg = await getSystemStorageConfig();
        if (!isMounted) return;
        setActiveConfig(cfg);
        if (cfg.catalog_name) setSelectedCatalogName(cfg.catalog_name);
        if (cfg.schema_name) setSelectedSchemaName(cfg.schema_name);
        if (cfg.volume_id) setSelectedVolumeId(cfg.volume_id);
        if (cfg.auth_token) {
          setAuthTokenInput(cfg.auth_token);
          setShowTokenField(true);
        }

        // Check if database has saved a custom endpoint URL
        if (cfg.endpoint_url) {
          const savedBase = cleanBaseUrl(cfg.endpoint_url);
          if (savedBase && savedBase !== autoDetectedBaseUrl) {
            setIsOverriding(true);
            setBaseUrlInput(savedBase);
            try {
              localStorage.setItem(LOCAL_STORAGE_OVERRIDE_KEY, savedBase);
            } catch {}
            fetchCatalogs(savedBase, cfg.auth_token || authTokenInput);
            return;
          }
        }

        // Otherwise check local storage
        const localCustom = localStorage.getItem(LOCAL_STORAGE_OVERRIDE_KEY);
        if (localCustom) {
          setIsOverriding(true);
          setBaseUrlInput(localCustom);
          fetchCatalogs(localCustom, authTokenInput);
          return;
        }

        // Default: auto-detected URL
        fetchCatalogs(autoDetectedBaseUrl, authTokenInput);
      } catch (err: any) {
        console.error('Failed to load system storage config:', err);
        if (isMounted) {
          fetchCatalogs(autoDetectedBaseUrl, authTokenInput);
        }
      } finally {
        if (isMounted) setLoadingConfig(false);
      }
    }
    loadInitial();
    return () => {
      isMounted = false;
    };
  }, [autoDetectedBaseUrl, fetchCatalogs, authTokenInput]);

  // Auto-fetch volumes when catalog or schema changes
  useEffect(() => {
    if (selectedCatalogName && selectedSchemaName) {
      fetchVolumes(selectedCatalogName, selectedSchemaName);
    } else {
      setVolumes([]);
      setSelectedVolumeId('');
    }
  }, [selectedCatalogName, selectedSchemaName, fetchVolumes]);

  // Selected catalog object & its dependent schemas
  const currentCatalog = catalogs.find((c) => c.name === selectedCatalogName);
  const availableSchemas = currentCatalog?.schemas || [];

  // Selected schema object
  const currentSchema = availableSchemas.find((s) => s.name === selectedSchemaName);

  // Selected volume object
  const currentVolume = volumes.find((v) => v.id === selectedVolumeId || v.name === selectedVolumeId);

  // Handle URL input change -> Stores it immediately in state & localStorage
  const handleUrlInputChange = (val: string) => {
    const cleaned = cleanBaseUrl(val);
    setBaseUrlInput(cleaned);
    setIsOverriding(true);
    try {
      if (cleaned) {
        localStorage.setItem(LOCAL_STORAGE_OVERRIDE_KEY, cleaned);
      } else {
        localStorage.removeItem(LOCAL_STORAGE_OVERRIDE_KEY);
      }
    } catch {}
  };

  // Handle Token input change -> Stores it immediately in state & localStorage
  const handleTokenInputChange = (val: string) => {
    const clean = val.trim();
    setAuthTokenInput(clean);
    try {
      if (clean) {
        localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, clean);
      } else {
        localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
      }
    } catch {}
  };

  // Handle Start Override Action
  const handleStartOverride = () => {
    setIsOverriding(true);
    if (!baseUrlInput || baseUrlInput === autoDetectedBaseUrl) {
      setBaseUrlInput(autoDetectedBaseUrl);
    }
  };

  // Handle Delete Override Action
  const handleDeleteOverride = async () => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_OVERRIDE_KEY);
      localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
    } catch {}
    setIsOverriding(false);
    setBaseUrlInput(autoDetectedBaseUrl);
    setAuthTokenInput('');
    setShowTokenField(false);
    setCatalogError(null);
    await fetchCatalogs(autoDetectedBaseUrl, '');
    if (selectedCatalogName && selectedSchemaName) {
      await fetchVolumes(selectedCatalogName, selectedSchemaName, autoDetectedBaseUrl, '');
    }
  };

  // Handle Catalog Change -> updates dependent Schemas and resets Volume
  const handleCatalogChange = (catName: string) => {
    setSelectedCatalogName(catName);
    const cat = catalogs.find((c) => c.name === catName);
    if (cat && cat.schemas && cat.schemas.length > 0) {
      setSelectedSchemaName(cat.schemas[0].name);
    } else {
      setSelectedSchemaName('');
    }
    setSelectedVolumeId('');
  };

  // Handle Schema Change -> updates dependent Volumes
  const handleSchemaChange = (schName: string) => {
    setSelectedSchemaName(schName);
    setSelectedVolumeId('');
  };

  // Handle Save
  const handleSaveConfig = async () => {
    if (!selectedCatalogName || !selectedSchemaName || !currentVolume) {
      setErrorMessage('Please select a catalog, schema, and document volume before saving.');
      return;
    }
    try {
      setSaving(true);
      setErrorMessage(null);
      const targetBase = isOverriding && baseUrlInput.trim() ? cleanBaseUrl(baseUrlInput) : autoDetectedBaseUrl;
      const updated = await updateSystemStorageConfig({
        catalog_name: selectedCatalogName,
        schema_name: selectedSchemaName,
        volume_id: currentVolume.id,
        volume_name: currentVolume.name,
        storage_location: currentVolume.storage_location,
        endpoint_url: isOverriding && baseUrlInput.trim() ? targetBase : undefined,
        auth_token: authTokenInput.trim() ? authTokenInput.trim() : null,
      }, targetBase, authTokenInput);
      setActiveConfig(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save storage settings');
    } finally {
      setSaving(false);
    }
  };

  // Handle New Volume Creation
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
      const targetBase = isOverriding && baseUrlInput.trim() ? cleanBaseUrl(baseUrlInput) : autoDetectedBaseUrl;
      const created = await createCompassXVolume({
        catalog_name: selectedCatalogName,
        schema_name: selectedSchemaName,
        name: newVolumeName.trim(),
        description: newVolumeDesc.trim(),
      }, targetBase, authTokenInput);

      // Refresh volumes list and select newly created volume
      await fetchVolumes(selectedCatalogName, selectedSchemaName, targetBase, authTokenInput);
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
    activeConfig?.volume_id === currentVolume?.id &&
    (isOverriding
      ? cleanBaseUrl(activeConfig?.endpoint_url || '') === cleanBaseUrl(baseUrlInput)
      : (!activeConfig?.endpoint_url || cleanBaseUrl(activeConfig?.endpoint_url) === autoDetectedBaseUrl));

  return (
    <div className="space-y-0">
      {/* 1. CompassX Base URL Input (Auto-detected read-only with Override & Delete actions) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
        <div className="md:col-span-4">
          <h4 className="text-xs font-semibold text-gray-900">CompassX Base URL</h4>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Auto-detected domain from browser origin. You can provide a custom Base URL or reset to default.
          </p>
        </div>
        <div className="md:col-span-8 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 max-w-xl">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                {isOverriding ? (
                  <Globe className="h-3.5 w-3.5 text-purple-600" />
                ) : (
                  <Lock className="h-3.5 w-3.5 text-gray-400" />
                )}
              </div>
              <input
                type="text"
                value={baseUrlInput}
                readOnly={!isOverriding}
                onChange={(e) => handleUrlInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isOverriding) {
                    fetchCatalogs(baseUrlInput, authTokenInput);
                  }
                }}
                placeholder={isOverriding ? 'e.g. 135.13.180.167.nip.io' : autoDetectedBaseUrl || 'http://compassx.io'}
                className={`w-full rounded-lg border pl-9 pr-36 py-2 text-xs font-mono transition-colors shadow-2xs ${
                  isOverriding
                    ? 'border-purple-300 bg-white text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500'
                    : 'border-gray-200 bg-gray-50/80 text-gray-600 cursor-default select-all'
                }`}
              />
              <div className="absolute inset-y-0 right-1.5 flex items-center">
                {isOverriding ? (
                  <span className="rounded bg-purple-50 border border-purple-200 px-1.5 py-0.5 font-mono text-[9px] font-bold text-purple-700">
                    Custom Stored
                  </span>
                ) : (
                  <span className="rounded bg-gray-200/70 border border-gray-300/60 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-gray-600">
                    Auto-Detected (Read-Only)
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isOverriding ? (
                <>
                  <button
                    type="button"
                    onClick={handleDeleteOverride}
                    title="Delete custom override and revert to browser auto-detected Base URL"
                    className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors shadow-2xs"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    <span>Delete Override</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      fetchCatalogs(baseUrlInput, authTokenInput);
                      if (selectedCatalogName && selectedSchemaName) {
                        fetchVolumes(selectedCatalogName, selectedSchemaName, baseUrlInput, authTokenInput);
                      }
                    }}
                    disabled={loadingCatalogs || loadingVolumes}
                    title="Connect and fetch catalogs from this custom Base URL"
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-purple-700 transition-colors shadow-2xs"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingCatalogs || loadingVolumes ? 'animate-spin text-purple-600' : 'text-gray-500'}`} />
                    <span>Fetch</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleStartOverride}
                    title="Override Base URL with a custom endpoint"
                    className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-blue-700 transition-colors shadow-2xs"
                  >
                    <Pencil className="h-3.5 w-3.5 text-gray-500" />
                    <span>Override URL</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      fetchCatalogs(autoDetectedBaseUrl, authTokenInput);
                      if (selectedCatalogName && selectedSchemaName) {
                        fetchVolumes(selectedCatalogName, selectedSchemaName, autoDetectedBaseUrl, authTokenInput);
                      }
                    }}
                    disabled={loadingCatalogs || loadingVolumes}
                    title="Refresh catalogs from auto-detected Base URL"
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:text-blue-700 transition-colors shadow-2xs"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingCatalogs || loadingVolumes ? 'animate-spin text-blue-600' : 'text-gray-500'}`} />
                    <span>Fetch</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Optional Access Token Field (Auto-revealed on 401 or user toggle) */}
          {(showTokenField || isOverriding || Boolean(catalogError?.includes('401'))) && (
            <div className="pt-1 max-w-xl animate-in fade-in">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-gray-700 flex items-center gap-1">
                  <Key className="h-3 w-3 text-gray-500" />
                  <span>API / Access Token</span>
                  <span className="text-[10px] font-normal text-gray-400">(Required if instance returns 401 Unauthorized)</span>
                </label>
                {authTokenInput && (
                  <button
                    type="button"
                    onClick={() => handleTokenInputChange('')}
                    className="text-[10px] text-gray-400 hover:text-red-600"
                  >
                    Clear Token
                  </button>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Key className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={authTokenInput}
                  onChange={(e) => handleTokenInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      fetchCatalogs(baseUrlInput, authTokenInput);
                    }
                  }}
                  placeholder="Paste your CompassX Bearer Token or JWT..."
                  className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-24 py-1.5 text-xs font-mono text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none shadow-2xs"
                />
                <div className="absolute inset-y-0 right-1.5 flex items-center">
                  <span className="rounded bg-gray-100 border border-gray-200 px-1.5 py-0.5 font-mono text-[9px] font-medium text-gray-600">
                    Bearer Token
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            <span>Detected browser main domain:</span>
            <code className="font-mono text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
              {autoDetectedBaseUrl || 'localhost'}
            </code>
            <span className="text-gray-300">•</span>
            <span className="text-gray-400">Fixed internal endpoint:</span>
            <span className="font-mono text-gray-500">/api/v1/catalog</span>
          </div>
        </div>
      </div>

      {/* 2. Catalog Dropdown (Fetched from CompassX Base URL) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
        <div className="md:col-span-4">
          <h4 className="text-xs font-semibold text-gray-900">Catalog</h4>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Select the enterprise data catalog fetched from CompassX
          </p>
        </div>
        <div className="md:col-span-8 max-w-lg">
          {loadingCatalogs ? (
            <div className="flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500">
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin text-blue-600" /> Loading catalogs...
            </div>
          ) : catalogError ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="font-semibold text-amber-900">
                    {catalogError.includes('401') || catalogError.toLowerCase().includes('unauthorized')
                      ? 'Authentication Required (401 Unauthorized)'
                      : 'Unable to Fetch Catalogs'}
                  </div>
                  <div className="text-[11px] text-amber-800 break-all">{catalogError}</div>
                  <div className="text-[11px] text-gray-600 pt-0.5">
                    {catalogError.includes('401') || catalogError.toLowerCase().includes('unauthorized')
                      ? 'Your Base URL was reached successfully, but this endpoint requires an Access Token. Please paste your token in the API Access Token field above and click Retry Fetch.'
                      : `Your Base URL (${baseUrlInput}) remains stored. Check connectivity and click Retry Fetch.`}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  onClick={() => fetchCatalogs(baseUrlInput, authTokenInput)}
                  className="flex items-center gap-1 rounded-md bg-white border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100/60 shadow-2xs"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Retry Fetch</span>
                </button>
              </div>
            </div>
          ) : catalogs.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              No catalogs found from CompassX Base URL. Check the URL and click Fetch.
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="relative">
                <select
                  value={selectedCatalogName}
                  onChange={(e) => handleCatalogChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 font-semibold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                >
                  {catalogs.map((cat) => (
                    <option key={cat.id || cat.name} value={cat.name}>
                      {cat.name} {cat.catalog_type ? `(${cat.catalog_type})` : ''} — {cat.schemas?.length || 0} schemas
                    </option>
                  ))}
                </select>
              </div>

              {currentCatalog && (
                <p className="text-[11px] text-gray-500 truncate" title={currentCatalog.description || ''}>
                  {currentCatalog.description || `Catalog type: ${currentCatalog.catalog_type || 'standard'}`}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. Schema Dropdown (Depends directly on selected Catalog) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
        <div className="md:col-span-4">
          <h4 className="text-xs font-semibold text-gray-900">Schema</h4>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Select the schema namespace under <span className="font-semibold text-gray-800">{selectedCatalogName || 'selected catalog'}</span>
          </p>
        </div>
        <div className="md:col-span-8 max-w-lg">
          {availableSchemas.length === 0 ? (
            <div className="flex h-9 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-400">
              {selectedCatalogName ? `No schemas found under ${selectedCatalogName}` : 'Select a catalog first'}
            </div>
          ) : (
            <div className="space-y-1.5">
              <select
                value={selectedSchemaName}
                onChange={(e) => handleSchemaChange(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 font-semibold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              >
                {availableSchemas.map((sch) => (
                  <option key={sch.id || sch.name} value={sch.name}>
                    {sch.name} {sch.table_count !== undefined ? `(${sch.table_count} tables)` : ''}
                  </option>
                ))}
              </select>

              {currentSchema?.description && (
                <p className="text-[11px] text-gray-500 truncate">
                  {currentSchema.description}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Document / Volume Dropdown (Depends directly on selected Catalog & Schema) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
        <div className="md:col-span-4">
          <h4 className="text-xs font-semibold text-gray-900">Document Volume</h4>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Select the storage volume under <span className="font-mono text-gray-700">{selectedCatalogName}/{selectedSchemaName}</span>
          </p>
        </div>
        <div className="md:col-span-8 space-y-3 max-w-xl">
          {loadingVolumes ? (
            <div className="flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-500">
              <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin text-blue-600" /> Loading volumes...
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={selectedVolumeId}
                  onChange={(e) => setSelectedVolumeId(e.target.value)}
                  disabled={volumes.length === 0}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 font-semibold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs disabled:opacity-50"
                >
                  {volumes.length === 0 ? (
                    <option value="">No volumes found in this schema</option>
                  ) : (
                    volumes.map((vol) => (
                      <option key={vol.id || vol.name} value={vol.id}>
                        {vol.name} {activeConfig?.volume_id === vol.id ? '(Active Target)' : ''}
                      </option>
                    ))
                  )}
                </select>

                {!isCreatingVolume && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingVolume(true);
                      setCreateVolumeError(null);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors shadow-2xs shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5 text-blue-600" />
                    <span>New Volume</span>
                  </button>
                )}
              </div>

              {/* Volume Details pill */}
              {currentVolume && (
                <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-2.5 text-[11px] font-mono text-gray-700 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900">{currentVolume.name}</span>
                    <span className="text-[10px] text-gray-400">ID: {currentVolume.id}</span>
                  </div>
                  {currentVolume.description && (
                    <div className="text-gray-500 font-sans text-xs">{currentVolume.description}</div>
                  )}
                  {currentVolume.storage_location && (
                    <div className="text-[10px] text-gray-500 truncate pt-0.5">
                      <span className="text-gray-400">Location:</span> {currentVolume.storage_location}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Inline Volume Creation Form */}
          {isCreatingVolume && (
            <form onSubmit={handleCreateVolume} className="rounded-xl border border-blue-200 bg-blue-50/20 p-4 text-xs space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-blue-950 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  New Storage Volume under {selectedCatalogName} / {selectedSchemaName}
                </span>
                <button
                  type="button"
                  onClick={() => setIsCreatingVolume(false)}
                  className="text-gray-400 hover:text-gray-600 text-xs"
                >
                  Cancel
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
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Primary blob storage for plant documents"
                    value={newVolumeDesc}
                    onChange={(e) => setNewVolumeDesc(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
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
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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
        </div>
      </div>

      {/* 5. Active System Storage Target Overview */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 border-b border-gray-100 items-start">
        <div className="md:col-span-4">
          <h4 className="text-xs font-semibold text-gray-900">Active Storage Target</h4>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Current active global storage target for documents and attachments
          </p>
        </div>
        <div className="md:col-span-8">
          {activeConfig ? (
            <div className="rounded-xl border border-gray-200/80 bg-gray-50/50 p-3.5 text-xs space-y-2 max-w-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                  <span className="font-semibold text-gray-900">Configured Target</span>
                  {activeConfig.is_configured ? (
                    <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-200/80 px-2 py-0.5 font-mono text-[10px] font-medium text-gray-700">
                      Default Fallback
                    </span>
                  )}
                </div>

                {activeConfig.configured_at && (
                  <span className="text-[10px] text-gray-400 font-mono">
                    Updated: {new Date(activeConfig.configured_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] pt-1">
                <div className="rounded-lg border border-gray-200 bg-white p-2">
                  <span className="block text-[9px] uppercase font-bold text-gray-400">Catalog</span>
                  <span className="font-semibold text-gray-800 truncate block">{activeConfig.catalog_name}</span>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-2">
                  <span className="block text-[9px] uppercase font-bold text-gray-400">Schema</span>
                  <span className="font-semibold text-gray-800 truncate block">{activeConfig.schema_name}</span>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-2">
                  <span className="block text-[9px] uppercase font-bold text-gray-400">Volume</span>
                  <span className="font-semibold text-gray-800 truncate block" title={activeConfig.volume_id}>
                    {activeConfig.volume_name}
                  </span>
                </div>
              </div>

              {activeConfig.endpoint_url && (
                <div className="text-[10px] font-mono text-gray-500 truncate pt-1">
                  <span className="text-gray-400">Base URL:</span> {cleanBaseUrl(activeConfig.endpoint_url)}
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-400">Loading active configuration...</span>
          )}
        </div>
      </div>

      {/* Notifications / Alerts */}
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
            <span className="font-medium">System storage configuration updated and applied successfully!</span>
          </div>
        </div>
      )}

      {/* 6. Save Action */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-5 items-center">
        <div className="md:col-span-4">
          <h4 className="text-xs font-semibold text-gray-900">Save Changes</h4>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Apply selected catalog, schema, document volume, base URL, and credentials
          </p>
        </div>
        <div className="md:col-span-8 flex items-center justify-between">
          <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span>Setting this volume will direct all new document uploads to this location.</span>
          </div>

          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving || !currentVolume || isCurrentActive}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-40 transition-all shrink-0 ml-4"
          >
            {saving ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span>{isCurrentActive ? 'Active Storage Configured' : 'Apply Storage Settings'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
