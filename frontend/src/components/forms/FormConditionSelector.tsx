import { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  Plus,
  Info,
  ChevronDown,
  Layers,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  VisibilityCondition,
  ConditionDefinition,
  ConditionAction,
} from '../../types';
import { ConditionCard } from '../builder/studio/ConditionCard';
import { formatConditionSummary } from '../../lib/conditions';

interface FormConditionSelectorProps {
  condition?: VisibilityCondition | null;
  conditions: ConditionDefinition[];
  entityType: string;
  onChange: (cond: VisibilityCondition | null) => void;
  onOpenConditionModal: (condition?: ConditionDefinition | null, anchorY?: number | null) => void;
  inheritedGroupCondition?: VisibilityCondition | null;
  groupTitle?: string | null;
}

export function FormConditionSelector({
  condition,
  conditions,
  entityType,
  onChange,
  onOpenConditionModal,
  inheritedGroupCondition,
  groupTitle,
}: FormConditionSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isEnabled = Boolean(
    condition && (condition.condition_id || (condition.rules && condition.rules.length > 0) || condition.field)
  );
  const action: ConditionAction = condition?.action || 'show';
  const selectedConditionDef = condition?.condition_id
    ? conditions.find((c) => c.id === condition.condition_id)
    : null;

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleDocClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [dropdownOpen]);

  const handleActionChange = (newAction: ConditionAction) => {
    if (!condition) {
      onChange({
        action: newAction,
        condition_id: conditions[0]?.id || null,
      });
    } else {
      onChange({
        ...condition,
        action: newAction,
      });
    }
  };

  const handleSelectConditionId = (condId: string, e?: React.MouseEvent) => {
    setDropdownOpen(false);
    if (condId === '__new__') {
      const anchor = e ? e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2 : null;
      onOpenConditionModal(null, anchor);
      return;
    }
    onChange({
      action,
      condition_id: condId,
    });
  };

  const handleClear = () => {
    onChange(null);
  };

  const isReadOnlyAction = action === 'readonly' || action === 'editable';

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
      {/* Header with Title & Info Hover Tooltip */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
          Conditional Logic
          <span className="group relative inline-flex items-center">
            <Info className="h-3.5 w-3.5 cursor-default text-gray-400 transition-colors hover:text-gray-600" />
            <span className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden w-64 rounded-md border border-gray-700 bg-slate-900 px-2.5 py-2 text-[11px] font-medium normal-case leading-snug text-white shadow-2xl group-hover:block">
              Linked from the central <strong>Conditions Module</strong>. Dynamic visibility and read-only rules update live everywhere when conditions are edited.
            </span>
          </span>
        </span>

        {isEnabled && (
          <button
            type="button"
            onClick={handleClear}
            className="text-[10px] font-medium text-gray-400 hover:text-red-600 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Inherited Group Condition Banner (if applicable) */}
      {inheritedGroupCondition && (
        <div className="flex items-start gap-2 rounded-md border border-purple-200 bg-purple-50/60 p-2 text-xs text-purple-900">
          <Layers className="h-4 w-4 shrink-0 text-purple-600 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-semibold text-[11px]">
              <span>Parent Group Rule ({groupTitle || 'Group'})</span>
            </div>
            <p className="mt-0.5 text-[10px] text-purple-800 leading-snug">
              {formatConditionSummary(inheritedGroupCondition, conditions)}
            </p>
          </div>
        </div>
      )}

      {/* Main Condition Selector / Card */}
      {!isEnabled ? (
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed border-gray-300 bg-white px-3 py-2 text-left text-xs font-medium text-gray-600 hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-700 transition-colors"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span>— Link a Condition —</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 right-0 z-40 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-xl">
              <button
                type="button"
                onClick={(e) => handleSelectConditionId('__new__', e)}
                className="flex w-full items-center gap-2 rounded-md bg-blue-50 px-2.5 py-1.5 text-left text-xs font-semibold text-blue-700 hover:bg-blue-100/80 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>+ Create new condition in Condition Module…</span>
              </button>

              <div className="my-1 border-t border-gray-100" />

              {conditions.length === 0 ? (
                <div className="px-2.5 py-2 text-center text-[11px] text-gray-400">
                  No saved conditions for &quot;{entityType}&quot; yet.
                </div>
              ) : (
                conditions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectConditionId(c.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <div className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-gray-800">{c.label}</span>
                      <span className="ml-1 font-mono text-[10px] text-gray-400">({c.id})</span>
                    </div>
                    <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 font-mono text-[9px] text-gray-500 font-semibold">
                      v{c.current_version}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* Effect / Action Selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Effect / Action</span>
            <select
              value={action}
              onChange={(e) => handleActionChange(e.target.value as ConditionAction)}
              className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <optgroup label="Visibility (Show / Hide)">
                <option value="show">👁 Show field when condition passes (hide otherwise)</option>
                <option value="hide">🙈 Hide field when condition passes (show otherwise)</option>
              </optgroup>
              <optgroup label="Interactivity (Read-Only / Editable)">
                <option value="readonly">🔒 Make Read-Only when condition passes</option>
                <option value="editable">✏️ Make Editable only when condition passes</option>
              </optgroup>
            </select>
          </div>

          {/* Condition Display Card (Linked from central module) */}
          {selectedConditionDef ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Linked Central Condition
              </span>
              <ConditionCard
                condition={selectedConditionDef}
                onEdit={(c, e) => {
                  const anchor = e ? e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2 : null;
                  onOpenConditionModal(c, anchor);
                }}
                onRemove={handleClear}
                compact={false}
              />
              <div ref={dropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-md border border-gray-200 bg-white px-2.5 py-1 text-left text-[11px] font-medium text-gray-600 hover:border-gray-300"
                >
                  <span className="truncate">Switch condition…</span>
                  <ChevronDown className="h-3 w-3 text-gray-400" />
                </button>
                {dropdownOpen && (
                  <div className="absolute left-0 right-0 z-40 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-xl">
                    <button
                      type="button"
                      onClick={(e) => handleSelectConditionId('__new__', e)}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> + Create new condition…
                    </button>
                    <div className="my-1 border-t border-gray-100" />
                    {conditions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectConditionId(c.id)}
                        className={`flex w-full items-center justify-between gap-1.5 rounded px-2 py-1 text-left text-xs ${
                          c.id === condition?.condition_id ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="truncate">{c.label}</span>
                        <span className="font-mono text-[9px] text-gray-400">v{c.current_version}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : condition?.condition_id ? (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/50 p-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />
                <span className="font-mono text-xs text-gray-800 truncate">{condition.condition_id}</span>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-gray-400 hover:text-red-600 rounded"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            /* Legacy inline condition display */
            <div className="flex flex-col gap-1.5 rounded-md border border-gray-200 bg-white p-2 text-xs">
              <div className="flex items-center justify-between text-gray-500">
                <span className="text-[10px] font-bold uppercase text-gray-400">Legacy Inline Rule</span>
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[10px] text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="rounded bg-gray-50 p-1.5 text-[11px] font-mono text-gray-700">
                {formatConditionSummary(condition)}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                  onOpenConditionModal(null, anchor);
                }}
                className="mt-1 flex items-center justify-center gap-1 rounded border border-dashed border-blue-300 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
              >
                <Sparkles className="h-3 w-3" /> Upgrade to Central Condition in Module
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
