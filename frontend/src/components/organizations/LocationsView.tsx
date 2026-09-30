import React, { useState, useEffect, useCallback } from 'react';
import {
  MapPin,
  Building2,
  Search,
  Plus,
  RefreshCw,
  FolderTree,
  Edit2,
  Trash2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  X,
  Check,
  Cpu,
  Tag,
} from 'lucide-react';
import { api } from '../../api/client';
import type { Location, Site, Organization, LocationType, LocationStatus } from '../../types';
import { InfoTooltip } from '../people/InfoTooltip';
import { InstanceSpecificationsInspector } from './InstanceSpecificationsInspector';

interface LocationsViewProps {
  onNavigateToHierarchy?: () => void;
}

const getLocationTypeBadge = (type: string) => {
  switch (type?.toUpperCase()) {
    case 'OPERATING':
      return { bg: 'bg-blue-50 text-blue-700 border-blue-200/70', label: 'Operating' };
    case 'STOREROOM':
      return { bg: 'bg-purple-50 text-purple-700 border-purple-200/70', label: 'Storeroom' };
    case 'HOLDING':
      return { bg: 'bg-amber-50 text-amber-700 border-amber-200/70', label: 'Holding' };
    case 'SALVAGE':
      return { bg: 'bg-rose-50 text-rose-700 border-rose-200/70', label: 'Salvage' };
    case 'VENDOR':
      return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/70', label: 'Vendor' };
    case 'REPAIR':
      return { bg: 'bg-cyan-50 text-cyan-700 border-cyan-200/70', label: 'Repair' };
    default:
      return { bg: 'bg-gray-100 text-gray-600 border-gray-200', label: type || 'Location' };
  }
};

const getStatusBadge = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'OPERATING':
    case 'ACTIVE':
      return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Operating' };
    case 'NOT_READY':
      return { bg: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Not Ready' };
    case 'DECOMMISSIONED':
      return { bg: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Decommissioned' };
    default:
      return { bg: 'bg-slate-100 text-slate-700 border-slate-200', label: status || 'Unknown' };
  }
};

export const LocationsView: React.FC<LocationsViewProps> = ({ onNavigateToHierarchy }) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingLoc, setEditingLoc] = useState<Partial<Location> | null>(null);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const [locs, sList] = await Promise.all([
        api.listLocations({
          site_id: siteFilter === 'ALL' ? undefined : siteFilter,
          type: typeFilter === 'ALL' ? undefined : typeFilter,
          search: search.trim() || undefined,
        }),
        api.listSites(),
      ]);
      setLocations(locs);
      setSites(sList);
    } catch (err) {
      console.error('Failed to load locations:', err);
    } finally {
      setLoading(false);
    }
  }, [siteFilter, typeFilter, search]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const handleDelete = async (siteId: string, locationId: string) => {
    if (!window.confirm(`Are you sure you want to delete Location "${locationId}" in Site "${siteId}"?`)) {
      return;
    }
    try {
      await api.deleteLocation(siteId, locationId);
      fetchLocations();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete location.');
    }
  };

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden bg-slate-50/50">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 bg-white px-6 py-3.5 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search locations, descriptions, GL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-64 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-800 placeholder-gray-400 focus:border-sky-500 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Site Filter */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>Site:</span>
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-700 focus:border-sky-500 focus:outline-none"
            >
              <option value="ALL">All Sites</option>
              {sites.map((s) => (
                <option key={s.site_id} value={s.site_id}>
                  {s.site_id} ({s.name})
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-700 focus:border-sky-500 focus:outline-none"
            >
              <option value="ALL">All Types</option>
              <option value="OPERATING">Operating</option>
              <option value="STOREROOM">Storeroom</option>
              <option value="HOLDING">Holding</option>
              <option value="SALVAGE">Salvage</option>
              <option value="VENDOR">Vendor</option>
              <option value="REPAIR">Repair</option>
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {onNavigateToHierarchy && (
            <button
              onClick={onNavigateToHierarchy}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-100 transition-colors shadow-2xs"
            >
              <FolderTree className="h-3.5 w-3.5" />
              <span>Tree Drilldown View</span>
            </button>
          )}

          <button
            onClick={() => {
              setModalMode('create');
              setEditingLoc({
                site_id: sites[0]?.site_id || 'BEDFORD',
                type: 'OPERATING',
                status: 'OPERATING',
              });
              setIsModalOpen(true);
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-sky-700 px-3.5 text-xs font-semibold text-white hover:bg-sky-800 transition-colors shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>+ New Location</span>
          </button>

          <button
            onClick={fetchLocations}
            title="Refresh locations"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Locations Table Surface */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-sky-600" />
          </div>
        ) : locations.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
            <MapPin className="h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-gray-700">No Locations Found</p>
            <p className="text-xs text-gray-500 max-w-sm mt-1">
              Create your first operating location, storeroom, or work area in one of your active sites.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-slate-50/80 text-[11px] font-semibold text-gray-600">
                <tr>
                  <th className="px-4 py-3">Location ID</th>
                  <th className="px-4 py-3">Site / Org</th>
                  <th className="px-4 py-3">Classification</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Parent Location</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">GL Account</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {locations.map((loc) => {
                  const typeBadge = getLocationTypeBadge(loc.type);
                  const statusBadge = getStatusBadge(loc.status);
                  return (
                    <tr
                      key={`${loc.site_id}-${loc.location_id}`}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono font-bold text-gray-900">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                          <span>{loc.location_id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 font-mono text-gray-700">
                          <span className="font-semibold">{loc.site_id}</span>
                          <span className="text-gray-400">/</span>
                          <span className="text-gray-500 text-[10px]">{loc.org_id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {loc.classification_path || loc.classstructure_id ? (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 font-medium">
                            <Tag className="h-3 w-3 text-sky-600 shrink-0" />
                            <span className="truncate max-w-[140px]">{loc.classification_path || loc.classstructure_id}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400 italic text-[11px]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                        {loc.description || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-600">
                        {loc.parent_location_id || (
                          <span className="text-gray-400 italic text-[11px]">Root</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold border ${typeBadge.bg}`}
                        >
                          {typeBadge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold border ${statusBadge.bg}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-600">
                        {loc.gl_account || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setModalMode('edit');
                              setEditingLoc(loc);
                              setIsModalOpen(true);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                            title="Edit Location"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(loc.site_id, loc.location_id)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                            title="Delete Location"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / Create Modal */}
      {isModalOpen && editingLoc && (
        <LocationDirectModal
          mode={modalMode}
          initialData={editingLoc}
          sites={sites}
          onClose={() => {
            setIsModalOpen(false);
            setEditingLoc(null);
          }}
          onSaved={() => {
            setIsModalOpen(false);
            setEditingLoc(null);
            fetchLocations();
          }}
        />
      )}
    </div>
  );
};

// ============================================================================
// Internal Modal
// ============================================================================

interface LocationDirectModalProps {
  mode: 'create' | 'edit';
  initialData: Partial<Location>;
  sites: Site[];
  onClose: () => void;
  onSaved: () => void;
}

const LocationDirectModal: React.FC<LocationDirectModalProps> = ({
  mode,
  initialData,
  sites,
  onClose,
  onSaved,
}) => {
  const [siteId, setSiteId] = useState(initialData.site_id || sites[0]?.site_id || 'BEDFORD');
  const [locationId, setLocationId] = useState(initialData.location_id || '');
  const [parentLocationId, setParentLocationId] = useState(initialData.parent_location_id || '');
  const [description, setDescription] = useState(initialData.description || '');
  const [type, setType] = useState<LocationType>(initialData.type || 'OPERATING');
  const [status, setStatus] = useState<LocationStatus>(initialData.status || 'OPERATING');
  const [glAccount, setGlAccount] = useState(initialData.gl_account || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationId.trim() || !siteId) return;

    setSaving(true);
    setError(null);
    try {
      if (mode === 'create') {
        await api.createLocation({
          location_id: locationId.trim().toUpperCase(),
          site_id: siteId,
          parent_location_id: parentLocationId.trim() ? parentLocationId.trim().toUpperCase() : null,
          description: description.trim() || undefined,
          type,
          status,
          gl_account: glAccount.trim() || undefined,
        });
      } else {
        await api.updateLocation(initialData.site_id!, initialData.location_id!, {
          description: description.trim() || undefined,
          parent_location_id: parentLocationId.trim() ? parentLocationId.trim().toUpperCase() : null,
          type,
          status,
          gl_account: glAccount.trim() || undefined,
        });
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Failed to save location.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <MapPin className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-gray-900">
              {mode === 'create' ? 'Create New Location' : `Edit Location: ${initialData.location_id}`}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Site <span className="text-rose-500">*</span>
              </label>
              <select
                value={siteId}
                disabled={mode === 'edit'}
                onChange={(e) => setSiteId(e.target.value)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 disabled:bg-gray-100 focus:border-sky-500 focus:outline-none"
              >
                {sites.map((s) => (
                  <option key={s.site_id} value={s.site_id}>
                    {s.site_id} ({s.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Location ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={mode === 'edit'}
                placeholder="e.g. MECH_ROOM_101"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value.toUpperCase())}
                className="h-8 w-full font-mono rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 disabled:bg-gray-100 focus:border-sky-500 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Description / Area Name
            </label>
            <input
              type="text"
              placeholder="e.g. Primary Boiler Mechanical Room"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Parent Location ID
              </label>
              <input
                type="text"
                placeholder="Optional parent (e.g. BLDG_01)"
                value={parentLocationId}
                onChange={(e) => setParentLocationId(e.target.value.toUpperCase())}
                className="h-8 w-full font-mono rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Location Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as LocationType)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="OPERATING">OPERATING</option>
                <option value="STOREROOM">STOREROOM</option>
                <option value="HOLDING">HOLDING</option>
                <option value="SALVAGE">SALVAGE</option>
                <option value="VENDOR">VENDOR</option>
                <option value="REPAIR">REPAIR</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LocationStatus)}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              >
                <option value="OPERATING">OPERATING</option>
                <option value="NOT_READY">NOT READY</option>
                <option value="DECOMMISSIONED">DECOMMISSIONED</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                GL Account Code
              </label>
              <input
                type="text"
                placeholder="e.g. 6100-001"
                value={glAccount}
                onChange={(e) => setGlAccount(e.target.value)}
                className="h-8 w-full font-mono rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Specifications Inspector in Edit Mode */}
          {mode === 'edit' && initialData.site_id && initialData.location_id && (
            <div className="pt-2">
              <InstanceSpecificationsInspector
                targetType="location"
                siteId={initialData.site_id}
                instanceId={initialData.location_id}
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-lg border border-gray-200 px-4 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-sky-700 px-4 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              <span>{mode === 'create' ? 'Create Location' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
