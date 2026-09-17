import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Plus,
  RefreshCw,
  Loader2,
  Layers,
} from 'lucide-react';
import { api } from '../../api/client';
import { useHashRoute, navigate } from '../../lib/router';
import type { EntityRecord } from '../../types';
import { EntityFormView } from './EntityFormView';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  requested: 'bg-blue-100 text-blue-800 border-blue-200',
  active: 'bg-blue-100 text-blue-800 border-blue-200',
  isolationprecheck: 'bg-purple-100 text-purple-800 border-purple-200',
  riskassessed: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  published: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border-rose-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
  expired: 'bg-orange-100 text-orange-800 border-orange-200',
};

function statusBadge(s?: string) {
  if (!s) return 'bg-gray-100 text-gray-700 border-gray-200';
  return STATUS_BADGE[s.toLowerCase()] ?? 'bg-blue-50 text-blue-700 border-blue-200';
}

function truncate(id: string, n = 14) {
  return id.length <= n ? id : `${id.slice(0, 8)}…${id.slice(-5)}`;
}

const TITLE_KEYS = ['title', 'name', 'subject', 'summary', 'label'];

function entityTitle(e: { custom_fields?: Record<string, unknown> }): string | null {
  const cf = e.custom_fields || {};
  for (const k of TITLE_KEYS) {
    const v = cf[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return null;
}

export function EntityConsole({ entityType, displayName }: { entityType: string; displayName?: string }) {
  const route = useHashRoute();
  const type = entityType;
  const [statusFilter, setStatusFilter] = useState(() => route.query.get('status') || '');
  const [items, setItems] = useState<EntityRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRecordId = route.query.get('record') || route.query.get('selected');

  const patchQuery = (patch: Record<string, string | undefined>) => {
    const q: Record<string, string> = { type, status: statusFilter || undefined } as Record<string, string>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') delete q[k];
      else q[k] = v;
    }
    navigate('/records', q);
  };

  useEffect(() => {
    const s = route.query.get('status') || '';
    if (s !== statusFilter) setStatusFilter(s);
  }, [route.query.toString(), route.query.get('status')]);

  const loadList = useCallback(() => {
    setLoading(true);
    setError(null);
    api.listEntities(type, { status: statusFilter || undefined })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [type, statusFilter]);

  useEffect(() => {
    loadList();
  }, [type, statusFilter, loadList]);

  // If a record is selected, render the dedicated full-page form view
  if (selectedRecordId) {
    return (
      <EntityFormView
        key={selectedRecordId}
        recordId={selectedRecordId}
        entityType={type}
        onClose={() => patchQuery({ record: undefined, selected: undefined })}
        onRecordUpdated={loadList}
      />
    );
  }

  // Otherwise, render the entity records list table
  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden">
      {/* Surface Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-white px-6 py-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Layers className="h-5 w-5 text-gray-500" />
              <span>{displayName || type}</span>
            </h1>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-600">
              {total}
            </span>
            <span className="font-mono text-[11px] text-gray-400">{type}</span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Select any record row to view and edit in full-page form layout.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={statusFilter}
            onChange={(e) => {
              const s = e.target.value.trim();
              setStatusFilter(s);
              patchQuery({ status: s });
            }}
            placeholder="filter state…"
            className="w-32 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none shadow-2xs"
            title="Filter by current workflow state"
          />

          <button
            onClick={loadList}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-2xs"
            title="Refresh records"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => navigate('/create', { type })}
            className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-800 transition-colors"
          >
            <Plus className="h-4 w-4" /> Create {displayName || type || 'record'}
          </button>
        </div>
      </div>

      {/* Surface Content Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-xs">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Record ID</th>
                <th className="px-4 py-3">Current State</th>
                <th className="px-4 py-3">Workflow</th>
                <th className="px-4 py-3">Fields</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading {type} records…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-gray-400">
                    No {type} records{statusFilter ? ` in state "${statusFilter}"` : ''}. Click &ldquo;Create {displayName || type}&rdquo; to start.
                  </td>
                </tr>
              ) : (
                items.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => patchQuery({ record: e.id, selected: undefined })}
                    className="cursor-pointer hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="max-w-[240px] truncate px-4 py-3 text-xs font-semibold text-gray-900 group-hover:text-blue-700">
                      {entityTitle(e) ?? <span className="font-normal text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-600">{truncate(e.id)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusBadge(e.status)}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{e.workflow_version}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{Object.keys(e.custom_fields || {}).length}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {e.updated_at ? new Date(e.updated_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}