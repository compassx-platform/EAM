import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Circle,
  ClipboardList,
  Copy,
  Flag,
  Info,
  ListChecks,
  Mail,
  Minus,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Timer,
  Trash2,
  Workflow,
} from 'lucide-react';
import type { ConditionDefinition } from '../../../types';
import { KIND_LABEL, NODE_KINDS, edgeDescription, type NodeKind, type WorkflowFlowEdge, type WorkflowFlowNode } from '../flowModel';
import { UnderlineTabs } from './ui';

const KIND_ICONS: Record<NodeKind, typeof Play> = {
  start: Play,
  state: Circle,
  task: ClipboardList,
  gate: ShieldCheck,
  manual: ListChecks,
  wait: Timer,
  sub: Workflow,
  comm: Mail,
  end: Flag,
};

interface NodeInspectorProps {
  node: WorkflowFlowNode;
  edges: WorkflowFlowEdge[];
  nodeLabels: string[];
  conditions: ConditionDefinition[];
  onKind: (id: string, kind: NodeKind) => void;
  onRename: (oldLabel: string, newLabel: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onTarget: (id: string, to: string) => void;
  onConditions: (id: string, conditions: string[]) => void;
  onEvent: (id: string, event: string) => void;
  onRemoveConnection: (id: string) => void;
  onNewCondition: () => void;
}

export function NodeInspector({
  node,
  edges,
  nodeLabels,
  conditions,
  onKind,
  onRename,
  onDuplicate,
  onDelete,
  onTarget,
  onConditions,
  onEvent,
  onRemoveConnection,
  onNewCondition,
}: NodeInspectorProps) {
  const [name, setName] = useState(node.data.label);
  const [editingName, setEditingName] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const typeRef = useRef<HTMLDivElement>(null);
  const kind = node.data.kind || 'state';

  const [eventPopup, setEventPopup] = useState<{ id: string; x: number; y: number } | null>(null);
  const [popupTab, setPopupTab] = useState<'details' | 'conditions'>('details');
  const popupRef = useRef<HTMLDivElement>(null);

  const outgoing = edges.filter((e) => e.source === node.id);
  const incoming = edges.filter((e) => e.target === node.id);

  useEffect(() => {
    if (typeOpen) return;
    if (!eventPopup) return;
    const onDocDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setEventPopup(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEventPopup(null);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [eventPopup]);

  useEffect(() => {
    if (!typeOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [typeOpen]);

  const SelectedIcon = KIND_ICONS[kind];

  const commitName = () => {
    setEditingName(false);
    const next = name.trim();
    setName(next || node.data.label);
    if (next && next !== node.data.label) onRename(node.data.label, next);
  };

  const startEdit = () => {
    setName(node.data.label);
    setEditingName(true);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      {editingName ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          onFocus={(e) => e.target.select()}
          className="-mx-1 w-[calc(100%+0.5rem)] rounded border border-blue-300 bg-blue-50/50 px-1 py-0 text-base font-bold text-gray-800 outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="group flex w-full items-center gap-2 text-left"
        >
          <span className="truncate text-base font-bold text-gray-800">{node.data.label}</span>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          State type
          <span className="group relative">
            <Info className="h-3 w-3 text-gray-300 transition-colors hover:text-gray-500" />
            <span className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-60 rounded-md bg-slate-900 p-2 text-[11px] font-normal normal-case leading-snug text-white shadow-lg group-hover:block">
              {NODE_KINDS.find((k) => k.kind === kind)?.description ?? 'A step in the process'}
            </span>
          </span>
        </label>
        <div ref={typeRef} className="relative">
          <button
            type="button"
            onClick={() => setTypeOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-left text-sm font-medium text-gray-800 hover:border-blue-300 focus:border-blue-500 focus:outline-none"
          >
            <span className="flex items-center gap-2">
              <SelectedIcon className="h-4 w-4 text-gray-500" />
              {KIND_LABEL[kind]}
            </span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${typeOpen ? 'rotate-180' : ''}`} />
          </button>
          {typeOpen && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
              {NODE_KINDS.map((k) => {
                const Icon = KIND_ICONS[k.kind];
                const active = k.kind === kind;
                return (
                  <button
                    key={k.kind}
                    type="button"
                    onClick={() => {
                      onKind(node.id, k.kind);
                      setTypeOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
                      active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-600' : 'text-gray-500'}`} />
                    <span className="flex-1">{k.label}</span>
                    {active && <Check className="h-3.5 w-3.5 text-blue-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Connected events</label>
        {outgoing.length + incoming.length === 0 ? (
          <p className="text-xs text-gray-400">No connections yet — drag between handles to add one.</p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {outgoing.map((e) => {
              const d = edgeDescription(e);
              return (
                <div key={e.id} className="flex w-full items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(ev) => {
                      const r = ev.currentTarget.getBoundingClientRect();
                      setEventPopup({ id: e.id, x: r.left, y: r.bottom + 4 });
                      setPopupTab('details');
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left transition-colors hover:bg-blue-50/60"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                        d.event ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {d.event || 'unset'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500">
                      fires <span className="font-medium text-gray-700">{d.to ?? '…'}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Remove connection"
                    onClick={() => onRemoveConnection(e.id)}
                    className="shrink-0 rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {incoming.map((e) => {
              const d = edgeDescription(e);
              return (
                <div key={e.id} className="flex w-full items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(ev) => {
                      const r = ev.currentTarget.getBoundingClientRect();
                      setEventPopup({ id: e.id, x: r.left, y: r.bottom + 4 });
                      setPopupTab('details');
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left transition-colors hover:bg-blue-50/60"
                  >
                    <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                        d.event ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {d.event || 'unset'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500">
                      from <span className="font-medium text-gray-700">{d.from}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Remove connection"
                    onClick={() => onRemoveConnection(e.id)}
                    className="shrink-0 rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() => onDuplicate(node.id)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          <Copy className="h-3.5 w-3.5" /> Duplicate
        </button>
        <button
          type="button"
          onClick={() => onDelete(node.id)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>

      {eventPopup && (() => {
        const edge = edges.find((e) => e.id === eventPopup.id);
        if (!edge) return null;
        const width = 360;
        return (
          <div
            ref={popupRef}
            className="fixed z-50 flex w-[360px] flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-2xl"
            style={{
              left: Math.min(eventPopup.x, window.innerWidth - width - 24),
              top: Math.min(eventPopup.y, window.innerHeight - 360),
            }}
          >
            <UnderlineTabs<'details' | 'conditions'>
              value={popupTab}
              onChange={setPopupTab}
              tabs={[
                { key: 'details', label: 'Details' },
                { key: 'conditions', label: 'Conditions' },
              ]}
            />

            {popupTab === 'details' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Event name</label>
                  <EventNameInput edge={edge} onCommit={onEvent} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Destination</label>
                  <select
                    value={edgeDescription(edge).to ?? ''}
                    onChange={(e) => onTarget(edge.id, e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">choose a state…</option>
                    {nodeLabels
                      .filter((l) => l !== edge.source)
                      .map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}

            {popupTab === 'conditions' && <ConditionsPicker edge={edge} conditions={conditions} onConditions={onConditions} onNewCondition={onNewCondition} />}
          </div>
        );
      })()}
    </div>
  );
}

function EventNameInput({ edge, onCommit }: { edge: WorkflowFlowEdge; onCommit: (id: string, event: string) => void }) {
  const [v, setV] = useState(edge.data?.event ?? 'EVENT');
  const commit = () => {
    const next = v.trim().toUpperCase();
    setV(next || edge.data?.event || 'EVENT');
    if (next && next !== edge.data?.event) onCommit(edge.id, next);
  };
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value.toUpperCase())}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
    />
  );
}

function ConditionsPicker({
  edge,
  conditions,
  onConditions,
  onNewCondition,
}: {
  edge: WorkflowFlowEdge;
  conditions: ConditionDefinition[];
  onConditions: (id: string, conditions: string[]) => void;
  onNewCondition: () => void;
}) {
  const guarded = edge.data?.conditions ?? [];
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Required conditions</label>
      <p className="-mt-0.5 text-[11px] leading-snug text-gray-400">ALL selected must pass for this event to fire.</p>
      {conditions.length === 0 ? (
        <p className="text-[11px] text-gray-400">No conditions registered for this entity yet.</p>
      ) : (
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {conditions.map((g) => {
            const checked = guarded.includes(g.id);
            return (
              <label
                key={g.id}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked ? [...guarded, g.id] : guarded.filter((x) => x !== g.id);
                    onConditions(edge.id, next);
                  }}
                  className="mt-0.5 h-3.5 w-3.5 accent-blue-600"
                />
                <span className="min-w-0">
                  <span className="block truncate text-xs text-gray-700">{g.label}</span>
                  <span className="block truncate font-mono text-[10px] text-blue-700">{g.id}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={onNewCondition}
        className="flex items-center gap-1 self-start rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
      >
        <Plus className="h-3 w-3" /> New condition…
      </button>
    </div>
  );
}