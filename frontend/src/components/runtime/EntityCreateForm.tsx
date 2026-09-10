import { forwardRef, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { GridLayout, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { ArrowLeft, CheckCircle2, Loader2, FileText, Heading, Zap } from 'lucide-react';
import { api } from '../../api/client';
import { navigate } from '../../lib/router';
import type { EntityField, EntityFormItem } from '../../types';

interface EntityCreateFormProps {
  entityType: string;
  onBack: () => void;
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
        setItems(form.layout || []);
        setFields(form.fields || []);
        setCols(form.cols || 12);
        setRowHeight(form.row_height || 40);
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
  const placed = new Set(items.map((it) => it.i));
  const autoAppended = fields
    .filter((f) => f.required && !placed.has(f.field_name))
    .sort((a, b) => a.field_name.localeCompare(b.field_name));

  const visibleItems = items.filter((it) => it.isHeader || byName.has(it.i));
  const hasLayout = visibleItems.length > 0;
  const fallbackFields =
    !hasLayout && fields.length > 0
      ? [...fields].sort((a, b) => a.field_name.localeCompare(b.field_name))
      : [];

  const submit = async () => {
    setSaving(true);
    setErr(null);
    setSuccess(false);
    try {
      const custom = toCustomFields(values, fields);
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
              {visibleItems.length || autoAppended.length ? 'Form layout' : 'No form layout defined'}
            </span>
            {mounted && <span className="text-[11px] text-gray-400">{cols} cols · {rowHeight}px rows</span>}
          </div>

          {hasLayout || autoAppended.length > 0 || fallbackFields.length > 0 ? (
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
                    className="rounded-lg border border-gray-100 bg-gray-50/50"
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
                          field={byName.get(it.i)!}
                          value={values[it.i] ?? ''}
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
                      field={f}
                      value={values[f.field_name] ?? ''}
                      onChange={(v) => setValues((s) => ({ ...s, [f.field_name]: v }))}
                    />
                  ))}
                </div>
              )}

              {autoAppended.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    Required fields not on the form
                  </div>
                  <div className="flex flex-col gap-2">
                    {autoAppended.map((f) => (
                      <FieldRow
                        key={`auto-${f.field_name}`}
                        field={f}
                        value={values[f.field_name] ?? ''}
                        onChange={(v) => setValues((s) => ({ ...s, [f.field_name]: v }))}
                      />
                    ))}
                  </div>
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
  field: EntityField;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: CSSProperties;
}>(function FillCell({ field, value, onChange, className, style }, ref) {
  const id = useId();
  const input = makeInput(field, id, value, onChange);
  return (
    <div
      ref={ref}
      style={style}
      className={`${className ?? ''} flex h-full w-full items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5`}
    >
      <label htmlFor={id} className="flex w-36 shrink-0 items-center gap-1 truncate text-[11px] font-semibold text-gray-600">
        <FileText className="h-3 w-3 shrink-0 text-gray-400" />
        <span className="truncate">{field.field_name}</span>
        {field.required && <span className="text-red-500">*</span>}
        <span className="ml-auto rounded bg-gray-100 px-1 font-mono text-[9px] text-gray-400">{field.field_type}</span>
      </label>
      <div className="min-w-0 flex-1">{input}</div>
    </div>
  );
});

// --- full-width vertical label+input row (used for auto-appended fields) ----
function FieldRow({
  field,
  value,
  onChange,
}: {
  field: EntityField;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="flex items-center gap-1 text-[11px] font-semibold text-gray-600">
        <FileText className="h-3 w-3 text-gray-400" />
        {field.field_name}
        {field.required && <span className="text-red-500">*</span>}
        <span className="rounded bg-gray-100 px-1 font-mono text-[9px] text-gray-400">{field.field_type}</span>
      </label>
      {makeInput(field, id, value, onChange)}
    </div>
  );
}

function makeInput(
  field: EntityField,
  id: string,
  value: string,
  onChange: (v: string) => void
) {
  const cls = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800';
  if (field.field_type === 'select') {
    return (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">—</option>
        {(field.select_options || []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      id={id}
      type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.field_type === 'entity_reference' ? 'linked entity id' : ''}
      className={cls}
    />
  );
}

function toCustomFields(values: Record<string, string>, fields: EntityField[]): Record<string, unknown> {
  const byName = new Map(fields.map((f) => [f.field_name, f]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const trimmed = v.trim();
    if (trimmed === '') continue;
    const field = byName.get(k);
    if (field?.field_type === 'number') {
      const n = Number(trimmed);
      out[k] = Number.isNaN(n) ? trimmed : n;
    } else {
      out[k] = trimmed;
    }
  }
  return out;
}