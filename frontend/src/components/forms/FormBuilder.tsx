import { useEffect, useState } from 'react';
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
}

const FIELD_TYPE_DEFS: FieldTypeDef[] = [
  { type: 'text', label: 'Text', hint: 'Single-line text input', defaultFieldName: 'text_field', defaultOptions: [] },
  { type: 'long_text', label: 'Long text', hint: 'Multi-line text area', defaultFieldName: 'long_text_field', defaultOptions: [] },
  { type: 'selection', label: 'Selection', hint: 'Radio buttons, choose one', defaultFieldName: 'selection_field', defaultOptions: ['Option 1', 'Option 2'] },
  { type: 'dropdown', label: 'Dropdown', hint: 'Pick from a list', defaultFieldName: 'dropdown_field', defaultOptions: ['Option 1', 'Option 2'] },
];

const FIELD_TYPE_STYLE: Record<string, string> = {
  text: 'text-sky-700 bg-sky-50 border-sky-200',
  long_text: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  selection: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  dropdown: 'text-amber-700 bg-amber-50 border-amber-200',
  number: 'text-violet-700 bg-violet-50 border-violet-200',
  date: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  select: 'text-amber-700 bg-amber-50 border-amber-200',
  entity_reference: 'text-rose-700 bg-rose-50 border-rose-200',
};

function fieldIcon(type?: string) {
  switch (type) {
    case 'text':
      return Type;
    case 'long_text':
      return AlignLeft;
    case 'selection':
      return ListChecks;
    case 'dropdown':
      return ChevronDown;
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
    case 'selection':
      return 'text-emerald-600';
    case 'dropdown':
      return 'text-amber-600';
    default:
      return 'text-gray-400';
  }
}

// Disabled, non-interactive preview of the control a field will render as in
// the real form. pointer-events-none keeps drag/clicks from fighting the grid.
function ControlPreview({
  type,
  options,
  placeholder,
  tall,
}: {
  type?: string;
  options?: string[];
  placeholder?: string | null;
  tall?: boolean;
}) {
  const inputCls =
    'pointer-events-none w-full rounded-md border border-gray-200 bg-gray-50/60 px-2 py-1.5 text-sm text-gray-500 select-none';

  if (type === 'long_text') {
    return (
      <textarea
        disabled
        rows={tall ? 3 : 1}
        placeholder={placeholder || 'Long text…'}
        className={`${inputCls} min-h-[28px] resize-none leading-snug`}
      />
    );
  }

  if (type === 'selection') {
    if (!options || options.length === 0) {
      return <span className="text-[11px] text-gray-400">No options defined</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {options.map((o) => (
          <label key={o} className="flex cursor-pointer items-center gap-1 text-xs text-gray-600">
            <input type="radio" disabled className="pointer-events-none accent-blue-600" />
            {o}
          </label>
        ))}
      </div>
    );
  }

  if (type === 'dropdown' || type === 'select') {
    return (
      <select disabled className={inputCls}>
        <option>—</option>
        {(options || []).map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  }

  if (type === 'number') {
    return <input disabled type="number" className={inputCls} placeholder="0" />;
  }
  if (type === 'date') {
    return <input disabled type="date" className={inputCls} />;
  }
  if (type === 'entity_reference') {
    return <input disabled type="text" className={inputCls} placeholder="linked entity id" />;
  }
  return <input disabled type="text" className={inputCls} placeholder={placeholder || 'Type here…'} />;
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
        h: type === 'long_text' ? 3 : type === 'selection' ? 2 : 1,
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
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" /> Forms
        </button>

        <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-semibold text-blue-700">{entityType}</span>

        {dirty && <span className="text-[11px] font-medium text-amber-600">Unsaved changes</span>}
        {!loaded && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        {mounted && (
          <span className="text-[11px] text-gray-400">canvas: {Math.round(width)}px · {cols} cols</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {notice && (
            <span className={`flex items-center gap-1 text-xs ${notice.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
              {notice.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
              {notice.text}
            </span>
          )}
          <button
            onClick={handleDeleteForm}
            disabled={deleting || saving}
            className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Form
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Palette */}
        <div className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-gray-200 bg-gray-50 p-3">
          <div>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">Section</h3>
            <button
              onClick={addHeading}
              className="mb-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-2.5 py-2 text-left text-sm text-gray-700 hover:border-indigo-300 hover:bg-indigo-50"
            >
              <Heading className="h-4 w-4 text-indigo-600" /> Add a section heading
            </button>
          </div>

          <div>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">Fields</h3>
            <div className="flex flex-col gap-1.5">
              {FIELD_TYPE_DEFS.map((def) => (
                <button
                  key={def.type}
                  onClick={() => addField(def.type)}
                  className="flex w-full items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-left hover:border-blue-300 hover:bg-blue-50"
                >
                  {(() => {
                    const Icon = fieldIcon(def.type);
                    return <Icon className={`h-4 w-4 shrink-0 ${iconColor(def.type)}`} />;
                  })()}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-800">{def.label}</span>
                    <span className="block text-[11px] text-gray-400">{def.hint}</span>
                  </span>
                  <Plus className="h-4 w-4 shrink-0 text-blue-600" />
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-gray-400">
              Click a field type to drop it on the canvas, then configure it in the inspector. Fields are stored as part
              of the form.
            </p>
          </div>

          {fields.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">Registered fields</h3>
              {fields
                .filter((f) => !items.some((it) => !it.isHeader && (it.fieldName || it.i) === f.field_name))
                .map((f) => (
                  <div
                    key={f.field_name}
                    className="mb-1 flex items-center gap-2 rounded-md border border-dashed border-gray-200 bg-white/60 px-2.5 py-2"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-gray-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-400">{f.field_name}</span>
                      <span className="block text-[11px] text-gray-300">
                        {f.field_type}
                        {f.required ? ' · required' : ''}
                      </span>
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="min-w-0 flex-1 overflow-y-auto bg-[#f8fafc] p-4">
          {mounted && (
            <GridLayout
              width={width}
              layout={items}
              compactor={verticalCompactor}
              gridConfig={{ cols, rowHeight, margin: [12, 12], containerPadding: [12, 12] }}
              dragConfig={{ enabled: true, handle: '.drag-handle', threshold: 3 }}
              resizeConfig={{ enabled: true, handles: ['se'] }}
              onLayoutChange={handleLayoutChange}
              className="!bg-white rounded-lg border border-gray-200 shadow-sm"
            >
              {items.map((it) => {
                const isSelected = selected === it.i;
                const type = it.isHeader
                  ? undefined
                  : it.fieldType ?? fields.find((f) => f.field_name === it.i)?.field_type;
                const chipStyle = it.isHeader
                  ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                  : FIELD_TYPE_STYLE[type ?? 'text'] || FIELD_TYPE_STYLE.text;
                const Icon = it.isHeader ? Heading : fieldIcon(type);
                const label = it.isHeader ? it.label : it.label || it.fieldName || it.i;

                return (
                  <div
                    key={it.i}
                    onClick={() => setSelected(it.i)}
                    className={`group flex h-full w-full flex-col rounded-md border bg-white p-2 ${
                      isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                    }`}
                  >
                    {it.isHeader ? (
                      <div className="drag-handle flex h-full w-full cursor-grab items-center gap-1.5 rounded-md bg-indigo-50 px-3 text-sm font-bold text-indigo-700">
                        <Heading className="h-4 w-4 shrink-0" />
                        <span className="truncate">{label}</span>
                        <span className={`ml-auto rounded border px-1 font-mono text-[9px] ${chipStyle}`}>section</span>
                      </div>
                    ) : (
                      <>
                        <div className="drag-handle flex cursor-grab items-center gap-1.5">
                          <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                          <span className="truncate text-sm font-semibold text-gray-800">{label}</span>
                          {it.required && <span className="text-red-500">*</span>}
                          <span className={`ml-auto rounded border px-1 font-mono text-[9px] ${chipStyle}`}>
                            {type || 'unknown'}
                          </span>
                        </div>
                        <div className="mt-1 min-h-0 flex-1">
                          <ControlPreview
                            type={type}
                            options={it.options}
                            placeholder={it.placeholder}
                            tall={it.fieldType === 'long_text'}
                          />
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
        {selectedItem && (
          <div className="w-72 shrink-0 border-l border-gray-200 bg-white p-4">
            <h3 className="text-sm font-bold text-gray-800">
              {selectedItem.isHeader ? 'Section' : 'Field'} Inspector
            </h3>

            <div className="mt-3 flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Width (cols)</label>
              <input
                type="number"
                min={1}
                max={cols}
                value={selectedItem.w}
                onChange={(e) => patchItem(selectedItem.i, { w: Math.max(1, Math.min(cols, Number(e.target.value) || 1)) })}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
              />
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Height (rows)</label>
              <input
                type="number"
                min={1}
                value={selectedItem.h}
                onChange={(e) => patchItem(selectedItem.i, { h: Math.max(1, Number(e.target.value) || 1) })}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
              />
            </div>

            {selectedItem.isHeader ? (
              <div className="mt-3 flex flex-col gap-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Heading text</label>
                <input
                  value={selectedItem.label ?? ''}
                  onChange={(e) => patchItem(selectedItem.i, { label: e.target.value })}
                  placeholder="Section title"
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
                />
              </div>
            ) : (
              <>
                <div className="mt-3 flex flex-col gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Field label</label>
                  <input
                    value={selectedItem.label ?? ''}
                    onChange={(e) => patchItem(selectedItem.i, { label: e.target.value })}
                    placeholder="Visible label"
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
                  />
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Field name (stored key)
                  </label>
                  <input
                    value={selectedItem.fieldName ?? ''}
                    onChange={(e) => patchItem(selectedItem.i, { fieldName: e.target.value })}
                    placeholder={selectedItem.i}
                    className="rounded-md border border-gray-300 px-2 py-1.5 font-mono text-sm text-gray-800"
                  />
                  <span className="text-[10px] text-gray-400">
                    The key the value is stored under on the record.
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Field type</label>
                  <select
                    value={selectedItem.fieldType ?? ''}
                    onChange={(e) => {
                      const t = e.target.value as GenericFieldType;
                      const def = FIELD_TYPE_DEFS.find((d) => d.type === t);
                      patchItem(selectedItem.i, {
                        fieldType: t,
                        options:
                          t === 'selection' || t === 'dropdown'
                            ? (selectedItem.options?.length ? selectedItem.options : [...(def?.defaultOptions ?? [])])
                            : selectedItem.options,
                      });
                    }}
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
                  >
                    {FIELD_TYPE_DEFS.map((def) => (
                      <option key={def.type} value={def.type}>
                        {def.label}
                      </option>
                    ))}
                  </select>
                </div>

                {(selectedItem.fieldType === 'text' || selectedItem.fieldType === 'long_text') && (
                  <div className="mt-3 flex flex-col gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Placeholder</label>
                    <input
                      value={selectedItem.placeholder ?? ''}
                      onChange={(e) => patchItem(selectedItem.i, { placeholder: e.target.value })}
                      placeholder="Optional hint text"
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
                    />
                  </div>
                )}

                {(selectedItem.fieldType === 'selection' || selectedItem.fieldType === 'dropdown') && (
                  <div className="mt-3 flex flex-col gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Options</label>
                    {(selectedItem.options || []).map((o, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <input
                          value={o}
                          onChange={(e) => patchOption(selectedItem.i, idx, e.target.value)}
                          className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
                        />
                        <button
                          onClick={() => removeOption(selectedItem.i, idx)}
                          className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Remove option"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addOption(selectedItem.i)}
                      className="flex items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add option
                    </button>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2">
                  <input
                    id="field-required"
                    type="checkbox"
                    checked={Boolean(selectedItem.required)}
                    onChange={(e) => patchItem(selectedItem.i, { required: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                  />
                  <label htmlFor="field-required" className="text-xs font-medium text-gray-700">
                    Required
                  </label>
                </div>
              </>
            )}

            <button
              onClick={() => removeItem(selectedItem.i)}
              className="mt-4 flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Remove from form
            </button>
          </div>
        )}
      </div>
    </div>
  );
}