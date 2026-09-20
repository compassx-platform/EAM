import { useState, useRef, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Eye,
  Layers,
  Heading,
  Paperclip,
  Plus,
  Lock,
  Workflow,
  Code2,
  ChevronDown,
  Info,
  Database,
  Minus,
} from 'lucide-react';
import {
  GridLayout,
  verticalCompactor,
} from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type {
  EntityFormItem,
  ResolvedList,
  ConditionDefinition,
  ChecklistItem,
} from '../../types';
import {
  isItemVisible,
  isItemReadOnly,
  withWorkflowStatus,
} from '../../lib/conditions';

interface FormPreviewModalProps {
  entityType: string;
  items: EntityFormItem[];
  cols: number;
  rowHeight: number;
  workflowStates: string[];
  resolvedLists: Record<string, ResolvedList>;
  conditions: ConditionDefinition[];
  onClose: () => void;
}

export function FormPreviewModal({
  entityType,
  items,
  cols,
  rowHeight,
  workflowStates,
  resolvedLists,
  conditions,
  onClose,
}: FormPreviewModalProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [simulatedStage, setSimulatedStage] = useState<string>(workflowStates[0] || 'Requested');
  const [showHidden, setShowHidden] = useState(false);
  const [showPayload, setShowPayload] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const valuesForEvaluation = withWorkflowStatus(values, simulatedStage);

  const handleInputChange = (key: string, val: unknown) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleReset = () => {
    setValues({});
  };

  const visibleItems = items.filter((it) => {
    if (showHidden) return true;
    return isItemVisible(it, items, valuesForEvaluation, conditions);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs" onMouseDown={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Eye className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Interactive Form Preview · <span className="font-mono text-blue-700">{entityType}</span>
              </h2>
              <p className="text-[11px] text-gray-500">
                Test form data entry and watch dynamic conditions evaluate in real-time.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <RotateCcw className="h-3.5 w-3.5 text-gray-400" />
              <span>Reset Values</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Interactive Simulation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/80 px-5 py-2.5 text-xs text-gray-700">
          {/* Stage Simulation */}
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-blue-700" />
            <span className="font-semibold text-gray-800">Simulate Workflow Stage:</span>
            {workflowStates.length > 0 ? (
              <select
                value={simulatedStage}
                onChange={(e) => setSimulatedStage(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 focus:border-blue-500 focus:outline-none"
              >
                {workflowStates.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={simulatedStage}
                onChange={(e) => setSimulatedStage(e.target.value)}
                placeholder="e.g. Requested"
                className="w-36 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
              />
            )}
            <span className="text-[11px] text-gray-400">
              (_workflow_status = &quot;{simulatedStage}&quot;)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 font-medium text-gray-600">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(e) => setShowHidden(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
              />
              <span>Show hidden fields</span>
            </label>
            <button
              type="button"
              onClick={() => setShowPayload((p) => !p)}
              className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                showPayload ? 'bg-blue-100 text-blue-800' : 'bg-white border border-gray-200 text-gray-600'
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>Live JSON</span>
            </button>
          </div>
        </div>

        {/* Modal Main Area */}
        <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
          {/* Form Fill Canvas */}
          <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8 bg-white">
            <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-8 sm:p-10 shadow-xs">
              {/* Document Sheet Heading */}
              <div className="mb-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                  {entityType.charAt(0).toUpperCase() + entityType.slice(1)} preview
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Interactive preview simulating data entry and dynamic rule evaluation.
                </p>
              </div>

              {items.length === 0 ? (
                <div className="py-20 text-center text-xs text-gray-400">
                  No items on form yet. Add fields on the builder canvas to preview.
                </div>
              ) : (
                <GridLayout
                  width={containerWidth > 0 ? Math.min(containerWidth - 96, 750) : 700}
                  layout={visibleItems}
                  compactor={verticalCompactor}
                  gridConfig={{
                    cols,
                    rowHeight,
                    margin: [16, 16],
                    containerPadding: [0, 0],
                  }}
                  dragConfig={{ enabled: false }}
                  resizeConfig={{ enabled: false }}
                >
                  {visibleItems.map((it) => {
                    const key = it.fieldName || it.i;
                    const isGrp = Boolean(it.isGroup ?? it.is_group);
                    const isHdr = Boolean(it.isHeader ?? it.is_header);

                    if (isGrp) {
                      return (
                        <div
                          key={it.i}
                          className="flex h-full w-full flex-col justify-center rounded-lg border border-gray-200 bg-white p-4 shadow-2xs"
                        >
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 shrink-0 text-gray-500" />
                            <span className="text-sm font-semibold text-gray-900">
                              {it.label || it.groupTitle || 'Group'}
                            </span>
                          </div>
                          {it.placeholder && (
                            <p className="text-xs text-gray-500 mt-1">{it.placeholder}</p>
                          )}
                        </div>
                      );
                    }

                    if (isHdr) {
                      return (
                        <div
                          key={it.i}
                          className="flex h-full w-full flex-col justify-center pt-2 pb-1"
                        >
                          <h4 className="text-sm sm:text-base font-semibold text-gray-900">
                            {it.label || 'Section Title'}
                          </h4>
                          {it.placeholder && (
                            <p className="text-xs text-gray-500 mt-0.5">{it.placeholder}</p>
                          )}
                        </div>
                      );
                    }

                    const readOnly = isItemReadOnly(it, items, valuesForEvaluation, conditions);
                    const isHidden = !isItemVisible(it, items, valuesForEvaluation, conditions);
                    const val = values[key];
                    const resolved = it.optionsList ? resolvedLists[it.optionsList] : null;

                    return (
                      <div
                        key={it.i}
                        className={`flex h-full w-full flex-col justify-center py-1 transition-all ${
                          isHidden
                            ? 'opacity-40 border border-dashed border-gray-300 rounded-lg p-2'
                            : ''
                        }`}
                      >
                        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-900">
                          <span className="truncate">{it.label || key}</span>
                          {it.required && <span className="text-red-500">*</span>}
                          {it.placeholder && (
                            <span title={it.placeholder}>
                              <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                            </span>
                          )}
                          {readOnly && (
                            <span className="rounded bg-amber-50 border border-amber-200 px-1 font-mono text-[9px] font-semibold text-amber-700">
                              Read-only
                            </span>
                          )}
                          {isHidden && (
                            <span className="rounded bg-gray-100 px-1 font-mono text-[9px] text-gray-500">
                              (Hidden by rule)
                            </span>
                          )}
                        </label>

                        <div className="min-w-0 flex-1">
                          <InteractiveControl
                            item={it}
                            value={val}
                            readOnly={readOnly}
                            resolved={resolved}
                            onChange={(v) => handleInputChange(key, v)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </GridLayout>
              )}
            </div>
          </div>

          {/* Live JSON Payload Inspector Drawer */}
          {showPayload && (
            <div className="flex w-72 shrink-0 flex-col border-l border-gray-200 bg-gray-900 text-white">
              <div className="border-b border-gray-800 px-4 py-3">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Live Custom Fields
                </span>
              </div>
              <pre className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-emerald-400">
                {JSON.stringify(values, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InteractiveControl({
  item,
  value,
  readOnly,
  resolved,
  onChange,
}: {
  item: EntityFormItem;
  value: unknown;
  readOnly: boolean;
  resolved?: ResolvedList | null;
  onChange: (v: unknown) => void;
}) {
  const type = item.fieldType || 'text';
  const hiddenSet = new Set(item.hiddenOptions || item.hidden_options || []);

  const inputCls = `w-full rounded-md border px-3 py-2 text-xs transition-colors shadow-2xs ${
    readOnly
      ? 'border-gray-200 bg-gray-100/90 text-gray-500 cursor-not-allowed select-none'
      : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600'
  }`;

  if (type === 'selection') {
    const rawOpts = resolved?.kind === 'options' ? (resolved.items as string[]) : item.options || [];
    const opts = rawOpts.filter((o) => !hiddenSet.has(o));
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
        {opts.map((opt) => {
          const isSelected = value === opt;
          const parts = opt.includes(' | ') ? opt.split(' | ') : opt.includes(' - ') ? opt.split(' - ') : [opt];
          const title = parts[0].trim();
          const desc = parts.length > 1 ? parts.slice(1).join(' - ').trim() : null;

          return (
            <div
              key={opt}
              onClick={() => !readOnly && onChange(opt)}
              className={`rounded-lg border p-4 text-left flex flex-col justify-between transition-all cursor-pointer ${
                isSelected
                  ? 'border-gray-300 bg-white ring-1 ring-blue-600/40 shadow-xs'
                  : 'border-gray-300 bg-white hover:border-gray-400'
              } ${readOnly ? 'cursor-not-allowed opacity-60' : ''}`}
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
              {desc && (
                <p className="mt-1.5 text-xs text-gray-500 leading-normal">{desc}</p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (type === 'checkbox_group') {
    const rawOpts = resolved?.kind === 'options' ? (resolved.items as string[]) : item.options || [];
    const opts = rawOpts.filter((o) => !hiddenSet.has(o));
    const currentList = Array.isArray(value) ? (value as string[]) : [];

    const toggle = (opt: string) => {
      if (readOnly) return;
      if (currentList.includes(opt)) {
        onChange(currentList.filter((x) => x !== opt));
      } else {
        onChange([...currentList, opt]);
      }
    };

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
        {opts.map((opt) => {
          const isChecked = currentList.includes(opt);
          const parts = opt.includes(' | ') ? opt.split(' | ') : opt.includes(' - ') ? opt.split(' - ') : [opt];
          const title = parts[0].trim();
          const desc = parts.length > 1 ? parts.slice(1).join(' - ').trim() : null;

          return (
            <label
              key={opt}
              className={`rounded-lg border p-4 text-left flex flex-col justify-between transition-all cursor-pointer ${
                isChecked
                  ? 'border-gray-300 bg-white ring-1 ring-blue-600/40 shadow-xs'
                  : 'border-gray-300 bg-white hover:border-gray-400'
              } ${readOnly ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-gray-900 truncate">{title}</span>
                  <Info className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                </div>
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={isChecked}
                  onChange={() => toggle(opt)}
                  className="accent-blue-600 h-4 w-4 rounded"
                />
              </div>
              {desc && (
                <p className="mt-1.5 text-xs text-gray-500 leading-normal">{desc}</p>
              )}
            </label>
          );
        })}
      </div>
    );
  }

  if (type === 'checklist') {
    const rawTasks = resolved?.kind === 'checklist' ? (resolved.items as ChecklistItem[]) : [];
    const tasks = rawTasks.filter((t) => !hiddenSet.has(t.label));
    let checkedSet = new Set<string>();
    if (Array.isArray(value)) {
      checkedSet = new Set(value.map((s) => String(s)));
    } else if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) checkedSet = new Set(parsed.map((s) => String(s)));
      } catch {
        checkedSet = new Set(value.split(',').map((s) => s.trim()));
      }
    }

    const toggle = (label: string) => {
      if (readOnly) return;
      const next = new Set(checkedSet);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      onChange(JSON.stringify([...next]));
    };

    return (
      <div className="flex w-full flex-col gap-1.5">
        {tasks.map((t) => {
          const isDone = checkedSet.has(t.label);
          return (
            <label
              key={t.label}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-all ${
                readOnly
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100/70 text-gray-400'
                  : isDone
                  ? 'border-blue-200 bg-blue-50/50 cursor-pointer'
                  : 'border-gray-300 bg-white hover:border-gray-400 cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={isDone}
                disabled={readOnly}
                onChange={() => toggle(t.label)}
                className="accent-blue-600 h-3.5 w-3.5"
              />
              <span className={isDone ? 'font-medium text-gray-900' : 'text-gray-700'}>
                {t.label}
              </span>
              {t.required && (
                <span className={`ml-auto text-[10px] font-medium ${isDone ? 'text-blue-600' : 'text-amber-600'}`}>
                  {isDone ? '✓ Completed' : 'Required'}
                </span>
              )}
            </label>
          );
        })}
      </div>
    );
  }

  if (type === 'dropdown') {
    const rawOpts = resolved?.kind === 'options' ? (resolved.items as string[]) : item.options || [];
    const opts = rawOpts.filter((o) => !hiddenSet.has(o));
    return (
      <div className="relative w-full">
        <select
          value={String(value || '')}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-md border border-gray-300 bg-white pl-8 pr-8 py-2 text-xs text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 shadow-2xs"
        >
          <option value="">— Select an option —</option>
          {opts.map((o) => (
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

  if (type === 'boolean') {
    const rawLower = typeof value === 'string' ? value.trim().toLowerCase() : (typeof value === 'boolean' ? (value ? 'true' : 'false') : '');
    const isYes = (value as any) === true || rawLower === 'true' || rawLower === 'yes' || rawLower === '1';
    const isNo = (value as any) === false || rawLower === 'false' || rawLower === 'no' || rawLower === '0' || (!value && value !== undefined && value !== '');
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => !readOnly && onChange(true)}
          className={`rounded-md border px-4 py-2 text-xs font-semibold transition-all ${
            isYes
              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => !readOnly && onChange(false)}
          className={`rounded-md border px-4 py-2 text-xs font-semibold transition-all ${
            isNo
              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          No
        </button>
      </div>
    );
  }

  if (type === 'table') {
    const rawCols = item.options && item.options.length > 0 ? item.options : ['Column 1', 'Column 2', 'Column 3'];
    const cols = rawCols.filter((c) => !hiddenSet.has(c));
    let rows: Record<string, string>[] = [];
    if (Array.isArray(value)) {
      rows = value as Record<string, string>[];
    } else if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) rows = parsed;
      } catch {}
    }

    const commitRows = (next: Record<string, string>[]) => {
      if (readOnly) return;
      onChange(JSON.stringify(next));
    };

    const addRow = () => {
      if (readOnly) return;
      if (item.maxRows && rows.length >= item.maxRows) return;
      const empty = Object.fromEntries(cols.map((c) => [c, ''])) as Record<string, string>;
      commitRows([...rows, empty]);
    };

    const removeRow = (idx: number) => {
      if (readOnly) return;
      if (item.minRows && rows.length <= item.minRows) return;
      commitRows(rows.filter((_, i) => i !== idx));
    };

    const setCell = (rowIdx: number, col: string, cellVal: string) => {
      if (readOnly) return;
      const next = rows.map((r, i) => (i === rowIdx ? { ...r, [col]: cellVal } : r));
      commitRows(next);
    };

    const canAdd = !readOnly && item.allowAddRows !== false && (!item.maxRows || rows.length < item.maxRows);
    const canDelete = !readOnly && item.allowDeleteRows !== false && (!item.minRows || rows.length > item.minRows);

    return (
      <div className="w-full overflow-hidden rounded-md border border-gray-300 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                {cols.map((c) => (
                  <th key={c} className="border-b border-gray-200 px-2.5 py-1.5 font-medium">
                    {c}
                  </th>
                ))}
                {!readOnly && <th className="w-8 border-b border-gray-200" />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + (readOnly ? 0 : 1)} className="px-3 py-3 text-center text-xs text-gray-400">
                    {readOnly ? 'No table rows recorded.' : (item.emptyStateText || 'No rows yet — click “Add row”.')}
                  </td>
                </tr>
              )}
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-gray-100 last:border-b-0">
                  {cols.map((c) => (
                    <td key={c} className="border-r border-gray-100 px-1 py-1 last:border-r-0">
                      <input
                        value={row[c] ?? ''}
                        disabled={readOnly}
                        readOnly={readOnly}
                        onChange={(e) => setCell(ri, c, e.target.value)}
                        className={`w-full rounded border px-2 py-1 text-xs ${
                          readOnly
                            ? 'border-transparent bg-gray-50 text-gray-600'
                            : 'border-transparent text-gray-800 focus:border-blue-400 focus:outline-none'
                        }`}
                      />
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        disabled={!canDelete}
                        onClick={() => removeRow(ri)}
                        title="Remove row"
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-3 py-1.5 text-[11px]">
            <button
              type="button"
              disabled={!canAdd}
              onClick={addRow}
              className="flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:hover:text-blue-600"
            >
              <Plus className="h-3 w-3" /> Add row
            </button>
            {(item.minRows || item.maxRows) && (
              <span className="font-mono text-[10px] text-gray-400">
                {item.minRows ? `Min: ${item.minRows}` : ''}
                {item.minRows && item.maxRows ? ' • ' : ''}
                {item.maxRows ? `Max: ${item.maxRows}` : ''}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  if (type === 'long_text') {
    return (
      <textarea
        rows={3}
        disabled={readOnly}
        value={String(value || '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder={item.placeholder || 'Enter details…'}
        className={`${inputCls} resize-none min-h-[60px] leading-relaxed`}
      />
    );
  }

  return (
    <input
      type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
      disabled={readOnly}
      value={String(value || '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder={item.placeholder || ''}
      className={inputCls}
    />
  );
}
