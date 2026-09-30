import { useState, useMemo } from 'react';
import {
  AlarmClock,
  Play,
  Plus,
  RefreshCw,
  Search,
  Clock,
  Shield,
  Trash2,
  History,
  Zap,
  Timer,
} from 'lucide-react';
import type { Escalation, EntityTypeDefinition } from '../../types';
import { useEscalationCountdown } from './useEscalationCountdown';

interface EscalationListProps {
  escalations: Escalation[];
  entityTypes: EntityTypeDefinition[];
  loading: boolean;
  onNew: () => void;
  onEdit: (esc: Escalation) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onRunSingle: (id: string) => void;
  onRunAll: () => void;
  onViewLogs: (escalationId?: string) => void;
  onRefresh: () => void;
}

function EscalationCardItem({
  esc,
  onEdit,
  onDelete,
  onToggleActive,
  onRunSingle,
  onViewLogs,
}: {
  esc: Escalation;
  onEdit: (esc: Escalation) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
  onRunSingle: (id: string) => void;
  onViewLogs: (escalationId?: string) => void;
}) {
  const isActive = esc.status === 'ACTIVE';
  const timer = useEscalationCountdown(esc.status, esc.last_run_at, esc.check_interval_seconds || 5);

  return (
    <div
      className={`group flex flex-col justify-between rounded-xl border bg-white p-4 shadow-2xs transition-all hover:border-gray-300 hover:shadow-xs ${
        isActive ? 'border-gray-200' : 'border-gray-200/60 bg-gray-50/40 opacity-80'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
              isActive
                ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                : 'border-gray-200 bg-gray-100 text-gray-400'
            }`}
          >
            <AlarmClock className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onEdit(esc)}
                className="text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors text-left"
              >
                {esc.name}
              </button>
              <span className="font-mono text-[10px] text-gray-400">({esc.id})</span>
              {esc.is_system && (
                <span className="inline-flex items-center gap-0.5 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-gray-600">
                  <Shield className="h-2.5 w-2.5" />
                  System
                </span>
              )}
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  isActive
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 bg-gray-100 text-gray-500'
                }`}
              >
                {esc.status}
              </span>

              {/* Live Countdown Heartbeat Badge */}
              {isActive && (
                <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50/60 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-800">
                  <Timer className="h-3 w-3 text-blue-600 animate-pulse" />
                  <span>Next Run: {timer.formattedNextRunTime}</span>
                  <span className="rounded bg-blue-100 px-1 py-0.2 text-blue-900 font-extrabold">{timer.formattedCountdown}</span>
                </span>
              )}
            </div>
            {esc.description && (
              <p className="mt-1 text-xs text-gray-500 line-clamp-2">{esc.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={() => onToggleActive(esc.id, !isActive)}
            title={isActive ? 'Deactivate Escalation' : 'Activate Escalation'}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
              isActive
                ? 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            {isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button
            type="button"
            onClick={() => onRunSingle(esc.id)}
            title="Run this escalation immediately"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
          >
            <Play className="h-3 w-3 text-blue-600" />
            <span>Run Now</span>
          </button>
          <button
            type="button"
            onClick={() => onViewLogs(esc.id)}
            title="View history logs for this escalation"
            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onEdit(esc)}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Edit
          </button>
          {!esc.is_system && (
            <button
              type="button"
              onClick={() => onDelete(esc.id)}
              title="Delete escalation"
              className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Metadata and Points Footer */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2.5 text-xs text-gray-500">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-gray-200/80 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700">
            <Clock className="h-3 w-3 text-gray-400" />
            <span>Interval: <strong className="font-mono text-gray-900">{esc.check_interval_seconds || 5}s</strong></span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-gray-200/80 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700">
            <span>Cron: <code className="font-mono text-[10px]">{esc.schedule_cron || '*/5 * * * *'}</code></span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-gray-200/80 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700">
            <span>Target: <strong>{esc.entity_type === '*' ? 'All Entity Types' : esc.entity_type}</strong></span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-gray-200/80 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700">
            <span>Applies To: <strong>{esc.applies_to || 'entity'}</strong></span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-400 font-medium">
            {esc.points?.length || 0} Escalation Point{esc.points?.length === 1 ? '' : 's'}:
          </span>
          {(esc.points || []).map((pt, pIdx) => (
            <span
              key={pIdx}
              className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-600"
            >
              <code className="font-mono">{pt.reference_date_field || 'created_at'}</code>
              <span>({pt.elapsed_hours >= 0 ? `+${pt.elapsed_hours}h` : `${pt.elapsed_hours}h`})</span>
              <span className="text-gray-400">→</span>
              <span className="font-semibold text-gray-700">
                {pt.actions?.map((a) => a.action_type).join(', ') || 'No actions'}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EscalationList({
  escalations,
  entityTypes,
  loading,
  onNew,
  onEdit,
  onDelete,
  onToggleActive,
  onRunSingle,
  onRunAll,
  onViewLogs,
  onRefresh,
}: EscalationListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const filtered = useMemo(() => {
    return escalations.filter((e) => {
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && e.entity_type !== typeFilter.toLowerCase() && e.entity_type !== '*') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = e.name.toLowerCase().includes(q);
        const matchId = e.id.toLowerCase().includes(q);
        const matchDesc = (e.description || '').toLowerCase().includes(q);
        const matchType = e.entity_type.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchDesc && !matchType) return false;
      }
      return true;
    });
  }, [escalations, statusFilter, typeFilter, search]);

  const activeCount = escalations.filter((e) => e.status === 'ACTIVE').length;

  return (
    <div className="flex h-full w-full flex-col min-h-0 bg-slate-50/50">
      {/* Top Header Surface */}
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-50 text-amber-700 shadow-2xs">
            <AlarmClock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-gray-900">Escalations Engine</h1>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-[10px] font-bold text-gray-600">
                {activeCount} Active
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Enterprise-grade background watchdogs monitoring SLA dates, expirations, and triggers.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh Escalations"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => onViewLogs()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
          >
            <History className="h-3.5 w-3.5 text-gray-500" />
            <span>Execution Logs</span>
          </button>
          <button
            type="button"
            onClick={onRunAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50/80 px-2.5 py-1.5 text-xs font-semibold text-amber-900 shadow-2xs hover:bg-amber-100 transition-colors"
          >
            <Zap className="h-3.5 w-3.5 text-amber-700" />
            <span>Run All Watchdogs</span>
          </button>
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Escalation</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search escalations by name, ID, or entity..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50/50 py-1.5 pl-8 pr-3 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 text-xs">
            <span className="text-[11px] font-semibold text-gray-400">Status:</span>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    statusFilter === s
                      ? 'bg-white font-semibold text-gray-900 shadow-2xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold text-gray-400">Applies To:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white py-1 pl-2.5 pr-8 text-xs font-semibold text-gray-800 shadow-2xs focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">All Entity Types</option>
              {entityTypes.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.display_name || t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-[11px] text-gray-400">
          Showing {filtered.length} of {escalations.length} escalation{escalations.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Main Escalation List Cards */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center">
            <AlarmClock className="h-10 w-10 text-gray-300" />
            <h3 className="mt-3 text-sm font-bold text-gray-800">No Escalations Found</h3>
            <p className="mt-1 max-w-sm text-xs text-gray-500">
              {search || statusFilter !== 'ALL' || typeFilter !== 'ALL'
                ? 'Try clearing your filters or search term to see more escalations.'
                : 'Define automatic SLA timers and dynamic date-based expiration watchdogs.'}
            </p>
            {!search && statusFilter === 'ALL' && typeFilter === 'ALL' && (
              <button
                type="button"
                onClick={onNew}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create First Escalation</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {filtered.map((esc) => (
              <EscalationCardItem
                key={esc.id}
                esc={esc}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleActive={onToggleActive}
                onRunSingle={onRunSingle}
                onViewLogs={onViewLogs}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
