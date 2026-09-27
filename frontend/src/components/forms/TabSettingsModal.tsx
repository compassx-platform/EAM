import { useState } from 'react';
import { X, Trash2, ShieldCheck, Plus } from 'lucide-react';
import type { FormTab, ConditionDefinition } from '../../types';

interface TabSettingsModalProps {
  tab: FormTab;
  allTabs: FormTab[];
  conditions: ConditionDefinition[];
  onSave: (updatedTab: FormTab, oldId: string) => void;
  onDelete?: (tabId: string) => void;
  onClose: () => void;
  onOpenConditionModal?: () => void;
}

export function TabSettingsModal({
  tab,
  allTabs,
  conditions,
  onSave,
  onDelete,
  onClose,
  onOpenConditionModal,
}: TabSettingsModalProps) {
  const [label, setLabel] = useState(tab.label || '');
  const [id, setId] = useState(tab.id || '');
  const [isDefault, setIsDefault] = useState(Boolean(tab.is_default));
  const [conditionId, setConditionId] = useState<string>(
    tab.visibility_condition?.condition_id || tab.condition_id || ''
  );
  const [conditionAction, setConditionAction] = useState<
    'show' | 'hide' | 'editable' | 'readonly'
  >(
    (tab.visibility_condition?.action as 'show' | 'hide' | 'editable' | 'readonly') || 'show'
  );
  const [idTouched, setIdTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLabelChange = (val: string) => {
    setLabel(val);
    if (!idTouched) {
      const slug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      if (slug) setId(slug);
    }
  };

  const handleSave = () => {
    const trimmedLabel = label.trim();
    const trimmedId = id.trim();

    if (!trimmedLabel) {
      setError('Tab label cannot be empty.');
      return;
    }
    if (!trimmedId) {
      setError('Tab ID cannot be empty.');
      return;
    }

    // Check for ID duplicate if changed
    if (trimmedId !== tab.id && allTabs.some((t) => t.id === trimmedId)) {
      setError(`A tab with ID "${trimmedId}" already exists.`);
      return;
    }

    const updatedTab: FormTab = {
      id: trimmedId,
      label: trimmedLabel,
      is_default: isDefault,
      condition_id: conditionId ? conditionId : undefined,
      visibility_condition: conditionId
        ? {
            action: conditionAction,
            condition_id: conditionId,
          }
        : undefined,
    };

    onSave(updatedTab, tab.id);
  };

  const selectedDef = conditionId ? conditions.find((c) => c.id === conditionId) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-2xs"
      onMouseDown={onClose}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Configure Tab</h3>
            <p className="text-xs text-gray-500">
              Manage tab name, identifier, and conditional visibility or interactivity rules
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="space-y-4 p-5 text-xs">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Tab Label */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
              Tab Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              placeholder="e.g. SOP & Documents"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Tab Identifier */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                Tab ID (Internal Key)
              </label>
              <span className="text-[10px] text-gray-400 font-mono">e.g. sop_documents</span>
            </div>
            <input
              type="text"
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setIdTouched(true);
              }}
              placeholder="e.g. sop_documents"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Default Tab Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/70 p-3">
            <div>
              <span className="font-semibold text-gray-800">Default Active Tab</span>
              <p className="text-[11px] text-gray-500">
                Automatically show this tab first when opening the entity record.
              </p>
            </div>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
          </div>

          {/* Conditional Logic */}
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                  Tab Conditional Logic
                </span>
              </div>
              {onOpenConditionModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenConditionModal();
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  <span>Create Condition</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-500">
              Control when this tab is displayed or when its fields become editable vs read-only based on workflow stage, user role, or record values.
            </p>

            <div className="space-y-2 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Condition Effect / Action
                </label>
                <select
                  value={conditionAction}
                  onChange={(e) =>
                    setConditionAction(
                      e.target.value as 'show' | 'hide' | 'editable' | 'readonly'
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-medium text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <optgroup label="Interactivity (Enable / Disable fields)">
                    <option value="editable">
                      ✏️ Enable when... (Editable in stage, Read-only in other stages)
                    </option>
                    <option value="readonly">
                      🔒 Disable when... (Read-only in stage, Editable in other stages)
                    </option>
                  </optgroup>
                  <optgroup label="Visibility (Show / Hide tab)">
                    <option value="show">
                      👁 Show when... (Visible in stage, Hidden in other stages)
                    </option>
                    <option value="hide">
                      🙈 Hide when... (Hidden in stage, Visible in other stages)
                    </option>
                  </optgroup>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Linked Condition
                  </label>
                  {conditionId && (
                    <button
                      type="button"
                      onClick={() => setConditionId('')}
                      className="text-[10px] font-medium text-gray-400 hover:text-red-600 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <select
                  value={conditionId}
                  onChange={(e) => setConditionId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">(Always active - No condition linked)</option>
                  {conditions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} ({c.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Helpful Hint Description */}
              {conditionId && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-2.5 text-[11px] text-blue-900">
                  {conditionAction === 'editable' && (
                    <p>
                      <strong>✏️ Enable when active:</strong> This tab stays visible. All fields in this tab are <strong>editable</strong> only when condition <em>&quot;{selectedDef?.label || conditionId}&quot;</em> passes, and <strong>read-only</strong> in all other workflow stages.
                    </p>
                  )}
                  {conditionAction === 'readonly' && (
                    <p>
                      <strong>🔒 Disable when active:</strong> This tab stays visible. All fields in this tab become <strong>read-only</strong> when condition <em>&quot;{selectedDef?.label || conditionId}&quot;</em> passes.
                    </p>
                  )}
                  {conditionAction === 'show' && (
                    <p>
                      <strong>👁 Show tab:</strong> This tab is displayed only when condition <em>&quot;{selectedDef?.label || conditionId}&quot;</em> passes, and completely hidden otherwise.
                    </p>
                  )}
                  {conditionAction === 'hide' && (
                    <p>
                      <strong>🙈 Hide tab:</strong> This tab is hidden when condition <em>&quot;{selectedDef?.label || conditionId}&quot;</em> passes, and displayed otherwise.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50/50 px-5 py-3">
          {onDelete && allTabs.length > 1 ? (
            <button
              type="button"
              onClick={() => onDelete(tab.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 shadow-2xs transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Tab</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 shadow-2xs transition-colors"
            >
              Save Tab
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
