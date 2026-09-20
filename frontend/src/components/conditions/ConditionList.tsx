import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type { ConditionDefinition, ConditionTypeInfo, EntityField } from '../../types';
import { ConditionModal } from '../builder/studio/ConditionModal';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ConditionList() {
  const [conditions, setConditions] = useState<ConditionDefinition[]>([]);
  const [conditionTypes, setConditionTypes] = useState<ConditionTypeInfo | null>(null);
  const [fields, setFields] = useState<EntityField[]>([]);
  const [knownTypes, setKnownTypes] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ConditionDefinition | null>(null);
  const [deleting, setDeleting] = useState<ConditionDefinition | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(() => {
    api
      .listConditions()
      .then(setConditions)
      .finally(() => setLoading(false));
    api.listFields().then(setFields).catch(() => {});
  }, []);

  useEffect(() => {
    api.listConditionTypes().then(setConditionTypes).catch(() => setConditionTypes(null));
    Promise.all([
      api.listEntityTypes().catch(() => []),
      api.listFields().catch(() => []),
    ]).then(([ets, fs]) => {
      const names = [...new Set([...(ets as any[]).map((e) => e.name), ...(fs as any[]).map((f) => f.entity_type)])].sort();
      setKnownTypes(names);
      setFields(fs as EntityField[]);
    });
    refresh();
  }, [refresh]);

  const entityTypeOptions = useMemo(
    () => [...new Set([...knownTypes, ...conditions.map((c) => c.entity_type)])].filter(Boolean).sort(),
    [knownTypes, conditions],
  );

  const rows = useMemo(
    () => (filter === 'all' ? conditions : conditions.filter((c) => c.entity_type === filter)),
    [conditions, filter],
  );

  const ruleCount = (c: ConditionDefinition) => c.definition?.rules?.length ?? 0;

  const doDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.deleteCondition(deleting.id);
      setDeleting(null);
      refresh();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden">
      {/* Surface Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-white px-6 py-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <ShieldCheck className="h-5 w-5 text-blue-700" />
              <span>Central Conditions</span>
            </h1>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-600">
              {rows.length}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Reusable Maximo-style conditional rules for workflow transition routing and form visibility logic.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none shadow-xs"
          >
            <option value="all">All entity types</option>
            {entityTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={refresh}
            title="Refresh"
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-xs"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Condition
          </button>
        </div>
      </div>

      {/* Surface Content Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading conditions…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white py-16">
            <ShieldCheck className="h-10 w-10 text-gray-300" />
            <p className="text-sm font-semibold text-gray-700">
              {conditions.length === 0 ? 'No conditions yet' : `No conditions for "${filter}"`}
            </p>
            <p className="max-w-sm text-center text-xs text-gray-500">
              Conditions are reusable rules like “Permit Type is Electrical Isolation”. Create one to drive routing branches and transition guards.
            </p>
            {conditions.length === 0 && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-1 flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
              >
                <Plus className="h-4 w-4" /> New Condition
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-xs">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Condition</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-3 py-3 text-center">Rules</th>
                  <th className="px-3 py-3 text-center">Version</th>
                  <th className="px-3 py-3 text-center">Policy</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-gray-50/60 transition-colors"
                    onClick={() => {
                      setCreating(false);
                      setEditing(c);
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="text-xs font-bold text-gray-900">{c.label}</div>
                      <div className="font-mono text-[11px] text-gray-400">{c.id}</div>
                      {c.description && <div className="mt-0.5 max-w-md truncate text-[11px] text-gray-500">{c.description}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-gray-600">
                        {c.entity_type}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-gray-600">{ruleCount(c)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-blue-700">
                        v{c.current_version}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          c.failure_policy === 'allow'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {c.failure_policy === 'allow' ? 'Allow' : 'Block'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(c.updated_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCreating(false);
                            setEditing(c);
                          }}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleting(c);
                          }}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
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
        )}
      </div>

      {(creating || editing) && (
        <ConditionModal
          key={editing?.id ?? 'new'}
          entityType={editing?.entity_type ?? (filter !== 'all' ? filter : '')}
          entityTypes={entityTypeOptions}
          conditionTypes={conditionTypes}
          fields={fields}
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={() => !deleteBusy && setDeleting(null)}>
          <div
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800">
              <Trash2 className="h-4 w-4 text-red-600" /> Delete condition
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Delete <span className="font-semibold text-gray-800">{deleting.label}</span> (
              <span className="font-mono">{deleting.id}</span>)? Workflows and forms referencing it will fail their checks until
              the reference is removed.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={deleteBusy}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={deleteBusy}
                className="flex items-center gap-1.5 rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {deleteBusy && <Loader2 className="h-4 w-4 animate-spin" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}