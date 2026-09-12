import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import {
  Plus,
  RefreshCw,
  Loader2,
  Zap,
  X,
  ShieldCheck,
  ShieldX,
  ArrowRight,
  ChevronRight,
  Layers,
  FileText,
  Check,
  Workflow,
} from 'lucide-react';
import { api } from '../../api/client';
import { useHashRoute, navigate } from '../../lib/router';
import type {
  EntityRecord,
  EntityEvent,
  ValidTransition,
  EntityField,
  GateTraceItem,
} from '../../types';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-700 border-amber-200',
  active: 'bg-blue-100 text-blue-700 border-blue-200',
  published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
  expired: 'bg-red-100 text-red-700 border-red-200',
};

function statusBadge(s: string) {
  return (
    STATUS_BADGE[s?.toLowerCase()] ??
    'bg-blue-50 text-blue-700 border-blue-200'
  );
}

function truncate(id: string, n = 14) {
  return id.length <= n ? id : `${id.slice(0, 8)}…${id.slice(-5)}`;
}

const TITLE_KEYS = ['title', 'name', 'subject', 'summary', 'label'];

function entityTitle(e: { custom_fields: Record<string, unknown> }): string | null {
  const cf = e.custom_fields || {};
  for (const k of TITLE_KEYS) {
    const v = cf[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return null;
}

export function EntityConsole() {
  const route = useHashRoute();
  const [type, setType] = useState(() => route.query.get('type') || 'workorder');
  const [knownTypes, setKnownTypes] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState(() => route.query.get('status') || '');
  const [items, setItems] = useState<EntityRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fields, setFields] = useState<EntityField[]>([]);
  const [gateMap, setGateMap] = useState<Record<string, { label: string; gate_type: string }>>({});

  const [detail, setDetail] = useState<{ entity: EntityRecord; events: EntityEvent[] } | null>(null);
  const [valid, setValid] = useState<ValidTransition[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [fire, setFire] = useState<ValidTransition | null>(null);

  const selectedId = route.query.get('selected');

  const patchQuery = (patch: Record<string, string | undefined>) => {
    const q: Record<string, string> = { type, status: statusFilter || undefined } as Record<string, string>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') delete q[k];
      else q[k] = v;
    }
    navigate('/entities', q);
  };

  useEffect(() => {
    const t = route.query.get('type') || 'workorder';
    const s = route.query.get('status') || '';
    if (t !== type) setType(t);
    if (s !== statusFilter) setStatusFilter(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.query.toString(), route.query.get('type'), route.query.get('status')]);

  const loadMeta = useCallback(() => {
    api.listGates(type).then((gates) => {
      const map: Record<string, { label: string; gate_type: string }> = {};
      for (const g of gates) map[g.id] = { label: g.label, gate_type: g.gate_type };
      setGateMap(map);
    }).catch(() => setGateMap({}));
    api.listFields(type).then(setFields).catch(() => setFields([]));
  }, [type]);

  const loadList = useCallback(() => {
    setLoading(true);
    setError(null);
    api.listEntities(type, { status: statusFilter || undefined })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [type, statusFilter]);

  useEffect(() => {
    setDetail(null);
    setValid([]);
    loadMeta();
    loadList();
  }, [type, statusFilter, loadMeta, loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setValid([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    Promise.all([
      api.getEntity(type, selectedId),
      api.listValidTransitions(type, selectedId),
    ])
      .then(([res, vt]) => {
        if (cancelled) return;
        setDetail(res);
        setValid(vt.valid_transitions);
        setError(null);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setDetail(null);
        setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, type]);

  useEffect(() => {
    api
      .listWorkflows()
      .then((wfs) => setKnownTypes([...new Set(wfs.map((w) => w.entity_type))].sort()))
      .catch(() => {});
  }, []);

  const reloadDetail = () => {
    if (!detail) return;
    const id = detail.entity.id;
    api.getEntity(type, id).then(setDetail).catch(() => {});
    api.listValidTransitions(type, id).then((vt) => setValid(vt.valid_transitions)).catch(() => setValid([]));
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entity Console</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and drive real <span className="font-mono">{type}</span> records through published workflows.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={type}
            onChange={(e) => {
              const t = e.target.value.trim().toLowerCase() || 'workorder';
              setType(t);
              patchQuery({ type: t, selected: undefined });
            }}
            placeholder="entity_type"
            list="console-entity-types"
            className="w-44 rounded-md border border-gray-300 px-2.5 py-1.5 font-mono text-sm text-gray-700"
            title="Entity type to manage"
          />
          <datalist id="console-entity-types">
            {knownTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <input
            value={statusFilter}
            onChange={(e) => {
              const s = e.target.value.trim();
              setStatusFilter(s);
              patchQuery({ status: s });
            }}
            placeholder="status filter"
            className="w-32 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700"
            title="Filter by current workflow state"
          />

          <button
            onClick={loadList}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            onClick={() => navigate('/entities/new', { type })}
            className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" /> New {type || 'entity'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          {loading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : `${total} record(s)`}
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold">Entity</th>
              <th className="px-4 py-3 font-semibold">Current State</th>
              <th className="px-4 py-3 font-semibold">Workflow Version</th>
              <th className="px-4 py-3 font-semibold">Fields</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="px-4 py-3 text-right font-semibold">Open</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                  No {type} records{statusFilter ? ` in state "${statusFilter}"` : ''}. Create one to start driving the
                  workflow.
                </td>
              </tr>
            ) : (
              items.map((e) => (
                <tr key={e.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="max-w-[260px] truncate px-4 py-3 text-[13px] font-medium text-gray-800">
                    {entityTitle(e) ?? <span className="font-normal text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-gray-800">{truncate(e.id)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge(e.status)}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{e.workflow_version}</td>
                  <td className="px-4 py-3 text-gray-600">{Object.keys(e.custom_fields || {}).length}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {e.updated_at ? new Date(e.updated_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => patchQuery({ selected: e.id })}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      Drive <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <EntityDetail
          entityType={type}
          detail={detail}
          valid={valid}
          gateMap={gateMap}
          loading={detailLoading}
          onRefresh={reloadDetail}
          onClose={() => patchQuery({ selected: undefined })}
          onFire={(t) => setFire(t)}
        />
      )}

      {fire && detail && (
        <FireTransitionModal
          entityType={type}
          entity={detail.entity}
          transition={fire}
          fields={fields}
          gateMap={gateMap}
          onClose={() => setFire(null)}
          onDone={() => {
            setFire(null);
            reloadDetail();
            loadList();
          }}
        />
      )}
    </div>
  );
}

// ---- Entity detail slide-over ---------------------------------------------------------

function EntityDetail({
  entityType,
  detail,
  valid,
  gateMap,
  loading,
  onRefresh,
  onClose,
  onFire,
}: {
  entityType: string;
  detail: { entity: EntityRecord; events: EntityEvent[] };
  valid: ValidTransition[];
  gateMap: Record<string, { label: string; gate_type: string }>;
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
  onFire: (t: ValidTransition) => void;
}) {
  const { entity, events } = detail;

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-gray-900/30" onClick={onClose}>
      <aside
        className="flex h-full w-[420px] flex-col overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
          <Layers className="h-4 w-4 text-blue-700" />
          <h3 className="flex-1 truncate font-mono text-sm font-semibold text-gray-800">{entity.id}</h3>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge(entity.status)}`}>
            {entity.status}
          </span>
          <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[11px] text-blue-700">{entityType}</span>
          <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-600">{entity.workflow_version}</span>
        </div>

        <div className="px-4 pt-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Custom fields</label>
          {Object.keys(entity.custom_fields || {}).length === 0 ? (
            <p className="mt-1 text-xs text-gray-400">No custom fields set.</p>
          ) : (
            <div className="mt-1 flex flex-col gap-1">
              {Object.entries(entity.custom_fields).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-2 py-1">
                  <span className="font-mono text-[11px] text-gray-500">{k}</span>
                  <span className="max-w-[55%] truncate text-right text-xs font-medium text-gray-800">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 px-4">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Valid transitions ({valid.length})
          </label>
          <div className="mt-1 flex flex-col gap-1.5">
            {valid.length === 0 ? (
              <p className="text-xs text-gray-400">No legal transitions from this state.</p>
            ) : (
              valid.map((t) => {
                const gateIds = t.gates || [];
                return (
                  <button
                    key={t.event_type}
                    onClick={() => onFire(t)}
                    className="group flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-left hover:border-blue-400 hover:bg-blue-100"
                  >
                    <Zap className="h-4 w-4 shrink-0 text-blue-600" />
                    <span className="flex-1">
                      <span className="block font-mono text-xs font-bold text-blue-800">{t.event_type}</span>
                      <span className="flex items-center gap-1 text-[11px] text-blue-600">
                        {entity.status} <ArrowRight className="h-3 w-3" /> {transitionTarget(t)}
                      </span>
                    </span>
                    <span className="flex gap-0.5">
                      {gateIds.map((g) => (
                        <span
                          key={g}
                          title={gateMap[g]?.label || g}
                          className="flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold text-amber-700 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <ShieldCheck className="h-2.5 w-2.5" /> {gateIds.length} gate
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="mt-4 flex-1 px-4 pb-4">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Audit timeline</label>
            <button onClick={onRefresh} className="flex items-center gap-1 text-[11px] text-blue-700 hover:underline">
              <RefreshCw className="h-3 w-3" /> refresh
            </button>
          </div>
          <ol className="mt-2 flex flex-col border-l border-gray-200">
            {[...events].reverse().map((ev) => (
              <li key={ev.event_id} className="relative pl-4 pb-4">
                <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500" />
                <EventRow ev={ev} />
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

function EventRow({ ev }: { ev: EntityEvent }) {
  const [open, setOpen] = useState(false);
  const gateTrace = (ev.payload?.gate_trace as GateTraceItem[] | undefined) ?? null;
  const routing = ev.payload?.routing as RoutingSummary | undefined;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-blue-700">
          {ev.event_type}
        </span>
        {ev.from_state && (
          <span className="flex items-center gap-1 text-[11px] text-gray-500">
            {ev.from_state} <ArrowRight className="h-3 w-3" /> <span className="font-medium text-gray-700">{ev.to_state}</span>
          </span>
        )}
        <span className="text-[10px] text-gray-400">{ev.actor_id}</span>
        {ev.transaction_time && (
          <span className="text-[10px] text-gray-400">{new Date(ev.transaction_time).toLocaleString()}</span>
        )}
      </div>
      {gateTrace && gateTrace.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5">
          {gateTrace.map((g) => (
            <span
              key={g.gate_id}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${g.effective_pass ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
            >
              {g.effective_pass ? <ShieldCheck className="h-2.5 w-2.5" /> : <ShieldX className="h-2.5 w-2.5" />}
              {g.label} — {g.reason}
            </span>
          ))}
        </div>
      )}
      {routing && (
        <div className="mt-1 flex flex-wrap items-center gap-0.5">
          {routing.choices.map((c) => (
            <span
              key={c.choice_index}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                c.matched ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400 line-through'
              }`}
            >
              {c.matched ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
              c{String(c.choice_index)}→{c.to}
            </span>
          ))}
        </div>
      )}
      {(ev.payload?.comment || Object.keys(ev.payload || {}).length > 0) && (
        <button onClick={() => setOpen((o) => !o)} className="mt-1 text-[10px] font-medium text-gray-400 hover:text-blue-600">
          {open ? 'hide' : 'show'} payload
        </button>
      )}
      {open && (
        <pre className="mt-1 overflow-x-auto rounded-md bg-gray-50 p-2 text-[10px] text-gray-600">
          {JSON.stringify(ev.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---- Fire transition ---------------------------------------------------------

function FireTransitionModal({
  entityType,
  entity,
  transition,
  fields,
  gateMap,
  onClose,
  onDone,
}: {
  entityType: string;
  entity: EntityRecord;
  transition: ValidTransition;
  fields: EntityField[];
  gateMap: Record<string, { label: string; gate_type: string }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TransitionResponse | null>(null);

  const submit = async () => {
    setSaving(true);
    setErr(null);
    setLastResult(null);
    try {
      const res = await api.transition(entityType, {
        entity_id: entity.id,
        event_type: transition.event_type,
        custom_fields_delta: toCustomFields(values, fields),
        payload: comment.trim() ? { comment: comment.trim() } : undefined,
      });
      setLastResult(res);
      window.setTimeout(onDone, 900);
    } catch (e: any) {
      setErr(e.message);
      setLastResult({ new_status: '', gate_trace: e.body?.details?.gate_trace ?? [] });
    } finally {
      setSaving(false);
    }
  };

  const gateIds = transition.gates || [];

  return (
    <Modal
      title={`${transition.event_type}`}
      subtitle={`${entity.status} → ${transitionTarget(transition)}`}
      onClose={onClose}
    >
      {gateIds.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 p-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
            {gateIds.length} gate(s) will be enforced
          </label>
          {gateIds.map((g) => (
            <span key={g} className="flex items-center gap-1.5 text-[11px] text-amber-800">
              <ShieldCheck className="h-3 w-3" /> {gateMap[g]?.label || g}
              {gateMap[g]?.gate_type && (
                <span className="rounded bg-amber-200/60 px-1 font-mono text-[9px]">{gateMap[g]!.gate_type}</span>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Update fields (optional, sent as delta)
        </label>
        {fields.map((f) => (
          <FieldRow key={f.field_name} field={f} value={values[f.field_name] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [f.field_name]: v }))} />
        ))}
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comment / note for the event log (optional)"
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800 placeholder:text-gray-400"
        />
      </div>

      {err && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}

      {lastResult && (
        <div className="flex flex-col gap-1.5">
          {lastResult.gate_trace.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Gate results</label>
              {lastResult.gate_trace.map((g) => (
                <span
                  key={g.gate_id}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
                    g.effective_pass ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {g.effective_pass ? <ShieldCheck className="h-3 w-3" /> : <ShieldX className="h-3 w-3" />}
                  {g.label} — {g.reason}
                </span>
              ))}
            </div>
          )}
          {lastResult.routing && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Branch routing</label>
              {lastResult.routing.choices.map((c, i) => (
                <span
                  key={c.choice_index}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] ${
                    c.matched
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : i === lastResult.routing!.choice_index
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}
                >
                  {c.matched && <Check className="h-3 w-3" />}
                  c{String(c.choice_index)}: {c.to}
                  {c.when.length > 0 ? ` when ${c.when.join(', ')}` : ' (default)'}
                </span>
              ))}
            </div>
          )}
          {lastResult.side_effects && lastResult.side_effects.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Side effects</label>
              {lastResult.side_effects.map((s, i) => (
                <span
                  key={i}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
                    s.success ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {s.success ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {s.type}
                  {s.message ? ` — ${s.message}` : ''}
                </span>
              ))}
            </div>
          )}
          {lastResult.settled && lastResult.settled.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Auto-settled</label>
              {lastResult.settled.map((s, i) => (
                <span
                  key={i}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] ${
                    s.success ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {s.success ? <Workflow className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {s.event}
                  {s.to ? `: ${s.from} → ${s.to}` : ''}
                  {s.error ? ` — ${s.error}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={submit}
        disabled={saving}
        className="mt-2 flex items-center justify-center gap-1.5 rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        Fire {transition.event_type}
      </button>
    </Modal>
  );
}

// ---- Shared helpers ---------------------------------------------------------

type RoutingChoice = { choice_index: number; to: string; when: string[]; matched: boolean };
type RoutingSummary = { choice_index: number; to?: string; choices: RoutingChoice[] };

interface TransitionResponse {
  new_status: string;
  gate_trace: GateTraceItem[];
  routing?: RoutingSummary;
  side_effects?: Array<{ type: string; success: boolean; message?: string; [k: string]: unknown }>;
  settled?: Array<{ success: boolean; event: string; from?: string; to?: string; error?: string }>;
}

function transitionTarget(t: ValidTransition): string {
  if (t.to_state) return t.to_state;
  const targets = (t.choices || []).map((c) => c.to).filter(Boolean);
  return targets.length ? targets.join(' | ') : '…';
}

function toCustomFields(values: Record<string, string>, fields: EntityField[]): Record<string, unknown> {
  const byName = new Map(fields.map((f) => [f.field_name, f]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const trimmed = v.trim();
    if (trimmed === '') continue;
    const field = byName.get(k);
    if (field?.field_type === 'number') {
      const n = Number(trimmed);
      out[k] = Number.isNaN(n) ? trimmed : n;
    } else {
      out[k] = trimmed;
    }
  }
  return out;
}

function FieldRow({ field, value, onChange }: { field: EntityField; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const label = (
    <label htmlFor={id} className="flex items-center gap-1 text-[11px] font-semibold text-gray-600">
      <FileText className="h-3 w-3 text-gray-400" />
      {field.field_name}
      {field.required && <span className="text-red-500">*</span>}
      <span className="rounded bg-gray-100 px-1 font-mono text-[9px] text-gray-400">{field.field_type}</span>
    </label>
  );

  const input =
    field.field_type === 'select' ? (
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
      >
        <option value="">—</option>
        {(field.select_options || []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    ) : (
      <input
        id={id}
        type={
          field.field_type === 'number' ? 'number'
          : field.field_type === 'date' ? 'date'
          : 'text'
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.field_type === 'entity_reference' ? 'linked entity id' : ''}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
      />
    );

  return (
    <div className="flex flex-col gap-0.5">
      {label}
      {input}
    </div>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-gray-900/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-800">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}