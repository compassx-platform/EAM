import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  AtSign,
  Check,
  ChevronDown,
  Circle,
  ClipboardList,
  Clock,
  Copy,
  Database,
  Flag,
  GitFork,
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
  User,
  UserCheck,
  Users2,
  Workflow,
} from 'lucide-react';
import type { ConditionDefinition, WorkflowRole } from '../../../types';
import { KIND_LABEL, NODE_KINDS, edgeDescription, type NodeKind, type WorkflowFlowEdge, type WorkflowFlowNode } from '../flowModel';
import { UnderlineTabs } from './ui';
import { ConditionCard } from './ConditionCard';
import { navigate } from '../../../lib/router';

const KIND_ICONS: Record<NodeKind, typeof Play> = {
  start: Play,
  state: Circle,
  router: GitFork,
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
  nodes?: WorkflowFlowNode[];
  edges: WorkflowFlowEdge[];
  nodeLabels: string[];
  conditions: ConditionDefinition[];
  roles?: WorkflowRole[];
  onKind: (id: string, kind: NodeKind) => void;
  onRename: (oldLabel: string, newLabel: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onTarget: (id: string, to: string) => void;
  onConditions: (id: string, conditions: string[]) => void;
  onNodeConditions?: (nodeId: string, conditions: string[]) => void;
  onNodeTaskAssignment?: (
    nodeId: string,
    updates: {
      role_id?: string | null;
      role_name?: string | null;
      task_instructions?: string | null;
      time_limit_hours?: number | null;
    }
  ) => void;
  onSetRouterBranch?: (nodeId: string, branch: 'TRUE' | 'FALSE', targetState: string) => void;
  onEvent: (id: string, event: string) => void;
  onRemoveConnection: (id: string) => void;
  onAddRoute?: (sourceId: string, targetId: string) => string | void;
  onEditCondition?: (condition: ConditionDefinition) => void;
  onNewCondition: (edgeId?: string, nodeId?: string) => void;
  onOpenRolesModule?: () => void;
}

export function NodeInspector({
  node,
  nodes,
  edges,
  nodeLabels,
  conditions,
  roles = [],
  onKind,
  onRename,
  onDuplicate,
  onDelete,
  onTarget,
  onConditions,
  onNodeConditions,
  onNodeTaskAssignment,
  onSetRouterBranch,
  onEvent,
  onRemoveConnection,
  onAddRoute,
  onEditCondition,
  onNewCondition,
  onOpenRolesModule,
}: NodeInspectorProps) {
  const [name, setName] = useState(node.data.label);
  const [editingName, setEditingName] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const typeRef = useRef<HTMLDivElement>(null);
  const kind = node.data.kind || 'state';

  // Event popup modal state
  const popupRef = useRef<HTMLDivElement>(null);
  const [eventPopup, setEventPopup] = useState<{ id: string; x: number; y: number } | null>(null);
  const [popupTab, setPopupTab] = useState<'conditions' | 'details'>('conditions');

  const outgoing = edges.filter((e) => e.source === node.id);
  const incoming = edges.filter((e) => e.target === node.id);

  useEffect(() => {
    setName(node.data.label);
  }, [node.data.label]);

  useEffect(() => {
    if (!typeOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [typeOpen]);

  useEffect(() => {
    if (!eventPopup) return;
    const onDocDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setEventPopup(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEventPopup(null);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [eventPopup]);

  const SelectedIcon = KIND_ICONS[kind] || KIND_ICONS.state;

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
                const Icon = KIND_ICONS[k.kind] || KIND_ICONS.state;
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

      {/* Task-specific Assignment & Role Inspector */}
      {kind === 'task' && (
        <TaskAssignmentSection
          node={node}
          roles={roles}
          onNodeTaskAssignment={onNodeTaskAssignment}
          onOpenRolesModule={onOpenRolesModule}
        />
      )}

      {/* Router-specific Inspector */}
      {kind === 'router' ? (
        <>
          {/* Condition Evaluation Block */}
          <RouterConditionSection
            node={node}
            conditions={conditions}
            onNodeConditions={onNodeConditions}
            onEditCondition={onEditCondition}
            onNewCondition={onNewCondition}
          />

          {/* Binary Branching Output Routes (TRUE & FALSE) */}
          <RouterBranchSection
            node={node}
            edges={edges}
            nodeLabels={nodeLabels}
            onSetRouterBranch={onSetRouterBranch}
            onRemoveConnection={onRemoveConnection}
          />

          {/* Incoming Connections to this Router */}
          {incoming.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Incoming Transitions ({incoming.length})
                </label>
                <span className="text-[10px] text-gray-400">Click to configure</span>
              </div>
              <div className="flex flex-col divide-y divide-gray-100">
                {incoming.map((e) => {
                  const d = edgeDescription(e);
                  const guarded = (e.data?.conditions || []).length > 0;
                  return (
                    <div key={e.id} className="flex w-full items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(ev) => {
                          const r = ev.currentTarget.getBoundingClientRect();
                          setEventPopup({ id: e.id, x: r.left, y: r.bottom + 4 });
                          setPopupTab('conditions');
                        }}
                        className="group/btn flex min-w-0 flex-1 items-center gap-2 rounded p-1.5 text-left transition-colors hover:bg-blue-50/70"
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
                          from <span className="font-semibold text-gray-700">{d.from}</span>
                        </span>
                        {guarded ? (
                          <span className="flex shrink-0 items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                            <ShieldCheck className="h-3 w-3" /> condition
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] text-gray-300 group-hover/btn:text-blue-600">
                            + condition
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        title="Remove connection"
                        onClick={() => {
                          onRemoveConnection(e.id);
                          if (eventPopup?.id === e.id) setEventPopup(null);
                        }}
                        className="shrink-0 rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Standard Connected events list */
        <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Connected events ({outgoing.length + incoming.length})
            </label>
            <span className="text-[10px] text-gray-400">Click to configure</span>
          </div>

          {outgoing.length + incoming.length === 0 ? (
            <p className="text-xs text-gray-400">No connections yet — drag between handles to add one.</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {outgoing.map((e) => {
                const d = edgeDescription(e);
                const guarded = (e.data?.conditions || []).length > 0;
                return (
                  <div key={e.id} className="flex w-full items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(ev) => {
                        const r = ev.currentTarget.getBoundingClientRect();
                        setEventPopup({ id: e.id, x: r.left, y: r.bottom + 4 });
                        setPopupTab('conditions');
                      }}
                      className="group/btn flex min-w-0 flex-1 items-center gap-2 rounded p-1.5 text-left transition-colors hover:bg-blue-50/70"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                          d.event ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {d.event || 'unset'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500">
                        fires <span className="font-semibold text-gray-700">{d.to ?? '…'}</span>
                      </span>
                      {guarded ? (
                        <span className="flex shrink-0 items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                          <ShieldCheck className="h-3 w-3" /> condition
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] text-gray-300 group-hover/btn:text-blue-600">
                          + condition
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      title="Remove connection"
                      onClick={() => {
                        onRemoveConnection(e.id);
                        if (eventPopup?.id === e.id) setEventPopup(null);
                      }}
                      className="shrink-0 rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
              {incoming.map((e) => {
                const d = edgeDescription(e);
                const sourceNode = nodes?.find((n) => n.id === e.source);
                const isFromRouter = sourceNode?.data?.kind === 'router' || Boolean(e.data?.isRouterSource || e.sourceHandle === 'TRUE' || e.sourceHandle === 'FALSE');
                const guarded = (e.data?.conditions || []).length > 0;

                if (isFromRouter) {
                  return (
                    <div key={e.id} className="flex w-full items-center justify-between py-1 px-1.5 text-xs text-gray-600 bg-gray-50/50 rounded">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold bg-gray-100 text-gray-700">
                          {d.event === 'TRUE' ? 'TRUE route' : d.event === 'FALSE' ? 'FALSE route' : d.event}
                        </span>
                        <span className="min-w-0 truncate text-[11px] text-gray-500">
                          from router <span className="font-semibold text-gray-700">{d.from}</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        title="Disconnect route"
                        onClick={() => {
                          onRemoveConnection(e.id);
                          if (eventPopup?.id === e.id) setEventPopup(null);
                        }}
                        className="shrink-0 rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={e.id} className="flex w-full items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(ev) => {
                        const r = ev.currentTarget.getBoundingClientRect();
                        setEventPopup({ id: e.id, x: r.left, y: r.bottom + 4 });
                        setPopupTab('conditions');
                      }}
                      className="group/btn flex min-w-0 flex-1 items-center gap-2 rounded p-1.5 text-left transition-colors hover:bg-blue-50/70"
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
                        from <span className="font-semibold text-gray-700">{d.from}</span>
                      </span>
                      {guarded ? (
                        <span className="flex shrink-0 items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                          <ShieldCheck className="h-3 w-3" /> condition
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] text-gray-300 group-hover/btn:text-blue-600">
                          + condition
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      title="Remove connection"
                      onClick={() => {
                        onRemoveConnection(e.id);
                        if (eventPopup?.id === e.id) setEventPopup(null);
                      }}
                      className="shrink-0 rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {onAddRoute && (
            <div className="pt-1">
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    onAddRoute(node.id, e.target.value);
                    e.target.value = '';
                  }
                }}
                className="w-full rounded-md border border-dashed border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none cursor-pointer"
              >
                <option value="">+ Add route to state…</option>
                {nodeLabels
                  .filter((l) => l !== node.data.label)
                  .map((l) => (
                    <option key={l} value={l}>
                      → {l}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      )}

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

      {/* Event Details & Conditions Pop-up Modal */}
      {eventPopup && (() => {
        const edge = edges.find((e) => e.id === eventPopup.id);
        if (!edge) return null;
        const desc = edgeDescription(edge);
        const guarded = edge.data?.conditions ?? [];
        const selectedConditionId = guarded[0] || '';
        const selectedCondition = conditions.find((c) => c.id === selectedConditionId) ?? null;
        const width = 380;

        return (
          <div
            ref={popupRef}
            className="fixed z-50 flex w-[380px] max-h-[85vh] flex-col gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white p-3.5 shadow-2xl"
            style={{
              left: Math.max(16, Math.min(eventPopup.x - 400, window.innerWidth - width - 24)),
              top: Math.max(16, Math.min(eventPopup.y - 100, window.innerHeight - 450)),
            }}
          >
            <UnderlineTabs<'conditions' | 'details'>
              value={popupTab}
              onChange={setPopupTab}
              tabs={[
                { key: 'conditions', label: `Condition${selectedConditionId ? ' (1)' : ''}` },
                { key: 'details', label: 'Event Details' },
              ]}
            />

            <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
              {popupTab === 'conditions' && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Condition
                      <span className="group relative inline-flex items-center">
                        <Info className="h-3.5 w-3.5 text-gray-400 transition-colors hover:text-gray-600" />
                        <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-64 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium normal-case leading-snug text-white shadow-2xl group-hover:block border border-gray-700">
                          Select a condition from the condition module. The condition must pass for this event to fire.
                        </span>
                      </span>
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <select
                      value={selectedConditionId}
                      onChange={(e) => {
                        const id = e.target.value;
                        onConditions(edge.id, id ? [id] : []);
                      }}
                      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-800 hover:border-blue-300 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">— No condition (unguarded) —</option>
                      {conditions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label} ({c.id})
                        </option>
                      ))}
                    </select>

                    {selectedCondition ? (
                      <ConditionCard
                        condition={selectedCondition}
                        onEdit={onEditCondition}
                        onRemove={() => onConditions(edge.id, [])}
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-4 text-center">
                        <ShieldCheck className="mx-auto h-6 w-6 text-gray-300" />
                        <p className="mt-1 text-xs font-medium text-gray-600">No condition attached</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          This transition is unguarded and fires immediately when triggered.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onNewCondition(edge.id)}
                        className="flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Plus className="h-3 w-3" /> New condition…
                      </button>
                      {selectedCondition && onEditCondition && (
                        <button
                          type="button"
                          onClick={() => onEditCondition(selectedCondition)}
                          className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Pencil className="h-3 w-3" /> Edit in condition module
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {popupTab === 'details' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Event name</label>
                    <EventNameInput edge={edge} onCommit={onEvent} />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Destination</label>
                    <select
                      value={desc.to ?? ''}
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

                  <button
                    type="button"
                    onClick={() => setPopupTab('conditions')}
                    className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50/60 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> Configure Condition {selectedConditionId ? '(1)' : ''}
                  </button>
                </div>
              )}
            </div>
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

function RouterConditionSection({
  node,
  conditions,
  onNodeConditions,
  onEditCondition,
  onNewCondition,
}: {
  node: WorkflowFlowNode;
  conditions: ConditionDefinition[];
  onNodeConditions?: (nodeId: string, conditions: string[]) => void;
  onEditCondition?: (condition: ConditionDefinition) => void;
  onNewCondition: (edgeId?: string, nodeId?: string) => void;
}) {
  const nodeConditions = node.data.conditions || (node.data.condition_id ? [node.data.condition_id] : []);
  const selectedConditionId = nodeConditions[0] || '';
  const selectedCondition = conditions.find((c) => c.id === selectedConditionId) ?? null;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [menuOpen]);

  const selectCondition = (id: string) => {
    onNodeConditions?.(node.id, id ? [id] : []);
    setMenuOpen(false);
  };

  return (
    <div ref={menuRef} className="relative flex flex-col gap-1.5 border-t border-gray-100 pt-3">
      {/* Header with Title, Info Tooltip, and Add Button when no condition */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Evaluation Condition
          <span className="group relative inline-flex items-center">
            <Info className="h-3.5 w-3.5 cursor-default text-gray-400 transition-colors hover:text-gray-600" />
            <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-64 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium normal-case leading-snug text-white shadow-2xl group-hover:block border border-gray-700">
              Select a condition from the Condition Module. The router evaluates this condition to determine whether to follow the TRUE or FALSE path.
            </span>
          </span>
        </span>

        {!selectedConditionId && (
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            title="Add condition"
            className="flex items-center gap-1 rounded border border-dashed border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
          >
            <Plus className="h-3 w-3" />
            <span>Add</span>
          </button>
        )}
      </div>

      {/* Selected condition pill */}
      {selectedConditionId && (
        <div className="flex items-center justify-between gap-1 rounded-lg border border-gray-200 bg-gray-50/80 p-1.5 transition-colors hover:border-gray-300">
          {/* Clickable condition button: directly opens edit condition window */}
          <button
            type="button"
            onClick={() => {
              if (selectedCondition && onEditCondition) {
                onEditCondition(selectedCondition);
              }
            }}
            className="group flex min-w-0 flex-1 items-center gap-1.5 text-left"
            title="Click to edit condition in condition module"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 text-slate-600" />
            <span className="truncate text-xs font-semibold text-gray-800 group-hover:text-blue-600">
              {selectedCondition?.label || selectedConditionId}
            </span>
            <Pencil className="h-3 w-3 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-blue-600" />
          </button>

          {/* Action buttons: Change (dropdown arrow) and Remove (-) */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              title="Change condition"
              className={`rounded p-1 text-gray-500 transition-colors hover:bg-gray-200/60 hover:text-gray-800 ${
                menuOpen ? 'bg-gray-200/60 text-gray-800' : ''
              }`}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => onNodeConditions?.(node.id, [])}
              title="Remove condition"
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Dropdown Menu (Opens directly on 1st click of Down Arrow or + Add) */}
      {menuOpen && (
        <div className="absolute top-full left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
          {selectedConditionId && (
            <button
              type="button"
              onClick={() => selectCondition('')}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50 hover:text-red-600"
            >
              <Minus className="h-3.5 w-3.5 text-gray-400" />
              <span>— No condition (remove) —</span>
            </button>
          )}

          {conditions.map((c) => {
            const active = c.id === selectedConditionId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCondition(c.id)}
                className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                  active ? 'bg-blue-50 font-bold text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{c.label}</span>
                  <span className="truncate font-mono text-[10px] text-gray-400">{c.id}</span>
                </div>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
              </button>
            );
          })}

          <div className="border-t border-gray-100 mt-1 pt-1 px-1">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onNewCondition(undefined, node.id);
              }}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs font-semibold text-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create new condition…</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RouterBranchSection({
  node,
  edges,
  nodeLabels,
  onSetRouterBranch,
  onRemoveConnection,
}: {
  node: WorkflowFlowNode;
  edges: WorkflowFlowEdge[];
  nodeLabels: string[];
  onSetRouterBranch?: (nodeId: string, branch: 'TRUE' | 'FALSE', targetState: string) => void;
  onRemoveConnection: (id: string) => void;
}) {
  const outgoing = edges.filter((e) => e.source === node.id);
  const trueEdge = outgoing.find((e) => e.data?.event === 'TRUE');
  const falseEdge = outgoing.find((e) => e.data?.event === 'FALSE');
  const otherOutgoing = outgoing.filter((e) => e.data?.event !== 'TRUE' && e.data?.event !== 'FALSE');
  const availableTargets = nodeLabels.filter((l) => l !== node.data.label);

  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Branching Routes
          <span className="group relative inline-flex items-center">
            <Info className="h-3.5 w-3.5 cursor-default text-gray-400 transition-colors hover:text-gray-600" />
            <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-64 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium normal-case leading-snug text-white shadow-2xl group-hover:block border border-gray-700">
              The router evaluates its condition and automatically routes along one of two output paths without conditions on the transitions.
            </span>
          </span>
        </span>
      </div>

      {/* TRUE Route */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-gray-800">
              TRUE
            </span>
            <span className="text-xs text-gray-500">· Condition passes</span>
          </div>
          {trueEdge && (
            <button
              type="button"
              onClick={() => onRemoveConnection(trueEdge.id)}
              title="Disconnect TRUE branch"
              className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={trueEdge?.target || ''}
          onChange={(e) => onSetRouterBranch?.(node.id, 'TRUE', e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 hover:border-gray-400 focus:border-blue-500 focus:outline-none cursor-pointer"
        >
          <option value="">{trueEdge ? '— Disconnect TRUE route —' : 'Select destination state for TRUE…'}</option>
          {availableTargets.map((target) => (
            <option key={target} value={target}>
              → {target}
            </option>
          ))}
        </select>
      </div>

      {/* FALSE Route */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-gray-800">
              FALSE
            </span>
            <span className="text-xs text-gray-500">· Condition fails / Fallback</span>
          </div>
          {falseEdge && (
            <button
              type="button"
              onClick={() => onRemoveConnection(falseEdge.id)}
              title="Disconnect FALSE branch"
              className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={falseEdge?.target || ''}
          onChange={(e) => onSetRouterBranch?.(node.id, 'FALSE', e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 hover:border-gray-400 focus:border-blue-500 focus:outline-none cursor-pointer"
        >
          <option value="">{falseEdge ? '— Disconnect FALSE route —' : 'Select destination state for FALSE…'}</option>
          {availableTargets.map((target) => (
            <option key={target} value={target}>
              → {target}
            </option>
          ))}
        </select>
      </div>

      {/* Other Outgoing (if any custom edge created) */}
      {otherOutgoing.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Other outgoing events</span>
          {otherOutgoing.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
              <span className="font-mono text-gray-700">{e.data?.event} → {e.target}</span>
              <button
                type="button"
                onClick={() => onRemoveConnection(e.id)}
                className="text-gray-400 hover:text-red-600"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskAssignmentSection({
  node,
  roles = [],
  onNodeTaskAssignment,
  onOpenRolesModule,
}: {
  node: WorkflowFlowNode;
  roles?: WorkflowRole[];
  onNodeTaskAssignment?: (
    nodeId: string,
    updates: {
      role_id?: string | null;
      role_name?: string | null;
      task_instructions?: string | null;
      time_limit_hours?: number | null;
    }
  ) => void;
  onOpenRolesModule?: () => void;
}) {
  const selectedRoleId = node.data.role_id || '';
  const selectedRole = roles.find((r) => r.id === selectedRoleId) ?? null;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [instructions, setInstructions] = useState(node.data.task_instructions || '');
  const [timeLimit, setTimeLimit] = useState(node.data.time_limit_hours?.toString() || '');

  useEffect(() => {
    setInstructions(node.data.task_instructions || '');
  }, [node.data.task_instructions]);

  useEffect(() => {
    setTimeLimit(node.data.time_limit_hours !== null && node.data.time_limit_hours !== undefined ? node.data.time_limit_hours.toString() : '');
  }, [node.data.time_limit_hours]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [menuOpen]);

  const selectRole = (role: WorkflowRole | null) => {
    onNodeTaskAssignment?.(node.id, {
      role_id: role ? role.id : null,
      role_name: role ? role.name : null,
    });
    setMenuOpen(false);
  };

  const commitInstructions = () => {
    onNodeTaskAssignment?.(node.id, {
      task_instructions: instructions.trim() || null,
    });
  };

  const commitTimeLimit = () => {
    const num = timeLimit.trim() ? parseInt(timeLimit.trim(), 10) : null;
    onNodeTaskAssignment?.(node.id, {
      time_limit_hours: isNaN(num as number) ? null : num,
    });
  };

  const getRoleIcon = (type?: string) => {
    switch (type) {
      case 'PERSON_GROUP':
        return Users2;
      case 'DATASET_ATTRIBUTE':
        return Database;
      case 'EMAIL_ADDRESS':
        return AtSign;
      default:
        return User;
    }
  };

  const SelectedRoleIcon = getRoleIcon(selectedRole?.role_type);

  return (
    <div ref={menuRef} className="relative flex flex-col gap-2.5 border-t border-gray-100 pt-3">
      {/* Header with Title and Info Tooltip */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          <UserCheck className="h-3.5 w-3.5 text-gray-500" />
          Task Assignment & Role
          <span className="group relative inline-flex items-center">
            <Info className="h-3.5 w-3.5 cursor-default text-gray-400 transition-colors hover:text-gray-600" />
            <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-64 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium normal-case leading-snug text-white shadow-2xl group-hover:block border border-gray-700">
              Link dynamic workflow roles modeled after IBM Maximo MAXROLE to dynamically route this task to a Person, Person Group, or Dataset Attribute with active availability & delegation awareness.
            </span>
          </span>
        </span>

        {!selectedRoleId && (
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            title="Assign Role"
            className="flex items-center gap-1 rounded border border-dashed border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
          >
            <Plus className="h-3 w-3" />
            <span>Assign</span>
          </button>
        )}
      </div>

      {/* Selected Role Pill / Card */}
      {selectedRoleId ? (
        <div className="flex items-center justify-between gap-1 rounded-lg border border-gray-200 bg-gray-50/80 p-2 transition-colors hover:border-gray-300">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white border border-gray-200 text-gray-700">
              <SelectedRoleIcon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-semibold text-gray-800">
                  {selectedRole?.name || selectedRoleId}
                </span>
                {selectedRole && (
                  <span className="rounded px-1 py-0.2 font-mono text-[9px] font-bold uppercase bg-gray-200/70 text-gray-700">
                    {selectedRole.role_type}
                  </span>
                )}
              </div>
              <div className="truncate font-mono text-[10px] text-gray-400">
                {selectedRoleId}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              title="Change role"
              className={`rounded p-1 text-gray-500 transition-colors hover:bg-gray-200/60 hover:text-gray-800 ${
                menuOpen ? 'bg-gray-200/60 text-gray-800' : ''
              }`}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => selectRole(null)}
              title="Unassign role"
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-2.5 text-center">
          <p className="text-xs font-medium text-gray-500">No role assigned</p>
          <p className="mt-0.5 text-[10px] text-gray-400">
            Click '+ Assign' to bind a Maximo dynamic routing role.
          </p>
        </div>
      )}

      {/* Role Picker Dropdown */}
      {menuOpen && (
        <div className="absolute top-10 left-0 right-0 z-30 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
          {selectedRoleId && (
            <button
              type="button"
              onClick={() => selectRole(null)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50 hover:text-red-600"
            >
              <Minus className="h-3.5 w-3.5 text-gray-400" />
              <span>— None (unassign role) —</span>
            </button>
          )}

          {roles.map((r) => {
            const active = r.id === selectedRoleId;
            const Icon = getRoleIcon(r.role_type);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => selectRole(r)}
                className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                  active ? 'bg-blue-50 font-bold text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{r.name}</span>
                    <span className="truncate font-mono text-[10px] text-gray-400">
                      {r.id} · {r.role_type}
                    </span>
                  </div>
                </div>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
              </button>
            );
          })}

          <div className="border-t border-gray-100 mt-1 pt-1 px-1">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                if (onOpenRolesModule) onOpenRolesModule();
                else navigate('/people/roles/new');
              }}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs font-semibold text-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create new role in Roles module…</span>
            </button>
          </div>
        </div>
      )}

      {/* Task Instructions Field */}
      <div className="flex flex-col gap-1 pt-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Instructions / Task Guidance
        </label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          onBlur={commitInstructions}
          rows={2}
          placeholder="Guidance shown to assigned person when performing this task…"
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-none"
        />
      </div>

      {/* SLA / Time Limit */}
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          <Clock className="h-3 w-3" />
          Time Limit (Hours)
        </label>
        <input
          type="number"
          min="1"
          value={timeLimit}
          onChange={(e) => setTimeLimit(e.target.value)}
          onBlur={commitTimeLimit}
          placeholder="e.g. 24"
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>
    </div>
  );
}