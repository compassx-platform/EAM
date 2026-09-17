import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  RefreshCw,
  Layers,
  ClipboardList,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  FileText,
  Wrench,
  Truck,
  Cpu,
  Tag,
  Box,
  Pencil,
  Trash2,
  GitBranch,
  PenTool,
  PlayCircle,
  Search,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { api } from '../../api/client';
import { navigate, useHashRoute } from '../../lib/router';
import type { EntityTypeDefinition } from '../../types';

const ICON_MAP: Record<string, typeof Layers> = {
  ClipboardList,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  FileText,
  Wrench,
  Truck,
  Cpu,
  Tag,
  Box,
  Layers,
};

const ICON_COLORS: Record<string, string> = {
  workorder: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  permit: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  pm_schedule: 'text-teal-600 bg-teal-50 border-teal-200',
  incident: 'text-rose-600 bg-rose-50 border-rose-200',
  asset: 'text-blue-600 bg-blue-50 border-blue-200',
};

export function EntitiesView() {
  const route = useHashRoute();
  const [entityTypes, setEntityTypes] = useState<EntityTypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .listEntityTypes()
      .then((data) => setEntityTypes(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredEntities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entityTypes;
    return entityTypes.filter(
      (et) =>
        et.display_name.toLowerCase().includes(q) ||
        et.name.toLowerCase().includes(q) ||
        (et.description && et.description.toLowerCase().includes(q))
    );
  }, [entityTypes, search]);

  const handleDelete = async (et: EntityTypeDefinition) => {
    if (et.is_system) {
      alert('System entity types (Work Order, Permit, PM Schedule) cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete entity type "${et.display_name}" (${et.name})? All associated fields, form layouts, workflows, and records will be deleted.`)) {
      return;
    }

    setDeleting(et.name);
    try {
      await api.deleteEntityType(et.name);
      loadData();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden">
      {/* Surface Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-white px-6 py-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Layers className="h-5 w-5 text-blue-700" />
              <span>Entity Management</span>
            </h1>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-600">
              {entityTypes.length}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Define and manage domain entity types, fields, bound forms, workflows, and live runtime records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Bar */}
              <div className="relative w-52">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search entities…"
                  className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none shadow-2xs"
                />
              </div>

              <button
                type="button"
                onClick={loadData}
                title="Refresh entities"
                className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 transition-colors shadow-2xs"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => navigate('/entities/design')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 active:bg-blue-800 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>New Entity Type</span>
              </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Surface Content Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">
          {loading && entityTypes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600 mb-2" />
              <p className="text-xs">Loading entity types…</p>
            </div>
          ) : filteredEntities.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center shadow-2xs">
              <Layers className="h-10 w-10 text-gray-300 mb-2" />
              <h3 className="text-sm font-semibold text-gray-800">No entity types found</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">
                {search ? `No entity matches "${search}".` : 'Create your first entity type to start designing forms and workflows.'}
              </p>
              {!search && (
                <button
                  type="button"
                  onClick={() => navigate('/entities/design')}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Entity Type</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEntities.map((et) => {
                const IconComp = ICON_MAP[et.icon] || Layers;
                const colorCls = ICON_COLORS[et.name] || 'text-purple-600 bg-purple-50 border-purple-200';

                return (
                  <div
                    key={et.name}
                    className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-2xs hover:shadow-xs hover:border-gray-300 transition-all"
                  >
                    {/* Top Row: Icon + Title + Actions */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${colorCls} shadow-2xs`}>
                          <IconComp className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold text-gray-900">{et.display_name}</h3>
                          <span className="font-mono text-[11px] text-gray-400">{et.name}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {et.is_system ? (
                          <span className="rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-gray-600">
                            System
                          </span>
                        ) : (
                          <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-blue-700">
                            Custom
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => navigate(`/entities/design/${encodeURIComponent(et.name)}`)}
                          title="Edit entity type and fields"
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        {!et.is_system && (
                          <button
                            type="button"
                            onClick={() => handleDelete(et)}
                            disabled={deleting === et.name}
                            title="Delete custom entity type"
                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="mt-3 text-xs text-gray-500 leading-relaxed line-clamp-2 min-h-[2.5rem]">
                      {et.description || 'No description provided for this entity type.'}
                    </p>

                    {/* Live Metrics Grid */}
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
                      <div className="flex flex-col rounded-lg bg-gray-50/80 p-2 text-center">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Fields</span>
                        <span className="font-mono text-xs font-bold text-gray-800">{et.field_count ?? 0}</span>
                      </div>
                      <div className="flex flex-col rounded-lg bg-gray-50/80 p-2 text-center">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Workflows</span>
                        <span className="font-mono text-xs font-bold text-gray-800">
                          {et.has_published_workflow ? (
                            <span className="text-emerald-600">Active</span>
                          ) : (
                            <span>{et.workflow_count ?? 0}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-col rounded-lg bg-gray-50/80 p-2 text-center">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Records</span>
                        <span className="font-mono text-xs font-bold text-gray-800">{et.record_count ?? 0}</span>
                      </div>
                    </div>

                    {/* Action Links */}
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/forms/${encodeURIComponent(et.name)}`)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 hover:underline"
                      >
                        <PenTool className="h-3 w-3" />
                        <span>Form Studio</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate('/workflows')}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-800 hover:underline"
                      >
                        <GitBranch className="h-3 w-3" />
                        <span>Workflows</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate('/records', { type: et.name })}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                      >
                        <PlayCircle className="h-3 w-3" />
                        <span>Open Records</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
    </div>
  );
}
