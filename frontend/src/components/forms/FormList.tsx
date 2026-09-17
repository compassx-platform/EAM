import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  PenTool,
  Database,
  Loader2,
  FileText,
  Search,
  ShieldCheck,
  Calendar,
  Layers,
  Sparkles,
  Info,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { api } from '../../api/client';
import type { ConditionDefinition } from '../../types';

interface FormSummary {
  entity_type: string;
  cols: number;
  row_height: number;
  item_count: number;
  updated_at?: string | null;
}

interface FormListProps {
  onBuild: (entityType: string) => void;
}

function typeLabel(t: string): string {
  return t
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}

export function FormList({ onBuild }: FormListProps) {
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [fieldCounts, setFieldCounts] = useState<Record<string, number>>({});
  const [conditionsCount, setConditionsCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [newType, setNewType] = useState('');
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [knownTypes, setKnownTypes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.listForms(),
      api.listFields(),
      api.listConditions().catch(() => [] as ConditionDefinition[]),
    ])
      .then(async ([formList, allFields, allConditions]) => {
        setForms(formList);
        setKnownTypes([...new Set(allFields.map((f) => f.entity_type))].sort());

        // Condition count by entity type
        const condCounts: Record<string, number> = {};
        allConditions.forEach((c) => {
          condCounts[c.entity_type] = (condCounts[c.entity_type] || 0) + 1;
        });
        setConditionsCount(condCounts);

        // Calculate placed field counts
        const counts: Record<string, number> = {};
        for (const f of formList) {
          try {
            const detail = await api.getForm(f.entity_type);
            const fn = new Set((detail.fields || []).map((x) => x.field_name));
            const placed = (detail.layout || []).filter(
              (it) => !it.isHeader && (it.fieldType || fn.has(it.i))
            ).length;
            counts[f.entity_type] = placed > 0 ? placed : detail.fields.length;
          } catch {
            counts[f.entity_type] = 0;
          }
        }
        setFieldCounts(counts);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const candidates = useMemo(
    () => [...new Set([...knownTypes, ...forms.map((f) => f.entity_type)])].sort(),
    [knownTypes, forms]
  );

  const filteredForms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter(
      (f) =>
        f.entity_type.toLowerCase().includes(q) ||
        typeLabel(f.entity_type).toLowerCase().includes(q)
    );
  }, [forms, search]);

  const startBuild = (t: string) => {
    const type = t.trim().toLowerCase();
    if (!type) return;
    onBuild(type);
  };

  const handleDelete = async (e: React.MouseEvent, entityType: string) => {
    e.stopPropagation();
    if (!window.confirm(`Delete form layout for "${entityType}"?`)) return;
    try {
      await api.deleteForm(entityType);
      load();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden">
      {/* Surface Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-white px-6 py-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <PenTool className="h-5 w-5 text-blue-700" />
              <span>Form Studio</span>
            </h1>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-600">
              {forms.length}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Design dynamic data entry forms with drag-and-drop grid layouts, custom input fields, and visibility rules.
          </p>
        </div>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search forms…"
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none shadow-xs"
              />
            </div>

            <button
              type="button"
              onClick={load}
              title="Refresh list"
              className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-xs"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {!creatingOpen ? (
              <button
                type="button"
                onClick={() => setCreatingOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>New Form</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  placeholder="entity type (e.g. training)"
                  list="form-entity-types"
                  onKeyDown={(e) => e.key === 'Enter' && startBuild(newType)}
                  className="w-48 rounded-lg border border-gray-300 px-2.5 py-1.5 font-mono text-xs text-gray-800 focus:border-blue-500 focus:outline-none shadow-xs"
                />
                <datalist id="form-entity-types">
                  {candidates.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <button
                  type="button"
                  onClick={() => startBuild(newType)}
                  disabled={!newType.trim()}
                  className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors shadow-xs"
                >
                  Build
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreatingOpen(false);
                    setNewType('');
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-xs"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
      </div>

      {/* Surface Content Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-xs">
            {loading && forms.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading form directory…</span>
              </div>
            ) : filteredForms.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <PenTool className="h-10 w-10 text-gray-300" />
                <div className="max-w-sm">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {forms.length === 0 ? 'No form layouts created yet' : `No forms matching "${search}"`}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Click &quot;New Form&quot; above to design the custom data entry form for an entity type.
                  </p>
                </div>
                {forms.length === 0 && (
                  <button
                    type="button"
                onClick={() => setCreatingOpen(true)}
                className="mt-1 flex items-center gap-1.5 rounded-md bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
              >
                <Plus className="h-4 w-4" />
                <span>Build First Form</span>
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Entity Type</th>
                <th className="px-4 py-3">Placed Fields</th>
                <th className="px-4 py-3">Grid Layout</th>
                <th className="px-4 py-3">Central Conditions</th>
                <th className="px-4 py-3">Last Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredForms.map((f) => {
                const placed = fieldCounts[f.entity_type] ?? f.item_count;
                const condCount = conditionsCount[f.entity_type] || 0;

                return (
                  <tr
                    key={f.entity_type}
                    onClick={() => onBuild(f.entity_type)}
                    className="group cursor-pointer hover:bg-blue-50/30 transition-colors"
                  >
                    {/* Entity Type */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 font-mono text-xs font-bold text-gray-700 group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">
                          {f.entity_type.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <div className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                            {typeLabel(f.entity_type)}
                          </div>
                          <div className="font-mono text-[10px] text-gray-400">{f.entity_type}</div>
                        </div>
                      </div>
                    </td>

                    {/* Placed Fields */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <FileText className="h-3.5 w-3.5 text-gray-400" />
                        <span className="font-semibold">{placed}</span>
                        <span className="text-gray-400">field{placed === 1 ? '' : 's'}</span>
                      </div>
                    </td>

                    {/* Grid Specs */}
                    <td className="px-4 py-3.5">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">
                        {f.cols} cols · {f.row_height}px
                      </span>
                    </td>

                    {/* Central Conditions */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
                        <span className="font-semibold text-gray-700">{condCount}</span>
                        <span className="text-gray-400">condition{condCount === 1 ? '' : 's'}</span>
                      </div>
                    </td>

                    {/* Last Updated */}
                    <td className="px-4 py-3.5 text-gray-500">
                      {f.updated_at ? (
                        new Date(f.updated_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBuild(f.entity_type);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-colors shadow-2xs"
                        >
                          <PenTool className="h-3 w-3" />
                          <span>Edit Form</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, f.entity_type)}
                          title="Delete form layout"
                          className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-600 transition-colors"
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
        )}
      </div>
    </div>
  </div>
);
}
