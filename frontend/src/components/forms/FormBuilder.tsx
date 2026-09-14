import { useEffect, useState, type ReactNode } from 'react';
import {
  GridLayout,
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  Trash2,
  Heading,
  Type,
  AlignLeft,
  ListChecks,
  ChevronDown,
  X,
  FileText,
  GripVertical,
  MousePointerClick,
  Hash,
  Mail,
  Phone,
  Link,
  Calendar,
  CalendarClock,
  Clock,
  CheckSquare,
  ToggleRight,
  Table2,
  Code2,
  Copy,
  ClipboardCheck,
  Upload,
  Eye,
  EyeOff,
  Layers,
  FolderPlus,
  Filter,
  Paperclip,
  Lock,
} from 'lucide-react';
import { api } from '../../api/client';
import { formatConditionSummary, getConditionRules } from '../../lib/conditions';
import type {
  EntityField,
  EntityFormItem,
  GenericFieldType,
  ChecklistItem,
  ResolvedList,
  OptionListSummary,
  VisibilityCondition,
  ConditionOperator,
  ConditionRule,
  ConditionAction,
} from '../../types';

interface FormBuilderProps {
  entityType: string;
  onBack: () => void;
  onChanged: () => void;
}

interface FieldTypeDef {
  type: GenericFieldType;
  label: string;
  hint: string;
  defaultFieldName: string;
  defaultOptions: string[];
  defaultHeight: number;
}

const FIELD_TYPE_DEFS: FieldTypeDef[] = [
  { type: 'text', label: 'Text', hint: 'Single-line text input', defaultFieldName: 'text_field', defaultOptions: [], defaultHeight: 1 },
  { type: 'long_text', label: 'Long text', hint: 'Multi-line text area', defaultFieldName: 'long_text_field', defaultOptions: [], defaultHeight: 3 },
  { type: 'number', label: 'Number', hint: 'Numeric value', defaultFieldName: 'number_field', defaultOptions: [], defaultHeight: 1 },
  { type: 'email', label: 'Email', hint: 'Email address', defaultFieldName: 'email_field', defaultOptions: [], defaultHeight: 1 },
  { type: 'phone', label: 'Phone', hint: 'Phone number', defaultFieldName: 'phone_field', defaultOptions: [], defaultHeight: 1 },
  { type: 'url', label: 'URL', hint: 'Web link', defaultFieldName: 'url_field', defaultOptions: [], defaultHeight: 1 },
  { type: 'date', label: 'Date', hint: 'Date picker', defaultFieldName: 'date_field', defaultOptions: [], defaultHeight: 1 },
  { type: 'datetime', label: 'Date & time', hint: 'Date and time picker', defaultFieldName: 'datetime_field', defaultOptions: [], defaultHeight: 1 },
  { type: 'time', label: 'Time', hint: 'Time picker', defaultFieldName: 'time_field', defaultOptions: [], defaultHeight: 1 },
  { type: 'selection', label: 'Selection', hint: 'Radio buttons, choose one', defaultFieldName: 'selection_field', defaultOptions: ['Option 1', 'Option 2'], defaultHeight: 2 },
  { type: 'checkbox_group', label: 'Checkbox group', hint: 'Tick any number of options', defaultFieldName: 'checkbox_field', defaultOptions: ['Option 1', 'Option 2'], defaultHeight: 2 },
  { type: 'dropdown', label: 'Dropdown', hint: 'Pick from a list', defaultFieldName: 'dropdown_field', defaultOptions: ['Option 1', 'Option 2'], defaultHeight: 1 },
  { type: 'boolean', label: 'Yes / No', hint: 'Single checkbox toggle', defaultFieldName: 'boolean_field', defaultOptions: [], defaultHeight: 1 },
  { type: 'table', label: 'Table', hint: 'Dynamic row grid (columns added here, rows added at fill)', defaultFieldName: 'table_field', defaultOptions: ['Column 1', 'Column 2'], defaultHeight: 3 },
  { type: 'checklist', label: 'Checklist', hint: 'Pre-work checklist from a shared list (required tasks must be ticked)', defaultFieldName: 'checklist_field', defaultOptions: [], defaultHeight: 4 },
  { type: 'file', label: 'Attachment', hint: 'File / document upload', defaultFieldName: 'attachment_field', defaultOptions: [], defaultHeight: 2 },
];

function fieldIcon(type?: string) {
  switch (type) {
    case 'text':
      return Type;
    case 'long_text':
      return AlignLeft;
    case 'number':
      return Hash;
    case 'email':
      return Mail;
    case 'phone':
      return Phone;
    case 'url':
      return Link;
    case 'date':
      return Calendar;
    case 'datetime':
      return CalendarClock;
    case 'time':
      return Clock;
    case 'selection':
      return ListChecks;
    case 'checkbox_group':
      return CheckSquare;
    case 'dropdown':
      return ChevronDown;
    case 'boolean':
      return ToggleRight;
    case 'table':
      return Table2;
    case 'checklist':
      return ListChecks;
    case 'file':
      return Paperclip;
    default:
      return FileText;
  }
}

function iconColor(type?: string) {
  switch (type) {
    case 'text':
      return 'text-sky-600';
    case 'long_text':
      return 'text-indigo-600';
    case 'number':
      return 'text-violet-600';
    case 'email':
      return 'text-pink-600';
    case 'phone':
      return 'text-teal-600';
    case 'url':
      return 'text-blue-600';
    case 'date':
      return 'text-emerald-600';
    case 'datetime':
      return 'text-teal-600';
    case 'time':
      return 'text-cyan-600';
    case 'selection':
      return 'text-emerald-600';
    case 'checkbox_group':
      return 'text-purple-600';
    case 'dropdown':
      return 'text-amber-600';
    case 'boolean':
      return 'text-orange-600';
    case 'table':
      return 'text-rose-600';
    case 'checklist':
      return 'text-indigo-600';
    case 'file':
      return 'text-amber-600';
    default:
      return 'text-gray-400';
  }
}

const INSPECTOR_INPUT =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

function InspectorField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</label>
      {children}
      {hint && <span className="text-[10px] leading-snug text-gray-400">{hint}</span>}
    </div>
  );
}

function SizeInputs({
  item,
  maxW,
  onChange,
}: {
  item: EntityFormItem;
  maxW: number;
  onChange: (patch: Partial<EntityFormItem>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-400">Width</span>
        <input
          type="number"
          min={1}
          max={maxW}
          value={item.w}
          onChange={(e) => onChange({ w: Math.max(1, Math.min(maxW, Number(e.target.value) || 1)) })}
          className={INSPECTOR_INPUT}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-400">Height</span>
        <input
          type="number"
          min={1}
          value={item.h}
          onChange={(e) => onChange({ h: Math.max(1, Number(e.target.value) || 1) })}
          className={INSPECTOR_INPUT}
        />
      </div>
    </div>
  );
}

function OptionVisibilityList({
  items,
  hiddenOptions = [],
  onChange,
}: {
  items: Array<string | ChecklistItem>;
  hiddenOptions?: string[];
  onChange: (hidden: string[]) => void;
}) {
  const hiddenSet = new Set(hiddenOptions);
  const total = items.length;
  const hiddenCount = items.filter((item) => {
    const label = typeof item === 'string' ? item : item.label;
    return hiddenSet.has(label);
  }).length;
  const visibleCount = total - hiddenCount;

  const toggle = (label: string) => {
    const next = new Set(hiddenSet);
    if (next.has(label)) {
      next.delete(label);
    } else {
      next.add(label);
    }
    onChange(Array.from(next));
  };

  const showAll = () => onChange([]);
  const hideAll = () => {
    onChange(items.map((it) => (typeof it === 'string' ? it : it.label)));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>
          <span className="font-semibold text-gray-700">{visibleCount}</span> of {total} visible
          {hiddenCount > 0 && (
            <span className="ml-1 font-medium text-amber-600">({hiddenCount} hidden)</span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={showAll}
            className="text-[10px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            Show all
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={hideAll}
            className="text-[10px] font-medium text-gray-500 hover:text-gray-700 hover:underline"
          >
            Hide all
          </button>
        </div>
      </div>

      <div className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white">
        {items.map((rawItem) => {
          const label = typeof rawItem === 'string' ? rawItem : rawItem.label;
          const isChecklist = typeof rawItem !== 'string';
          const isHidden = hiddenSet.has(label);

          return (
            <div
              key={label}
              onClick={() => toggle(label)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-xs transition-colors ${
                isHidden
                  ? 'bg-gray-50/80 text-gray-400 hover:bg-gray-100/80'
                  : 'bg-white text-gray-700 hover:bg-blue-50/50'
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <span className={isHidden ? 'line-through opacity-70 truncate' : 'truncate font-medium'}>
                  {label}
                </span>
                {isChecklist && (rawItem as ChecklistItem).required && (
                  <span
                    className={`shrink-0 rounded px-1 text-[9px] font-semibold ${
                      isHidden ? 'bg-gray-200 text-gray-400' : 'bg-red-50 text-red-600'
                    }`}
                  >
                    required
                  </span>
                )}
                {isChecklist && (rawItem as ChecklistItem).assigned_role && (
                  <span className="shrink-0 rounded bg-gray-100 px-1 font-mono text-[9px] text-gray-400">
                    {(rawItem as ChecklistItem).assigned_role}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(label);
                }}
                title={isHidden ? 'Show this option on this form' : 'Hide this option from this form'}
                className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  isHidden
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {isHidden ? (
                  <>
                    <EyeOff className="h-3 w-3" /> Hidden
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3 text-emerald-600" /> Visible
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConditionBuilder({
  condition,
  availableFields,
  onChange,
}: {
  condition?: VisibilityCondition | null;
  availableFields: Array<{ name: string; label: string; type?: string; options?: string[] }>;
  onChange: (cond: VisibilityCondition | null) => void;
}) {
  const rules = getConditionRules(condition);
  const isEnabled = Boolean(condition && rules.length > 0);
  const action: ConditionAction = condition?.action || 'show';
  const matchType: 'all' | 'any' = condition?.matchType || 'all';

  const handleToggle = (enabled: boolean) => {
    if (!enabled) {
      onChange(null);
    } else {
      const defaultField = availableFields[0]?.name || '';
      onChange({
        action: 'show',
        matchType: 'all',
        rules: [
          {
            field: defaultField,
            operator: 'equals',
            value: '',
          },
        ],
      });
    }
  };

  const handleActionChange = (newAction: ConditionAction) => {
    const currentRules =
      rules.length > 0
        ? rules
        : [{ field: availableFields[0]?.name || '', operator: 'equals' as ConditionOperator, value: '' }];
    onChange({
      action: newAction,
      matchType,
      rules: currentRules,
    });
  };

  const handleMatchTypeChange = (newMatchType: 'all' | 'any') => {
    onChange({
      action,
      matchType: newMatchType,
      rules,
    });
  };

  const handleAddRule = () => {
    const nextRules: ConditionRule[] = [
      ...rules,
      {
        field: availableFields[0]?.name || '',
        operator: 'equals',
        value: '',
      },
    ];
    onChange({
      action,
      matchType,
      rules: nextRules,
    });
  };

  const handleUpdateRule = (index: number, patch: Partial<ConditionRule>) => {
    const nextRules = rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange({
      action,
      matchType,
      rules: nextRules,
    });
  };

  const handleRemoveRule = (index: number) => {
    const nextRules = rules.filter((_, i) => i !== index);
    if (nextRules.length === 0) {
      onChange(null);
    } else {
      onChange({
        action,
        matchType,
        rules: nextRules,
      });
    }
  };

  if (availableFields.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50/50 p-2 text-center text-[11px] text-gray-400">
        Add at least one other field to this form to configure conditional logic.
      </div>
    );
  }

  const isReadOnlyAction = action === 'readonly' || action === 'editable';

  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50/70 p-2.5">
      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="accent-blue-600"
          />
          Enable Conditional Logic
        </label>
        {isEnabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[10px] text-gray-400 hover:text-red-600 hover:underline"
          >
            Clear rules
          </button>
        )}
      </div>

      {isEnabled && (
        <div className="mt-1 flex flex-col gap-2.5 border-t border-gray-200/80 pt-2">
          {/* Action Selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Effect / Action</span>
            <select
              value={action}
              onChange={(e) => handleActionChange(e.target.value as ConditionAction)}
              className={INSPECTOR_INPUT}
            >
              <optgroup label="Visibility (Show / Hide)">
                <option value="show">👁 Show when conditions match (hide otherwise)</option>
                <option value="hide">🙈 Hide when conditions match (show otherwise)</option>
              </optgroup>
              <optgroup label="Interactivity (Read-Only / Disabled)">
                <option value="readonly">🔒 Make Read-Only when conditions match</option>
                <option value="editable">✏️ Make Editable only when conditions match</option>
              </optgroup>
            </select>
          </div>

          {/* Match Mode (AND / OR) */}
          {rules.length > 1 && (
            <div className="flex items-center justify-between rounded bg-gray-100/80 px-2 py-1">
              <span className="text-[11px] font-medium text-gray-600">Combine logic:</span>
              <div className="flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-gray-700">
                  <input
                    type="radio"
                    name="matchType"
                    checked={matchType === 'all'}
                    onChange={() => handleMatchTypeChange('all')}
                    className="accent-blue-600"
                  />
                  ALL must match (AND)
                </label>
                <label className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-gray-700">
                  <input
                    type="radio"
                    name="matchType"
                    checked={matchType === 'any'}
                    onChange={() => handleMatchTypeChange('any')}
                    className="accent-blue-600"
                  />
                  ANY can match (OR)
                </label>
              </div>
            </div>
          )}

          {/* Rules List */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Conditions ({rules.length})
              </span>
            </div>
            {rules.map((rule, idx) => {
              const selectedTargetField = availableFields.find((f) => f.name === rule.field);
              const isFirst = idx === 0;
              return (
                <div
                  key={idx}
                  className="relative flex flex-col gap-1.5 rounded-md border border-gray-200 bg-white p-2 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-600">
                      {isFirst ? 'When' : matchType === 'all' ? 'AND' : 'OR'}
                    </span>
                    {rules.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(idx)}
                        className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Remove condition clause"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Field Selector */}
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-gray-400">Field</label>
                    <select
                      value={rule.field}
                      onChange={(e) => handleUpdateRule(idx, { field: e.target.value, value: '' })}
                      className={INSPECTOR_INPUT}
                    >
                      {availableFields.map((f) => (
                        <option key={f.name} value={f.name}>
                          {f.label} ({f.name})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Operator */}
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-gray-400">Comparison</label>
                    <select
                      value={rule.operator}
                      onChange={(e) => handleUpdateRule(idx, { operator: e.target.value as ConditionOperator })}
                      className={INSPECTOR_INPUT}
                    >
                      <option value="equals">Equals (is equal to)</option>
                      <option value="not_equals">Does not equal</option>
                      <option value="contains">Contains / In group</option>
                      <option value="not_contains">Does not contain</option>
                      <option value="is_not_empty">Is filled / checked (not empty)</option>
                      <option value="is_empty">Is empty / unchecked</option>
                      <option value="greater_than">Greater than (&gt;)</option>
                      <option value="less_than">Less than (&lt;)</option>
                    </select>
                  </div>

                  {/* Value */}
                  {rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty' && (
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-gray-400">Value</label>
                      {selectedTargetField?.options && selectedTargetField.options.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          <select
                            value={rule.value || ''}
                            onChange={(e) => handleUpdateRule(idx, { value: e.target.value })}
                            className={INSPECTOR_INPUT}
                          >
                            <option value="">Select option…</option>
                            {selectedTargetField.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                          <input
                            value={rule.value || ''}
                            onChange={(e) => handleUpdateRule(idx, { value: e.target.value })}
                            placeholder="Or type custom value"
                            className={`${INSPECTOR_INPUT} text-xs`}
                          />
                        </div>
                      ) : (
                        <input
                          value={rule.value || ''}
                          onChange={(e) => handleUpdateRule(idx, { value: e.target.value })}
                          placeholder={selectedTargetField?.type === 'number' ? 'e.g. 15000' : 'e.g. Yes'}
                          className={INSPECTOR_INPUT}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={handleAddRule}
              className="flex items-center justify-center gap-1 rounded border border-dashed border-gray-300 py-1.5 text-[11px] font-medium text-gray-600 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700"
            >
              <Plus className="h-3 w-3" /> Add another condition clause ({matchType === 'all' ? 'AND' : 'OR'})
            </button>
          </div>

          {/* Summary Preview */}
          <div
            className={`mt-1 flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-medium ${
              isReadOnlyAction ? 'bg-amber-50 text-amber-800' : 'bg-indigo-50 text-indigo-700'
            }`}
          >
            {isReadOnlyAction ? <Lock className="h-3 w-3 shrink-0" /> : <Filter className="h-3 w-3 shrink-0" />}
            <span className="truncate">{formatConditionSummary(condition)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Non-interactive preview of the control a field will render as in the real
// form, using the exact same widget styling as the fill-in form.
// pointer-events-none keeps drag/clicks from fighting the grid.
function ControlPreview({
  type,
  options,
  hiddenOptions = [],
  placeholder,
  resolved,
  height = 3,
  item,
}: {
  type?: string;
  options?: string[];
  hiddenOptions?: string[];
  placeholder?: string | null;
  resolved?: ResolvedList | null;
  height?: number;
  item?: EntityFormItem;
}) {
  const inputCls =
    'pointer-events-none w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 select-none';
  const choiceCls = 'flex items-center gap-1 text-xs text-gray-700';
  const choiceInput = 'pointer-events-none accent-blue-600';

  const hiddenSet = new Set(hiddenOptions || []);

  const resolvedStrings = resolved && resolved.kind === 'options'
    ? (resolved.items as string[])
    : [];
  const allOptions = resolved && resolved.kind === 'options'
    ? resolvedStrings
    : (options ?? []);

  const displayedOptions = allOptions.filter((o) => !hiddenSet.has(o));
  const hiddenCount = allOptions.length - displayedOptions.length;

  if (type === 'file') {
    return (
      <div className="pointer-events-none flex h-full w-full flex-col justify-center rounded-md border-2 border-dashed border-gray-300 bg-gray-50/70 p-2 text-center select-none">
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-700">
          <Paperclip className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <span className="truncate">{placeholder || 'Click or drag files to attach'}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
          {item?.accept && (
            <span className="rounded bg-gray-200/90 px-1 font-mono text-[9px] text-gray-600">
              {item.accept}
            </span>
          )}
          <span className="rounded bg-blue-50 px-1 font-mono text-[9px] text-blue-700">
            Max {item?.maxFileSizeMb || 10} MB
          </span>
          {item?.allowMultiple && (
            <span className="rounded bg-purple-50 px-1 font-mono text-[9px] text-purple-700">
              Multiple (up to {item?.maxFiles || 5})
            </span>
          )}
        </div>
      </div>
    );
  }

  if (type === 'long_text') {
    return (
      <textarea
        rows={Math.max(2, Math.round((height * 40) / 24))}
        placeholder={placeholder || ''}
        className={`${inputCls} h-full min-h-[30px] resize-none leading-snug`}
      />
    );
  }

  if (type === 'checklist') {
    const rawTasks = resolved && resolved.kind === 'checklist'
      ? (resolved.items as ChecklistItem[])
      : null;
    const tasks = rawTasks ? rawTasks.filter((t) => !hiddenSet.has(t.label)) : null;
    const hiddenTasksCount = rawTasks ? rawTasks.length - (tasks?.length ?? 0) : 0;

    return (
      <div className="pointer-events-none w-full select-none rounded-md border border-gray-300 bg-white">
        {!rawTasks || rawTasks.length === 0 ? (
          <span className="block px-2 py-1.5 text-[11px] text-gray-400">
            Pick a published checklist list in the inspector
          </span>
        ) : tasks?.length === 0 ? (
          <span className="block px-2 py-1.5 text-[11px] italic text-amber-600">
            All {rawTasks.length} task(s) hidden on this form
          </span>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {tasks.map((t) => (
              <span key={t.label} className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-gray-700">
                <input type="checkbox" className={choiceInput} />
                <span className={t.required ? 'font-semibold text-gray-800' : ''}>{t.label}</span>
                {t.required && <span className="text-[9px] font-bold text-red-500">required</span>}
                {t.assigned_role && (
                  <span className="rounded bg-gray-100 px-1 font-mono text-[9px] text-gray-400">{t.assigned_role}</span>
                )}
              </span>
            ))}
            {hiddenTasksCount > 0 && (
              <span className="bg-amber-50/60 px-2 py-0.5 text-[10px] text-amber-700">
                + {hiddenTasksCount} task(s) hidden
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (type === 'table') {
    const rawCols = options && options.length > 0 ? options : ['Column 1', 'Column 2'];
    const cols = rawCols.filter((c) => !hiddenSet.has(c));
    const effectiveCols = cols.length > 0 ? cols : ['(No visible columns)'];
    return (
      <div className="pointer-events-none w-full select-none overflow-hidden rounded-md border border-gray-300 bg-white text-xs text-gray-700">
        <div className="flex border-b border-gray-200 bg-gray-50">
          {effectiveCols.map((c, i) => (
            <span
              key={i}
              className="flex-1 truncate border-r border-gray-200 px-2 py-1.5 font-medium text-gray-500 last:border-r-0"
            >
              {c}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-gray-400">
          <Plus className="h-3 w-3" /> Add row at fill time
        </div>
      </div>
    );
  }

  if (type === 'selection' || type === 'checkbox_group') {
    if (!allOptions || allOptions.length === 0) {
      return <span className="text-[11px] text-gray-400">No options defined</span>;
    }
    if (displayedOptions.length === 0) {
      return (
        <span className="text-[11px] italic text-amber-600">
          All {allOptions.length} option(s) hidden on this form
        </span>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {displayedOptions.map((o) => (
          <label key={o} className={choiceCls}>
            <input
              type={type === 'selection' ? 'radio' : 'checkbox'}
              className={choiceInput}
              name={type === 'selection' ? 'preview' : undefined}
            />
            {o}
          </label>
        ))}
        {hiddenCount > 0 && (
          <span className="rounded bg-amber-50 px-1 font-mono text-[9px] text-amber-700">
            +{hiddenCount} hidden
          </span>
        )}
        {resolved?.version_label && (
          <span className="rounded bg-emerald-50 px-1 font-mono text-[9px] text-emerald-600">
            {resolved.list_key} · {resolved.version_label}
          </span>
        )}
      </div>
    );
  }

  if (type === 'boolean') {
    return (
      <label className="flex w-fit items-center gap-1.5 rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs text-gray-700">
        <input type="checkbox" className={choiceInput} /> Yes
      </label>
    );
  }

  if (type === 'dropdown' || type === 'select') {
    return (
      <select className={inputCls}>
        <option>—</option>
        {(displayedOptions || []).map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  }

  const NATIVE: Record<string, string> = {
    number: 'number',
    email: 'email',
    phone: 'tel',
    url: 'url',
    date: 'date',
    datetime: 'datetime-local',
    time: 'time',
  };
  if (type && NATIVE[type]) {
    return <input type={NATIVE[type]} className={inputCls} />;
  }
  if (type === 'entity_reference') {
    return <input type="text" className={inputCls} placeholder="linked entity id" />;
  }
  return <input type="text" className={inputCls} placeholder={placeholder || ''} />;
}

let itemCounter = 0;
function nextItemId(prefix: string) {
  itemCounter += 1;
  return `${prefix}:${Date.now().toString(36)}-${itemCounter}`;
}

function nextY(items: EntityFormItem[], cols: number): number {
  const rows = items.map((it) => it.y + it.h);
  return rows.length ? Math.max(...rows) : 0;
}

export function FormBuilder({ entityType, onBack, onChanged }: FormBuilderProps) {
  const [items, setItems] = useState<EntityFormItem[]>([]);
  const [fields, setFields] = useState<EntityField[]>([]);
  const [cols, setCols] = useState(12);
  const [rowHeight, setRowHeight] = useState(40);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [resolved, setResolved] = useState<Record<string, ResolvedList>>({});
  const [publishedLists, setPublishedLists] = useState<OptionListSummary[]>([]);

  const { width, containerRef, mounted } = useContainerWidth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const form = await api.getForm(entityType);
        if (cancelled) return;
        const layout = ((form.layout || []) as Array<any>).map((it) => {
          const isGroup = Boolean(it.isGroup ?? it.is_group ?? it.i?.startsWith('group:'));
          const isHeader = Boolean(it.isHeader ?? it.is_header ?? it.i?.startsWith('header:'));
          return {
            ...it,
            isHeader,
            isGroup,
            is_header: undefined,
            is_group: undefined,
            fieldName: it.fieldName ?? it.field_name ?? (isHeader || isGroup ? null : it.i),
            fieldType: it.fieldType ?? it.field_type ?? null,
            optionsList: it.optionsList ?? it.options_list ?? null,
            options_list: undefined,
            hiddenOptions: it.hiddenOptions ?? it.hidden_options ?? [],
            hidden_options: undefined,
            groupId: it.groupId ?? it.group_id ?? (isGroup ? it.i : null),
            group_id: undefined,
            groupTitle: it.groupTitle ?? it.group_title ?? (isGroup ? (it.label || 'Group') : null),
            group_title: undefined,
            visibilityCondition: it.visibilityCondition ?? it.visibility_condition ?? null,
            visibility_condition: undefined,
            accept: it.accept ?? it.accept ?? null,
            maxFileSizeMb: it.maxFileSizeMb ?? it.max_file_size_mb ?? null,
            allowMultiple: Boolean(it.allowMultiple ?? it.allow_multiple),
            maxFiles: it.maxFiles ?? it.max_files ?? null,
          };
        });
        setItems(layout);
        setFields(form.fields || []);
        setCols(form.cols || 12);
        setRowHeight(form.row_height || 40);
        ensureResolved(layout.map((it) => it.optionsList).filter((k): k is string => Boolean(k)));
      } catch (e: any) {
        if (cancelled) return;
        setNotice({ kind: 'err', text: e.message });
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lists = await api.listLists();
        if (!cancelled) setPublishedLists(lists.filter((l) => l.published_version));
      } catch {
        /* list pickers just stay empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureResolved = (keys: string[]) => {
    const missing = [...new Set(keys.map((k) => k.trim()).filter((k) => k && !resolved[k]))];
    if (missing.length === 0) return;
    api.resolveLists(missing).then((r) => {
      setResolved((prev) => {
        const next = { ...prev };
        for (const k of missing) if (!next[k]) next[k] = r.resolved[k];
        else if (r.resolved[k]) next[k] = r.resolved[k];
        return next;
      });
    }).catch(() => {});
  };

  const resolvedFor = (it: EntityFormItem): ResolvedList | null =>
    it.optionsList ? resolved[it.optionsList] ?? null : null;

  const flash = (kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 3500);
  };

  const addHeading = () => {
    const y = nextY(items, cols);
    setItems((prev) => [
      ...prev,
      { i: nextItemId('header'), x: 0, y, w: cols, h: 1, isHeader: true, label: 'New Section' },
    ]);
    setDirty(true);
  };

  const addGroup = () => {
    const y = nextY(items, cols);
    const id = nextItemId('group');
    const groupCount = items.filter((it) => it.isGroup).length + 1;
    const groupTitle = `Group ${groupCount}`;
    setItems((prev) => [
      ...prev,
      {
        i: id,
        x: 0,
        y,
        w: cols,
        h: 1,
        isGroup: true,
        groupId: id,
        label: groupTitle,
        groupTitle: groupTitle,
      },
    ]);
    setSelected(id);
    setDirty(true);
  };

  const addField = (type: GenericFieldType) => {
    const def = FIELD_TYPE_DEFS.find((d) => d.type === type)!;
    const usedNames = new Set(items.map((it) => it.fieldName).filter((n): n is string => Boolean(n)));
    let name = def.defaultFieldName;
    let n = 2;
    while (usedNames.has(name)) name = `${def.defaultFieldName}_${n++}`;

    const id = nextItemId('field');
    const y = nextY(items, cols);
    setItems((prev) => [
      ...prev,
      {
        i: id,
        x: 0,
        y,
        w: Math.max(6, Math.round(cols / 2)),
        h: def.defaultHeight,
        label: def.label,
        fieldName: name,
        fieldType: type,
        required: false,
        options: [...def.defaultOptions],
        placeholder: type === 'file' ? 'Attach files or documents' : '',
        accept: type === 'file' ? '' : undefined,
        maxFileSizeMb: type === 'file' ? 10 : undefined,
        allowMultiple: type === 'file' ? true : undefined,
        maxFiles: type === 'file' ? 5 : undefined,
      },
    ]);
    setSelected(id);
    setDirty(true);
  };

  const handleLayoutChange = (layout: Layout) => {
    const byId = new Map(items.map((it) => [it.i, it]));
    setItems(
      layout.map((li: LayoutItem) => {
        const existing = byId.get(li.i);
        return {
          ...(existing ?? {}),
          i: li.i,
          x: li.x,
          y: li.y,
          w: li.w,
          h: li.h,
        };
      })
    );
    setDirty(true);
  };

  const patchItem = (id: string, patch: Partial<EntityFormItem>) => {
    setItems((prev) => prev.map((it) => (it.i === id ? { ...it, ...patch } : it)));
    setDirty(true);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.i !== id));
    setSelected((s) => (s === id ? null : s));
    setDirty(true);
  };

  const patchOption = (id: string, idx: number, value: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.i !== id) return it;
        const options = [...(it.options || [])];
        options[idx] = value;
        return { ...it, options };
      })
    );
    setDirty(true);
  };

  const addOption = (id: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.i !== id) return it;
        const n = (it.options || []).length;
        return {
          ...it,
          options: [...(it.options || []), it.fieldType === 'table' ? `Column ${n + 1}` : `Option ${n + 1}`],
        };
      })
    );
    setDirty(true);
  };

  const removeOption = (id: string, idx: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.i !== id) return it;
        const options = (it.options || []).filter((_, i) => i !== idx);
        return { ...it, options };
      })
    );
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await api.saveForm({
        entity_type: entityType,
        layout: items,
        cols,
        row_height: rowHeight,
      });
      if (res && Array.isArray(res.layout)) {
        const layout = (res.layout as Array<any>).map((it) => {
          const isGroup = Boolean(it.isGroup ?? it.is_group ?? it.i?.startsWith('group:'));
          const isHeader = Boolean(it.isHeader ?? it.is_header ?? it.i?.startsWith('header:'));
          return {
            ...it,
            isHeader,
            isGroup,
            is_header: undefined,
            is_group: undefined,
            fieldName: it.fieldName ?? it.field_name ?? (isHeader || isGroup ? null : it.i),
            fieldType: it.fieldType ?? it.field_type ?? null,
            optionsList: it.optionsList ?? it.options_list ?? null,
            options_list: undefined,
            hiddenOptions: it.hiddenOptions ?? it.hidden_options ?? [],
            hidden_options: undefined,
            groupId: it.groupId ?? it.group_id ?? (isGroup ? it.i : null),
            group_id: undefined,
            groupTitle: it.groupTitle ?? it.group_title ?? (isGroup ? (it.label || 'Group') : null),
            group_title: undefined,
            visibilityCondition: it.visibilityCondition ?? it.visibility_condition ?? null,
            visibility_condition: undefined,
            accept: it.accept ?? (it as any).accept ?? null,
            maxFileSizeMb: it.maxFileSizeMb ?? (it as any).max_file_size_mb ?? null,
            allowMultiple: Boolean(it.allowMultiple ?? (it as any).allow_multiple),
            maxFiles: it.maxFiles ?? (it as any).max_files ?? null,
          };
        });
        setItems(layout);
      }
      setDirty(false);
      onChanged();
      flash('ok', 'Form layout saved.');
    } catch (e: any) {
      flash('err', `Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteForm = async () => {
    if (!window.confirm(`Delete the form layout for "${entityType}"?`)) return;
    setDeleting(true);
    try {
      await api.deleteForm(entityType);
      setItems([]);
      setDirty(false);
      onChanged();
      flash('ok', 'Form layout deleted.');
    } catch (e: any) {
      flash('err', `Delete failed: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const selectedItem = selected ? items.find((it) => it.i === selected) : null;

  const optionLists = publishedLists.filter((l) => l.kind === 'options');
  const checklistLists = publishedLists.filter((l) => l.kind === 'checklist');

  const currentDefinition = () => ({
    entity_type: entityType,
    layout: items.map((it) => {
      const copy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(it)) {
        if (v !== undefined && v !== null) copy[k] = v;
      }
      return copy;
    }),
    cols,
    row_height: rowHeight,
  });

  const openJson = () => {
    setJsonDraft(JSON.stringify(currentDefinition(), null, 2));
    setJsonError(null);
    setCopied(false);
    setJsonOpen(true);
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonDraft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      flash('err', 'Copy failed — select the JSON and copy manually.');
    }
  };

  const importJson = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonDraft);
    } catch {
      setJsonError('Invalid JSON — check for missing commas or trailing commas.');
      return;
    }
    const obj = parsed as {
      layout?: unknown;
      cols?: unknown;
      row_height?: unknown;
    };
    if (!Array.isArray(obj.layout)) {
      setJsonError('The JSON must contain a "layout" array.');
      return;
    }
    const layout = obj.layout as EntityFormItem[];
    for (let idx = 0; idx < layout.length; idx += 1) {
      const it = layout[idx];
      if (!it || typeof it !== 'object' || typeof it.i !== 'string' || !it.i.trim()) {
        setJsonError(`Layout item #${idx + 1} is missing a valid "i" id.`);
        return;
      }
      const dup = layout.findIndex((o, j) => j < idx && o.i === it.i);
      if (dup !== -1) {
        setJsonError(`Duplicate layout item id "${it.i}".`);
        return;
      }
    }
    const nextCols = Number.isFinite(Number(obj.cols)) && Number(obj.cols) >= 1 ? Math.round(Number(obj.cols)) : cols;
    const nextRowHeight =
      Number.isFinite(Number(obj.row_height)) && Number(obj.row_height) >= 1 ? Math.round(Number(obj.row_height)) : rowHeight;
    const normalized: EntityFormItem[] = layout.map((it) => {
      const isGroup = Boolean(it.isGroup ?? (it as any).is_group ?? it.i?.startsWith('group:'));
      const isHeader = Boolean(it.isHeader ?? (it as any).is_header ?? it.i?.startsWith('header:'));
      return {
        ...it,
        i: it.i,
        x: Number.isFinite(Number(it.x)) ? Math.max(0, Math.round(Number(it.x))) : 0,
        y: Number.isFinite(Number(it.y)) ? Math.max(0, Math.round(Number(it.y))) : 0,
        w: Number.isFinite(Number(it.w)) ? Math.max(1, Math.min(nextCols, Math.round(Number(it.w)))) : 6,
        h: Number.isFinite(Number(it.h)) ? Math.max(1, Math.round(Number(it.h))) : 1,
        isHeader,
        isGroup,
        optionsList: (it as any).options_list ?? it.optionsList ?? null,
        hiddenOptions: (it as any).hidden_options ?? it.hiddenOptions ?? [],
        groupId: it.groupId ?? (it as any).group_id ?? (isGroup ? it.i : null),
        groupTitle: it.groupTitle ?? (it as any).group_title ?? (isGroup ? (it.label || 'Group') : null),
        visibilityCondition: it.visibilityCondition ?? (it as any).visibility_condition ?? null,
        accept: it.accept ?? (it as any).accept ?? null,
        maxFileSizeMb: it.maxFileSizeMb ?? (it as any).max_file_size_mb ?? null,
        allowMultiple: Boolean(it.allowMultiple ?? (it as any).allow_multiple),
        maxFiles: it.maxFiles ?? (it as any).max_files ?? null,
      };
    });
    setItems(normalized);
    setCols(nextCols);
    setRowHeight(nextRowHeight);
    setJsonOpen(false);
    setJsonError(null);
    setDirty(true);
    flash('ok', `Imported ${normalized.length} item(s) from JSON. Review and Save to persist.`);
  };

  const availableGroups = items
    .filter((it) => it.isGroup)
    .map((it) => ({
      id: it.groupId || it.i,
      title: it.groupTitle || it.label || it.i,
      item: it,
    }));

  const targetFieldOptions = items
    .filter((it) => !it.isHeader && !it.isGroup && it.i !== selectedItem?.i)
    .map((it) => {
      const fieldName = it.fieldName || it.i;
      const label = it.label || fieldName;
      let opts = it.options || [];
      if (it.optionsList && resolved[it.optionsList]?.kind === 'options') {
        opts = resolved[it.optionsList].items as string[];
      }
      if (it.fieldType === 'boolean' && (!opts || opts.length === 0)) {
        opts = ['yes', 'no'];
      }
      return {
        name: fieldName,
        label,
        type: it.fieldType || 'text',
        options: opts,
      };
    });

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-200 bg-white px-4 py-2.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" /> Forms
        </button>

        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-base font-bold text-gray-900">Form Builder</h1>
          <span className="max-w-[220px] truncate rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-semibold text-blue-700">
            {entityType}
          </span>
          {!loaded && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {dirty && (
            <span className="hidden items-center gap-1.5 text-xs font-medium text-amber-600 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes
            </span>
          )}
          {notice && (
            <span
              className={`hidden items-center gap-1 text-xs md:inline-flex ${
                notice.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {notice.kind === 'ok' && <CheckCircle2 className="h-3.5 w-3.5" />}
              {notice.text}
            </span>
          )}
          <button
            onClick={handleDeleteForm}
            disabled={deleting || saving}
            title="Delete this form layout"
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
          </button>
          <button
            onClick={openJson}
            title="View, edit, copy or export the form as JSON"
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            <Code2 className="h-4 w-4" /> JSON
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Palette */}
        <div className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-gray-200 bg-gray-50 p-3">
          <div>
            <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Sections & Groups</h3>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={addHeading}
                className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-2.5 py-2 text-left text-sm text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              >
                <Heading className="h-4 w-4 shrink-0 text-indigo-500" /> Add section heading
              </button>
              <button
                onClick={addGroup}
                className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-2.5 py-2 text-left text-sm text-gray-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"
              >
                <Layers className="h-4 w-4 shrink-0 text-purple-600" /> Add form group
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fields</h3>
              <span className="text-[10px] text-gray-300">{FIELD_TYPE_DEFS.length} blocks</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {FIELD_TYPE_DEFS.map((def) => {
                const Icon = fieldIcon(def.type);
                return (
                  <button
                    key={def.type}
                    onClick={() => addField(def.type)}
                    title={def.hint}
                    className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-2 text-left text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor(def.type)}`} />
                    <span className="truncate">{def.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-gray-400">
              Click a block to drop it on the canvas, then fine-tune it in the inspector.
            </p>
          </div>

          {fields.length > 0 && (
            <details className="rounded-md border border-gray-200 bg-white">
              <summary className="flex cursor-pointer select-none items-center gap-1.5 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600 [&::-webkit-details-marker]:hidden">
                <FileText className="h-3.5 w-3.5" /> Registered fields
                <ChevronDown className="ml-auto h-3.5 w-3.5" />
              </summary>
              <div className="px-2 pb-2">
                {fields
                  .filter((f) => !items.some((it) => !it.isHeader && !it.isGroup && (it.fieldName || it.i) === f.field_name))
                  .map((f) => (
                    <div
                      key={f.field_name}
                      className="mb-1 flex items-center gap-2 rounded-md bg-gray-50 px-2.5 py-1.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-500">{f.field_name}</span>
                        <span className="block text-[11px] text-gray-400">
                          {f.field_type}
                          {f.required ? ' · required' : ''}
                        </span>
                      </span>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="relative min-w-0 flex-1 overflow-y-auto bg-white">
          {items.length === 0 && mounted && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <MousePointerClick className="h-8 w-8 text-gray-300" />
              <p className="text-sm font-semibold text-gray-400">Your form is empty</p>
              <p className="max-w-xs text-xs leading-relaxed text-gray-400">
                Drop a section heading, form group, or a field block from the palette on the left to start building this form.
              </p>
            </div>
          )}
          {mounted && (
            <GridLayout
              width={width}
              layout={items}
              compactor={verticalCompactor}
              gridConfig={{ cols, rowHeight, margin: [12, 12], containerPadding: [12, 12] }}
              dragConfig={{ enabled: true, handle: '.drag-handle', threshold: 3 }}
              resizeConfig={{ enabled: true, handles: ['se'] }}
              onLayoutChange={handleLayoutChange}
              style={{ minHeight: '100%' }}
              className="w-full"
            >
              {items.map((it) => {
                const isSelected = selected === it.i;
                const type = it.isHeader || it.isGroup
                  ? undefined
                  : it.fieldType ?? fields.find((f) => f.field_name === it.i)?.field_type;
                const label = it.isHeader || it.isGroup ? it.label : it.label || it.fieldName || it.i;
                const stateCls = isSelected
                  ? 'border-blue-400 bg-blue-50/50'
                  : 'border-transparent hover:border-gray-200 hover:bg-gray-50/70';

                const groupName = it.groupId ? availableGroups.find((g) => g.id === it.groupId)?.title : null;

                if (it.isGroup) {
                  return (
                    <div
                      key={it.i}
                      onClick={() => setSelected(it.i)}
                      className={`drag-handle cursor-grab group flex h-full w-full items-center justify-between gap-2 rounded-md border border-purple-200 bg-purple-50/60 px-3 transition-colors ${
                        isSelected ? 'border-purple-500 ring-2 ring-purple-200' : 'hover:border-purple-300 hover:bg-purple-50'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 text-purple-300 opacity-0 transition-opacity group-hover:opacity-100" />
                        <Layers className="h-4 w-4 shrink-0 text-purple-600" />
                        <span className="truncate text-sm font-bold text-purple-900">{label || 'Form Group'}</span>
                        <span className="rounded bg-purple-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-purple-800">
                          Form Group
                        </span>
                      </div>

                      {it.visibilityCondition && (
                        <span
                          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            it.visibilityCondition.action === 'readonly' || it.visibilityCondition.action === 'editable'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {it.visibilityCondition.action === 'readonly' || it.visibilityCondition.action === 'editable' ? (
                            <Lock className="h-3 w-3" />
                          ) : (
                            <Filter className="h-3 w-3" />
                          )}{' '}
                          {formatConditionSummary(it.visibilityCondition)}
                        </span>
                      )}
                    </div>
                  );
                }

                if (it.isHeader) {
                  return (
                    <div
                      key={it.i}
                      onClick={() => setSelected(it.i)}
                      className={`drag-handle cursor-grab group flex h-full w-full items-center justify-between gap-2 rounded-md border border-indigo-100 bg-indigo-50/40 px-3 transition-colors ${
                        isSelected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'hover:border-indigo-200 hover:bg-indigo-50/70'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700 truncate">
                        <GripVertical className="h-4 w-4 shrink-0 text-indigo-300 opacity-0 transition-opacity group-hover:opacity-100" />
                        <Heading className="h-4 w-4 shrink-0" />
                        <span className="truncate">{label}</span>
                      </span>
                      {it.visibilityCondition && (
                        <span
                          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            it.visibilityCondition.action === 'readonly' || it.visibilityCondition.action === 'editable'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-indigo-100 text-indigo-700'
                          }`}
                        >
                          {it.visibilityCondition.action === 'readonly' || it.visibilityCondition.action === 'editable' ? (
                            <Lock className="h-3 w-3" />
                          ) : (
                            <Filter className="h-3 w-3" />
                          )}{' '}
                          {formatConditionSummary(it.visibilityCondition)}
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={it.i}
                    onClick={() => setSelected(it.i)}
                    className={`drag-handle cursor-grab group flex h-full w-full items-center gap-2 rounded-md border px-2 transition-colors ${stateCls}`}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="flex w-36 shrink-0 flex-col truncate">
                      <span className="truncate text-xs font-medium text-gray-700">
                        {label}
                        {it.required && <span className="text-red-500">*</span>}
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        {groupName && (
                          <span className="inline-block max-w-[100px] truncate rounded bg-purple-50 px-1 font-mono text-[9px] text-purple-700">
                            📁 {groupName}
                          </span>
                        )}
                        {it.visibilityCondition && (
                          <span
                            className={`inline-block max-w-[120px] truncate rounded px-1 font-mono text-[9px] ${
                              it.visibilityCondition.action === 'readonly' || it.visibilityCondition.action === 'editable'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-indigo-50 text-indigo-700'
                            }`}
                            title={formatConditionSummary(it.visibilityCondition)}
                          >
                            {it.visibilityCondition.action === 'readonly' || it.visibilityCondition.action === 'editable'
                              ? '🔒 Read-only'
                              : '👁 Cond'}
                          </span>
                        )}
                      </div>
                    </div>
                    {type && (
                      <span className="shrink-0 rounded bg-gray-100 px-1 font-mono text-[9px] text-gray-400">
                        {type}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <ControlPreview
                        type={type}
                        options={it.options}
                        hiddenOptions={it.hiddenOptions}
                        placeholder={it.placeholder}
                        resolved={resolvedFor(it)}
                        height={it.h}
                        item={it}
                      />
                    </div>
                  </div>
                );
              })}
            </GridLayout>
          )}
          {!mounted && (
            <div className="flex h-full items-center justify-center text-gray-400">Measuring canvas…</div>
          )}
        </div>

        {/* Inspector */}
        <aside className="flex w-72 shrink-0 flex-col border-l border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-bold text-gray-800">Inspector</h3>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {selectedItem
                ? selectedItem.isGroup
                  ? 'Form Group settings'
                  : selectedItem.isHeader
                  ? 'Section settings'
                  : 'Field settings'
                : 'Nothing selected'}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {!selectedItem ? (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
                <MousePointerClick className="h-6 w-6 text-gray-300" />
                <p className="text-xs font-medium text-gray-400">Nothing selected</p>
                <p className="max-w-[190px] text-[11px] leading-relaxed text-gray-300">
                  Click a field, section, or form group on the canvas to edit it here.
                </p>
              </div>
            ) : selectedItem.isGroup ? (
              <>
                <InspectorField label="Group title">
                  <input
                    value={selectedItem.label ?? selectedItem.groupTitle ?? ''}
                    onChange={(e) =>
                      patchItem(selectedItem.i, { label: e.target.value, groupTitle: e.target.value })
                    }
                    placeholder="Group Title"
                    className={INSPECTOR_INPUT}
                  />
                </InspectorField>

                <InspectorField
                  label="Member fields"
                  hint="Fields assigned to this group in their inspector settings."
                >
                  <div className="flex flex-col gap-1 rounded-md border border-gray-200 bg-gray-50/70 p-2 text-xs text-gray-700">
                    <span className="font-semibold text-gray-800">
                      {
                        items.filter(
                          (it) => !it.isHeader && !it.isGroup && it.groupId === (selectedItem.groupId || selectedItem.i)
                        ).length
                      }{' '}
                      field(s) in this group
                    </span>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {items
                        .filter(
                          (it) => !it.isHeader && !it.isGroup && it.groupId === (selectedItem.groupId || selectedItem.i)
                        )
                        .map((f) => (
                          <span
                            key={f.i}
                            className="rounded bg-purple-100 px-1.5 py-0.5 font-mono text-[10px] text-purple-700"
                          >
                            {f.label || f.fieldName || f.i}
                          </span>
                        ))}
                      {items.filter(
                        (it) => !it.isHeader && !it.isGroup && it.groupId === (selectedItem.groupId || selectedItem.i)
                      ).length === 0 && (
                        <span className="text-[11px] italic text-gray-400">
                          No fields assigned yet. Select any field and assign it to this group.
                        </span>
                      )}
                    </div>
                  </div>
                </InspectorField>

                <InspectorField
                  label="Group Conditional Logic"
                  hint="Controls dynamic visibility or read-only state for this entire group and all its member fields together."
                >
                  <ConditionBuilder
                    condition={selectedItem.visibilityCondition}
                    availableFields={targetFieldOptions}
                    onChange={(cond) => patchItem(selectedItem.i, { visibilityCondition: cond })}
                  />
                </InspectorField>

                <InspectorField label="Size" hint="Width in columns · height in rows.">
                  <SizeInputs item={selectedItem} maxW={cols} onChange={(p) => patchItem(selectedItem.i, p)} />
                </InspectorField>

                <button
                  onClick={() => {
                    const gid = selectedItem.groupId || selectedItem.i;
                    setItems((prev) =>
                      prev
                        .filter((it) => it.i !== selectedItem.i)
                        .map((it) => (it.groupId === gid ? { ...it, groupId: null, groupTitle: null } : it))
                    );
                    setSelected(null);
                    setDirty(true);
                  }}
                  className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" /> Delete group
                </button>
              </>
            ) : selectedItem.isHeader ? (
              <>
                <InspectorField label="Heading text">
                  <input
                    value={selectedItem.label ?? ''}
                    onChange={(e) => patchItem(selectedItem.i, { label: e.target.value })}
                    placeholder="Section title"
                    className={INSPECTOR_INPUT}
                  />
                </InspectorField>

                <InspectorField
                  label="Conditional Logic"
                  hint="Hide or show this section header dynamically based on form conditions."
                >
                  <ConditionBuilder
                    condition={selectedItem.visibilityCondition}
                    availableFields={targetFieldOptions}
                    onChange={(cond) => patchItem(selectedItem.i, { visibilityCondition: cond })}
                  />
                </InspectorField>

                <InspectorField label="Size" hint="Width in columns · height in rows.">
                  <SizeInputs item={selectedItem} maxW={cols} onChange={(p) => patchItem(selectedItem.i, p)} />
                </InspectorField>

                <button
                  onClick={() => removeItem(selectedItem.i)}
                  className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" /> Delete section
                </button>
              </>
            ) : (
              <>
                <InspectorField label="Field type">
                  <select
                    value={selectedItem.fieldType ?? ''}
                    onChange={(e) => {
                      const t = e.target.value as GenericFieldType;
                      const def = FIELD_TYPE_DEFS.find((d) => d.type === t);
                      patchItem(selectedItem.i, {
                        fieldType: t,
                        options:
                          t === 'selection' || t === 'checkbox_group' || t === 'dropdown' || t === 'table'
                            ? selectedItem.options?.length
                              ? selectedItem.options
                              : [...(def?.defaultOptions ?? [])]
                            : selectedItem.options,
                      });
                    }}
                    className={INSPECTOR_INPUT}
                  >
                    {!selectedItem.fieldType && <option value="">Pick a type…</option>}
                    {FIELD_TYPE_DEFS.map((def) => (
                      <option key={def.type} value={def.type} title={def.hint}>
                        {def.label}
                      </option>
                    ))}
                  </select>
                </InspectorField>

                <InspectorField label="Field label">
                  <input
                    value={selectedItem.label ?? ''}
                    onChange={(e) => patchItem(selectedItem.i, { label: e.target.value })}
                    placeholder="Visible label"
                    className={INSPECTOR_INPUT}
                  />
                </InspectorField>

                {(selectedItem.fieldType === 'text' ||
                  selectedItem.fieldType === 'long_text' ||
                  selectedItem.fieldType === 'number' ||
                  selectedItem.fieldType === 'email' ||
                  selectedItem.fieldType === 'phone' ||
                  selectedItem.fieldType === 'url' ||
                  selectedItem.fieldType === 'file') && (
                  <InspectorField
                    label={selectedItem.fieldType === 'file' ? 'Upload prompt text' : 'Placeholder'}
                    hint={
                      selectedItem.fieldType === 'file'
                        ? 'Shown inside the dropzone area.'
                        : 'Shown inside the control when it is empty.'
                    }
                  >
                    <input
                      value={selectedItem.placeholder ?? ''}
                      onChange={(e) => patchItem(selectedItem.i, { placeholder: e.target.value })}
                      placeholder={
                        selectedItem.fieldType === 'file'
                          ? 'e.g. Click or drag files to attach'
                          : 'Optional hint text'
                      }
                      className={INSPECTOR_INPUT}
                    />
                  </InspectorField>
                )}

                {(selectedItem.fieldType === 'selection' ||
                  selectedItem.fieldType === 'checkbox_group' ||
                  selectedItem.fieldType === 'dropdown' ||
                  selectedItem.fieldType === 'table') && (
                  <>
                    <InspectorField
                      label="Options source"
                      hint="Inline options are stored on the form. A shared list renders the latest published
                        snapshot from the Lists tab, so options stay in sync everywhere."
                    >
                      <select
                        value={selectedItem.optionsList ? 'list' : 'inline'}
                        onChange={(e) => {
                          if (e.target.value === 'list' && !selectedItem.optionsList) {
                            patchItem(selectedItem.i, { optionsList: '' });
                          } else if (e.target.value === 'inline') {
                            patchItem(selectedItem.i, { optionsList: null, hiddenOptions: [] });
                          }
                        }}
                        className={INSPECTOR_INPUT}
                      >
                        <option value="inline">Inline options</option>
                        <option value="list">Shared list</option>
                      </select>
                    </InspectorField>

                    {selectedItem.optionsList !== undefined && selectedItem.optionsList !== null ? (
                      <>
                        <InspectorField
                          label={selectedItem.fieldType === 'table' ? 'Shared list' : 'Shared list'}
                          hint="Saved form items reference the list key — the newest published version wins."
                        >
                          <select
                            value={selectedItem.optionsList}
                            onChange={(e) => {
                              patchItem(selectedItem.i, { optionsList: e.target.value || '', hiddenOptions: [] });
                              ensureResolved([e.target.value]);
                            }}
                            className={INSPECTOR_INPUT}
                          >
                            <option value="">Pick a published list…</option>
                            {optionLists.map((l) => (
                              <option key={l.list_key} value={l.list_key}>
                                {l.list_key} ({l.published_version})
                              </option>
                            ))}
                          </select>
                          {resolvedFor(selectedItem) ? (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-600">
                              {resolvedFor(selectedItem)!.list_key} · {resolvedFor(selectedItem)!.version_label} ·{' '}
                              {resolvedFor(selectedItem)!.items.length} item(s)
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400">
                              {optionLists.length === 0
                                ? 'No published options lists yet — create one in the Lists tab.'
                                : 'Resolving…'}
                            </span>
                          )}
                        </InspectorField>

                        {resolvedFor(selectedItem) && resolvedFor(selectedItem)!.items.length > 0 && (
                          <InspectorField
                            label="Option visibility on this form"
                            hint="The shared list stays intact. Click any option to hide or show it for this specific form."
                          >
                            <OptionVisibilityList
                              items={resolvedFor(selectedItem)!.items}
                              hiddenOptions={selectedItem.hiddenOptions}
                              onChange={(hidden) => patchItem(selectedItem.i, { hiddenOptions: hidden })}
                            />
                          </InspectorField>
                        )}
                      </>
                    ) : (
                      <InspectorField
                        label={selectedItem.fieldType === 'table' ? 'Columns' : 'Options'}
                        hint={
                          selectedItem.fieldType === 'table'
                            ? 'Add the columns the dynamic row table will show.'
                            : undefined
                        }
                      >
                        <div className="flex flex-col gap-1.5">
                          {(selectedItem.options || []).map((o, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                              <input
                                value={o}
                                onChange={(e) => patchOption(selectedItem.i, idx, e.target.value)}
                                className={`${INSPECTOR_INPUT} flex-1`}
                              />
                              <button
                                onClick={() => removeOption(selectedItem.i, idx)}
                                className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                title="Remove column"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => addOption(selectedItem.i)}
                            className="flex items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {selectedItem.fieldType === 'table' ? 'Add column' : 'Add option'}
                          </button>
                        </div>
                      </InspectorField>
                    )}
                  </>
                )}

                {selectedItem.fieldType === 'checklist' && (
                  <>
                    <InspectorField
                      label="Checklist list"
                      hint="Checks the tasks from a published checklist list. Required tasks must all be ticked before the form can submit."
                    >
                      <select
                        value={selectedItem.optionsList ?? ''}
                        onChange={(e) => {
                          patchItem(selectedItem.i, { optionsList: e.target.value || '', hiddenOptions: [] });
                          ensureResolved([e.target.value]);
                        }}
                        className={INSPECTOR_INPUT}
                      >
                        <option value="">Pick a published checklist list…</option>
                        {checklistLists.map((l) => (
                          <option key={l.list_key} value={l.list_key}>
                            {l.list_key} ({l.published_version})
                          </option>
                        ))}
                      </select>
                      {resolvedFor(selectedItem) ? (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-600">
                          {resolvedFor(selectedItem)!.list_key} · {resolvedFor(selectedItem)!.version_label} ·{' '}
                          {resolvedFor(selectedItem)!.items.length} task(s)
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">
                          {checklistLists.length === 0
                            ? 'No published checklist lists yet — create one in the Lists tab.'
                            : 'Resolving…'}
                        </span>
                      )}
                    </InspectorField>

                    {resolvedFor(selectedItem) && resolvedFor(selectedItem)!.items.length > 0 && (
                      <InspectorField
                        label="Task visibility on this form"
                        hint="The shared list stays intact. Click any task to hide or show it for this specific form."
                      >
                        <OptionVisibilityList
                          items={resolvedFor(selectedItem)!.items}
                          hiddenOptions={selectedItem.hiddenOptions}
                          onChange={(hidden) => patchItem(selectedItem.i, { hiddenOptions: hidden })}
                        />
                      </InspectorField>
                    )}
                  </>
                )}

                {selectedItem.fieldType === 'file' && (
                  <>
                    <InspectorField
                      label="Accepted file types"
                      hint="Comma-separated extensions or MIME types (e.g. .pdf,.png,.jpg or image/*)."
                    >
                      <input
                        value={selectedItem.accept ?? ''}
                        onChange={(e) => patchItem(selectedItem.i, { accept: e.target.value })}
                        placeholder="* or .pdf,.png,.jpg,.docx"
                        className={`${INSPECTOR_INPUT} font-mono`}
                      />
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {[
                          { label: 'All files', val: '' },
                          { label: 'PDF only', val: '.pdf' },
                          { label: 'Images', val: 'image/*,.png,.jpg,.jpeg' },
                          { label: 'Documents', val: '.pdf,.doc,.docx,.txt' },
                          { label: 'Spreadsheets', val: '.xlsx,.xls,.csv' },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => patchItem(selectedItem.i, { accept: preset.val })}
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                              (selectedItem.accept ?? '') === preset.val
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </InspectorField>

                    <InspectorField
                      label="Max file size (MB)"
                      hint="Maximum allowed size per file in megabytes."
                    >
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={selectedItem.maxFileSizeMb ?? 10}
                        onChange={(e) =>
                          patchItem(selectedItem.i, {
                            maxFileSizeMb: Math.max(1, parseInt(e.target.value, 10) || 1),
                          })
                        }
                        className={INSPECTOR_INPUT}
                      />
                    </InspectorField>

                    <InspectorField label="Multiple files">
                      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedItem.allowMultiple)}
                          onChange={(e) =>
                            patchItem(selectedItem.i, {
                              allowMultiple: e.target.checked,
                              maxFiles: selectedItem.maxFiles ?? 5,
                            })
                          }
                          className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                        />
                        <span className="text-xs font-medium text-gray-700">Allow multiple attachments</span>
                      </label>
                    </InspectorField>

                    {selectedItem.allowMultiple && (
                      <InspectorField
                        label="Max number of files"
                        hint="Maximum total files that can be attached."
                      >
                        <input
                          type="number"
                          min={2}
                          max={50}
                          value={selectedItem.maxFiles ?? 5}
                          onChange={(e) =>
                            patchItem(selectedItem.i, {
                              maxFiles: Math.max(2, parseInt(e.target.value, 10) || 2),
                            })
                          }
                          className={INSPECTOR_INPUT}
                        />
                      </InspectorField>
                    )}
                  </>
                )}

                {/* Form Group Assignment */}
                <InspectorField
                  label="Form Group"
                  hint="Assign to a Form Group to organize fields and share visibility conditions."
                >
                  <select
                    value={selectedItem.groupId ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__new__') {
                        const newId = nextItemId('group');
                        const groupCount = availableGroups.length + 1;
                        const groupTitle = `Group ${groupCount}`;
                        const y = nextY(items, cols);
                        const newGroupItem: EntityFormItem = {
                          i: newId,
                          x: 0,
                          y,
                          w: cols,
                          h: 1,
                          isGroup: true,
                          groupId: newId,
                          label: groupTitle,
                          groupTitle,
                        };
                        setItems((prev) => [...prev, newGroupItem]);
                        patchItem(selectedItem.i, { groupId: newId, groupTitle });
                      } else {
                        const matching = availableGroups.find((g) => g.id === val);
                        patchItem(selectedItem.i, {
                          groupId: val || null,
                          groupTitle: matching ? matching.title : null,
                        });
                      }
                    }}
                    className={INSPECTOR_INPUT}
                  >
                    <option value="">(None / Ungrouped)</option>
                    {availableGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                    <option value="__new__">+ Create new group…</option>
                  </select>
                  {selectedItem.groupId && (
                    (() => {
                      const parent = availableGroups.find((g) => g.id === selectedItem.groupId);
                      if (parent?.item.visibilityCondition) {
                        const pAction = parent.item.visibilityCondition.action;
                        const isRO = pAction === 'readonly' || pAction === 'editable';
                        return (
                          <div
                            className={`mt-1 rounded p-2 text-[11px] ${
                              isRO ? 'bg-amber-50 text-amber-800' : 'bg-purple-50 text-purple-700'
                            }`}
                          >
                            <span className="font-semibold">Parent Group Rule:</span>{' '}
                            {formatConditionSummary(parent.item.visibilityCondition)}
                            <div className="mt-0.5 text-[10px] opacity-80">
                              {isRO
                                ? 'This field will be made read-only whenever the group is read-only.'
                                : 'This field will be hidden whenever the group is hidden.'}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()
                  )}
                </InspectorField>

                {/* Conditional Logic */}
                <InspectorField
                  label="Conditional Logic"
                  hint="Control dynamic visibility (show/hide) or read-only state based on one or more field conditions."
                >
                  <ConditionBuilder
                    condition={selectedItem.visibilityCondition}
                    availableFields={targetFieldOptions}
                    onChange={(cond) => patchItem(selectedItem.i, { visibilityCondition: cond })}
                  />
                </InspectorField>

                <InspectorField label="Storage key" hint="The key the value is stored under on the record.">
                  <input
                    value={selectedItem.fieldName ?? ''}
                    onChange={(e) => patchItem(selectedItem.i, { fieldName: e.target.value })}
                    placeholder={selectedItem.i}
                    className={`${INSPECTOR_INPUT} font-mono`}
                  />
                </InspectorField>

                <InspectorField label="Size" hint="Width in columns · height in rows.">
                  <SizeInputs item={selectedItem} maxW={cols} onChange={(p) => patchItem(selectedItem.i, p)} />
                </InspectorField>

                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
                  <input
                    id="field-required"
                    type="checkbox"
                    checked={Boolean(selectedItem.required)}
                    onChange={(e) => patchItem(selectedItem.i, { required: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                  />
                  <span className="text-xs font-medium text-gray-700">Required field</span>
                </label>

                <button
                  onClick={() => removeItem(selectedItem.i)}
                  className="mt-1 flex items-center justify-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" /> Remove from form
                </button>
              </>
            )}
          </div>
        </aside>
      </div>

      {jsonOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[80vh] max-h-[720px] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
              <Code2 className="h-5 w-5 text-blue-700" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-gray-900">Form JSON</h3>
                <p className="truncate text-[11px] text-gray-400">
                  Copy to export, or paste JSON from another form to import its layout.
                </p>
              </div>
              <button
                onClick={() => setJsonOpen(false)}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
                <button
                  onClick={importJson}
                  className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
                >
                  <Upload className="h-4 w-4" /> Import JSON into editor
                </button>
                <button
                  onClick={copyJson}
                  className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  {copied ? <ClipboardCheck className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy JSON'}
                </button>
                {jsonError ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                    <X className="h-3.5 w-3.5" /> {jsonError}
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-400">
                    {items.length} item(s) · {cols} cols · {rowHeight}px rows
                  </span>
                )}
              </div>

              <textarea
                value={jsonDraft}
                onChange={(e) => {
                  setJsonDraft(e.target.value);
                  if (jsonError) setJsonError(null);
                }}
                spellCheck={false}
                className={`mx-4 mt-3 flex-1 resize-none rounded-md border bg-gray-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-gray-800 focus:outline-none ${
                  jsonError ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                }`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
              <button
                onClick={() => {
                  setJsonOpen(false);
                  setJsonError(null);
                }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={importJson}
                className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
              >
                <Upload className="h-4 w-4" /> Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}