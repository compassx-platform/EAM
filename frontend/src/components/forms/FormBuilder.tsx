import { useEffect, useMemo, useState } from 'react';
import {
  GridLayout,
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { ArrowLeft, CheckCircle2, Loader2, Plus, Save, Trash2, Heading, FileText } from 'lucide-react';
import { api } from '../../api/client';
import type { EntityField, EntityFormItem } from '../../types';

interface FormBuilderProps {
  entityType: string;
  onBack: () => void;
  onChanged: () => void;
}

const FIELD_TYPE_STYLE: Record<string, string> = {
  text: 'text-sky-700 bg-sky-50 border-sky-200',
  number: 'text-violet-700 bg-violet-50 border-violet-200',
  date: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  select: 'text-amber-700 bg-amber-50 border-amber-200',
  entity_reference: 'text-rose-700 bg-rose-50 border-rose-200',
};

let headerCounter = 0;
function nextHeaderId() {
  headerCounter += 1;
  return `header:section-${Date.now().toString(36)}-${headerCounter}`;
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

  const placed = useMemo(() => new Set(items.map((it) => it.i)), [items]);
  const unplacedFields = useMemo(() => fields.filter((f) => !placed.has(f.field_name)), [fields, placed]);

  const addHeading = () => {
    const y = nextY(items, cols);
    setItems((prev) => [
      ...prev,
      { i: nextHeaderId(), x: 0, y, w: cols, h: 1, isHeader: true, label: 'New Section' },
    ]);
    setDirty(true);
  };

  const addField = (field: EntityField) => {
    const y = nextY(items, cols);
    setItems((prev) => [
      ...prev,
      { i: field.field_name, x: 0, y, w: Math.max(6, Math.round(cols / 2)), h: 1 },
    ]);
    setSelected(field.field_name);
    setDirty(true);
  };

  const handleLayoutChange = (layout: Layout) => {
    const byId = new Map(items.map((it) => [it.i, it]));
    setItems(
      layout.map((li: LayoutItem) => {
        const existing = byId.get(li.i);
        return {
          i: li.i,
          x: li.x,
          y: li.y,
          w: li.w,
          h: li.h,
          isHeader: existing?.isHeader,
          label: existing?.label,
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
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">Unplaced fields</h3>
            <button
              onClick={addHeading}
              className="mb-2 flex w-full items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-2.5 py-2 text-left text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50"
            >
              <Heading className="h-4 w-4 text-blue-600" /> Add a section heading
            </button>
            {unplacedFields.length === 0 ? (
              <p className="text-xs text-gray-400">
                All fields are placed. Register more fields for <span className="font-mono">{entityType}</span> to add
                them here.
              </p>
            ) : (
              unplacedFields.map((f) => (
                <button
                  key={f.field_name}
                  onClick={() => addField(f)}
                  className="mb-1.5 flex w-full items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-left hover:border-blue-300 hover:bg-blue-50"
                >
                  <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-800">{f.field_name}</span>
                    <span className="block text-[11px] text-gray-400">
                      {f.field_type}
                      {f.required ? ' · required' : ''}
                    </span>
                  </span>
                  <Plus className="h-4 w-4 shrink-0 text-blue-600" />
                </button>
              ))
            )}
          </div>
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
                const field = !it.isHeader ? fields.find((f) => f.field_name === it.i) : undefined;
                const isSelected = selected === it.i;
                const chipStyle = it.isHeader
                  ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                  : FIELD_TYPE_STYLE[field?.field_type ?? 'text'] || FIELD_TYPE_STYLE.text;

                return (
                  <div
                    key={it.i}
                    onClick={() => setSelected(it.i)}
                    className={`group flex h-full w-full flex-col rounded-md border bg-white p-2 ${
                      isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                    }`}
                  >
                    <div className="drag-handle flex cursor-grab items-center gap-1.5">
                      {it.isHeader ? (
                        <Heading className="h-4 w-4 text-indigo-600" />
                      ) : field ? (
                        <FileText className="h-4 w-4 text-gray-400" />
                      ) : (
                        <FileText className="h-4 w-4 text-red-500" />
                      )}
                      <span className="truncate text-sm font-semibold text-gray-800">
                        {it.isHeader ? it.label : it.i}
                      </span>
                      <span className={`ml-auto rounded border px-1 font-mono text-[9px] ${chipStyle}`}>
                        {it.isHeader ? 'section' : field?.field_type || 'unknown'}
                      </span>
                    </div>
                    {!it.isHeader && field?.required && (
                      <span className="mt-1 text-[11px] text-red-500">required field</span>
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

            {selectedItem.isHeader && (
              <div className="mt-3 flex flex-col gap-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Heading text</label>
                <input
                  value={selectedItem.label ?? ''}
                  onChange={(e) => patchItem(selectedItem.i, { label: e.target.value })}
                  placeholder="Section title"
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
                />
              </div>
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
