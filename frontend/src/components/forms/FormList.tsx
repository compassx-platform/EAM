import { useCallback, useEffect, useState } from 'react';
import { Plus, PenTool, Database, Loader2, FileText } from 'lucide-react';
import { api } from '../../api/client';

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

function typeLabel(t: string) {
  return t
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
}

export function FormList({ onBuild }: FormListProps) {
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [fieldCounts, setFieldCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [newType, setNewType] = useState('');
  const [knownTypes, setKnownTypes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .listForms()
      .then(async (list) => {
        setForms(list);
        const counts: Record<string, number> = {};
        for (const f of list) {
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
    api
      .listFields()
      .then((allFields) =>
        setKnownTypes([...new Set(allFields.map((f) => f.entity_type))].sort())
      )
      .catch(() => {});
  }, [load]);

  const formTypes = new Set(forms.map((f) => f.entity_type));
  const candidates = [...new Set([...knownTypes, ...forms.map((f) => f.entity_type)])].sort();

  const startBuild = (t: string) => {
    const type = t.trim().toLowerCase();
    if (!type) return;
    onBuild(type);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entity Form Builder</h1>
          <p className="mt-1 text-sm text-gray-500">
            Design the creation form for each entity type (workorder, permit, or any future type).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            placeholder="new entity type (e.g. training)"
            list="form-entity-types"
            onKeyDown={(e) => e.key === 'Enter' && startBuild(newType)}
            className="w-56 rounded-md border border-gray-300 px-2.5 py-1.5 font-mono text-sm text-gray-700"
          />
          <datalist id="form-entity-types">
            {candidates.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button
            onClick={() => startBuild(newType)}
            disabled={!newType.trim()}
            className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Build form
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {loading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : `${forms.length} form layout(s)`}
        </div>

        {forms.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <PenTool className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              No form layouts yet. Enter an entity type above and click <strong>Build form</strong> to design its
              creation form.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 font-semibold">Entity Type</th>
                <th className="px-4 py-3 font-semibold">Fields</th>
                <th className="px-4 py-3 font-semibold">Placed Items</th>
                <th className="px-4 py-3 font-semibold">Grid</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 text-right font-semibold">Edit</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.entity_type} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium text-gray-800">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-[11px] font-bold text-blue-700">
                        {f.entity_type.slice(0, 2).toUpperCase()}
                      </span>
                      {typeLabel(f.entity_type)}
                      <span className="rounded bg-gray-100 px-1.5 font-mono text-[11px] text-gray-500">
                        {f.entity_type}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <span className="flex items-center gap-1">
                      <Database className="h-3.5 w-3.5 text-gray-400" />
                      {fieldCounts[f.entity_type] ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-gray-600">
                      <FileText className="h-3.5 w-3.5 text-gray-400" /> {f.item_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {f.cols} cols · {f.row_height}px
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {f.updated_at ? new Date(f.updated_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onBuild(f.entity_type)}
                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                    >
                      <PenTool className="h-3.5 w-3.5" /> Edit form
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!formTypes.has('workorder') && (
          <div className="border-t border-gray-100 bg-amber-50/50 px-4 py-3 text-xs text-amber-700">
            Tip: start by building a form for <strong>workorder</strong> — its fields are already registered.
          </div>
        )}
      </div>
    </div>
  );
}
