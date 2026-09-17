import React, { forwardRef, type CSSProperties } from 'react';
import {
  GripVertical,
  Heading,
  Layers,
  Paperclip,
  Plus,
  ShieldCheck,
  Lock,
  Eye,
  Trash2,
  Copy,
  Info,
  ChevronDown,
  Database,
} from 'lucide-react';
import type {
  EntityFormItem,
  ResolvedList,
  ChecklistItem,
  ConditionDefinition,
} from '../../types';
import { formatConditionSummary } from '../../lib/conditions';

interface FormCanvasItemProps {
  item: EntityFormItem;
  isSelected: boolean;
  value?: any;
  onChange?: (val: any) => void;
  resolvedList?: ResolvedList | null;
  conditions: ConditionDefinition[];
  groupTitle?: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  style?: CSSProperties;
  className?: string;
}

export const FormCanvasItem = forwardRef<HTMLDivElement, FormCanvasItemProps>(
  function FormCanvasItem(
    {
      item,
      isSelected,
      value,
      onChange,
      resolvedList,
      conditions,
      groupTitle,
      onSelect,
      onRemove,
      onDuplicate,
      style,
      className,
      ...rest
    },
    ref
  ) {
    const isGroup = Boolean(item.isGroup ?? item.is_group);
    const isHeader = Boolean(item.isHeader ?? item.is_header);

    const condition = item.visibilityCondition ?? item.visibility_condition;
    const hasCondition = Boolean(
      condition && (condition.condition_id || (condition.rules && condition.rules.length > 0) || condition.field)
    );
    const isReadOnlyCondition = condition?.action === 'readonly' || condition?.action === 'editable';

    // 1. Form Group Header
    if (isGroup) {
      return (
        <div
          ref={ref}
          style={style}
          onClick={() => onSelect(item.i)}
          className={`${className ?? ''} group relative flex h-full w-full flex-col justify-center rounded-lg border px-3 py-2 transition-all select-none cursor-pointer ${
            isSelected
              ? 'border-blue-600 bg-blue-50/20 ring-2 ring-blue-100 shadow-2xs'
              : 'border-gray-200 bg-white hover:border-gray-300 shadow-2xs'
          }`}
          {...rest}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex min-w-0 items-center gap-2">
              <Layers className="h-4 w-4 shrink-0 text-gray-500" />
              <span className="truncate text-sm font-semibold text-gray-900">
                {item.label || item.groupTitle || 'Form Group'}
              </span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-gray-600">
                Group
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasCondition && (
                <span
                  className="flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
                  title={formatConditionSummary(condition, conditions)}
                >
                  <ShieldCheck className="h-3 w-3 text-blue-600" />
                  <span className="max-w-[120px] truncate">
                    {condition?.condition_id ? condition.condition_id : 'Condition'}
                  </span>
                </span>
              )}
              <GripVertical className="h-4 w-4 shrink-0 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab drag-handle" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.i);
                }}
                className="rounded p-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all"
                title="Delete group"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {item.placeholder && (
            <p className="text-xs text-gray-500 mt-1">{item.placeholder}</p>
          )}
        </div>
      );
    }

    // 2. Section Heading (Unboxed title matching image design)
    if (isHeader) {
      return (
        <div
          ref={ref}
          style={style}
          onClick={() => onSelect(item.i)}
          className={`${className ?? ''} group relative flex h-full w-full flex-col justify-center rounded-lg border p-1 transition-all select-none cursor-pointer ${
            isSelected
              ? 'border-blue-600 bg-blue-50/20 ring-2 ring-blue-100'
              : 'border-transparent hover:border-gray-200 hover:bg-gray-50/50'
          }`}
          {...rest}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex min-w-0 items-center gap-2">
              <div>
                <h2 className="truncate text-sm sm:text-base font-semibold text-gray-900 tracking-tight">
                  {item.label || 'Section Header'}
                </h2>
                {item.placeholder && (
                  <p className="text-xs text-gray-500 mt-0.5">{item.placeholder}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasCondition && (
                <span
                  className="flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
                  title={formatConditionSummary(condition, conditions)}
                >
                  <ShieldCheck className="h-3 w-3 text-blue-600" />
                  <span className="max-w-[120px] truncate">
                    {condition?.condition_id ? condition.condition_id : 'Condition'}
                  </span>
                </span>
              )}
              <GripVertical className="h-4 w-4 shrink-0 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab drag-handle" />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.i);
                }}
                className="rounded p-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all"
                title="Delete section"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 3. Regular Form Field (Stacked label with info icon and live interactive control)
    return (
      <div
        ref={ref}
        style={style}
        onClick={() => onSelect(item.i)}
        className={`${className ?? ''} group relative flex h-full w-full flex-col justify-center rounded-lg border p-1 transition-all select-none cursor-pointer ${
          isSelected
            ? 'border-blue-600 bg-blue-50/10 ring-2 ring-blue-100 shadow-xs'
            : 'border-transparent hover:border-gray-200 hover:bg-gray-50/40'
        }`}
        {...rest}
      >
        {/* Field Top Label Row: Stacked Label, Info Icon, Metadata chips, Drag Handle at end */}
        <div className="flex items-center justify-between gap-1.5 mb-1.5 w-full">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-xs font-semibold text-gray-900" title={item.label || item.fieldName || item.i}>
              {item.label || item.fieldName || item.i}
            </span>
            {item.required && <span className="text-red-500 text-xs font-bold">*</span>}
            <Info className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Group Membership Chip */}
            {groupTitle && (
              <span className="inline-block max-w-[70px] truncate rounded bg-purple-50 px-1.5 py-0.5 font-mono text-[9px] text-purple-700">
                📁 {groupTitle}
              </span>
            )}

            {/* Central Condition Badge */}
            {hasCondition && (
              <span
                className={`inline-flex max-w-[90px] items-center gap-0.5 truncate rounded px-1.5 py-0.5 font-mono text-[9px] ${
                  isReadOnlyCondition
                    ? 'bg-amber-50 text-amber-700 font-semibold'
                    : 'bg-blue-50 text-blue-700 font-semibold'
                }`}
                title={formatConditionSummary(condition, conditions)}
              >
                {isReadOnlyCondition ? <Lock className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                <span className="truncate">
                  {condition?.condition_id ? condition.condition_id : 'cond'}
                </span>
              </span>
            )}

            {/* Drag Handle at top-right end */}
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab drag-handle" />
          </div>
        </div>

        {/* Live Interactive Widget */}
        <div className="min-w-0 flex-1 w-full flex flex-col justify-center">
          <ControlPreviewWidget
            item={item}
            value={value}
            onChange={onChange}
            resolvedList={resolvedList}
          />
        </div>

        {/* Hover Quick Actions */}
        <div className="absolute right-1 top-1 hidden items-center gap-0.5 rounded-md border border-gray-200 bg-white p-0.5 shadow-md group-hover:flex z-10">
          <button
            type="button"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-grab drag-handle"
            title="Drag to reposition"
          >
            <GripVertical className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(item.i);
            }}
            title="Duplicate field"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item.i);
            }}
            title="Remove field"
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }
);

// --- Interactive Control Widget Renderer ---
function ControlPreviewWidget({
  item,
  value,
  onChange,
  resolvedList,
}: {
  item: EntityFormItem;
  value?: any;
  onChange?: (val: any) => void;
  resolvedList?: ResolvedList | null;
}) {
  const type = item.fieldType || 'text';
  const hiddenSet = new Set(item.hiddenOptions || item.hidden_options || []);

  // 1. File Upload Dropzone
  if (type === 'file' || (type as string) === 'file_attachment' || (type as string) === 'attachment') {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-3 text-center cursor-pointer hover:bg-blue-50/20 hover:border-blue-300 transition-colors"
      >
        <div className="flex items-center justify-center gap-1.5 text-xs text-gray-700 font-medium">
          <Paperclip className="h-3.5 w-3.5 text-gray-400" />
          <span className="truncate">{item.placeholder || 'Click to browse or drop files'}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
          {item.accept && (
            <span className="rounded bg-gray-200/80 px-1.5 py-0.5 font-mono text-[9px] text-gray-600">
              {item.accept}
            </span>
          )}
          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[9px] text-blue-700">
            Max {item.maxFileSizeMb || 10} MB
          </span>
          {item.allowMultiple && (
            <span className="rounded bg-purple-50 px-1.5 py-0.5 font-mono text-[9px] text-purple-700">
              Multiple (up to {item.maxFiles || 5})
            </span>
          )}
        </div>
      </div>
    );
  }

  // 2. Long text
  if (type === 'long_text') {
    const valStr = typeof value === 'string' ? value : '';
    return (
      <textarea
        rows={Math.max(2, Math.round(((item.h || 3) * 40) / 28))}
        value={valStr}
        onChange={(e) => onChange && onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder={item.placeholder || 'Enter details…'}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs h-full min-h-[36px] resize-none leading-relaxed cursor-text"
      />
    );
  }

  // 3. Checklist
  if (type === 'checklist') {
    const rawTasks = resolvedList && resolvedList.kind === 'checklist'
      ? (resolvedList.items as ChecklistItem[])
      : null;
    const tasks = rawTasks ? rawTasks.filter((t) => !hiddenSet.has(t.label)) : null;
    let checkedSet = new Set<string>();
    try {
      if (typeof value === 'string' && value.startsWith('[')) {
        checkedSet = new Set(JSON.parse(value));
      }
    } catch {}

    const toggleTask = (label: string) => {
      const next = new Set(checkedSet);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      if (onChange) onChange(JSON.stringify(Array.from(next)));
    };

    return (
      <div className="w-full flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
        {!rawTasks || rawTasks.length === 0 ? (
          <div className="rounded-md border border-dashed border-gray-200 p-2.5 text-center text-xs text-gray-400 italic">
            Select a published Checklist in the inspector
          </div>
        ) : tasks?.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-amber-50/30 p-2 text-xs text-amber-700 italic">
            All tasks hidden on this form
          </div>
        ) : (
          tasks.map((t) => {
            const isDone = checkedSet.has(t.label);
            return (
              <label
                key={t.label}
                onClick={() => toggleTask(t.label)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer transition-all ${
                  isDone
                    ? 'border-blue-200 bg-blue-50/50'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => {}}
                  className="accent-blue-600 h-3.5 w-3.5"
                />
                <span className={isDone ? 'text-gray-500 line-through' : t.required ? 'font-semibold text-gray-800' : 'text-gray-700'}>
                  {t.label}
                </span>
                {t.required && (
                  <span className="ml-auto text-[10px] font-medium text-amber-600">
                    {isDone ? 'required ✓' : 'required'}
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>
    );
  }

  // 4. Dynamic Table
  if (type === 'table') {
    const rawCols = item.options && item.options.length > 0 ? item.options : ['Column 1', 'Column 2'];
    const cols = rawCols.filter((c) => !hiddenSet.has(c));
    return (
      <div className="w-full overflow-hidden rounded-md border border-gray-300 bg-white text-xs text-gray-700 shadow-2xs" onClick={(e) => e.stopPropagation()}>
        <div className="flex border-b border-gray-200 bg-gray-50">
          {(cols.length > 0 ? cols : ['(No columns)']).map((c, i) => (
            <span
              key={i}
              className="flex-1 truncate border-r border-gray-200 px-2.5 py-1.5 font-medium text-gray-600 last:border-r-0"
            >
              {c}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-blue-600 hover:bg-blue-50/50 cursor-pointer">
          <Plus className="h-3 w-3" /> Add dynamic rows at fill time
        </div>
      </div>
    );
  }

  // 5. Selection / Radio choices (2-column Choice Cards matching reference design)
  if (type === 'selection') {
    const rawOptions = resolvedList && resolvedList.kind === 'options'
      ? (resolvedList.items as string[])
      : (item.options ?? ['Option 1', 'Option 2']);
    const displayed = rawOptions.filter((o) => !hiddenSet.has(o));
    const currentVal = typeof value === 'string' ? value : '';

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
        {displayed.map((opt) => {
          const isSelected = currentVal === opt;
          const parts = opt.includes(' | ') ? opt.split(' | ') : opt.includes(' - ') ? opt.split(' - ') : [opt];
          const title = parts[0].trim();
          const desc = parts.length > 1 ? parts.slice(1).join(' - ').trim() : null;

          return (
            <div
              key={opt}
              onClick={(e) => {
                e.stopPropagation();
                if (onChange) onChange(opt);
              }}
              className={`rounded-lg border p-4 text-left flex flex-col justify-between bg-white cursor-pointer transition-all ${
                isSelected
                  ? 'border-gray-300 ring-1 ring-blue-600/40 shadow-xs'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-gray-900 truncate">{title}</span>
                  <Info className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                </div>
                <div
                  className={`h-4 w-4 shrink-0 rounded-full border flex items-center justify-center ${
                    isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
              </div>
              {desc && <p className="mt-1.5 text-xs text-gray-500 leading-normal">{desc}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  // 6. Checkbox Group (2-column Choice Cards with checkboxes)
  if (type === 'checkbox_group') {
    const rawOptions = resolvedList && resolvedList.kind === 'options'
      ? (resolvedList.items as string[])
      : (item.options ?? ['Option 1', 'Option 2']);
    const displayed = rawOptions.filter((o) => !hiddenSet.has(o));
    const currentSet = new Set(
      typeof value === 'string'
        ? value.split(',').map((s) => s.trim()).filter(Boolean)
        : Array.isArray(value)
        ? value
        : []
    );

    const toggle = (opt: string) => {
      const next = new Set(currentSet);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      if (onChange) onChange(Array.from(next).join(', '));
    };

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
        {displayed.map((opt) => {
          const isChecked = currentSet.has(opt);
          const parts = opt.includes(' | ') ? opt.split(' | ') : opt.includes(' - ') ? opt.split(' - ') : [opt];
          const title = parts[0].trim();
          const desc = parts.length > 1 ? parts.slice(1).join(' - ').trim() : null;

          return (
            <div
              key={opt}
              onClick={(e) => {
                e.stopPropagation();
                toggle(opt);
              }}
              className={`rounded-lg border p-4 text-left flex flex-col justify-between bg-white cursor-pointer transition-all ${
                isChecked
                  ? 'border-gray-300 ring-1 ring-blue-600/40 shadow-xs'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-gray-900 truncate">{title}</span>
                  <Info className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                </div>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}}
                  className="accent-blue-600 h-4 w-4 rounded cursor-pointer"
                />
              </div>
              {desc && <p className="mt-1.5 text-xs text-gray-500 leading-normal">{desc}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  // 7. Dropdown (Leading database icon + Trailing ChevronDown)
  if (type === 'dropdown' || (type as string) === 'select') {
    const rawOptions = resolvedList && resolvedList.kind === 'options'
      ? (resolvedList.items as string[])
      : (item.options ?? ['Option 1', 'Option 2']);
    const displayed = rawOptions.filter((o) => !hiddenSet.has(o));
    const currentVal = typeof value === 'string' ? value : '';

    return (
      <div className="relative w-full" onClick={(e) => e.stopPropagation()}>
        <select
          value={currentVal}
          onChange={(e) => onChange && onChange(e.target.value)}
          className="w-full appearance-none rounded-md border border-gray-300 bg-white pl-8 pr-8 py-2 text-xs text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs cursor-pointer"
        >
          <option value="">{item.placeholder || 'Select…'}</option>
          {displayed.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <Database className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
      </div>
    );
  }

  // 8. Boolean / Yes-No
  if (type === 'boolean') {
    const currentVal = typeof value === 'string' ? value : '';
    return (
      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onChange && onChange('yes')}
          className={`rounded-md border px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
            currentVal === 'yes'
              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600 shadow-2xs'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-2xs'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange && onChange('no')}
          className={`rounded-md border px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
            currentVal === 'no'
              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600 shadow-2xs'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 shadow-2xs'
          }`}
        >
          No
        </button>
      </div>
    );
  }

  // 9. Standard inputs (text, number, email, phone, url, date, time)
  const valStr = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return (
    <input
      type={type === 'number' ? 'number' : type === 'email' ? 'email' : type === 'date' ? 'date' : type === 'time' ? 'time' : 'text'}
      value={valStr}
      onChange={(e) => onChange && onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      placeholder={item.placeholder || (type === 'date' ? 'YYYY-MM-DD' : type === 'number' ? '0' : 'Text input…')}
      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs cursor-text"
    />
  );
}
