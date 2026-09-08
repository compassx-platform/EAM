import React, { useState, useEffect } from 'react';
import { WorkflowDefinition, WorkflowTransition, GateInstance } from '../../types';
import { api } from '../../api/client';
import { Badge } from '../../design-system/components/Badge';
import { Button } from '../../design-system/components/Button';
import { Modal } from '../../design-system/components/Modal';
import {
  Plus,
  ArrowRight,
  Shield,
  Trash2,
  Edit2,
  Workflow as WorkflowIcon,
  CheckCircle2,
  Layers,
  Settings2,
} from 'lucide-react';

interface WorkflowCanvasProps {
  workflow: WorkflowDefinition;
  onChange: (updatedWf: WorkflowDefinition) => void;
  entityType: string;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  workflow,
  onChange,
  entityType,
}) => {
  const [gates, setGates] = useState<GateInstance[]>([]);
  const [isAddStateOpen, setIsAddStateOpen] = useState(false);
  const [newStateName, setNewStateName] = useState('');
  
  const [isTransitionModalOpen, setIsTransitionModalOpen] = useState(false);
  const [editingTransitionIdx, setEditingTransitionIdx] = useState<number | null>(null);
  const [transitionFrom, setTransitionFrom] = useState('');
  const [transitionEvent, setTransitionEvent] = useState('');
  const [transitionTo, setTransitionTo] = useState('');
  const [transitionGates, setTransitionGates] = useState<string[]>([]);

  useEffect(() => {
    api.listGates(entityType).then(setGates);
  }, [entityType]);

  const definition = workflow.definition || { states: [], transitions: [] };
  const states = definition.states || [];
  const transitions = definition.transitions || [];

  const gateMap = new Map<string, GateInstance>();
  gates.forEach((g) => gateMap.set(g.id, g));

  const handleAddState = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newStateName.trim();
    if (!trimmed || states.includes(trimmed)) return;
    const updatedStates = [...states, trimmed];
    onChange({
      ...workflow,
      definition: {
        ...definition,
        states: updatedStates,
      },
    });
    setNewStateName('');
    setIsAddStateOpen(false);
  };

  const handleRemoveState = (stateName: string) => {
    if (confirm(`Remove state '${stateName}' and any associated transitions?`)) {
      const updatedStates = states.filter((s) => s !== stateName);
      const updatedTransitions = transitions.filter(
        (t) => t.from !== stateName && t.to !== stateName
      );
      onChange({
        ...workflow,
        definition: {
          ...definition,
          states: updatedStates,
          transitions: updatedTransitions,
        },
      });
    }
  };

  const openAddTransition = (fromState?: string) => {
    setEditingTransitionIdx(null);
    setTransitionFrom(fromState || (states[0] || ''));
    setTransitionEvent('');
    setTransitionTo(states[1] || states[0] || '');
    setTransitionGates([]);
    setIsTransitionModalOpen(true);
  };

  const openEditTransition = (idx: number) => {
    const t = transitions[idx];
    setEditingTransitionIdx(idx);
    setTransitionFrom(t.from);
    setTransitionEvent(t.event);
    setTransitionTo(t.to);
    setTransitionGates(t.gates || []);
    setIsTransitionModalOpen(true);
  };

  const handleSaveTransition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transitionFrom || !transitionEvent.trim() || !transitionTo) return;

    const newTransition: WorkflowTransition = {
      from: transitionFrom,
      event: transitionEvent.trim().toUpperCase().replace(/\s+/g, '_'),
      to: transitionTo,
      gates: transitionGates,
    };

    let updatedTransitions = [...transitions];
    if (editingTransitionIdx !== null) {
      updatedTransitions[editingTransitionIdx] = newTransition;
    } else {
      updatedTransitions.push(newTransition);
    }

    onChange({
      ...workflow,
      definition: {
        ...definition,
        transitions: updatedTransitions,
      },
    });
    setIsTransitionModalOpen(false);
  };

  const handleRemoveTransition = (idx: number) => {
    const updatedTransitions = transitions.filter((_, i) => i !== idx);
    onChange({
      ...workflow,
      definition: {
        ...definition,
        transitions: updatedTransitions,
      },
    });
  };

  const toggleGate = (gateId: string) => {
    setTransitionGates((prev) =>
      prev.includes(gateId) ? prev.filter((id) => id !== gateId) : [...prev, gateId]
    );
  };

  return (
    <div className="space-y-6">
      {/* Canvas Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--cx-color-text)] flex items-center gap-2">
            <WorkflowIcon className="w-4 h-4 text-[var(--cx-color-brand-primary)]" />
            <span>Interactive State Machine Canvas</span>
          </h3>
          <p className="text-xs text-[var(--cx-color-text-muted)]">
            Define legal states, trigger events, and attach deterministic enforcement gates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsAddStateOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Add State Node
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => openAddTransition()}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Transition
          </Button>
        </div>
      </div>

      {/* Visual State Graph / Flow Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
        {states.map((stateName, sIdx) => {
          const outgoing = transitions.filter((t) => t.from === stateName);
          const incoming = transitions.filter((t) => t.to === stateName);
          const isInitial = sIdx === 0;

          return (
            <div
              key={stateName}
              className="bg-[var(--cx-color-surface)] border border-[var(--cx-color-border)] rounded-xl p-4 shadow-xs flex flex-col justify-between hover:border-[var(--cx-color-brand-primary)] hover:shadow-md transition-all space-y-3 min-h-[140px]"
            >
              {/* State Card Header */}
              <div className="flex items-center justify-between border-b border-[var(--cx-color-border-subtle)] pb-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant="status" status={stateName}>
                    {stateName}
                  </Badge>
                  {isInitial && (
                    <span className="text-[9px] font-bold bg-blue-100 dark:bg-blue-900/50 text-[var(--cx-color-brand-primary)] px-1.5 py-0.5 rounded">
                      INITIAL
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openAddTransition(stateName)}
                    className="p-1 text-[var(--cx-color-text-muted)] hover:text-[var(--cx-color-brand-primary)] hover:bg-[var(--cx-color-surface-hover)] rounded cursor-pointer"
                    title="Add transition from this state"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveState(stateName)}
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded cursor-pointer"
                    title="Delete state"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Outgoing Transitions */}
              <div className="space-y-2 flex-1">
                <div className="text-[10px] font-bold text-[var(--cx-color-text-muted)] uppercase tracking-wider">
                  Outgoing Transitions ({outgoing.length})
                </div>

                {outgoing.length === 0 ? (
                  <div className="text-[11px] italic text-[var(--cx-color-text-muted)] py-1.5">
                    Terminal state / no outgoing events.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {outgoing.map((t) => {
                      const tIdx = transitions.findIndex(
                        (orig) => orig.from === t.from && orig.event === t.event
                      );
                      const attachedGates = (t.gates || []).map((gid) => gateMap.get(gid)).filter(Boolean);

                      return (
                        <div
                          key={`${t.from}-${t.event}`}
                          onClick={() => openEditTransition(tIdx)}
                          className="group p-2.5 rounded-lg bg-[var(--cx-color-surface-subtle)] border border-[var(--cx-color-border-subtle)] hover:border-[var(--cx-color-brand-primary)] hover:bg-[var(--cx-color-surface-hover)] cursor-pointer text-xs transition-all"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-mono font-bold text-[var(--cx-color-brand-primary)] text-[11px] tracking-tight truncate">
                              {t.event}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <ArrowRight className="w-3 h-3 text-gray-400" />
                              <Badge variant="status" status={t.to} size="sm">
                                {t.to}
                              </Badge>
                            </div>
                          </div>

                          {/* Gate badges */}
                          {attachedGates.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {attachedGates.map((g) => (
                                <span
                                  key={g!.id}
                                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                >
                                  <Shield className="w-2.5 h-2.5" />
                                  <span>{g!.label}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add State Modal */}
      <Modal
        isOpen={isAddStateOpen}
        onClose={() => setIsAddStateOpen(false)}
        title="Add State to State Machine"
        description="Every entity instance will occupy one of these defined states."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddStateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddState}>
              Add State Node
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddState} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
              State Name
            </label>
            <input
              type="text"
              className="cx-input"
              value={newStateName}
              onChange={(e) => setNewStateName(e.target.value)}
              placeholder="e.g. UnderReview, Escalated, Verified"
              required
              autoFocus
            />
          </div>
        </form>
      </Modal>

      {/* Transition Modal */}
      <Modal
        isOpen={isTransitionModalOpen}
        onClose={() => setIsTransitionModalOpen(false)}
        title={editingTransitionIdx !== null ? 'Edit State Transition' : 'Add State Transition'}
        description="Transitions are triggered by explicit Command events and guarded by closed gates."
        maxWidth="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            {editingTransitionIdx !== null ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  handleRemoveTransition(editingTransitionIdx);
                  setIsTransitionModalOpen(false);
                }}
                icon={<Trash2 className="w-3.5 h-3.5" />}
              >
                Delete Transition
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setIsTransitionModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveTransition}>
                Save Transition
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSaveTransition} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                From State
              </label>
              <select
                className="cx-select"
                value={transitionFrom}
                onChange={(e) => setTransitionFrom(e.target.value)}
                required
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
                Trigger Event Name
              </label>
              <input
                type="text"
                className="cx-input font-mono uppercase"
                value={transitionEvent}
                onChange={(e) => setTransitionEvent(e.target.value)}
                placeholder="e.g. APPROVED"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
                To Target State
              </label>
              <select
                className="cx-select"
                value={transitionTo}
                onChange={(e) => setTransitionTo(e.target.value)}
                required
              >
                {states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Attached Gates Multi-select */}
          <div className="border border-[var(--cx-color-border)] rounded-[var(--cx-radius-md)] p-3.5 bg-[var(--cx-color-surface-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-[var(--cx-color-text)] uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[var(--cx-color-brand-primary)]" />
                <span>Attached Gates & Enforcement Rules</span>
              </div>
              <span className="text-[11px] text-[var(--cx-color-text-muted)]">
                {transitionGates.length} selected
              </span>
            </div>

            {gates.length === 0 ? (
              <div className="text-xs text-[var(--cx-color-text-muted)] italic py-2">
                No reusable gate instances defined for this entity type. Create some in the Gate Registry.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {gates.map((g) => {
                  const isChecked = transitionGates.includes(g.id);
                  return (
                    <div
                      key={g.id}
                      onClick={() => toggleGate(g.id)}
                      className={`flex items-start justify-between p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200'
                          : 'bg-white dark:bg-gray-900 border-[var(--cx-color-border)] text-[var(--cx-color-text)] hover:bg-[var(--cx-color-surface-hover)]'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Handled by container
                          className="mt-0.5 rounded text-[var(--cx-color-brand-primary)]"
                        />
                        <div>
                          <div className="font-semibold">{g.label}</div>
                          <div className="text-[10px] opacity-70 font-mono">
                            Type: {g.gate_type} • Policy: {g.failure_policy}
                          </div>
                        </div>
                      </div>
                      <Badge variant={g.failure_policy === 'block' ? 'error' : 'warning'} size="sm">
                        {g.failure_policy === 'block' ? 'Block' : 'Allow'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
};
