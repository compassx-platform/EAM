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
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => !readOnly && onChange(true)}
          className={`rounded-md border px-4 py-2 text-xs font-semibold transition-all ${
            Boolean(value)
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
            !value && value !== undefined
              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          No
        </button>
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
