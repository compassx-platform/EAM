import React, { useState } from 'react';
import { GateManagerModal } from '../components/Gates/GateManagerModal';
import { ClipboardList, FileCheck2 } from 'lucide-react';

export const GateRegistryPage: React.FC = () => {
  const [activeEntityType, setActiveEntityType] = useState<string>('workorder');

  return (
    <div className="space-y-5">
      {/* Header and Entity Type toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--cx-color-border)] pb-3">
        <div>
          <h2 className="text-base font-bold text-[var(--cx-color-text)]">
            Enforcement Gate Registry
          </h2>
          <p className="text-xs text-[var(--cx-color-text-muted)]">
            Fixed code-defined gate types with user-parameterized reusable gate instances (Section 3.5 & 3.6).
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[var(--cx-color-surface-subtle)] p-1 rounded-[var(--cx-radius-md)] border border-[var(--cx-color-border)]">
          <button
            onClick={() => setActiveEntityType('workorder')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeEntityType === 'workorder'
                ? 'bg-[var(--cx-color-surface)] text-[var(--cx-color-brand-primary)] shadow-xs font-bold'
                : 'text-[var(--cx-color-text-muted)] hover:text-[var(--cx-color-text)]'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5 text-blue-600" />
            <span>Work Order Gates</span>
          </button>
          <button
            onClick={() => setActiveEntityType('permit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              activeEntityType === 'permit'
                ? 'bg-[var(--cx-color-surface)] text-[var(--cx-color-brand-primary)] shadow-xs font-bold'
                : 'text-[var(--cx-color-text-muted)] hover:text-[var(--cx-color-text)]'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Permit Gates</span>
          </button>
        </div>
      </div>

      <GateManagerModal entityType={activeEntityType} />
    </div>
  );
};
