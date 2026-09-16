import { useState } from 'react';
import { GitFork, ListChecks, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { ConditionDefinition, WorkflowAction, WorkflowChoice } from '../../../types';
import { edgeDescription, edgeIsBranching, type WorkflowFlowEdge } from '../flowModel';
import { DashedButton, Disclosure, Field, SectionLabel, SegmentedTabs } from './ui';

interface ActionInspectorProps {
  edge: WorkflowFlowEdge;
  nodeLabels: string[];
  conditions: ConditionDefinition[];
  actionTypes: Array<{ type: string; name: string; description: string }>;
  onEvent: (id: string, event: string) => void;
  onConditions: (id: string, conditions: string[]) => void;
  onChoices: (id: string, choices: WorkflowChoice[]) => void;
  onToggleBranching: (id: string, enabled: boolean) => void;
  onOnAfter: (id: string, actions: WorkflowAction[]) => void;
  onDelete: (id: string) => void;
  onNewCondition: () => void;
}

type Tab = 'basics' | 'routing' | 'advanced';

export function ActionInspector(p: ActionInspectorProps) {
  const { edge } = p;
  const [tab, setTab] = useState<Tab>('basics');
  const [eventValue, setEventValue] = useState(edge.data?.event ?? 'EVENT');
  const branching = edgeIsBranching(edge);
  const desc = edgeDescription(edge);

  const commitEvent = () => {
    const next = eventValue.trim().toUpperCase();
    setEventValue(next || edge.data?.event || 'EVENT');
    if (next && next !== edge.data?.event) p.onEvent(edge.id, next);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <SectionLabel right={<span className="font-mono text-[10px] text-gray-400">action</span>}>
        Connection · {edge.source} → {desc.to ?? '?'}
      </SectionLabel>

      <SegmentedTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'basics', label: 'Basics' },
          { key: 'routing', label: 'Routing' },
          { key: 'advanced', label: 'Advanced' },
        ]}
      />

      {tab === 'basics' && (
        <div className="flex flex-col gap-3">
          <Field label="Trigger event" hint="The event name that fires this action, e.g. SUBMIT or APPROVE.">
            <input
              value={eventValue}
              onChange={(e) => setEventValue(e.target.value.toUpperCase())}
              onBlur={commitEvent}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="rounded-md border border-gray-300 px-2 py-1.5 font-mono text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
            />
          </Field>

          <Field label="Destination">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
              <span className="text-xs text-gray-400">{edge.source}</span>
              <span className="text-gray-300">→</span>
              <span className="rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                {desc.to ?? 'unset'}
              </span>
            </div>
            <p className="text-[11px] leading-snug text-gray-400">
              Re-route by dragging the connection's handles on the canvas. Splitting into branches moves destinations to the
              Routing tab.
            </p>
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-gray-700">Conditional branches</span>
              <span className="text-[11px] text-gray-400">Route different outcomes based on conditions.</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={branching}
              onClick={() => p.onToggleBranching(edge.id, !branching)}
              className={`relative h-5 w-9 rounded-full transition-colors ${branching ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  branching ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {tab === 'routing' && <RoutingTab {...p} />}

      {tab === 'advanced' && <AdvancedTab {...p} />}

      <button
        type="button"
        onClick={() => p.onDelete(edge.id)}
        className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        <Trash2 className="h-3.5 w-3.5" /> Remove this connection
      </button>
    </div>
  );
}

function RoutingTab(p: ActionInspectorProps) {
  const { edge, conditions, nodeLabels } = p;
  const branching = edgeIsBranching(edge);
  const choices = edge.data?.choices ?? [];
  const desc = edgeDescription(edge);

  if (!branching) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
        <GitFork className="h-5 w-5 text-gray-400" />
        <p className="text-xs font-semibold text-gray-700">This connection always routes to one place.</p>
        <p className="text-[11px] leading-snug text-gray-400">
          Split it into branches so each outcome can take a different state based on a condition — e.g. an{" "}
          <span className="font-mono">isolation</span> permit goes to a precheck, everything else to risk assessment.
        </p>
        <button
          type="button"
          onClick={() => p.onToggleBranching(edge.id, true)}
          className="mt-1 flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
        >
          <GitFork className="h-3.5 w-3.5" /> Split into branches
        </button>
      </div>
    );
  }

  const updateBranch = (i: number, patch: Partial<WorkflowChoice>) => {
    const next = choices.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    p.onChoices(edge.id, next);
  };
  const removeBranch = (i: number) => p.onChoices(edge.id, choices.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <SectionLabel>Branches ({choices.length})</SectionLabel>
        <DashedButton
          onClick={() => p.onChoices(edge.id, [...choices, { to: desc.to ?? edge.target, when: [] }])}
          className="!px-1.5 !py-0.5"
        >
          Add branch
        </DashedButton>
      </div>
      <p className="text-[11px] leading-snug text-gray-400">
        Evaluated top-to-bottom: the first branch whose condition passes wins. The <em>Always</em> row is the fallback if no
        condition matches.
      </p>

      {choices.map((c, i) => {
        const when = c.when ?? [];
        return (
          <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-2">
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">#{i + 1}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {when.length === 0 ? 'Always (fallback)' : 'When…'}
              </span>
              <button
                type="button"
                onClick={() => removeBranch(i)}
                className="ml-auto rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                title="Remove branch"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-gray-500">go to</span>
              <select
                value={c.to || ''}
                onChange={(e) => updateBranch(i, { to: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="">choose a state…</option>
                {nodeLabels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            {when.length > 0 && (
              <div className="flex items-center gap-1.5 pl-0.5">
                <span className="text-[11px] font-medium text-gray-500">condition</span>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <select
                    value={when[0] || ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateBranch(i, { when: v ? [v] : [] });
                    }}
                    className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-1.5 py-1 text-[11px] text-gray-700 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="" />
                    {conditions.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label} · {g.id}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={p.onNewCondition}
                    title="Create a new condition"
                    className="rounded border border-dashed border-gray-300 p-1 text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {conditions.length === 0 && (
        <p className="text-[11px] text-gray-400">
          No conditions registered for this entity yet — create one to route by.
        </p>
      )}
    </div>
  );
}

function AdvancedTab(p: ActionInspectorProps) {
  const { edge, conditions, actionTypes } = p;
  const desc = edgeDescription(edge);
  const guarded = edge.data?.conditions ?? [];

  return (
    <div className="flex flex-col gap-2">
      <Disclosure title="Required conditions" defaultOpen={!conditions.length || guarded.length > 0}>
        <p className="text-[11px] leading-snug text-gray-400">
          ALL selected conditions must pass for this action to fire. Leave all unchecked for an unguarded action.
        </p>
        {conditions.length === 0 ? (
          <p className="text-[11px] text-gray-400">No conditions registered for this entity type.</p>
        ) : (
          <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
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
                      p.onConditions(edge.id, next);
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
        <DashedButton onClick={p.onNewCondition} className="self-start">
          New condition…
        </DashedButton>
      </Disclosure>

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
              conditions: guarded,
              branches: edge.data?.choices ?? [],
              on_after: edge.data?.on_after ?? [],
            },
            null,
            2
          )}
        </pre>
      </Disclosure>
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