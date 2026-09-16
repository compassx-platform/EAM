import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2, Pencil, Loader2, GitBranch, GitFork, CalendarClock, Layers, PlayCircle } from 'lucide-react';
import { api } from '../api/client';
import type { Workflow, WorkflowStatus } from '../types';

interface WorkflowListProps {
  onEdit: (workflow: Workflow) => void;
  onNew: () => void;
}

const statusBadge: Record<WorkflowStatus, string> = {
  draft: 'bg-amber-100 text-amber-700 border-amber-200',
  published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  deprecated: 'bg-gray-100 text-gray-500 border-gray-200',
};

export function WorkflowList({ onEdit, onNew }: WorkflowListProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .listWorkflows()
      .then(setWorkflows)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sections = useMemo(() => {
    const byType = new Map<string, Workflow[]>();
    for (const wf of workflows) {
      const list = byType.get(wf.entity_type) ?? [];
      list.push(wf);
      byType.set(wf.entity_type, list);
    }
    const types = [...byType.keys()].sort();
    return types
      .filter((t) => filter === 'all' || t === filter)
      .map((t) => {
        const list = [...byType.get(t)!].sort(
          (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
        );
        const live = list.filter((w) => w.status === 'published');
        return { entityType: t, versions: list, liveId: live.length ? live[live.length - 1].id : undefined };
      });
  }, [workflows, filter]);

  const entityTypes = useMemo(() => [...new Set(workflows.map((wf) => wf.entity_type))].sort(), [workflows]);

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

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Studio</h1>
          <p className="mt-1 text-sm text-gray-500">
            Design state machines with a drag-and-drop canvas, then publish them for use by entities.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                filter === 'all' ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              All
            </button>
            {entityTypes.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className={`rounded-full border px-2.5 py-1 font-mono text-xs ${
                  filter === t ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => refresh()}
            className="rounded-md border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onNew}
            className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" /> New Workflow
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-400">
          No workflows{filter !== 'all' ? ` for "${filter}"` : ''} yet. Click{' '}
          <span className="font-medium text-gray-600">New Workflow</span> to build one.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map(({ entityType, versions, liveId }) => (
            <section key={entityType} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-4 py-3">
                <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-sm font-semibold text-blue-700">
                  {entityType}
                </span>
                <span className="text-xs text-gray-400">{versions.length} version{versions.length > 1 ? 's' : ''}</span>
                {liveId && (
                  <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <PlayCircle className="h-3 w-3" /> Live · drives routing & forms
                  </span>
                )}
                <div className="ml-auto">
                  <button
                    type="button"
                    onClick={onNew}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                  >
                    + New draft
                  </button>
                </div>
              </header>

              <div className="divide-y divide-gray-50">
                {versions.map((wf) => {
                  const live = wf.id === liveId;
                  const branches = (wf.definition?.transitions ?? []).reduce(
                    (acc, t) => acc + (t.choices?.length ?? 1),
                    0
                  );
                  return (
                    <div key={wf.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-gray-50/60">
                      <span className="flex items-center gap-1.5 font-mono text-[13px] font-medium text-gray-800">
                        <GitBranch className="h-3.5 w-3.5 text-blue-500" />
                        {wf.version_label}
                      </span>

                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadge[wf.status]}`}>
                        {wf.status}
                        {live && <span className="ml-0.5 rounded bg-emerald-600 px-1 text-[9px] font-bold uppercase text-white">active</span>}
                      </span>

                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3 text-gray-400" />
                          {wf.definition?.states?.length ?? 0} states
                        </span>
                        <span className="flex items-center gap-1">
                          <GitFork className="h-3 w-3 text-gray-400" />
                          {branches} routes
                        </span>
                        {wf.created_at && (
                          <span className="flex items-center gap-1">
                            <CalendarClock className="h-3 w-3 text-gray-400" />
                            {new Date(wf.created_at).toLocaleString()}
                          </span>
                        )}
                      </div>

                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEdit(wf)}
                          className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                          title={live ? 'Edit (forks a new draft)' : 'Edit workflow'}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(wf)}
                          disabled={deleting === wf.id}
                          className="flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          title="Delete workflow"
                        >
                          {deleting === wf.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}