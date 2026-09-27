import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  History,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Timer,
  Play,
  Zap,
  Shield,
  Layers,
  ChevronRight,
  X,
  Code,
  AlertCircle,
  Radio,
} from 'lucide-react';
import type { EscalationLog, Escalation } from '../../types';
import { api } from '../../api/client';
import { useEscalationCountdown } from './useEscalationCountdown';

interface EscalationLogsProps {
  escalationId?: string;
  onBack: () => void;
}

export function EscalationLogs({ escalationId: initialEscalationId, onBack }: EscalationLogsProps) {
  const [selectedEscalationId, setSelectedEscalationId] = useState<string | undefined>(initialEscalationId);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [currentEscalation, setCurrentEscalation] = useState<Escalation | null>(null);
  const [logs, setLogs] = useState<EscalationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'TRIGGERED'>('ALL');
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedLog, setSelectedLog] = useState<EscalationLog | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 3500);
  }, []);

  // Fetch escalations list for selector and active watchdog tracking
  const loadEscalationMeta = useCallback(async () => {
    try {
      const list = await api.listEscalations();
      setEscalations(list);
      if (selectedEscalationId) {
        const found = list.find((e) => e.id === selectedEscalationId);
        setCurrentEscalation(found || null);
      } else if (list.length > 0) {
        // Default to first active escalation for next-run timer if all selected
        const active = list.find((e) => e.status === 'ACTIVE') || list[0];
        setCurrentEscalation(active);
      }
    } catch {
      // Fallback
    }
  }, [selectedEscalationId]);

  const fetchLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const data = await api.getEscalationLogs(selectedEscalationId, 100);
      setLogs(data);
      // Refresh escalation metadata to sync last_run_at / status
      loadEscalationMeta();
    } catch {
      if (!isSilent) setLogs([]);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [selectedEscalationId, loadEscalationMeta]);

  useEffect(() => {
    setSelectedEscalationId(initialEscalationId);
  }, [initialEscalationId]);

  useEffect(() => {
    fetchLogs();
  }, [selectedEscalationId, fetchLogs]);

  // Handle cycle complete: if auto-refresh is active, quietly fetch fresh logs
  const handleCycleComplete = useCallback(() => {
    if (autoRefresh) {
      fetchLogs(true);
    }
  }, [autoRefresh, fetchLogs]);

  // Active countdown timer hook
  const timer = useEscalationCountdown(
    currentEscalation?.status || 'ACTIVE',
    currentEscalation?.last_run_at,
    currentEscalation?.check_interval_seconds || 5,
    handleCycleComplete
  );

  const handleRunNow = async () => {
    setRunning(true);
    try {
      if (selectedEscalationId) {
        const res = await api.runEscalation(selectedEscalationId);
        flash('ok', `Escalation ${selectedEscalationId} executed: ${res.triggered_count} action(s) triggered.`);
      } else {
        const res = await api.runAllEscalations();
        flash('ok', `All active watchdogs executed: ${res.triggered_count} action(s) triggered.`);
      }
      await fetchLogs();
    } catch (err: any) {
      flash('err', err.message || 'Execution failed');
    } finally {
      setRunning(false);
    }
  };

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (filterStatus !== 'ALL') {
        if (filterStatus === 'TRIGGERED' && l.status !== 'TRIGGERED' && l.status !== 'SUCCESS') return false;
        if (filterStatus === 'FAILED' && l.status !== 'FAILED' && l.status !== 'ERROR') return false;
        if (filterStatus === 'SKIPPED' && l.status !== 'SKIPPED') return false;
        if (filterStatus === 'SUCCESS' && l.status !== 'SUCCESS' && l.status !== 'TRIGGERED') return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchEsc = l.escalation_id.toLowerCase().includes(q);
        const matchEntity = (l.entity_id || '').toLowerCase().includes(q);
        const matchType = (l.entity_type || '').toLowerCase().includes(q);
        const matchMsg = (l.message || '').toLowerCase().includes(q);
        const matchAction = (l.action_type || '').toLowerCase().includes(q);
        if (!matchEsc && !matchEntity && !matchType && !matchMsg && !matchAction) return false;
      }
      return true;
    });
  }, [logs, filterStatus, search]);

  return (
    <div className="relative flex h-full w-full flex-col min-h-0 bg-slate-50/50">
      {notice && (
        <div
          className={`absolute top-4 right-4 z-50 rounded-xl border px-4 py-2.5 text-xs font-semibold shadow-lg transition-all ${
            notice.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-gray-500" />
            <span>Back to Escalations</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-gray-900">
                {selectedEscalationId ? `Watchdog Logs · ${selectedEscalationId}` : 'Enterprise Escalation Logs'}
              </h1>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-[10px] font-bold text-gray-600">
                {logs.length} logged
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Live audit trail of background watchdog checks, SLA timers, and automated actions.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Auto-Refresh Toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? 'Disable live auto-refresh' : 'Enable live auto-refresh'}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition-colors ${
              autoRefresh
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Radio className={`h-3 w-3 ${autoRefresh ? 'text-emerald-600 animate-pulse' : 'text-gray-400'}`} />
            <span>Live Sync: {autoRefresh ? 'ON' : 'OFF'}</span>
          </button>

          {/* Manual Run Now */}
          <button
            type="button"
            onClick={handleRunNow}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50/80 px-2.5 py-1.5 text-xs font-semibold text-amber-900 shadow-2xs hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            <Play className={`h-3.5 w-3.5 text-amber-700 ${running ? 'animate-spin' : ''}`} />
            <span>Run Now</span>
          </button>

          {/* Refresh Logs */}
          <button
            type="button"
            onClick={() => fetchLogs()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Hero: Live Next Run & Countdown Card */}
      <div className="border-b border-gray-200 bg-white p-4 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Card 1: Escalation Scope & Status */}
          <div className="flex flex-col justify-between rounded-xl border border-gray-200/80 bg-slate-50/60 p-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Watchdog Engine</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  timer.isActive
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 bg-gray-100 text-gray-500'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${timer.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                {timer.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="mt-2">
              <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                <Shield className="h-4 w-4 text-blue-600" />
                <span className="truncate">{currentEscalation?.name || 'All Background Watchdogs'}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                Target: <strong className="text-gray-700">{currentEscalation?.entity_type === '*' ? 'All Entities' : (currentEscalation?.entity_type || 'Universal')}</strong> · Applies to: <strong className="text-gray-700">{currentEscalation?.applies_to || 'entity'}</strong>
              </p>
            </div>
          </div>

          {/* Card 2: Next Run Time & Live Remaining Countdown */}
          <div className="flex flex-col justify-between rounded-xl border border-blue-200/80 bg-blue-50/30 p-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Next Scheduled Run</span>
              <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-800">
                <Clock className="h-3 w-3 text-blue-600" />
                Every {timer.intervalSeconds}s
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <div>
                <div className="text-base font-bold text-gray-900">
                  {timer.formattedNextRunTime}
                </div>
                <div className="text-[11px] text-gray-500">
                  {timer.isActive ? `Target: in ${timer.remainingSeconds}s` : 'Watchdog is paused'}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 py-1 font-mono text-base font-bold tracking-widest text-blue-900 shadow-2xs">
                  <Timer className={`h-4 w-4 text-blue-600 ${timer.isActive ? 'animate-pulse' : ''}`} />
                  <span>{timer.formattedCountdown}</span>
                </div>
              </div>
            </div>
            {/* Progress bar */}
            {timer.isActive && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-blue-100/80">
                <div
                  className="h-full bg-blue-600 transition-all duration-300 ease-linear rounded-full"
                  style={{ width: `${timer.progressPct}%` }}
                />
              </div>
            )}
          </div>

          {/* Card 3: Last Evaluation & Execution Stats */}
          <div className="flex flex-col justify-between rounded-xl border border-gray-200/80 bg-slate-50/60 p-3.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Last Evaluation</span>
              {currentEscalation?.last_run_status && (
                <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-700">
                  {currentEscalation.last_run_status}
                </span>
              )}
            </div>
            <div className="mt-2">
              <div className="text-sm font-bold text-gray-900">
                {currentEscalation?.last_run_at
                  ? new Date(currentEscalation.last_run_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : 'Never executed'}
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {currentEscalation?.last_run_at
                  ? `${new Date(currentEscalation.last_run_at).toLocaleDateString()} · Watchdog cycle verified`
                  : 'Waiting for initial scheduled trigger'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Escalation Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold text-gray-400">Scope:</span>
            <select
              value={selectedEscalationId || 'ALL'}
              onChange={(e) => setSelectedEscalationId(e.target.value === 'ALL' ? undefined : e.target.value)}
              className="rounded-lg border border-gray-200 bg-white py-1 pl-2.5 pr-8 text-xs font-semibold text-gray-800 shadow-2xs focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">All Escalations (System-Wide)</option>
              {escalations.map((esc) => (
                <option key={esc.id} value={esc.id}>
                  {esc.name} ({esc.id})
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by entity, action, or message..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50/50 py-1.5 pl-8 pr-3 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[11px] font-semibold text-gray-400">Status:</span>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              {(['ALL', 'SUCCESS', 'FAILED', 'SKIPPED'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilterStatus(s)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    filterStatus === s
                      ? 'bg-white font-semibold text-gray-900 shadow-2xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-gray-400">
          Showing {filtered.length} of {logs.length} log entr{logs.length === 1 ? 'y' : 'ies'}
        </div>
      </div>

      {/* Logs Table */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center">
            <History className="h-10 w-10 text-gray-300" />
            <h3 className="mt-3 text-sm font-bold text-gray-800">No Escalation Logs</h3>
            <p className="mt-1 max-w-sm text-xs text-gray-500">
              When background watchdogs evaluate records or trigger SLA actions, execution logs appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-2.5">Time</th>
                  <th className="px-4 py-2.5">Escalation</th>
                  <th className="px-4 py-2.5">Entity</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Action / Type</th>
                  <th className="px-4 py-2.5">Message / Details</th>
                  <th className="px-4 py-2.5 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((log) => {
                  const isSuccess = log.status === 'SUCCESS' || log.status === 'TRIGGERED';
                  const isFail = log.status === 'FAILED' || log.status === 'ERROR';
                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="cursor-pointer hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-gray-500">
                        {log.execution_time ? new Date(log.execution_time).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-gray-900 group-hover:text-blue-700">
                          {log.escalation_id}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-gray-800">{log.entity_id || '—'}</span>
                          {log.entity_type && (
                            <span className="text-[10px] text-gray-400">{log.entity_type}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            isSuccess
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : isFail
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : 'border-gray-200 bg-gray-50 text-gray-600'
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : isFail ? (
                            <XCircle className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          <span>{log.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {log.action_type && (
                            <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-700">
                              {log.action_type}
                            </span>
                          )}
                          {(log.actions_taken || []).map((a, i) => (
                            <span
                              key={i}
                              className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] text-gray-700"
                            >
                              {typeof a === 'string' ? a : a.action_type || a.type || JSON.stringify(a)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">
                        {log.message || (log.actions_taken?.length ? 'Triggered actions completed' : '—')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 shadow-2xs hover:bg-gray-50 hover:text-gray-900 transition-colors"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Detail Inspector Modal / Drawer */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-5 py-4">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-gray-500" />
                <h3 className="text-sm font-bold text-gray-900">Escalation Execution Log</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400">Escalation ID</span>
                  <div className="font-mono font-bold text-gray-900">{selectedLog.escalation_id}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400">Execution Time</span>
                  <div className="font-mono text-gray-700">
                    {selectedLog.execution_time ? new Date(selectedLog.execution_time).toLocaleString() : '—'}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400">Entity Scope</span>
                  <div className="font-mono text-gray-700">
                    {selectedLog.entity_id || 'Universal / Task'} ({selectedLog.entity_type || '—'})
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400">Execution Status</span>
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        selectedLog.status === 'SUCCESS' || selectedLog.status === 'TRIGGERED'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-red-200 bg-red-50 text-red-700'
                      }`}
                    >
                      {selectedLog.status}
                    </span>
                  </div>
                </div>
              </div>

              {selectedLog.message && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400">Message</span>
                  <div className="mt-1 rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs text-gray-800">
                    {selectedLog.message}
                  </div>
                </div>
              )}

              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400">Execution Payload / Details</span>
                  <pre className="mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-slate-900 p-3 font-mono text-[11px] text-emerald-400">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-gray-100 bg-gray-50/50 px-5 py-3">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-black transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
