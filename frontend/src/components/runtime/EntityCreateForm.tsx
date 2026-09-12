import { forwardRef, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { GridLayout, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { ArrowLeft, CheckCircle2, Loader2, Heading, Plus, X, Zap } from 'lucide-react';
import { api } from '../../api/client';
import { navigate } from '../../lib/router';
import type { EntityField, EntityFormItem, ChecklistItem, ResolvedList } from '../../types';

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
        const layout = ((form.layout || []) as Array<EntityFormItem & { options_list?: string | null }>).map(
          (it) => ({ ...it, optionsList: it.options_list ?? it.optionsList, options_list: undefined })
        );
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
    if (it.isHeader) return null;
    if (it.fieldType) {
      const list = it.optionsList ? resolved[it.optionsList] : undefined;
      let options = it.options || [];
      let checklistItems: ChecklistItem[] | undefined;
      if (list) {
        if (list.kind === 'options') options = list.items as string[];
        else if (list.kind === 'checklist') checklistItems = list.items as ChecklistItem[];
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

  const visibleItems = items.filter((it) => it.isHeader || resolveItem(it) !== null);
  const hasLayout = visibleItems.length > 0;

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
      const defs = [
        ...visibleItems.filter((it) => resolveItem(it) !== null).map((it) => resolveItem(it)!),
        ...fallbackFields.map((f) => ({ key: f.field_name, name: f.field_name, type: f.field_type, required: f.required, options: fieldOptions(f) })),
      ];
      const pending: string[] = [];
      for (const d of defs) {
        if (d.type === 'checklist' && d.checklistItems) {
          const checked = new Set(parseCheckedList(values[d.key] ?? ''));
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
      const custom = toCustomFields(values, defs);
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
                    layout={visibleItems}
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
                    {visibleItems.map((it) =>
                      it.isHeader ? (
                        <div
                          key={it.i}
                          className="flex h-full w-full items-center gap-1.5 rounded-md bg-indigo-50 px-3 text-sm font-bold text-indigo-700"
                        >
                          <Heading className="h-4 w-4 shrink-0" />
                          <span className="truncate">{it.label}</span>
                        </div>
                      ) : (
                        <FillCell
                          key={it.i}
                          def={resolveItem(it)!}
                          value={values[it.i] ?? ''}
                          itemHeight={it.h}
                          onChange={(v) => setValues((s) => ({ ...s, [it.i]: v }))}
                        />
                      )
                    )}
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
                      onChange={(v) => setValues((s) => ({ ...s, [f.field_name]: v }))}
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
  onChange: (v: string) => void;
  className?: string;
  style?: CSSProperties;
}>(function FillCell({ def, value, itemHeight = 1, onChange, className, style }, ref) {
  const id = useId();
  const rows = def.type === 'long_text' ? Math.max(2, Math.round((itemHeight * 40) / 24)) : 1;
  const input = makeInput(def, id, value, onChange, rows);
  return (
    <div
      ref={ref}
      style={style}
      className={`${className ?? ''} flex h-full w-full items-center gap-2 px-2.5 py-1`}
    >
      <label htmlFor={id} className="flex w-36 shrink-0 items-center gap-1 truncate text-xs font-medium text-gray-700">
        <span className="truncate">{def.label || def.name}</span>
        {def.required && <span className="text-red-500">*</span>}
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
  textareaRows?: number
) {
  const cls = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800';
  if (def.type === 'long_text') {
    return (
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
            <label key={o} className="flex cursor-pointer items-center gap-1 text-xs text-gray-700">
              <input
                type="radio"
                name={`sel-${id}`}
                value={o}
                checked={value === o}
                onChange={() => onChange(o)}
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
              <label key={o} className="flex cursor-pointer items-center gap-1 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(toggleMulti(value, o))}
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
      <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs text-gray-700">
        <input
          id={id}
          type="checkbox"
          checked={value === 'yes'}
          onChange={(e) => onChange(e.target.checked ? 'yes' : 'no')}
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
                done ? 'border-indigo-200 bg-indigo-50/50' : pendingReq ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-white'
              }`}
            >
              <input
                type="checkbox"
                checked={done}
                onChange={() => toggle(t.label)}
                className="accent-indigo-600"
              />
              <span className={done ? 'text-gray-500 line-through' : 'text-gray-800'}>{t.label}</span>
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
    return <DynamicTable def={def} value={value} onChange={onChange} />;
  }
  if (def.type === 'dropdown' || def.type === 'select') {
    return (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
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
      onChange={(e) => onChange(e.target.value)}
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
}: {
  def: ResolvedField;
  value: string;
  onChange: (v: string) => void;
}) {
  const cols = def.options && def.options.length > 0 ? def.options : [''];
  const [rows, setRows] = useState<Record<string, string>[]>(() => parseTableRows(value));

  const commit = (next: Record<string, string>[]) => {
    setRows(next);
    onChange(JSON.stringify(next.filter((r) => Object.values(r).some((v) => v.trim() !== ''))));
  };

  const addRow = () => {
    const empty = Object.fromEntries(cols.map((c) => [c, ''])) as Record<string, string>;
    commit([...rows, empty]);
  };

  const removeRow = (idx: number) => {
    commit(rows.filter((_, i) => i !== idx));
  };

  const setCell = (rowIdx: number, col: string, cellValue: string) => {
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
              <th className="w-8 border-b border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="px-2 py-2 text-center text-[11px] text-gray-400">
                  No rows yet — click “Add row”.
                </td>
              </tr>
            )}
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-gray-100 last:border-b-0">
                {cols.map((c) => (
                  <td key={c} className="border-r border-gray-100 px-1 py-1 last:border-r-0">
                    <input
                      value={row[c] ?? ''}
                      onChange={(e) => setCell(ri, c, e.target.value)}
                      className="w-full rounded border border-transparent px-1.5 py-1 text-xs text-gray-800 focus:border-blue-400 focus:outline-none"
                    />
                  </td>
                ))}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-gray-200 bg-gray-50/60 px-2 py-1.5">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          <Plus className="h-3 w-3" /> Add row
        </button>
      </div>
    </div>
  );
}

function toCustomFields(values: Record<string, string>, defs: ResolvedField[]): Record<string, unknown> {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const trimmed = String(v ?? '').trim();
    if (trimmed === '') continue;
    const def = byKey.get(k);
    const name = def?.name ?? k;
    if (def?.type === 'number') {
      const n = Number(trimmed);
      out[name] = Number.isNaN(n) ? trimmed : n;
    } else if (def?.type === 'boolean') {
      out[name] = trimmed === 'yes';
    } else if (def?.type === 'checkbox_group') {
      out[name] = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (def?.type === 'table') {
      out[name] = parseTableRows(trimmed);
    } else if (def?.type === 'checklist') {
      out[name] = parseCheckedList(trimmed);
    } else {
      out[name] = trimmed;
    }
  }
  return out;
}