import { forwardRef, useEffect, useRef, useState, type CSSProperties } from 'react';
import { GridLayout, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  ArrowLeft,
  Download,
  Eye,
  Heading,
  Layers,
  Loader2,
  Paperclip,
  Printer,
  X,
  Clock,
  Info,
} from 'lucide-react';
import { api } from '../../api/client';
import { isItemVisible, withWorkflowStatus } from '../../lib/conditions';
import type {
  EntityField,
  EntityFormItem,
  EntityRecord,
  ChecklistItem,
  ResolvedList,
  ConditionDefinition,
} from '../../types';
import type { AttachedFile } from './EntityCreateForm';

interface EntityFormViewProps {
  entity: EntityRecord;
  entityType?: string;
  onClose?: () => void;
  isModal?: boolean;
}

interface ResolvedField {
  key: string;
  name: string;
  label?: string;
  type: string;
  required: boolean;
  options: string[];
  checklistItems?: ChecklistItem[];
  placeholder?: string;
  accept?: string;
  maxFileSizeMb?: number;
  allowMultiple?: boolean;
  maxFiles?: number;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-700 border-amber-200',
  active: 'bg-blue-100 text-blue-700 border-blue-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
  expired: 'bg-orange-100 text-orange-700 border-orange-200',
};

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useContainerSize(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !active) return;
    const update = () => {
      setWidth(Math.round(node.getBoundingClientRect().width));
      setMounted(true);
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(node);
      return () => ro.disconnect();
    }
    return undefined;
  }, [active]);
  return { width, mounted, containerRef };
}

export function EntityFormView({ entity, entityType: propType, onClose, isModal = false }: EntityFormViewProps) {
  const entityType = propType || (entity as any).entity_type || 'permit';
  const [items, setItems] = useState<EntityFormItem[]>([]);
  const [fields, setFields] = useState<EntityField[]>([]);
  const [conditions, setConditions] = useState<ConditionDefinition[]>([]);
  const [resolved, setResolved] = useState<Record<string, ResolvedList>>({});
  const [cols, setCols] = useState(12);
  const [rowHeight, setRowHeight] = useState(40);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAllFields, setShowAllFields] = useState(false);

  const { width, mounted, containerRef } = useContainerSize(loaded);

  // Normalize custom_fields from entity record
  const customFields: Record<string, unknown> = entity.custom_fields || {};
  const baseConditionValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(customFields)) {
    if (v === null || v === undefined) {
      baseConditionValues[k] = '';
    } else if (typeof v === 'object') {
      baseConditionValues[k] = JSON.stringify(v);
    } else {
      baseConditionValues[k] = String(v);
    }
  }
  // Merge the entity's current workflow stage so stage-bound rules apply in the
  // read-only filled-form view (stage -> form two-way binding).
  const valuesForCondition = withWorkflowStatus(baseConditionValues, entity.status);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [form, condList] = await Promise.all([
          api.getForm(entityType),
          api.listConditions(entityType).catch(() => [] as ConditionDefinition[]),
        ]);
        if (cancelled) return;
        setConditions(condList);
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
            accept: it.accept ?? undefined,
            maxFileSizeMb: it.maxFileSizeMb ?? it.max_file_size_mb ?? 10,
            allowMultiple: it.allowMultiple ?? it.allow_multiple ?? false,
            maxFiles: it.maxFiles ?? it.max_files ?? 5,
          };
        });
        const formFields = form.fields || [];
        setItems(layout);
        setFields(formFields);
        setCols(form.cols || 12);
        setRowHeight(form.row_height || 40);

        const layoutKeys = layout.map((it) => it.optionsList).filter((k): k is string => Boolean(k));
        const fieldKeys = formFields
          .map((f) => f.option_list_key)
          .filter((k): k is string => Boolean(k));
        const keys = [...new Set([...layoutKeys, ...fieldKeys])];
        if (keys.length > 0) {
          const r = await api.resolveLists(keys);
          if (!cancelled) setResolved(r.resolved);
        }
      } catch (e: any) {
        if (cancelled) return;
        setErr(e.message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  const byName = new Map(fields.map((f) => [f.field_name, f]));

  const resolveItem = (it: EntityFormItem): ResolvedField | null => {
    if (it.isHeader || it.isGroup) return null;
    if (it.fieldType) {
      const list = it.optionsList ? resolved[it.optionsList] : undefined;
      let options = it.options || [];
      let checklistItems: ChecklistItem[] | undefined;
      if (list) {
        if (list.kind === 'options') options = list.items as string[];
        else if (list.kind === 'checklist') checklistItems = list.items as ChecklistItem[];
      }
      const hidden = new Set(it.hiddenOptions || (it as any).hidden_options || []);
      if (hidden.size > 0) {
        options = options.filter((opt) => !hidden.has(opt));
        if (checklistItems) {
          checklistItems = checklistItems.filter((item) => !hidden.has(item.label));
        }
      }
      return {
        key: it.i,
        name: it.fieldName || it.i,
        label: it.label ?? undefined,
        type: it.fieldType,
        required: Boolean(it.required),
        options,
        checklistItems,
        placeholder: it.placeholder ?? undefined,
        accept: it.accept ?? undefined,
        maxFileSizeMb: it.maxFileSizeMb ?? (it as any).max_file_size_mb ?? 10,
        allowMultiple: it.allowMultiple ?? (it as any).allow_multiple ?? false,
        maxFiles: it.maxFiles ?? (it as any).max_files ?? 5,
      };
    }
    const f = byName.get(it.i);
    if (!f) return null;
    let options = f.select_options || [];
    if (f.option_list_key && resolved[f.option_list_key]) {
      const list = resolved[f.option_list_key];
      if (list.kind === 'options') options = list.items as string[];
    }
    return {
      key: it.i,
      name: f.field_name,
      type: f.field_type,
      required: f.required,
      options,
      checklistItems: undefined,
    };
  };

  const currentlyVisibleItems = items.filter((it) => {
    if (showAllFields) return true;
    if (!it.isHeader && !it.isGroup && resolveItem(it) === null) {
      return false;
    }
    return isItemVisible(it, items, valuesForCondition, conditions);
  });

  const hasLayout = items.length > 0;

  const content = (
    <div className="flex flex-col bg-white min-h-full">
      {/* Form Header Info Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white px-6 py-4 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-xs transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-gray-900">
                {entityType.charAt(0).toUpperCase() + entityType.slice(1)} Record
              </h1>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  STATUS_BADGE[entity.status?.toLowerCase()] || 'bg-blue-50 text-blue-700 border-blue-200'
                }`}
              >
                {entity.status}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-gray-500 font-mono">
              <span>ID: {entity.id}</span>
              <span>·</span>
              <span>Workflow: {entity.workflow_version}</span>
              {entity.created_at && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1 font-sans">
                    <Clock className="h-3 w-3 text-gray-400" />
                    {new Date(entity.created_at).toLocaleString()}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasLayout && (
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 shadow-2xs">
              <input
                type="checkbox"
                checked={showAllFields}
                onChange={(e) => setShowAllFields(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
              />
              <Eye className="h-3.5 w-3.5 text-gray-500" />
              <span>Show hidden fields</span>
            </label>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs"
            title="Print form"
          >
            <Printer className="h-3.5 w-3.5 text-gray-500" /> Print
          </button>
          {onClose && isModal && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {!loaded && (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading filled form layout…
        </div>
      )}

      {err && (
        <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {err}
        </div>
      )}

      {loaded && (
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-white">
          <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-8 sm:p-10 shadow-xs">
            {/* Document Sheet Heading */}
            <div className="mb-6">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                {entityType.charAt(0).toUpperCase() + entityType.slice(1)} details
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Summary of recorded fields and workflow attributes for this record.
              </p>
            </div>

            {hasLayout ? (
              <div ref={containerRef}>
                {mounted && (
                  <GridLayout
                    width={width}
                    layout={currentlyVisibleItems}
                    compactor={verticalCompactor}
                    gridConfig={{
                      cols,
                      rowHeight,
                      margin: [16, 16],
                      containerPadding: [0, 0],
                    }}
                    dragConfig={{ enabled: false }}
                    resizeConfig={{ enabled: false }}
                    className="rounded-lg"
                  >
                    {currentlyVisibleItems.map((it) => {
                      if (it.isGroup) {
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
                      if (it.isHeader) {
                        return (
                          <div
                            key={it.i}
                            className="flex h-full w-full flex-col justify-center pt-2 pb-1"
                          >
                            <h3 className="text-sm sm:text-base font-semibold text-gray-900">
                              {it.label || 'Section Header'}
                            </h3>
                            {it.placeholder && (
                              <p className="text-xs text-gray-500 mt-0.5">{it.placeholder}</p>
                            )}
                          </div>
                        );
                      }
                      const fieldDef = resolveItem(it);
                      if (!fieldDef) return null;
                      const rawVal = customFields[it.fieldName || it.i] ?? customFields[it.i];
                      return (
                        <ReadOnlyFillCell
                          key={it.i}
                          def={fieldDef}
                          value={rawVal}
                          itemHeight={it.h}
                        />
                      );
                    })}
                  </GridLayout>
                )}
              </div>
            ) : (
              /* Fallback when no form layout exists */
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800">
                  No custom form builder layout has been published for entity type{' '}
                  <span className="font-mono font-bold">{entityType}</span>. Displaying all recorded custom fields.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(customFields).map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-gray-900">{k}</span>
                      <ReadOnlyWidget def={{ key: k, name: k, type: 'text', required: false, options: [] }} value={v} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 sm:p-6 backdrop-blur-xs overflow-y-auto">
        <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="overflow-y-auto">
            {content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 overflow-hidden flex flex-col">
      {content}
    </div>
  );
}

// --- Read-only Grid Cell: Stacked Label + Input --------------------------------------
const ReadOnlyFillCell = forwardRef<
  HTMLDivElement,
  {
    def: ResolvedField;
    value: unknown;
    itemHeight?: number;
    className?: string;
    style?: CSSProperties;
  }
>(function ReadOnlyFillCell({ def, value, itemHeight = 1, className, style }, ref) {
  return (
    <div
      ref={ref}
      style={style}
      className={`${className ?? ''} flex h-full w-full flex-col justify-center py-1`}
    >
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-900">
        <span className="truncate" title={def.label || def.name}>
          {def.label || def.name}
        </span>
        {def.required && <span className="text-red-500">*</span>}
      </label>
      <div className="min-w-0 flex-1">
        <ReadOnlyWidget def={def} value={value} itemHeight={itemHeight} />
      </div>
    </div>
  );
});

// --- Widget Renderers in Read-Only Mode -----------------------------------------------
function ReadOnlyWidget({
  def,
  value,
  itemHeight = 1,
}: {
  def: ResolvedField;
  value: unknown;
  itemHeight?: number;
}) {
  const boxCls = 'w-full rounded-md border border-gray-300 bg-gray-50/70 px-3 py-2 text-xs text-gray-900 font-medium shadow-2xs';

  // 1. File Attachment
  if (def.type === 'file') {
    let files: AttachedFile[] = [];
    if (Array.isArray(value)) {
      files = value.filter((f) => f && typeof f === 'object' && f.name);
    } else if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) files = parsed.filter((f) => f && typeof f === 'object' && f.name);
      } catch {}
    }

    if (files.length === 0) {
      return (
        <div className="flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-gray-50/50 px-3 py-2 text-xs text-gray-400 italic">
          <Paperclip className="h-3.5 w-3.5 text-gray-400" /> No files attached
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        {files.map((f, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50/60 px-3 py-1.5 shadow-2xs"
          >
            <Paperclip className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <span className="max-w-[160px] truncate text-xs font-semibold text-gray-800" title={f.name}>
              {f.name}
            </span>
            <span className="font-mono text-[10px] text-gray-500 shrink-0">
              {formatFileSize(f.size)}
            </span>
            {f.dataUrl && (
              <a
                href={f.dataUrl}
                download={f.name}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-2.5 w-2.5" /> Download
              </a>
            )}
          </div>
        ))}
      </div>
    );
  }

  // 2. Checklist
  if (def.type === 'checklist') {
    const tasks = def.checklistItems ?? [];
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

    if (tasks.length === 0) {
      return (
        <span className="text-xs text-gray-400 italic">
          {checkedSet.size > 0 ? [...checkedSet].join(', ') : 'No checklist items'}
        </span>
      );
    }

    return (
      <div className="flex w-full flex-col divide-y divide-gray-100 rounded-md border border-gray-300 bg-white shadow-2xs">
        {tasks.map((t) => {
          const isDone = checkedSet.has(t.label);
          return (
            <div
              key={t.label}
              className={`flex items-center gap-2.5 px-3 py-2 text-xs ${
                isDone ? 'bg-blue-50/40 text-gray-900' : 'text-gray-500'
              }`}
            >
              <input
                type="checkbox"
                checked={isDone}
                readOnly
                disabled
                className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
              />
              <span className={isDone ? 'font-medium text-gray-900' : 'text-gray-500'}>
                {t.label}
              </span>
              {t.required && (
                <span className={`ml-auto text-[10px] font-bold ${isDone ? 'text-blue-600' : 'text-amber-600'}`}>
                  {isDone ? '✓ Completed' : 'Required'}
                </span>
              )}
              {t.assigned_role && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[9px] text-gray-500">
                  {t.assigned_role}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Dynamic Table
  if (def.type === 'table') {
    let rows: Record<string, string>[] = [];
    if (Array.isArray(value)) {
      rows = value as Record<string, string>[];
    } else if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) rows = parsed;
      } catch {}
    }
    const cols = def.options && def.options.length > 0 ? def.options : (rows.length > 0 ? Object.keys(rows[0]) : []);

    if (rows.length === 0) {
      return (
        <div className="rounded-md border border-gray-300 bg-gray-50/70 p-3 text-center text-xs text-gray-400 italic">
          No table rows recorded
        </div>
      );
    }

    return (
      <div className="w-full overflow-hidden rounded-md border border-gray-300 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-600 border-b border-gray-200 font-semibold">
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 font-semibold text-gray-700">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-gray-50/50">
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2 text-gray-800">
                    {row[c] || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 4. Selection / Radio Choice Cards
  if (def.type === 'selection') {
    const valStr = String(value ?? '');
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
        {def.options.map((o) => {
          const isSelected = valStr === o;
          const parts = o.includes(' | ') ? o.split(' | ') : o.includes(' - ') ? o.split(' - ') : [o];
          const title = parts[0].trim();
          const desc = parts.length > 1 ? parts.slice(1).join(' - ').trim() : null;

          return (
            <div
              key={o}
              className={`rounded-lg border p-4 text-left flex flex-col justify-between ${
                isSelected
                  ? 'border-gray-300 bg-white ring-1 ring-blue-600/40 shadow-xs'
                  : 'border-gray-200 bg-white opacity-70'
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
              {desc && (
                <p className="mt-1.5 text-xs text-gray-500 leading-normal">{desc}</p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // 5. Checkbox Group Choice Cards
  if (def.type === 'checkbox_group') {
    let checkedList: string[] = [];
    if (Array.isArray(value)) checkedList = value.map(String);
    else if (typeof value === 'string') checkedList = value.split(',').map((s) => s.trim());

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
        {def.options.map((o) => {
          const isSelected = checkedList.includes(o);
          const parts = o.includes(' | ') ? o.split(' | ') : o.includes(' - ') ? o.split(' - ') : [o];
          const title = parts[0].trim();
          const desc = parts.length > 1 ? parts.slice(1).join(' - ').trim() : null;

          return (
            <div
              key={o}
              className={`rounded-lg border p-4 text-left flex flex-col justify-between ${
                isSelected
                  ? 'border-gray-300 bg-white ring-1 ring-blue-600/40 shadow-xs'
                  : 'border-gray-200 bg-white opacity-70'
              }`}
            >
              <div className="flex items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold text-gray-900 truncate">{title}</span>
                  <Info className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                </div>
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  disabled
                  className="accent-blue-600 h-4 w-4 rounded"
                />
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

  // 6. Boolean Toggle Badges
  if (def.type === 'boolean') {
    const isYes = value === true || value === 'yes' || value === 'true';
    return (
      <div className="flex items-center gap-3">
        <div
          className={`rounded-md border px-4 py-2 text-xs font-semibold ${
            isYes
              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600'
              : 'border-gray-200 bg-gray-50/50 text-gray-400 opacity-60'
          }`}
        >
          Yes
        </div>
        <div
          className={`rounded-md border px-4 py-2 text-xs font-semibold ${
            !isYes
              ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600'
              : 'border-gray-200 bg-gray-50/50 text-gray-400 opacity-60'
          }`}
        >
          No
        </div>
      </div>
    );
  }

  // 7. Long Text
  if (def.type === 'long_text') {
    return (
      <div className={`${boxCls} whitespace-pre-wrap leading-relaxed min-h-[60px]`}>
        {value ? String(value) : <span className="text-gray-400 italic">None</span>}
      </div>
    );
  }

  // 8. Text / Date / Time / Email / Phone / URL / Number
  return (
    <div className={boxCls}>
      {value !== undefined && value !== null && String(value).trim() !== '' ? (
        String(value)
      ) : (
        <span className="text-gray-400 italic">Empty</span>
      )}
    </div>
  );
}
