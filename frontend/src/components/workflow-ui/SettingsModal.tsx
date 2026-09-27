import { useState } from 'react';
import type { WorkflowAutoTransition } from '../../types';
import { DashedButton, Field, ModalShell, SectionLabel } from './ui';

export interface SettingsModalProps {
  nodeLabels: string[];
  terminalStates: string[];
  autoTransitions: WorkflowAutoTransition[];
  onTerminal: (states: string[]) => void;
  onAutoTransitions: (transitions: WorkflowAutoTransition[]) => void;
  onClose: () => void;
}

export function SettingsModal(p: SettingsModalProps) {
  const [terminal, setTerminal] = useState<string[]>(p.terminalStates);
  const [autoList, setAutoList] = useState<WorkflowAutoTransition[]>(p.autoTransitions);

  const toggleTerminal = (state: string) => {
    const next = terminal.includes(state) ? terminal.filter((s) => s !== state) : [...terminal, state];
    setTerminal(next);
    p.onTerminal(next);
  };

  const removeAuto = (idx: number) => {
    const next = autoList.filter((_, i) => i !== idx);
    setAutoList(next);
    p.onAutoTransitions(next);
  };

  return (
    <ModalShell
      title="Process Settings"
      onClose={p.onClose}
      footer={
        <button
          type="button"
          onClick={p.onClose}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
        >
          Done
        </button>
      }
    >
      <div className="flex flex-col gap-5 text-xs text-gray-700">
        <div className="flex flex-col gap-2">
          <SectionLabel>Terminal (Stop) States</SectionLabel>
          <p className="text-[11px] text-gray-500 leading-snug">
            Records reaching these stop/terminal states complete process execution and exit the workflow.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {p.nodeLabels.map((label) => {
              const active = terminal.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleTerminal(label)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-gray-800 bg-gray-800 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {autoList.length > 0 && (
          <div className="flex flex-col gap-2">
            <SectionLabel>Auto Transitions</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {autoList.map((at, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-mono"
                >
                  <span>
                    {at.from} → [{at.event}]
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAuto(idx)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
