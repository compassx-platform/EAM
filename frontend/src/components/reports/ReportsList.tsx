import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Printer, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type { EntityTypeDefinition, ReportLayout } from '../../types';

interface ReportsListProps {
  onCreate: (entityType: string) => void;
  onEdit: (id: string) => void;
}

export function ReportsList({ onCreate, onEdit }: ReportsListProps) {
  const [entities, setEntities] = useState<EntityTypeDefinition[]>([]);
  const [entityType, setEntityType] = useState('');
  const [layouts, setLayouts] = useState<ReportLayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selected: string) => {
    setLoading(true);
    setError(null);
    try {
      const [types, rows] = await Promise.all([
        api.listEntityTypes(),
        selected ? api.listReports(selected) : Promise.resolve([]),
      ]);
      setEntities(types);
      setLayouts(rows);
      if (!selected && types.length > 0) {
        setEntityType(types[0].name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print views could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(entityType);
  }, [entityType, load]);

  const remove = async (layout: ReportLayout) => {
    setError(null);
    try {
      await api.deleteReport(layout.id);
      setLayouts((prev) => prev.filter((row) => row.id !== layout.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The print view could not be removed.');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <h1 className="text-sm font-bold text-gray-900">Reports</h1>
          <p className="mt-0.5 text-xs text-gray-500">Print views for an entity. The data-entry form stays separate.</p>
        </div>
        <button
          type="button"
          disabled={!entityType}
          onClick={() => onCreate(entityType)}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          New print view
        </button>
      </div>
      <div className="flex-1 overflow-auto p-5">
        <label className="mb-4 block max-w-xs text-[11px] text-gray-500">
          Entity
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
          >
            {entities.map((entity) => (
              <option key={entity.name} value={entity.name}>{entity.display_name}</option>
            ))}
          </select>
        </label>
        {error && <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {loading ? (
          <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading print views…</p>
        ) : layouts.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 text-center">
            <Printer className="mb-2 h-6 w-6 text-gray-400" />
            <p className="text-xs font-semibold text-gray-800">No print view for this entity</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {layouts.map((layout) => (
              <li key={layout.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <button type="button" onClick={() => onEdit(layout.id)} className="min-w-0 text-left">
                  <span className="block text-xs font-semibold text-gray-900">{layout.name}</span>
                  <span className="text-[11px] text-gray-500">{layout.blocks.length} blocks{layout.is_default ? ' · Default' : ''}</span>
                </button>
                <button type="button" onClick={() => void remove(layout)} className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Remove print view">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
