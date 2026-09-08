import React, { useState, useEffect } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { Button } from '../../design-system/components/Button';
import { Badge } from '../../design-system/components/Badge';
import { EntityInstance, ValidTransition, SimulateResponse, GateTraceItem } from '../../types';
import { api } from '../../api/client';
import { ArrowRight, CheckCircle, XCircle, AlertTriangle, Shield, Play } from 'lucide-react';

interface TransitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: EntityInstance;
  transition: ValidTransition;
  onTransitionSuccess: () => void;
}

export const TransitionModal: React.FC<TransitionModalProps> = ({
  isOpen,
  onClose,
  entity,
  transition,
  onTransitionSuccess,
}) => {
  const [comment, setComment] = useState('');
  const [fieldDeltas, setFieldDeltas] = useState<Record<string, any>>({});
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<SimulateResponse | null>(null);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setComment('');
      setFieldDeltas({});
      setError(null);
      // Run pre-flight simulation automatically
      handleSimulate();
    }
  }, [isOpen, transition, entity]);

  const handleSimulate = async () => {
    setSimulating(true);
    setError(null);
    try {
      const res = await api.simulateTransition(entity.entity_type, {
        entity_id: entity.id,
        event_type: transition.event_type,
        custom_fields_override: fieldDeltas,
      });
      setSimResult(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setSimulating(false);
    }
  };

  const handleExecute = async () => {
    setExecuting(true);
    setError(null);
    try {
      await api.proposeTransition(
        entity.entity_type,
        entity.id,
        transition.event_type,
        comment ? { comment } : undefined,
        Object.keys(fieldDeltas).length > 0 ? fieldDeltas : undefined,
        entity.last_event_id
      );
      onTransitionSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Transition rejected');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Execute State Transition: ${transition.event_type}`}
      description={`Transitions ${entity.entity_type} from ${entity.status} to ${transition.to_state}.`}
      maxWidth="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={executing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleExecute}
            loading={executing}
            icon={<Play className="w-4 h-4" />}
          >
            Confirm & Propose Transition
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Transition Summary Bar */}
        <div className="flex items-center justify-between p-3 bg-[var(--cx-color-surface-subtle)] border border-[var(--cx-color-border)] rounded-[var(--cx-radius-md)]">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[10px] text-[var(--cx-color-text-muted)] font-semibold uppercase">
                From State
              </div>
              <Badge variant="status" status={entity.status}>
                {entity.status}
              </Badge>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <div>
              <div className="text-[10px] text-[var(--cx-color-text-muted)] font-semibold uppercase">
                Target State
              </div>
              <Badge variant="status" status={transition.to_state}>
                {transition.to_state}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-[var(--cx-color-text-muted)] font-semibold uppercase">
              Trigger Event
            </div>
            <span className="font-mono font-bold text-xs text-[var(--cx-color-brand-primary)]">
              {transition.event_type}
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-md">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Transition Blocked</div>
              <div>{error}</div>
            </div>
          </div>
        )}

        {/* Pre-Flight Gate Simulation */}
        <div className="border border-[var(--cx-color-border)] rounded-[var(--cx-radius-md)] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--cx-color-text)]">
              <Shield className="w-4 h-4 text-[var(--cx-color-brand-primary)]" />
              <span>Gate Evaluation Pre-flight Check</span>
            </div>
            <button
              onClick={handleSimulate}
              disabled={simulating}
              className="text-[11px] text-[var(--cx-color-brand-primary)] hover:underline font-medium"
            >
              {simulating ? 'Evaluating...' : 'Re-check Gates'}
            </button>
          </div>

          {simResult?.gate_trace && simResult.gate_trace.length > 0 ? (
            <div className="space-y-1.5">
              {simResult.gate_trace.map((gt: GateTraceItem, idx: number) => (
                <div
                  key={idx}
                  className={`flex items-start justify-between p-2 rounded-md text-xs border ${
                    gt.effective_pass
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {gt.effective_pass ? (
                      <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold">{gt.label}</div>
                      <div className="text-[11px] opacity-80">{gt.reason}</div>
                    </div>
                  </div>
                  <Badge variant={gt.effective_pass ? 'success' : 'error'} size="sm">
                    {gt.effective_pass ? 'PASS' : 'BLOCK'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[var(--cx-color-text-muted)] py-1 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>No gates attached to this transition. Transition is unconditionally legal.</span>
            </div>
          )}
        </div>

        {/* Comment input */}
        <div>
          <label className="block text-xs font-semibold text-[var(--cx-color-text)] mb-1">
            Transition Note / Audit Reason (Optional)
          </label>
          <input
            type="text"
            className="cx-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. Safety inspection completed, work permits verified"
          />
        </div>
      </div>
    </Modal>
  );
};
