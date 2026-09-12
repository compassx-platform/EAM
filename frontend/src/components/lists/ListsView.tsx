import { useCallback, useEffect, useState } from 'react';
import { ListChecks, Loader2, Plus, PenTool, Trash2, Rocket, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client';
import { navigate } from '../../lib/router';
import type { OptionListSummary } from '../../types';

interface ListsViewProps {
  onEdit: (key: string) => void;
  tick?: number;
}

function kindBadge(kind: string) {
  return kind === 'checklist'
    ? 'bg-purple-100 text-purple-700 border-purple-200'
    : 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

export function ListsView({ onEdit, tick = 0 }: ListsViewProps) {
  const [lists, setLists] = useState<OptionListSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.listLists()
      .then(setLists)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, tick]);

  const doPublish = async (key: string) => {
    setPublishing(key);
    setError(null);
    try {
      const res = await api.publishList(key);
      window.alert(`Published "${key}" as ${res.list.version_label}.`);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPublishing(null);
    }
  };

  const doDelete = async (key: string) => {
    if (!window.confirm(`Permanently delete list "${key}" (draft + all versions)?`)) return;
    setDeleting(key);
    setError(null);
    try {
      await api.deleteList(key);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Central Lists</h1>
          <p className="mt-1 text-sm text-gray-500">
            Reusable option lists (select / dropdown) and pre-work checklists. Draft once, publish an immutable
            version, and reference it from fields and form builders.
          </p>
        </div>
        <button
          onClick={() => onEdit('new')}
          className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
        >
          <Plus className="h-4 w-4" /> New list
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {loading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : `${lists.length} list(s)`}
        </div>

        {lists.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <ListChecks className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              No lists yet. Create one to share selection options or a pre-work checklist across forms.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 font-semibold">List</th>
                <th className="px-4 py-3 font-semibold">Kind</th>
                <th className="px-4 py-3 font-semibold">Items</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Published</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lists.map((l) => (
                <tr key={l.list_key} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium text-gray-800">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 font-mono text-[11px] font-bold text-blue-700">
                        {l.list_key.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-mono text-sm">{l.list_key}</span>
                    </span>
                    {l.description && <p className="mt-0.5 max-w-[260px] truncate pl-9 text-[11px] text-gray-400">{l.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${kindBadge(l.kind)}`}>
                      {l.kind}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5 text-gray-400" />
                      {l.has_draft ? l.draft_item_count : l.item_count}
                      {l.has_draft && l.published_version && <span className="text-[10px] text-gray-400">draft</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        l.has_draft
                          ? 'bg-amber-100 text-amber-700 border-amber-200'
                          : l.published_version
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}
                    >
                      {l.has_draft ? 'draft' : l.published_version ? 'published' : 'deprecated'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{l.published_version ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onEdit(l.list_key)}
                        className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                      >
                        <PenTool className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => doPublish(l.list_key)}
                        disabled={publishing === l.list_key || !l.has_draft}
                        title={l.has_draft ? 'Publish the current draft as a new version' : 'No draft to publish'}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {publishing === l.list_key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                        Publish
                      </button>
                      <button
                        onClick={() => doDelete(l.list_key)}
                        disabled={deleting === l.list_key}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        {deleting === l.list_key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Runtime validation always resolves the newest published version of a list — drafts never affect live forms.
      </p>
    </div>
  );
}