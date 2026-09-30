import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Compass, GitFork, Info, Mail, Minus, Pencil, Play, Plus, ShieldCheck, Timer, Trash2, Workflow, Zap } from 'lucide-react';
import type { ConditionDefinition, WorkflowAction } from '../../types';
import {
  edgeDescription,
  isConditionKind,
  isActionKind,
  isSubprocessKind,
  kindDefaultLabel,
  type WorkflowFlowEdge,
  type WorkflowFlowNode,
  type EventEdgeData,
  type NodeKind,
} from './types';
import { DashedButton, Disclosure, SectionLabel } from './ui';

interface ActionInspectorProps {
  edge: WorkflowFlowEdge;
  sourceNode?: WorkflowFlowNode | null;
  nodeLabels: string[];
  conditions: ConditionDefinition[];
  actionTypes: Array<{ type: string; name: string; description: string }>;
  isRouterSource?: boolean;
  onEvent: (id: string, event: string) => void;
  onEdgeDataChange?: (id: string, updates: Partial<EventEdgeData>) => void;
  onTarget?: (id: string, to: string) => void;
  onConditions: (id: string, conditions: string[]) => void;
  onOnAfter: (id: string, actions: WorkflowAction[]) => void;
  onDelete: (id: string) => void;
  onEditCondition?: (condition: ConditionDefinition) => void;
  onNewCondition: () => void;
}

export function ActionInspector(p: ActionInspectorProps) {
  const {
    edge,
    sourceNode,
    conditions,
    onEditCondition,
    onNewCondition,
    onConditions,
    actionTypes,
    isRouterSource,
    onTarget,
    onEdgeDataChange,
    nodeLabels,
  } = p;

  const [eventValue, setEventValue] = useState(edge.data?.event ?? 'EVENT');
  const [labelValue, setLabelValue] = useState(edge.data?.button_label || edge.data?.label || '');
  const [buttonStyle, setButtonStyle] = useState<'primary' | 'secondary' | 'danger' | 'default'>(edge.data?.button_style || 'primary');
  const [isSystemEvent, setIsSystemEvent] = useState<boolean>(Boolean(edge.data?.is_system));
  const [descriptionValue, setDescriptionValue] = useState(edge.data?.description || '');
  const [editingEvent, setEditingEvent] = useState(false);
  const desc = edgeDescription(edge);

  useEffect(() => {
    setEventValue(edge.data?.event ?? 'EVENT');
    setLabelValue(edge.data?.button_label || edge.data?.label || '');
    setButtonStyle(edge.data?.button_style || 'primary');
    setIsSystemEvent(Boolean(edge.data?.is_system));
    setDescriptionValue(edge.data?.description || '');
  }, [edge.data?.event, edge.data?.button_label, edge.data?.label, edge.data?.button_style, edge.data?.is_system, edge.data?.description]);

  const commitEvent = () => {
    setEditingEvent(false);
    const next = eventValue.trim().toUpperCase();
    setEventValue(next || edge.data?.event || 'EVENT');
    if (next && next !== edge.data?.event) p.onEvent(edge.id, next);
  };

  const commitLabel = (newLabel: string) => {
    setLabelValue(newLabel);
    onEdgeDataChange?.(edge.id, {
      label: newLabel.trim() || undefined,
      button_label: newLabel.trim() || undefined,
    });
  };

  const commitButtonStyle = (style: 'primary' | 'secondary' | 'danger' | 'default') => {
    setButtonStyle(style);
    onEdgeDataChange?.(edge.id, { button_style: style });
  };

  const commitIsSystem = (systemVal: boolean) => {
    setIsSystemEvent(systemVal);
    onEdgeDataChange?.(edge.id, { is_system: systemVal });
  };

  const commitDescription = (descVal: string) => {
    setDescriptionValue(descVal);
    onEdgeDataChange?.(edge.id, { description: descVal.trim() || undefined });
  };

  const startEdit = () => {
    setEventValue(edge.data?.event ?? 'EVENT');
    setEditingEvent(true);
  };

  // Determine source node kind and classification
  const sourceNodeKind: NodeKind = sourceNode?.data?.kind || edge.data?.sourceNodeKind || (isRouterSource ? 'condition' : 'task');
  const sourceNodeLabel = sourceNode?.data?.label || edge.source;

  const isTrueBranch = edge.data?.event === 'TRUE';
  const isFalseBranch = edge.data?.event === 'FALSE';
  const isRouterBranch = Boolean(isRouterSource || edge.data?.isRouterSource || isConditionKind(sourceNodeKind));
  const isStartSource = sourceNodeKind === 'start';
  const isActionSource = isActionKind(sourceNodeKind);
  const isWaitSource = sourceNodeKind === 'wait';
  const isInteractionSource = sourceNodeKind === 'interaction';
  const isSubprocessSource = isSubprocessKind(sourceNodeKind);
  const isAutoProgression = isStartSource || isActionSource || isWaitSource || isInteractionSource || isSubprocessSource;

  // Action Line Classification
  const curEventUpper = (edge.data?.event || 'EVENT').toUpperCase();
  const isPositiveAction = ['APPROVE', 'COMPLETE', 'SUBMIT', 'ACCEPT', 'YES', 'PASS', 'START', 'ISSUE'].includes(curEventUpper);
  const isNegativeAction = ['REJECT', 'REROUTE', 'RETURN', 'CANCEL', 'NO', 'FAIL', 'ABORT'].includes(curEventUpper);
  const isOptionAction = curEventUpper.startsWith('OPTION');

  let lineClassification = 'Action Button / Transition';
  if (isRouterBranch) {
    lineClassification = isTrueBranch
      ? 'Positive Condition Branch (TRUE)'
      : isFalseBranch
      ? 'Negative Condition Branch (FALSE)'
      : 'Router Condition Branch';
  } else if (isStartSource) {
    lineClassification = 'Process Entry Line (START)';
  } else if (isActionSource) {
    lineClassification = 'Automated Action Follow-Through (NEXT)';
  } else if (isWaitSource) {
    lineClassification = 'Timer / Wait Follow-Through (NEXT)';
  } else if (isInteractionSource) {
    lineClassification = 'Interaction Follow-Through (NEXT)';
  } else if (isSubprocessSource) {
    lineClassification = 'Subprocess Resume Line (NEXT)';
  } else if (isSystemEvent) {
    lineClassification = 'Automated System Trigger';
  } else if (isPositiveAction) {
    lineClassification = 'Positive Action Button';
  } else if (isNegativeAction) {
    lineClassification = 'Negative / Rejection Action';
  } else if (isOptionAction) {
    lineClassification = 'Interactive Option Action';
  }

  const quickPresets = isRouterBranch || isAutoProgression
    ? []
    : [
        { label: 'Submit for JSA', event: 'SUBMIT_FOR_JSA', style: 'primary' as const },
        { label: 'Approve Safety', event: 'APPROVE_SAFETY', style: 'primary' as const },
        { label: 'Issue Permit', event: 'ISSUE_PERMIT', style: 'primary' as const },
        { label: 'Suspend Work', event: 'SUSPEND_WORK', style: 'secondary' as const },
        { label: 'Resume Work', event: 'RESUME_WORK', style: 'primary' as const },
        { label: 'Handback Permit', event: 'HANDBACK_PERMIT', style: 'primary' as const },
        { label: 'Revalidate Permit', event: 'REVALIDATE_PERMIT', style: 'primary' as const },
        { label: 'Close Permit', event: 'CLOSE_PERMIT', style: 'secondary' as const },
        { label: 'Reject', event: 'REJECT', style: 'danger' as const },
      ];

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Mode A: Condition / Router Branch */}
      {isRouterBranch ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <GitFork className="h-4 w-4 text-slate-500 shrink-0" />
            <span className="rounded border border-gray-200 bg-white px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-gray-800">
              {isTrueBranch ? 'TRUE Branch' : isFalseBranch ? 'FALSE Branch' : edge.data?.event || 'BRANCH'}
            </span>
            <span className="text-xs font-medium text-gray-500">Router outlet</span>
          </div>
        </div>
      ) : isAutoProgression ? (
        /* Mode B: Automatic Follow-Through Line (Start, Action, Wait, Interaction, Subprocess) */
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {isStartSource ? (
              <Play className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : isActionSource ? (
              <Zap className="h-4 w-4 text-amber-600 shrink-0" />
            ) : isWaitSource ? (
              <Timer className="h-4 w-4 text-teal-600 shrink-0" />
            ) : isInteractionSource ? (
              <Compass className="h-4 w-4 text-sky-600 shrink-0" />
            ) : (
              <Workflow className="h-4 w-4 text-indigo-600 shrink-0" />
            )}
            <span className="font-mono text-xs font-bold text-gray-800 uppercase tracking-wide">
              {isStartSource ? 'START' : 'NEXT'}
            </span>
            <span className="rounded bg-gray-100 border border-gray-200 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-gray-600 uppercase">
              Auto-Progression
            </span>
          </div>

          {/* Optional Action Description / Tooltip */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Description / Tooltip
            </label>
            <input
              type="text"
              value={descriptionValue}
              placeholder="e.g. Automatically cascaded upon node completion"
              onChange={(e) => commitDescription(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none placeholder:text-gray-400"
            />
          </div>
        </div>
      ) : (
        /* Mode C: Interactive User Action Line (Task / Manual Input) */
        <div className="flex flex-col gap-3">
          {/* 1. Action / Button Label */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Button / Action Label
            </label>
            <input
              type="text"
              value={labelValue}
              placeholder={edge.data?.event ? edge.data.event.replace(/_/g, ' ') : 'e.g. Approve Safety Sign-off'}
              onChange={(e) => commitLabel(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 focus:border-blue-500 focus:outline-none placeholder:font-normal placeholder:text-gray-400"
            />
          </div>

          {/* 2. Button Visual Style & Execution Mode */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Button Variant
              </label>
              <select
                value={buttonStyle}
                onChange={(e) => commitButtonStyle(e.target.value as any)}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800 focus:border-blue-500 focus:outline-none cursor-pointer"
              >
                <option value="primary">Primary (Blue)</option>
                <option value="secondary">Secondary (Neutral)</option>
                <option value="danger">Destructive (Red)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Trigger Type
              </label>
              <select
                value={isSystemEvent ? 'system' : 'manual'}
                onChange={(e) => commitIsSystem(e.target.value === 'system')}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800 focus:border-blue-500 focus:outline-none cursor-pointer"
              >
                <option value="manual">Manual User Action</option>
                <option value="system">System / Automated</option>
              </select>
            </div>
          </div>

          {/* 3. Action Description / Tooltip Prompt */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Instructions / Hover Tooltip
            </label>
            <input
              type="text"
              value={descriptionValue}
              placeholder="e.g. Requires atmospheric gas testing before approval"
              onChange={(e) => commitDescription(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none placeholder:text-gray-400"
            />
          </div>

          {/* 4. Internal Technical Event Code */}
          <div className="flex flex-col gap-1 border-t border-gray-100 pt-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Internal Event Code (Optional)
            </label>
            {editingEvent ? (
              <input
                autoFocus
                value={eventValue}
                onChange={(e) => setEventValue(e.target.value.toUpperCase())}
                onBlur={commitEvent}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                onFocus={(e) => e.target.select()}
                className="w-full rounded border border-blue-300 bg-blue-50/50 px-2 py-1 font-mono text-xs font-bold text-gray-800 outline-none"
              />
            ) : (
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-gray-600 truncate">
                  {edge.data?.event || 'EVENT'}
                </span>
                <button
                  type="button"
                  onClick={startEdit}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                  title="Rename technical event identifier"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Quick Action Presets */}
            {quickPresets.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {quickPresets.map((preset) => (
                  <button
                    key={preset.event}
                    type="button"
                    onClick={() => {
                      setLabelValue(preset.label);
                      setEventValue(preset.event);
                      setButtonStyle(preset.style);
                      p.onEvent(edge.id, preset.event);
                      onEdgeDataChange?.(edge.id, {
                        label: preset.label,
                        button_label: preset.label,
                        button_style: preset.style,
                        is_system: false,
                      });
                    }}
                    className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold transition-colors ${
                      curEventUpper === preset.event
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Condition Selector: Only shown for Interactive Action Lines (not router or auto lines) */}
      {!isRouterBranch && !isAutoProgression && (
        <ConditionSection
          edge={edge}
          conditions={conditions}
          onConditions={onConditions}
          onEditCondition={onEditCondition}
          onNewCondition={onNewCondition}
        />
      )}

      {/* Target state selection if onTarget provided */}
      {onTarget && (
        <div className="flex flex-col gap-1 border-t border-gray-100 pt-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Destination state
          </label>
          <select
            value={desc.to ?? ''}
            onChange={(e) => onTarget(edge.id, e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-800 hover:border-blue-300 focus:border-blue-500 focus:outline-none cursor-pointer"
          >
            <option value="">choose a state…</option>
            {nodeLabels
              .filter((l) => l !== edge.source)
              .map((l) => (
                <option key={l} value={l}>
                  → {l}
                </option>
              ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-gray-100 pt-3">
        <Disclosure title="Side effects on arrival">
          <OnAfterEditor
            key={edge.id}
            value={edge.data?.on_after ?? []}
            availableTypes={actionTypes}
            onChange={(a) => p.onOnAfter(edge.id, a)}
          />
          <p className="text-[11px] leading-snug text-gray-400">
            Optional work performed automatically when this action routes (e.g. update a related entity).
          </p>
        </Disclosure>

        <Disclosure title="Definition">
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-2.5 font-mono text-[10px] leading-relaxed text-slate-100">
            {JSON.stringify(
              {
                from: desc.from,
                event: desc.event,
                to: desc.to,
                conditions: edge.data?.conditions ?? [],
                on_after: edge.data?.on_after ?? [],
              },
              null,
              2
            )}
          </pre>
        </Disclosure>

        <button
          type="button"
          onClick={() => p.onDelete(edge.id)}
          className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove this connection
        </button>
      </div>
    </div>
  );
}

function ConditionSection({
  edge,
  conditions,
  onConditions,
  onEditCondition,
  onNewCondition,
}: {
  edge: WorkflowFlowEdge;
  conditions: ConditionDefinition[];
  onConditions: (id: string, conditions: string[]) => void;
  onEditCondition?: (condition: ConditionDefinition) => void;
  onNewCondition: () => void;
}) {
  const guarded = edge.data?.conditions ?? [];
  const selectedConditionId = guarded[0] || '';
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
    onConditions(edge.id, id ? [id] : []);
    setMenuOpen(false);
  };

  return (
    <div ref={menuRef} className="relative flex flex-col gap-1.5">
      {/* Header with Title, Info Tooltip, and Add Button when unguarded */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Condition
          <span className="group relative inline-flex items-center">
            <Info className="h-3.5 w-3.5 cursor-default text-gray-400 transition-colors hover:text-gray-600" />
            <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-64 rounded-md bg-black px-2.5 py-1.5 text-[11px] font-medium normal-case leading-snug text-white shadow-2xl group-hover:block border border-gray-700">
              Select a condition from the condition module. The condition must pass for this action to fire.
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
        <div className="flex items-center justify-between gap-1 rounded-lg border border-amber-200 bg-amber-50/60 p-1.5 transition-colors hover:border-amber-300">
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
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="truncate text-xs font-bold text-gray-800 group-hover:text-blue-700">
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
              className={`rounded p-1 text-gray-500 transition-colors hover:bg-amber-100 hover:text-gray-800 ${
                menuOpen ? 'bg-amber-100 text-gray-800' : ''
              }`}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => onConditions(edge.id, [])}
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
                  active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <ShieldCheck className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="truncate">{c.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-gray-400">({c.id})</span>
                </div>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
              </button>
            );
          })}

          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onNewCondition();
              }}
              className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+ New condition…</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type ActionRow = { type: string; paramsText: string };

function OnAfterEditor({
  value,
  availableTypes,
  onChange,
}: {
  value: WorkflowAction[];
  availableTypes: Array<{ type: string; name: string; description: string }>;
  onChange: (actions: WorkflowAction[]) => void;
}) {
  const [rows, setRows] = useState<ActionRow[]>(
    value.map((a) => ({ type: a.type, paramsText: JSON.stringify(a.params ?? {}, null, 2) }))
  );
  const [errors, setErrors] = useState<Record<number, string>>({});

  const emit = (next: ActionRow[], errs: Record<number, string>) => {
    setRows(next);
    setErrors(errs);
    const actions: WorkflowAction[] = [];
    for (const r of next) {
      if (!r.type) continue;
      let params: Record<string, unknown> = {};
      let ok = true;
      if (r.paramsText.trim()) {
        try {
          const parsed = JSON.parse(r.paramsText);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('expected an object');
          params = parsed as Record<string, unknown>;
        } catch {
          ok = false;
        }
      }
      if (ok) actions.push({ type: r.type, params });
    }
    onChange(actions);
  };

  const patch = (i: number, patch: Partial<ActionRow>) =>
    emit(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)), { ...errors, [i]: '' });

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && <p className="text-[11px] text-gray-400">None — this action has no side effects.</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-md border border-gray-200 bg-white p-2">
          <div className="flex items-center gap-1.5">
            <select
              value={r.type}
              onChange={(e) => patch(i, { type: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-1.5 py-1 text-[11px] text-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="">choose an action…</option>
              {availableTypes.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.name} ({t.type})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => emit(rows.filter((_, idx) => idx !== i), {})}
              className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
              title="Remove action"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {availableTypes.find((t) => t.type === r.type) && (
            <p className="text-[10px] leading-snug text-gray-400">
              {availableTypes.find((t) => t.type === r.type)!.description}
            </p>
          )}
          <textarea
            value={r.paramsText}
            onChange={(e) => {
              try {
                JSON.parse(e.target.value);
                patch(i, { paramsText: e.target.value });
              } catch {
                setRows(rows.map((x, idx) => (idx === i ? { ...x, paramsText: e.target.value } : x)));
                setErrors((cur) => ({ ...cur, [i]: 'params must be valid JSON objects' }));
              }
            }}
            rows={2}
            spellCheck={false}
            placeholder='{"key": "value"}'
            className="rounded-md border border-gray-300 p-1.5 font-mono text-[10px] text-gray-700 focus:border-blue-500 focus:outline-none"
          />
          {errors[i] && <p className="text-[10px] text-red-600">{errors[i]}</p>}
        </div>
      ))}
      <DashedButton
        onClick={() => emit([...rows, { type: '', paramsText: '{}' }], {})}
        className="self-start"
      >
        Add action
      </DashedButton>
    </div>
  );
}