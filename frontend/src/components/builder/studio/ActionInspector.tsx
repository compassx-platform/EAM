import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, GitFork, Info, Minus, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { ConditionDefinition, WorkflowAction } from '../../../types';
import { edgeDescription, type WorkflowFlowEdge } from '../flowModel';
import { DashedButton, Disclosure, SectionLabel } from './ui';

interface ActionInspectorProps {
  edge: WorkflowFlowEdge;
  nodeLabels: string[];
  conditions: ConditionDefinition[];
  actionTypes: Array<{ type: string; name: string; description: string }>;
  isRouterSource?: boolean;
  onEvent: (id: string, event: string) => void;
  onTarget?: (id: string, to: string) => void;
  onConditions: (id: string, conditions: string[]) => void;
  onOnAfter: (id: string, actions: WorkflowAction[]) => void;
  onDelete: (id: string) => void;
  onEditCondition?: (condition: ConditionDefinition) => void;
  onNewCondition: () => void;
}

export function ActionInspector(p: ActionInspectorProps) {
  const { edge, conditions, onEditCondition, onNewCondition, onConditions, actionTypes, isRouterSource, onTarget, nodeLabels } = p;
  const [eventValue, setEventValue] = useState(edge.data?.event ?? 'EVENT');
  const [editingEvent, setEditingEvent] = useState(false);
  const desc = edgeDescription(edge);

  useEffect(() => {
    setEventValue(edge.data?.event ?? 'EVENT');
  }, [edge.data?.event]);

  const commitEvent = () => {
    setEditingEvent(false);
    const next = eventValue.trim().toUpperCase();
    setEventValue(next || edge.data?.event || 'EVENT');
    if (next && next !== edge.data?.event) p.onEvent(edge.id, next);
  };

  const startEdit = () => {
    setEventValue(edge.data?.event ?? 'EVENT');
    setEditingEvent(true);
  };

  const isTrueBranch = edge.data?.event === 'TRUE';
  const isFalseBranch = edge.data?.event === 'FALSE';
  const isRouterBranch = Boolean(isRouterSource || edge.data?.isRouterSource);

  return (
    <div className="flex flex-col gap-3 p-4">
      {isRouterBranch ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="rounded border border-gray-200 bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-gray-800">
              {isTrueBranch ? 'TRUE Branch' : isFalseBranch ? 'FALSE Branch' : edge.data?.event || 'BRANCH'}
            </span>
            <span className="text-xs font-medium text-gray-500">Router outlet</span>
          </div>
          <p className="text-xs text-gray-500">
            From router <span className="font-semibold text-gray-700">{edge.source}</span>
          </p>
        </div>
      ) : editingEvent ? (
        <input
          autoFocus
          value={eventValue}
          onChange={(e) => setEventValue(e.target.value.toUpperCase())}
          onBlur={commitEvent}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          onFocus={(e) => e.target.select()}
          className="-mx-1 w-[calc(100%+0.5rem)] rounded border border-blue-300 bg-blue-50/50 px-1 py-0 font-mono text-base font-bold text-gray-800 outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="group flex w-full items-center gap-2 text-left"
        >
          <span className="truncate font-mono text-base font-bold text-gray-800">
            {edge.data?.event || 'EVENT'}
          </span>
          <Pencil className="h-3.5 w-3.5 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}

      {/* For Router outgoing branches: show router connection info; for standard transitions (including upstream into router): show condition selector */}
      {isRouterBranch ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-2.5">
          <div className="flex items-center gap-1.5">
            <GitFork className="h-4 w-4 text-slate-500 shrink-0" />
            <span className="text-xs font-semibold text-gray-800">Automatic Router Connection</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
            Condition evaluation is performed automatically at the <strong>{edge.source}</strong> router state. This branch executes when the router evaluates to {isTrueBranch ? 'TRUE' : isFalseBranch ? 'FALSE' : 'this path'} and does not require an event or edge condition.
          </p>
        </div>
      ) : (
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
        <SectionLabel right={<span className="font-mono text-[10px] text-gray-400">action</span>}>
          Connection · {edge.source} → {desc.to ?? '?'}
        </SectionLabel>

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