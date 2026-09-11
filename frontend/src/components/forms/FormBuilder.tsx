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
} from 'lucide-react';
import { api } from '../../api/client';
import type { EntityField, EntityFormItem, GenericFieldType } from '../../types';

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

// Non-interactive preview of the control a field will render as in the real
// form, using the exact same widget styling as the fill-in form.
// pointer-events-none keeps drag/clicks from fighting the grid.
function ControlPreview({
  type,
  options,
  placeholder,
  height = 3,
}: {
  type?: string;
  options?: string[];
  placeholder?: string | null;
  height?: number;
}) {
  const inputCls =
    'pointer-events-none w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 select-none';
  const choiceCls = 'flex items-center gap-1 text-xs text-gray-700';
  const choiceInput = 'pointer-events-none accent-blue-600';

  if (type === 'long_text') {
    return (
      <textarea
        rows={Math.max(2, Math.round((height * 40) / 24))}
        placeholder={placeholder || ''}
        className={`${inputCls} h-full min-h-[30px] resize-none leading-snug`}
      />
    );
  }

  if (type === 'selection' || type === 'checkbox_group') {
    if (!options || options.length === 0) {
      return <span className="text-[11px] text-gray-400">No options defined</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {options.map((o) => (
          <label key={o} className={choiceCls}>
            <input
              type={type === 'selection' ? 'radio' : 'checkbox'}
              className={choiceInput}
              name={type === 'selection' ? 'preview' : undefined}
            />
            {o}
          </label>
        ))}
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
        {(options || []).map((o) => (
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

  const { width, containerRef, mounted } = useContainerWidth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const form = await api.getForm(entityType);
        if (cancelled) return;
        setItems((form.layout || []) as EntityFormItem[]);
        setFields(form.fields || []);
        setCols(form.cols || 12);
        setRowHeight(form.row_height || 40);
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
        placeholder: '',
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
      prev.map((it) =>
        it.i === id ? { ...it, options: [...(it.options || []), `Option ${(it.options || []).length + 1}`] } : it
      )
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
      await api.saveForm({
        entity_type: entityType,
        layout: items,
        cols,
        row_height: rowHeight,
      });
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
            <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">Sections</h3>
            <button
              onClick={addHeading}
              className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-2.5 py-2 text-left text-sm text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <Heading className="h-4 w-4 shrink-0 text-indigo-500" /> Add section heading
            </button>
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
                  .filter((f) => !items.some((it) => !it.isHeader && (it.fieldName || it.i) === f.field_name))
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
                Drop a section heading or a field block from the palette on the left to start building this form.
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
                const type = it.isHeader
                  ? undefined
                  : it.fieldType ?? fields.find((f) => f.field_name === it.i)?.field_type;
                const label = it.isHeader ? it.label : it.label || it.fieldName || it.i;
                const stateCls = isSelected
                  ? 'border-blue-400 bg-blue-50/50'
                  : 'border-transparent hover:border-gray-200 hover:bg-gray-50/70';

                return (
                  <div
                    key={it.i}
                    onClick={() => setSelected(it.i)}
                    className={`drag-handle cursor-grab group flex h-full w-full items-center gap-2 rounded-md border px-2 transition-colors ${stateCls}`}
                  >
                    {it.isHeader ? (
                      <span className="flex w-full items-center gap-1.5 text-sm font-semibold text-indigo-700">
                        <GripVertical className="h-4 w-4 shrink-0 text-indigo-300 opacity-0 transition-opacity group-hover:opacity-100" />
                        <Heading className="h-4 w-4 shrink-0" />
                        <span className="truncate">{label}</span>
                      </span>
                    ) : (
                      <>
                        <GripVertical className="h-4 w-4 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
                        <span className="w-32 shrink-0 truncate text-xs font-medium text-gray-700">
                          {label}
                          {it.required && <span className="text-red-500">*</span>}
                        </span>
                        {type && (
                          <span className="shrink-0 rounded bg-gray-100 px-1 font-mono text-[9px] text-gray-400">
                            {type}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <ControlPreview type={type} options={it.options} placeholder={it.placeholder} height={it.h} />
                        </div>
                      </>
                    )}
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
              {selectedItem ? (selectedItem.isHeader ? 'Section settings' : 'Field settings') : 'Nothing selected'}
            </p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {!selectedItem ? (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
                <MousePointerClick className="h-6 w-6 text-gray-300" />
                <p className="text-xs font-medium text-gray-400">Nothing selected</p>
                <p className="max-w-[190px] text-[11px] leading-relaxed text-gray-300">
                  Click a field or section on the canvas to edit it here.
                </p>
              </div>
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

                <InspectorField label="Size" hint="Width in columns · height in rows.">
                  <SizeInputs item={selectedItem} maxW={cols} onChange={(p) => patchItem(selectedItem.i, p)} />
                </InspectorField>
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
                          t === 'selection' || t === 'checkbox_group' || t === 'dropdown'
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
                  selectedItem.fieldType === 'url') && (
                  <InspectorField label="Placeholder" hint="Shown inside the control when it is empty.">
                    <input
                      value={selectedItem.placeholder ?? ''}
                      onChange={(e) => patchItem(selectedItem.i, { placeholder: e.target.value })}
                      placeholder="Optional hint text"
                      className={INSPECTOR_INPUT}
                    />
                  </InspectorField>
                )}

                {(selectedItem.fieldType === 'selection' ||
                  selectedItem.fieldType === 'checkbox_group' ||
                  selectedItem.fieldType === 'dropdown') && (
                  <InspectorField label="Options">
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
                            title="Remove option"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addOption(selectedItem.i)}
                        className="flex items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add option
                      </button>
                    </div>
                  </InspectorField>
                )}

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
    </div>
  );
}