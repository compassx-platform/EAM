import { useEffect, useState } from 'react';
import {
  Layers,
  ClipboardList,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  FileText,
  Wrench,
  Truck,
  Cpu,
  Tag,
  Box,
} from 'lucide-react';
import { api } from '../../api/client';
import { useHashRoute, navigate } from '../../lib/router';
import type { EntityTypeDefinition } from '../../types';
import { EntityConsole } from './EntityConsole';

const ICON_MAP: Record<string, typeof Layers> = {
  ClipboardList,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  FileText,
  Wrench,
  Truck,
  Cpu,
  Tag,
  Box,
  Layers,
};

export function RuntimeWorkspace() {
  const route = useHashRoute();
  const [types, setTypes] = useState<EntityTypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listEntityTypes()
      .then((ets) => setTypes(ets))
      .catch(() => {
        api
          .listWorkflows()
          .then((wfs) => {
            const names = [...new Set(wfs.map((w) => w.entity_type))].sort();
            setTypes(
              names.map((n) => ({
                name: n,
                display_name: n,
                description: '',
                icon: 'Layers',
                is_system: false,
              }))
            );
          })
          .catch(() => setTypes([]));
      })
      .finally(() => setLoading(false));
  }, []);

  const activeType = route.query.get('type') || types[0]?.name || '';
  const active = types.find((t) => t.name === activeType);

  return (
    <div className="flex h-full w-full min-h-0 overflow-hidden">
      {/* Master sidebar: every entity type */}
      <aside className="flex w-60 shrink-0 flex-col min-h-0 overflow-y-auto border-r border-gray-200/80 bg-slate-50/70">
        <div className="border-b border-gray-100 px-4 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <Layers className="h-4 w-4 text-gray-500" />
            <span>Records</span>
          </h2>
          <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
            Create records and drive them through their workflows.
          </p>
        </div>

        <nav className="flex flex-col gap-0.5 p-2">
          {loading && types.length === 0 && (
            <span className="px-2 py-3 text-[11px] text-gray-400">Loading entities…</span>
          )}
          {types.map((t) => {
            const Icon = ICON_MAP[t.icon] || Layers;
            const isActive = t.name === activeType;
            return (
              <button
                key={t.name}
                type="button"
                onClick={() => navigate('/records', { type: t.name })}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  isActive
                    ? 'border border-gray-200/80 bg-white font-semibold text-gray-900 shadow-2xs'
                    : 'border border-transparent font-medium text-gray-600 hover:bg-white/70 hover:text-gray-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-gray-700' : 'text-gray-400'}`} />
                <span className="truncate">{t.display_name || t.name}</span>
                {!isActive && typeof t.record_count === 'number' && t.record_count > 0 && (
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-gray-400">
                    {t.record_count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Detail panel: selected entity's records */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {activeType ? (
          <EntityConsole key={activeType} entityType={activeType} displayName={active?.display_name} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-gray-400">
            {loading ? 'Loading entities…' : 'No entity types defined yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
