import { forwardRef, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { GridLayout, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { ArrowLeft, CheckCircle2, Loader2, Heading, Layers, Paperclip, Plus, X, Zap } from 'lucide-react';
import { api } from '../../api/client';
import { navigate } from '../../lib/router';
import { isItemVisible, isItemReadOnly } from '../../lib/conditions';
import type { EntityField, EntityFormItem, ChecklistItem, ResolvedList, VisibilityCondition } from '../../types';

interface EntityCreateFormProps {
  entityType: string;
  onBack: () => void;
}

interface ResolvedField {
  /** Input identity — layout item id for inline fields, field name for registry fields. */
  key: string;
  /** Storage key on the record's custom_fields. */
  name: string;
  /** Human-readable label from the form builder. */
  label?: string;
  type: string;
  required: boolean;
  options: string[];
  /** Tasks when the field is a checklist referencing a published list. */
  checklistItems?: ChecklistItem[];
  placeholder?: string;
  accept?: string;
  maxFileSizeMb?: number;
  allowMultiple?: boolean;
  maxFiles?: number;
}

// The layout container only mounts once the form definition is loaded, so
// react-grid-layout's built-in hook (which measures on mount) would miss it.
// Measure explicitly once the container is available, and keep an eye on
// viewport resizes so the grid fits its canvas width.
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

export function EntityCreateForm({ entityType, onBack }: EntityCreateFormProps) {
  const [items, setItems] = useState<EntityFormItem[]>([]);
  const [fields, setFields] = useState<EntityField[]>([]);
  const [resolved, setResolved] = useState<Record<string, ResolvedList>>({});
  const [cols, setCols] = useState(12);
  const [rowHeight, setRowHeight] = useState(40);
  const [loaded, setLoaded] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { width, mounted, containerRef } = useContainerSize(loaded);

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

  const handleValueChange = (it: EntityFormItem, val: string) => {
    setValues((prev) => {
      const next = { ...prev, [it.i]: val };
      if (it.fieldName) {
        next[it.fieldName] = val;
      }
      return next;
    });
  };

  const handleFallbackChange = (fieldName: string, val: string) => {
    setValues((prev) => ({ ...prev, [fieldName]: val }));
  };

  // Evaluate conditions dynamically based on current form values
  const currentlyVisibleItems = items.filter((it) => {
    if (!it.isHeader && !it.isGroup && resolveItem(it) === null) {
      return false;
    }
    return isItemVisible(it, items, values);
  });
  const hasLayout = items.length > 0;

  const fallbackFields =
    !hasLayout && fields.length > 0 ? [...fields].sort((a, b) => a.field_name.localeCompare(b.field_name)) : [];

  const fieldOptions = (f: EntityField): string[] => {
    if (f.option_list_key && resolved[f.option_list_key]) {
      const list = resolved[f.option_list_key];
      if (list.kind === 'options') return list.items as string[];
    }
    return f.select_options || [];
  };

  const submit = async () => {
    setSaving(true);
    setErr(null);
    setSuccess(false);
    try {
      const activeDefs = [
        ...currentlyVisibleItems
          .filter((it) => !it.isHeader && !it.isGroup && resolveItem(it) !== null)
          .map((it) => resolveItem(it)!),
        ...fallbackFields.map((f) => ({
          key: f.field_name,
          name: f.field_name,
          label: f.field_name,
          type: f.field_type,
          required: f.required,
          options: fieldOptions(f),
        })),
      ];

      // Check required fields (only for visible ones)
      for (const d of activeDefs) {
        if (d.required) {
          const val = values[d.key] ?? values[d.name] ?? '';
          if (d.type === 'file') {
            const files = parseFileList(String(val));
            if (files.length === 0) {
              setErr(`Field "${d.label || d.name}" requires at least one file attachment.`);
              setSaving(false);
              return;
            }
          } else if (String(val).trim() === '') {
            setErr(`Field "${d.label || d.name}" is required.`);
            setSaving(false);
            return;
          }
        }
      }

      // Check required checklist items (only for visible ones)
      const pending: string[] = [];
      for (const d of activeDefs) {
        if (d.type === 'checklist' && d.checklistItems) {
          const checked = new Set(parseCheckedList(values[d.key] ?? values[d.name] ?? ''));
          for (const t of d.checklistItems.filter((t) => t.required && !checked.has(t.label))) {
            pending.push(`${d.label || d.name}: ${t.label}`);
          }
        }
      }
      if (pending.length > 0) {
        setErr(`Required checklist items not completed: ${pending.join('; ')}`);
        setSaving(false);
        return;
      }
      const custom = toCustomFields(values, activeDefs);
      const res = await api.createEntity(entityType, { custom_fields: custom });
      setSuccess(true);
      window.setTimeout(
        () => navigate('/entities', { type: entityType, selected: res.entity_id }),
        600
      );
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" /> Entities
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">New {entityType} record</h1>
            <p className="mt-1 text-sm text-gray-500">
              Form fill-in based on the layout defined in the Form Builder. Creating the record starts the workflow.
            </p>
          </div>
        </div>
        <span className="rounded-md bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700">
          {entityType}
        </span>
      </div>

      {!loaded && (
        <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-20 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading form layout…
        </div>
      )}

      {loaded && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {hasLayout ? 'Form layout' : 'No form layout defined'}
            </span>
            {mounted && <span className="text-[11px] text-gray-400">{cols} cols · {rowHeight}px rows</span>}
          </div>

          {hasLayout || fallbackFields.length > 0 ? (
            <div className="p-4">
              <div ref={containerRef}>
                {mounted && hasLayout && (
                  <GridLayout
                    width={width}
                    layout={currentlyVisibleItems}
                    compactor={verticalCompactor}
                    gridConfig={{
                      cols,
                      rowHeight,
                      margin: [12, 12],
                      containerPadding: [12, 12],
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
                            className="flex h-full w-full items-center gap-2 rounded-md border border-purple-200 bg-purple-50/70 px-3 text-sm font-bold text-purple-900 shadow-sm"
                          >
                            <Layers className="h-4 w-4 shrink-0 text-purple-600" />
                            <span className="truncate">{it.label || it.groupTitle || 'Group'}</span>
                          </div>
                        );
                      }
                      if (it.isHeader) {
                        return (
                          <div
                            key={it.i}
                            className="flex h-full w-full items-center gap-1.5 rounded-md bg-indigo-50 px-3 text-sm font-bold text-indigo-700"
                          >
                            <Heading className="h-4 w-4 shrink-0" />
                            <span className="truncate">{it.label}</span>
                          </div>
                        );
                      }
                      const isReadOnly = isItemReadOnly(it, items, values);
                      return (
                        <FillCell
                          key={it.i}
                          def={resolveItem(it)!}
                          value={values[it.i] ?? (it.fieldName ? values[it.fieldName] : '') ?? ''}
                          itemHeight={it.h}
                          readOnly={isReadOnly}
                          onChange={(v) => handleValueChange(it, v)}
                        />
                      );
                    })}
                  </GridLayout>
                )}
                {mounted && !hasLayout && fallbackFields.length === 0 && (
                  <div className="py-6 text-center text-xs text-gray-400">Layout not visible yet — measuring…</div>
                )}
              </div>

              {fallbackFields.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="mb-1 flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    All registered fields (no layout defined yet — build one in the Form Builder)
                  </div>
                  {fallbackFields.map((f) => (
                    <FieldRow
                      key={`fallback-${f.field_name}`}
                      def={{ key: f.field_name, name: f.field_name, type: f.field_type, required: f.required, options: fieldOptions(f) }}
                      value={values[f.field_name] ?? ''}
                      onChange={(v) => handleFallbackChange(f.field_name, v)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-gray-200 bg-gray-50/60 px-4 py-3">
            {err && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>
            )}
            {success && (
              <p className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Created — opening the record…
              </p>
            )}
            <button
              onClick={submit}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 rounded-md bg-blue-700 px-3 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Create {entityType} (starts workflow)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- grid cell: compact label+input on one row so it fits h=1 field cells ----
// forwardRef + className/style forwarding so react-grid-layout can measure the
// cell and position it (it clones each child with ref/className/style props).
const FillCell = forwardRef<HTMLDivElement, {
  def: ResolvedField;
  value: string;
  itemHeight?: number;
  readOnly?: boolean;
  onChange: (v: string) => void;
  className?: string;
  style?: CSSProperties;
}>(function FillCell({ def, value, itemHeight = 1, readOnly = false, onChange, className, style }, ref) {
  const id = useId();
  const rows = def.type === 'long_text' ? Math.max(2, Math.round((itemHeight * 40) / 24)) : 1;
  const input = makeInput(def, id, value, onChange, rows, readOnly);
  return (
    <div
      ref={ref}
      style={style}
      className={`${className ?? ''} flex h-full w-full items-center gap-2 px-2.5 py-1 ${
        readOnly ? 'opacity-90' : ''
      }`}
    >
      <label htmlFor={id} className="flex w-36 shrink-0 items-center gap-1 truncate text-xs font-medium text-gray-700">
        <span className="truncate">{def.label || def.name}</span>
        {def.required && <span className="text-red-500">*</span>}
        {readOnly && (
          <span className="ml-0.5 text-[10px] text-amber-600" title="Read-only (disabled by condition)">
            🔒
          </span>
        )}
      </label>
      <div className="min-w-0 flex-1">{input}</div>
    </div>
  );
});

// --- full-width vertical label+input row (used for auto-appended fields) ----
function FieldRow({
  def,
  value,
  onChange,
}: {
  def: ResolvedField;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="flex items-center gap-1 text-xs font-medium text-gray-700">
        {def.label || def.name}
        {def.required && <span className="text-red-500">*</span>}
      </label>
      {makeInput(def, id, value, onChange, 3)}
    </div>
  );
}

function makeInput(
  def: ResolvedField,
  id: string,
  value: string,
  onChange: (v: string) => void,
  textareaRows?: number,
  readOnly = false
) {
  const cls = `w-full rounded-md border px-2 py-1.5 text-sm ${
    readOnly
      ? 'border-gray-200 bg-gray-100/90 text-gray-500 cursor-not-allowed select-none'
      : 'border-gray-300 bg-white text-gray-800'
  }`;

  if (def.type === 'long_text') {
    return (
      <textarea
        id={id}
        value={value}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        disabled={readOnly}
        readOnly={readOnly}
        rows={textareaRows ?? 3}
        placeholder={def.placeholder || ''}
        className={`${cls} h-full min-h-[28px] resize-none leading-snug`}
      />
    );
  }
  if (def.type === 'selection') {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {def.options.length === 0 ? (
          <span className="text-[11px] text-gray-400">No options defined</span>
        ) : (
          def.options.map((o) => (
            <label
              key={o}
              className={`flex items-center gap-1 text-xs ${
                readOnly ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer text-gray-700'
              }`}
            >
              <input
                type="radio"
                name={`sel-${id}`}
                value={o}
                checked={value === o}
                disabled={readOnly}
                onChange={() => !readOnly && onChange(o)}
                className="accent-blue-600"
              />
              {o}
            </label>
          ))
        )}
      </div>
    );
  }
  if (def.type === 'checkbox_group') {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {def.options.length === 0 ? (
          <span className="text-[11px] text-gray-400">No options defined</span>
        ) : (
          def.options.map((o) => {
            const checked = value.split(',').map((s) => s.trim()).includes(o);
            return (
              <label
                key={o}
                className={`flex items-center gap-1 text-xs ${
                  readOnly ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer text-gray-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={readOnly}
                  onChange={() => !readOnly && onChange(toggleMulti(value, o))}
                  className="accent-blue-600"
                />
                {o}
              </label>
            );
          })
        )}
      </div>
    );
  }
  if (def.type === 'boolean') {
    return (
      <label
        className={`flex w-fit items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${
          readOnly
            ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
            : 'cursor-pointer border-gray-300 bg-gray-50 text-gray-700'
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={value === 'yes'}
          disabled={readOnly}
          onChange={(e) => !readOnly && onChange(e.target.checked ? 'yes' : 'no')}
          className="accent-blue-600"
        />
        Yes
      </label>
    );
  }

  if (def.type === 'checklist') {
    const tasks = def.checklistItems ?? [];
    if (tasks.length === 0) {
      return <span className="text-[11px] text-gray-400">No tasks defined for this checklist</span>;
    }
    const checked = new Set(parseCheckedList(value));
    const toggle = (label: string) => {
      if (readOnly) return;
      const next = new Set(checked);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      onChange(JSON.stringify([...next]));
    };
    return (
      <div className="flex w-full flex-col gap-1">
        {tasks.map((t) => {
          const done = checked.has(t.label);
          const pendingReq = !done && t.required;
          return (
            <label
              key={t.label}
              className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
                readOnly
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100/70 text-gray-400'
                  : done
                  ? 'border-indigo-200 bg-indigo-50/50 cursor-pointer'
                  : pendingReq
                  ? 'border-amber-200 bg-amber-50/40 cursor-pointer'
                  : 'border-gray-200 bg-white cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={done}
                disabled={readOnly}
                onChange={() => toggle(t.label)}
                className="accent-indigo-600"
              />
              <span className={done ? 'text-gray-500 line-through' : readOnly ? 'text-gray-500' : 'text-gray-800'}>
                {t.label}
              </span>
              {t.required && (
                <span className="ml-auto shrink-0 text-[10px] font-medium text-amber-600">
                  {done ? 'required ✓' : 'required'}
                </span>
              )}
            </label>
          );
        })}
      </div>
    );
  }

  if (def.type === 'table') {
    return <DynamicTable def={def} value={value} onChange={onChange} readOnly={readOnly} />;
  }
  if (def.type === 'file') {
    return <FileInput def={def} value={value} onChange={onChange} readOnly={readOnly} />;
  }
  if (def.type === 'dropdown' || def.type === 'select') {
    return (
      <select
        id={id}
        value={value}
        disabled={readOnly}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        className={cls}
      >
        <option value="">—</option>
        {(def.options || []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  const nativeType: Record<string, string> = {
    number: 'number',
    email: 'email',
    phone: 'tel',
    url: 'url',
    date: 'date',
    datetime: 'datetime-local',
    time: 'time',
  };
  return (
    <input
      id={id}
      type={nativeType[def.type] ?? 'text'}
      value={value}
      disabled={readOnly}
      readOnly={readOnly}
      onChange={(e) => !readOnly && onChange(e.target.value)}
      placeholder={def.placeholder || ''}
      className={cls}
    />
  );
}

/** Toggle one option in a comma-joined multi-select value string. */
function toggleMulti(current: string, option: string): string {
  const set = new Set(current ? current.split(',').map((s) => s.trim()).filter(Boolean) : []);
  if (set.has(option)) set.delete(option);
  else set.add(option);
  return [...set].join(',');
}

/** Parse the JSON-array value of a checklist field into checked task labels. */
function parseCheckedList(value: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((s) => String(s)).filter(Boolean);
  } catch {
    /* fall through */
  }
  return [];
}

export interface AttachedFile {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  lastModified?: number;
}

/** Parse the JSON-array value of a file attachment field into AttachedFile items. */
function parseFileList(value: string): AttachedFile[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((f) => f && typeof f === 'object' && f.name);
    }
  } catch {
    /* fall through */
  }
  return [];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileInput({
  def,
  value,
  onChange,
  readOnly = false,
}: {
  def: ResolvedField;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const [files, setFiles] = useState<AttachedFile[]>(() => parseFileList(value));
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxMb = def.maxFileSizeMb || 10;
  const maxBytes = maxMb * 1024 * 1024;
  const allowMultiple = Boolean(def.allowMultiple);
  const maxFiles = def.maxFiles || 5;

  const commit = (next: AttachedFile[]) => {
    setFiles(next);
    onChange(JSON.stringify(next));
  };

  const processFiles = (fileList: FileList | File[]) => {
    if (readOnly) return;
    setError(null);
    const incoming = Array.from(fileList);
    if (!incoming.length) return;

    if (!allowMultiple && (incoming.length > 1 || files.length >= 1)) {
      if (incoming.length > 1) {
        setError('Only a single file attachment is allowed.');
        return;
      }
    }

    if (allowMultiple && files.length + incoming.length > maxFiles) {
      setError(`Cannot attach more than ${maxFiles} files in total.`);
      return;
    }

    // Validate size
    for (const f of incoming) {
      if (f.size > maxBytes) {
        setError(`File "${f.name}" exceeds maximum allowed size of ${maxMb} MB.`);
        return;
      }
    }

    const readers: Promise<AttachedFile>[] = incoming.map(
      (f) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              name: f.name,
              size: f.size,
              type: f.type || 'application/octet-stream',
              dataUrl: reader.result as string,
              lastModified: f.lastModified,
            });
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(f);
        })
    );

    Promise.all(readers)
      .then((newAttachments) => {
        if (!allowMultiple) {
          commit(newAttachments.slice(0, 1));
        } else {
          commit([...files, ...newAttachments]);
        }
      })
      .catch(() => {
        setError('Failed to read file content.');
      });
  };

  const removeFile = (idx: number) => {
    if (readOnly) return;
    commit(files.filter((_, i) => i !== idx));
  };

  const handleDrag = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  if (readOnly && files.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50/60 p-2 text-xs italic text-gray-400">
        No file attached
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple={allowMultiple}
        accept={def.accept || undefined}
        onChange={(e) => {
          if (e.target.files) {
            processFiles(e.target.files);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* Dropzone area */}
      {!readOnly && (!files.length || (allowMultiple && files.length < maxFiles)) && (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-3 text-center transition-colors ${
            dragActive
              ? 'border-blue-500 bg-blue-50/80'
              : 'border-gray-300 bg-gray-50/70 hover:border-blue-400 hover:bg-gray-100/70'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
            <Paperclip className="h-4 w-4 shrink-0 text-blue-600" />
            <span>{def.placeholder || 'Click or drag files to attach'}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-gray-400">
            {def.accept ? (
              <span className="rounded bg-gray-200/70 px-1 font-mono text-gray-600">{def.accept}</span>
            ) : (
              <span>Any file type</span>
            )}
            <span>·</span>
            <span>Max {maxMb} MB</span>
            {allowMultiple && (
              <>
                <span>·</span>
                <span>Max {maxFiles} files</span>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-red-600">
          <X className="h-3 w-3" /> {error}
        </p>
      )}

      {/* Attached file list */}
      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((f, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 shadow-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                <span className="truncate text-xs font-medium text-gray-800" title={f.name}>
                  {f.name}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-gray-400">
                  {formatFileSize(f.size)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {f.dataUrl && (
                  <a
                    href={f.dataUrl}
                    download={f.name}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50"
                  >
                    Download
                  </a>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(idx);
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Dynamic-row table. Columns come from the form-builder definition (added at
 * build time); rows are added/removed by the user while filling the form.
 * The value binding is a JSON string of row objects keyed by column name.
 */
function parseTableRows(value: string): Record<string, string>[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => (row && typeof row === 'object' ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String((v ?? '') as unknown)])) : {}))
      .filter((row) => Object.keys(row).length > 0);
  } catch {
    return [];
  }
}

function DynamicTable({
  def,
  value,
  onChange,
  readOnly = false,
}: {
  def: ResolvedField;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  const cols = def.options && def.options.length > 0 ? def.options : [''];
  const [rows, setRows] = useState<Record<string, string>[]>(() => parseTableRows(value));

  const commit = (next: Record<string, string>[]) => {
    if (readOnly) return;
    setRows(next);
    onChange(JSON.stringify(next.filter((r) => Object.values(r).some((v) => v.trim() !== ''))));
  };

  const addRow = () => {
    if (readOnly) return;
    const empty = Object.fromEntries(cols.map((c) => [c, ''])) as Record<string, string>;
    commit([...rows, empty]);
  };

  const removeRow = (idx: number) => {
    if (readOnly) return;
    commit(rows.filter((_, i) => i !== idx));
  };

  const setCell = (rowIdx: number, col: string, cellValue: string) => {
    if (readOnly) return;
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [col]: cellValue } : r));
    commit(next);
  };

  return (
    <div className="w-full overflow-hidden rounded-md border border-gray-300">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500">
              {cols.map((c) => (
                <th key={c} className="border-b border-gray-200 px-2 py-1.5 font-medium">
                  {c}
                </th>
              ))}
              {!readOnly && <th className="w-8 border-b border-gray-200" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + (readOnly ? 0 : 1)} className="px-2 py-2 text-center text-[11px] text-gray-400">
                  {readOnly ? 'No table rows entered.' : 'No rows yet — click “Add row”.'}
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
                      onChange={(e) => !readOnly && setCell(ri, c, e.target.value)}
                      className={`w-full rounded border px-1.5 py-1 text-xs ${
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
                      onClick={() => removeRow(ri)}
                      title="Remove row"
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="border-t border-gray-200 bg-gray-50/60 px-2 py-1.5">
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" /> Add row
          </button>
        </div>
      )}
    </div>
  );
}

function toCustomFields(values: Record<string, string>, defs: ResolvedField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of defs) {
    const rawVal = values[def.key] ?? values[def.name];
    if (rawVal === undefined || rawVal === null) continue;
    const trimmed = String(rawVal).trim();
    if (trimmed === '') continue;
    const name = def.name || def.key;
    if (def.type === 'number') {
      const n = Number(trimmed);
      out[name] = Number.isNaN(n) ? trimmed : n;
    } else if (def.type === 'boolean') {
      out[name] = trimmed === 'yes';
    } else if (def.type === 'checkbox_group') {
      out[name] = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (def.type === 'table') {
      out[name] = parseTableRows(trimmed);
    } else if (def.type === 'checklist') {
      out[name] = parseCheckedList(trimmed);
    } else if (def.type === 'file') {
      out[name] = parseFileList(trimmed);
    } else {
      out[name] = trimmed;
    }
  }
  return out;
}