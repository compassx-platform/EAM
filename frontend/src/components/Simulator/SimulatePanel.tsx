import React, { useState, useEffect } from 'react';
import { WorkflowDefinition, SimulateResponse, EntityField } from '../../types';
import { api, getActorContext } from '../../api/client';
import { Button } from '../../design-system/components/Button';
import { Badge } from '../../design-system/components/Badge';
import { Play, CheckCircle, XCircle, Shield, ArrowRight, Sparkles, RefreshCw } from 'lucide-react';

interface SimulatePanelProps {
  entityType: string;
  workflow?: WorkflowDefinition | null;
}

export const SimulatePanel: React.FC<SimulatePanelProps> = ({ entityType, workflow }) => {
  const [states, setStates] = useState<string[]>([]);
  const [selectedFromState, setSelectedFromState] = useState<string>('');
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [fields, setFields] = useState<EntityField[]>([]);
  const [sampleFields, setSampleFields] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulateResponse | null>(null);

  useEffect(() => {
    if (workflow?.definition) {
      const st = workflow.definition.states || [];
      setStates(st);
      if (st.length > 0 && !selectedFromState) {
        setSelectedFromState(st[0]);
      }
    }
  }, [workflow]);

  useEffect(() => {
    api.listFields(entityType).then((fList) => {
      setFields(fList);
      const defaults: Record<string, any> = {};
      fList.forEach((f) => {
        if (f.field_name === 'estimated_cost') defaults[f.field_name] = 5000;
        else if (f.field_name === 'hazards_identified') defaults[f.field_name] = 'High voltage line';
        else if (f.field_name === 'priority') defaults[f.field_name] = 'High';
        else defaults[f.field_name] = '';
      });
      setSampleFields(defaults);
    });
  }, [entityType]);

  // Transitions available from current selectedFromState
  const availableTransitions =
    workflow?.definition?.transitions?.filter((t) => t.from === selectedFromState) || [];

  useEffect(() => {
    if (availableTransitions.length > 0) {
      setSelectedEvent(availableTransitions[0].event);
    } else {
      setSelectedEvent('');
    }
  }, [selectedFromState, workflow]);

  const handleRunSimulation = async () => {
    if (!selectedEvent) return;
    setLoading(true);
    try {
      const res = await api.simulateTransition(entityType, {
        event_type: selectedEvent,
        current_status_override: selectedFromState,
        custom_fields_override: sampleFields,
        workflow_version_override: workflow?.version_label,
      });
      setResult(res);
    } catch (err: any) {
      alert(`Simulation error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const currentActor = getActorContext();

  return (
    <div className="bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-lg)] p-5 shadow-xs space-y-5">
      <div className="flex items-center justify-between border-b border-[var(--cx-color-border)] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--cx-color-brand-primary)]" />
            <h3 className="text-sm font-bold text-[var(--cx-color-text)]">
              Transition Gate Sandbox & Simulation Engine
            </h3>
          </div>
          <p className="text-xs text-[var(--cx-color-text-muted)] mt-0.5">
            Evaluates transition legality & gates in-memory without writing events to the database (Section 5: POST /simulate).
          </p>
        </div>
        <Badge variant="primary" size="sm">
          Active Persona: {currentActor.role}
        </Badge>
      </div>

      {/* Inputs grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
            Current Simulated State (from_state)
          </label>
          <select
            className="cx-select"
            value={selectedFromState}
            onChange={(e) => setSelectedFromState(e.target.value)}
          >
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
            Event to Propose
          </label>
          <select
            className="cx-select font-mono"
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
            disabled={availableTransitions.length === 0}
          >
            {availableTransitions.length > 0 ? (
              availableTransitions.map((t) => (
                <option key={t.event} value={t.event}>
                  {t.event} (&rarr; {t.to})
                </option>
              ))
            ) : (
              <option value="">No outgoing transitions from this state</option>
            )}
          </select>
        </div>
      </div>

      {/* Sample Custom Fields */}
      <div className="border border-[var(--cx-color-border)] rounded-[var(--cx-radius-md)] p-3.5 bg-[var(--cx-color-surface-subtle)] space-y-3">
        <div className="text-xs font-bold text-[var(--cx-color-text)] uppercase tracking-wider">
          Sample Entity Attributes (Custom Fields)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {fields.slice(0, 6).map((f) => (
            <div key={f.field_name}>
              <label className="block text-[11px] font-semibold text-[var(--cx-color-text)] mb-1">
                {f.field_name}
              </label>
              <input
                type={f.field_type === 'number' ? 'number' : 'text'}
                className="cx-input text-xs"
                value={sampleFields[f.field_name] ?? ''}
                onChange={(e) =>
                  setSampleFields({
                    ...sampleFields,
                    [f.field_name]:
                      f.field_type === 'number' ? Number(e.target.value) : e.target.value,
                  })
                }
                placeholder={`Sample ${f.field_name}`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={handleRunSimulation}
          loading={loading}
          disabled={!selectedEvent}
          icon={<Play className="w-4 h-4" />}
        >
          Execute Gate Simulation (/simulate)
        </Button>
      </div>

      {/* Simulation Result */}
      {result && (
        <div
          className={`border rounded-[var(--cx-radius-md)] p-4 space-y-3 ${
            result.accepted
              ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
              : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {result.accepted ? (
                <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              )}
              <div>
                <div className="text-sm font-bold text-[var(--cx-color-text)]">
                  {result.accepted ? 'Transition Accepted' : 'Transition Blocked'}
                </div>
                <div className="text-xs text-[var(--cx-color-text-muted)]">
                  {result.accepted
                    ? `State machine permits transition to '${result.to_state}'.`
                    : result.reason || 'Gate condition evaluation rejected the transition.'}
                </div>
              </div>
            </div>

            <Badge variant={result.accepted ? 'success' : 'error'}>
              {result.accepted ? 'LEGAL TRANSITION' : 'BLOCKED'}
            </Badge>
          </div>

          {/* Gate by Gate Trace */}
          {result.gate_trace && result.gate_trace.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[var(--cx-color-border)] space-y-2">
              <div className="text-xs font-bold text-[var(--cx-color-text)] uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[var(--cx-color-brand-primary)]" />
                <span>Gate-by-Gate Evaluation Trace ({result.gate_trace.length})</span>
              </div>
              <div className="space-y-1.5">
                {result.gate_trace.map((gt, gIdx) => (
                  <div
                    key={gIdx}
                    className={`flex items-start justify-between p-2.5 rounded-md text-xs border ${
                      gt.effective_pass
                        ? 'bg-white dark:bg-gray-900 border-emerald-200 dark:border-emerald-800 text-[var(--cx-color-text)]'
                        : 'bg-white dark:bg-gray-900 border-rose-200 dark:border-rose-800 text-[var(--cx-color-text)]'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold flex items-center gap-1.5">
                        {gt.effective_pass ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        )}
                        <span>{gt.label}</span>
                        <span className="font-mono text-[10px] text-gray-400">({gt.gate_type})</span>
                      </div>
                      <div className="text-[11px] text-[var(--cx-color-text-muted)] pl-5">
                        {gt.reason}
                      </div>
                    </div>

                    <Badge variant={gt.effective_pass ? 'success' : 'error'} size="sm">
                      {gt.effective_pass ? 'PASS' : 'FAIL'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
