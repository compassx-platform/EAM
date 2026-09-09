import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2, Pencil, Loader2, GitBranch, CalendarClock } from 'lucide-react';
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

  const entityTypes = useMemo(() => [...new Set(workflows.map((wf) => wf.entity_type))].sort(), [workflows]);
  const visible = filter === 'all' ? workflows : workflows.filter((wf) => wf.entity_type === filter);

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
          <h1 className="text-2xl font-bold text-gray-900">Workflow Builder</h1>
          <p className="mt-1 text-sm text-gray-500">
            Design state machines with a drag-and-drop canvas, then publish them for use by entities.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700"
          >
            <option value="all">All entity types</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <button
            onClick={() => refresh()}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
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

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3 font-semibold">Version</th>
              <th className="px-4 py-3 font-semibold">Entity Type</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">States</th>
              <th className="px-4 py-3 font-semibold">Transitions</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  No workflows{filter !== 'all' ? ` for "${filter}"` : ''} yet. Click <span className="font-medium text-gray-500">&quot;New Workflow&quot;</span> to build
                  one.
                </td>
              </tr>
            ) : (
              visible.map((wf) => (
                <tr key={wf.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 font-mono text-[13px] font-medium text-gray-800">
                      <GitBranch className="h-3.5 w-3.5 text-blue-500" />
                      {wf.version_label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs text-blue-700">
                      {wf.entity_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadge[wf.status]}`}
                    >
                      {wf.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{wf.definition?.states?.length ?? 0}</td>
                  <td className="px-4 py-3 text-gray-600">{wf.definition?.transitions?.length ?? 0}</td>
                  <td className="px-4 py-3 text-gray-500">
                    <span className="flex items-center gap-1 text-xs">
                      <CalendarClock className="h-3.5 w-3.5 text-gray-400" />
                      {wf.created_at ? new Date(wf.created_at).toLocaleString() : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onEdit(wf)}
                        className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                        title={wf.status === 'published' ? 'Edit (forks a new draft)' : 'Edit workflow'}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(wf)}
                        disabled={deleting === wf.id}
                        className="flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        title="Delete workflow"
                      >
                        {deleting === wf.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}