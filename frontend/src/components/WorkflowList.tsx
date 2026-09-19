import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  GitBranch,
  History,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { navigate } from '../lib/router';
import type { Workflow, EntityTypeDefinition } from '../types';

interface WorkflowListProps {
  onEdit: (workflow: Workflow) => void;
  onNew: () => void;
}

const humanize = (name: string) =>
  name
    .split(/[_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

function versionDate(wf: Workflow): string {
  const d = wf.status === 'published' && wf.published_at ? wf.published_at : wf.created_at;
  return d ? new Date(d).toLocaleDateString() : '—';
}

function statusText(cur: Workflow, liveVersionLabel?: string): string {
  if (cur.status === 'published') return 'live';
  if (cur.status === 'deprecated') return 'deprecated';
  return liveVersionLabel ? `draft · live ${liveVersionLabel}` : 'draft';
}

interface EntityRow {
  entityType: string;
  displayName: string;
  current: Workflow;
  live: Workflow | undefined;
  history: Workflow[];
}

export function WorkflowList({ onEdit, onNew }: WorkflowListProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [entityTypesList, setEntityTypesList] = useState<EntityTypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [selectedNewType, setSelectedNewType] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.listWorkflows(),
      api.listEntityTypes().catch(() => [] as EntityTypeDefinition[]),
    ])
      .then(([wfs, ets]) => {
        setWorkflows(wfs);
        setEntityTypesList(ets);
        setSelectedNewType((prev) => prev || (ets.length > 0 ? ets[0].name : ''));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const rows = useMemo<EntityRow[]>(() => {
    const byType = new Map<string, Workflow[]>();
    for (const wf of workflows) {
      const list = byType.get(wf.entity_type) ?? [];
      list.push(wf);
      byType.set(wf.entity_type, list);
    }
    const out: EntityRow[] = [];
    for (const [t, list] of byType) {
      const versions = [...list].sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      );
      const live = versions
        .filter((v) => v.status === 'published')
        .sort((a, b) => new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime())[0];
      const typeDef = entityTypesList.find((e) => e.name === t);
      out.push({
        entityType: t,
        displayName: typeDef?.display_name ?? humanize(t),
        current: versions[0],
        live,
        history: versions.slice(1),
      });
    }
    return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [workflows, entityTypesList]);

  const allAvailableEntityTypes = useMemo(() => {
    const names = new Set<string>();
    entityTypesList.forEach((e) => names.add(e.name));
    workflows.forEach((w) => names.add(w.entity_type));
    return [...names].sort();
  }, [entityTypesList, workflows]);

  const toggleExpand = (entityType: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entityType)) next.delete(entityType);
      else next.add(entityType);
      return next;
    });

  const handleDelete = async (wf: Workflow) => {
    if (!window.confirm(`Delete workflow "${wf.version_label}" (${wf.status})? This cannot be undone.`)) return;
    setDeleting(wf.id);
    setError(null);
    try {
      await api.deleteWorkflow(wf.id);
      refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleCreateWorkflow = () => {
    setNewModalOpen(false);
    navigate('/workflows/new', { type: selectedNewType });
  };

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden">
      {/* Surface Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 bg-white px-6 py-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <GitBranch className="h-5 w-5 text-blue-700" />
              <span>Workflow Studio</span>
            </h1>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-600">
              {rows.length}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            One workflow per entity — the latest version drives routing. Expand a row for version history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => refresh()}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-xs"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setNewModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition-colors"
          >
            <Plus className="h-4 w-4" /> New Workflow
          </button>
        </div>
      </div>

      {/* New Workflow Entity Type Selection Modal */}
      {newModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
          onMouseDown={() => setNewModalOpen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-blue-700" />
                <h3 className="text-sm font-bold text-gray-900">Create Workflow</h3>
              </div>
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3 py-4 text-xs">
              <p className="text-gray-600">
                Select the target entity type for which you want to design a new workflow state machine:
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-gray-700">Entity Type</label>
                <select
                  value={selectedNewType}
                  onChange={(e) => setSelectedNewType(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                >
                  {allAvailableEntityTypes.map((t) => {
                    const found = entityTypesList.find((e) => e.name === t);
                    return (
                      <option key={t} value={t}>
                        {found ? `${found.display_name} (${t})` : t}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={() => setNewModalOpen(false)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateWorkflow}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
              >
                Design Workflow
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Surface Content Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-400">
            No workflows yet. Click{' '}
            <span className="font-medium text-gray-600">New Workflow</span> to build one.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-2.5">Workflow</th>
                  <th className="px-3 py-2.5">Version</th>
                  <th className="px-3 py-2.5">Last updated</th>
                  <th className="w-36 px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const cur = row.current;
                  const isLive = row.live?.id === cur.id;
                  const hasHistory = row.history.length > 0;
                  const isExpanded = expanded.has(row.entityType);
                  return [
                    <tr
                      key={cur.id}
                      onClick={() => onEdit(cur)}
                      className="align-middle hover:bg-gray-50/80 cursor-pointer transition-colors group"
                    >
                      {/* Workflow / entity */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                          {row.displayName}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-gray-500">{row.entityType}</div>
                      </td>

                      {/* Version */}
                      <td className="px-3 py-3">
                        <div className="font-mono text-[12px] font-medium text-gray-800">{cur.version_label}</div>
                        <div className="mt-0.5 text-[11px] text-gray-500">{statusText(cur, row.live?.version_label)}</div>
                      </td>

                      {/* Updated */}
                      <td className="px-3 py-3 text-[11px] text-gray-500">{versionDate(cur)}</td>

                      {/* Actions */}
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {hasHistory && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(row.entityType);
                              }}
                              className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                              title={isExpanded ? 'Hide version history' : 'View version history'}
                            >
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              <History className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(cur);
                            }}
                            disabled={isLive}
                            className="flex items-center gap-1 rounded-md border border-gray-200 bg-white p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-400 transition-colors"
                            title={isLive ? 'Live workflows cannot be deleted' : 'Delete workflow'}
                          >
                            {deleting === cur.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>,
                    isExpanded && hasHistory ? (
                      <tr key={`${cur.id}-history`}>
                        <td colSpan={4} className="bg-gray-50/40 px-4 py-3">
                          <div className="divide-y divide-gray-100">
                            {row.history.map((v) => {
                              const vLive = row.live?.id === v.id;
                              return (
                                <div
                                  key={v.id}
                                  onClick={() => onEdit(v)}
                                  className="flex flex-wrap items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/80 cursor-pointer transition-colors group/hist"
                                >
                                  <span className="flex items-center gap-2 font-mono text-[12px] font-medium text-gray-700 group-hover/hist:text-blue-700 transition-colors">
                                    <GitBranch className="h-3.5 w-3.5 text-gray-400" />
                                    {v.version_label}
                                  </span>
                                  <span className="text-[11px] text-gray-500">{statusText(v)}</span>
                                  <span className="text-[11px] text-gray-500">{versionDate(v)}</span>
                                  <div className="ml-auto flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(v);
                                      }}
                                      disabled={vLive}
                                      className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-gray-400 transition-colors"
                                      title={vLive ? 'Live workflows cannot be deleted' : 'Delete workflow'}
                                    >
                                      {deleting === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}