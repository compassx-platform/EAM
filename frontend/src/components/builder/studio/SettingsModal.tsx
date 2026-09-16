import { useState } from 'react';
import { Flag } from 'lucide-react';
import type { WorkflowAutoTransition } from '../../../types';
import { Disclosure, Field, ModalShell, SectionLabel } from './ui';

interface SettingsModalProps {
  nodeLabels: string[];
  terminalStates: string[];
  autoTransitions: WorkflowAutoTransition[];
  onTerminal: (v: string[]) => void;
  onAutoTransitions: (v: WorkflowAutoTransition[]) => void;
  onClose: () => void;
}

export function SettingsModal({ nodeLabels, terminalStates, autoTransitions, onTerminal, onAutoTransitions, onClose }: SettingsModalProps) {
  const [autoText, setAutoText] = useState(JSON.stringify(autoTransitions, null, 2));
  const [err, setErr] = useState<string | null>(null);

  const toggleTerminal = (label: string) => {
    onTerminal(terminalStates.includes(label) ? terminalStates.filter((s) => s !== label) : [...terminalStates, label]);
  };

  const applyAuto = () => {
    try {
      const parsed = JSON.parse(autoText);
      if (!Array.isArray(parsed)) throw new Error('must be a JSON array');
      onAutoTransitions(parsed);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <ModalShell
      title="Workflow Settings"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
          >
            Done
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <SectionLabel>Terminal states</SectionLabel>
          <p className="text-[11px] leading-snug text-gray-400">
            Terminal states cannot advance — the UI stops offering transitions when an entity reaches them. Click a state to
            toggle it.
          </p>
          {nodeLabels.length === 0 ? (
            <p className="text-xs text-gray-400">Add states to the canvas to mark terminals.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {nodeLabels.map((l) => {
                const active = terminalStates.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => toggleTerminal(l)}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      active
                        ? 'border-rose-300 bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                        : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    <Flag className={`h-3 w-3 ${active ? 'text-rose-500' : 'text-gray-300'}`} />
                    {l}
                  </button>
                );
              })}
            </div>
          )}
          {terminalStates.length === 0 && (
            <p className="text-[11px] text-amber-600">No terminal states declared yet.</p>
          )}
        </div>

        <Disclosure title="Automatic routing (advanced)">
          <Field label="Auto transitions" hint="Fired automatically after any transition as the system actor.">
            <textarea
              value={autoText}
              onChange={(e) => setAutoText(e.target.value)}
              rows={6}
              spellCheck={false}
              className="rounded-md border border-gray-300 p-1.5 font-mono text-[11px] text-gray-700 focus:border-blue-500 focus:outline-none"
            />
          </Field>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={applyAuto}
              className="self-start rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
            >
              Apply auto-routing
            </button>
            {err && <p className="text-[11px] text-red-600">{err}</p>}
          </div>
        </Disclosure>
      </div>
    </ModalShell>
  );
}