import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Plus,
  Rocket,
  Save,
  Trash2,
  X,
  ListChecks,
  CheckSquare,
  GitCommitHorizontal,
  Link2,
} from 'lucide-react';
import { api } from '../../api/client';
import type { ChecklistItem, ListDefinition, ListKind } from '../../types';

const INPUT =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

interface ListEditorProps {
  listKey: string; // 'new' for a fresh list
  onBack: () => void;
  onChanged: () => void;
}

export function ListEditor({ listKey, onBack, onChanged }: ListEditorProps) {
  const isNew = listKey === 'new';
  const [loading, setLoading] = useState(!isNew);
  const [loaded, setLoaded] = useState(isNew);
  const [key, setKey] = useState(isNew ? '' : listKey);
  const [kind, setKind] = useState<ListKind>('options');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<Array<string | ChecklistItem>>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [versions, setVersions] = useState<ListDefinition[]>([]);
  const [usage, setUsage] = useState<{ field_count: number; form_item_count: number } | null>(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await api.getList(listKey);
        if (cancelled) return;
        setKind(list.kind);
        setDescription(list.description ?? '');
        setItems(list.items);
        const [vers, use] = await Promise.all([
          api.listListVersions(listKey).catch(() => []),
          api.getListUsage(listKey).catch(() => null),
        ]);
        if (cancelled) return;
        setVersions(vers);
        setUsage(use);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e.message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, listKey]);

  const flash = (kind2: 'ok' | 'err', text: string) => {
    setNotice({ kind: kind2, text });
    window.setTimeout(() => setNotice(null), 4000);
  };

  const optionItems = useMemo(
    () => items.filter((i): i is string => typeof i === 'string'),
    [items]
  );
  const checklistItems = useMemo(
    () => items.filter((i): i is ChecklistItem => typeof i !== 'string'),
    [items]
  );

  const setOption = (idx: number, value: string) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? value : it)));
  };

  const addOption = () => {
    const n = optionItems.length;
    setItems((prev) => [...prev, `Option ${n + 1}`]);
  };

  const removeOption = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const setChecklistItem = (idx: number, patch: Partial<ChecklistItem>) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx || typeof it === 'string') return it;
      return { ...it, ...patch };
    }));
  };

  const addChecklistItem = () => {
    setItems((prev) => [...prev, { label: '', required: false, assigned_role: null }]);
  };

  const saveDraft = async () => {
    setSaving(true);
    setErr(null);
    try {
      const finalKey = key.trim().toLowerCase();
      if (!finalKey) {
        setErr('list_key is required.');
        return;
      }
      const submitted = items
        .map((it) => (typeof it === 'string' ? it.trim() : { ...it, label: it.label.trim() }))
        .filter((it) => (typeof it === 'string' ? it : it.label));
      const res = await api.saveListDraft({
        list_key: finalKey,
        kind,
        description,
        items: submitted,
      });
      if (isNew) {
        onBack();
        return;
      }
      onChanged();
      flash('ok', `Draft for "${finalKey}" saved.`);
      setKey(finalKey);
      void api.listListVersions(finalKey).then(setVersions).catch(() => {});
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const doPublish = async () => {
    setPublishing(true);
    setErr(null);
    try {
      const res = await api.publishList(key);
      setNotice({ kind: 'ok', text: `Published "${res.list.list_key}" as ${res.list.version_label}.` });
      onChanged();
      void api.listListVersions(key).then(setVersions).catch(() => {});
      setVersions((v) => [res.list, ...v]);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setPublishing(false);
    }
  };

  const doDelete = async () => {
    if (!window.confirm(`Permanently delete list "${key}"?`)) return;
    setDeleting(true);
    setErr(null);
    try {
      await api.deleteList(key);
      onBack();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const itemValid =
    kind === 'options'
      ? optionItems.length > 0
      : checklistItems.length > 0 && checklistItems.every((c) => c.label.trim() !== '');

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" /> Lists
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{isNew ? 'New list' : `Edit ${key}`}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Edit the draft freely; publishing creates an immutable snapshot that runtime forms resolve.
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700">
          <ListChecks className="h-3.5 w-3.5" /> list · {kind}
        </span>
      </div>

      {!loaded && (
        <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-20 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading list…
        </div>
      )}

      {loaded && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">List key</label>
                <input
                  value={key}
                  disabled={!isNew}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="e.g. wo_priority"
                  className={`${INPUT} font-mono disabled:bg-gray-50 disabled:text-gray-500`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Kind</label>
                <select value={kind} onChange={(e) => setKind(e.target.value as ListKind)} className={INPUT}>
                  <option value="options">Options (select / dropdown)</option>
                  <option value="checklist">Checklist (pre-work tasks)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this list is for"
                  className={INPUT}
                />
              </div>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {kind === 'options' ? <ListChecks className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
                  {kind === 'options' ? 'Options' : 'Checklist items'}
                </span>
                <button
                  onClick={kind === 'options' ? addOption : addChecklistItem}
                  className="flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>

              {kind === 'options' ? (
                <div className="flex flex-col gap-1.5">
                  {optionItems.length === 0 && (
                    <p className="rounded-md border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-400">
                      No options yet — click <strong>Add</strong> to create the first one.
                    </p>
                  )}
                  {optionItems.map((o, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <input
                        value={o}
                        onChange={(e) => setOption(idx, e.target.value)}
                        className={`${INPUT} flex-1`}
                      />
                      <button
                        onClick={() => removeOption(idx)}
                        className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Remove option"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {checklistItems.length === 0 && (
                    <p className="rounded-md border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-400">
                      No checklist items yet — click <strong>Add</strong> to create the first task.
                    </p>
                  )}
                  {checklistItems.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white p-1.5">
                      <input
                        value={c.label}
                        onChange={(e) => setChecklistItem(idx, { label: e.target.value })}
                        placeholder="Task description"
                        className={`${INPUT} flex-1 border-0 focus:ring-0`}
                      />
                      <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-gray-500">
                        <input
                          type="checkbox"
                          checked={Boolean(c.required)}
                          onChange={(e) => setChecklistItem(idx, { required: e.target.checked })}
                          className="h-3.5 w-3.5 accent-blue-600"
                        />
                        required
                      </label>
                      <input
                        value={c.assigned_role ?? ''}
                        onChange={(e) => setChecklistItem(idx, { assigned_role: e.target.value || null })}
                        placeholder="role (optional)"
                        className={`${INPUT} w-32 shrink-0 border-0 focus:ring-0`}
                      />
                      <button
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Remove item"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {err && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>
            )}
            {notice && (
              <p
                className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs ${
                  notice.kind === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {notice.kind === 'ok' && <CheckCircle2 className="h-3.5 w-3.5" />}
                {notice.text}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <button
                onClick={saveDraft}
                disabled={saving || !itemValid}
                title={itemValid ? 'Save the editable draft' : 'Add at least one valid item first'}
                className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isNew ? 'Create draft' : 'Save draft'}
              </button>
              <button
                onClick={doPublish}
                disabled={publishing || saving || !itemValid}
                title="Validate and publish the draft as a new immutable version"
                className="flex items-center gap-1.5 rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Publish
              </button>
              {!isNew && (
                <button
                  onClick={doDelete}
                  disabled={deleting || saving}
                  className="ml-auto flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
                </button>
              )}
            </div>
          </div>

          {usage && (usage.field_count > 0 || usage.form_item_count > 0) && (
            <div className="border-t border-gray-100 bg-amber-50/50 px-4 py-2.5 text-xs text-amber-800">
              <span className="flex items-center gap-1.5 font-semibold">
                <Link2 className="h-3.5 w-3.5" /> Referenced by {usage.field_count} field(s) and {usage.form_item_count}{' '}
                form item(s) — deleting is blocked until these are detached.
              </span>
            </div>
          )}

          {versions.length > 0 && (
            <div className="border-t border-gray-100">
              <div className="flex items-center gap-1.5 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <GitCommitHorizontal className="h-3.5 w-3.5" /> Published versions
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-2 font-semibold">Version</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                    <th className="px-4 py-2 font-semibold">Items</th>
                    <th className="px-4 py-2 font-semibold">Published</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr key={v.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">{v.version_label}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${v.status === 'published' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                          {v.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">{v.items.length}</td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {v.published_at ? new Date(v.published_at).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}