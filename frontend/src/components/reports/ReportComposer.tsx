import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { GridLayout, verticalCompactor, type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { ArrowLeft, GripVertical, Loader2, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type { EntityField, ReportBlock } from '../../types';

interface ReportComposerProps {
  reportId: string | null;
  entityType: string;
  onBack: () => void;
}

const COLS = 12;

function blockId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function sizeFor(kind: string): { w: number; h: number } {
  switch (kind) {
    case 'heading':
    case 'section':
      return { w: 12, h: 1 };
    case 'header':
      return { w: 12, h: 3 };
    case 'choices':
    case 'table':
      return { w: 12, h: 6 };
    case 'signoff':
      return { w: 12, h: 4 };
    case 'field':
    case 'yes_no':
      return { w: 6, h: 2 };
    default:
      return { w: 12, h: 2 };
  }
}

function placed(blocks: ReportBlock[]): Array<ReportBlock & { x: number; y: number; w: number; h: number }> {
  let cursor = 0;
  return blocks.map((block) => {
    const fallback = sizeFor(block.kind);
    const h = block.h ?? fallback.h;
    const w = block.w ?? fallback.w;
    const x = block.x ?? 0;
    const y = block.y ?? cursor;
    cursor = Math.max(cursor, y + h);
    return { ...block, x, y, w, h };
  });
}

export function ReportComposer({ reportId, entityType, onBack }: ReportComposerProps) {
  const [name, setName] = useState('Print view');
  const [isDefault, setIsDefault] = useState(false);
  const [blocks, setBlocks] = useState<ReportBlock[]>([]);
  const [fields, setFields] = useState<EntityField[]>([]);
  const [boundType, setBoundType] = useState(entityType);
  const [loading, setLoading] = useState(Boolean(reportId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(720);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dropSize = useRef({ w: 6, h: 2 });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        if (reportId) {
          const layout = await api.getReport(reportId);
          if (!alive) return;
          setName(layout.name);
          setIsDefault(layout.is_default);
          setBlocks(placed(layout.blocks));
          setBoundType(layout.entity_type);
          setFields(await api.listFields(layout.entity_type));
        } else {
          setFields(await api.listFields(entityType));
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'The print view could not be loaded.');
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [reportId, entityType]);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const measure = () => setCanvasWidth(Math.max(node.clientWidth, 320));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading]);

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const field of fields) map[field.field_name] = field.label || field.field_name;
    return map;
  }, [fields]);

  const page = placed(blocks);
  const gridLayout: Layout = page.map((block) => ({
    i: block.id,
    x: block.x,
    y: block.y,
    w: block.w,
    h: block.h,
    minW: 2,
    minH: 1,
  }));

  const update = (id: string, patch: Partial<ReportBlock>) => {
    setBlocks((prev) => prev.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  };

  const nextSpot = (w: number, h: number) => {
    const bottom = page.reduce((max, block) => Math.max(max, block.y + block.h), 0);
    return { x: 0, y: bottom, w, h };
  };

  const addBlock = (block: Omit<ReportBlock, 'id' | 'x' | 'y' | 'w' | 'h'> & { w?: number; h?: number }) => {
    const w = block.w ?? sizeFor(block.kind).w;
    const h = block.h ?? sizeFor(block.kind).h;
    const spot = nextSpot(w, h);
    setBlocks((prev) => [...placed(prev), { ...block, id: blockId(), ...spot, w, h }]);
  };

  const onLayoutChange = (next: Layout) => {
    setBlocks((prev) => prev.map((block) => {
      const hit = next.find((item) => item.i === block.id);
      if (!hit) return block;
      return { ...block, x: hit.x, y: hit.y, w: hit.w, h: hit.h };
    }));
  };

  const startDrag = (payload: string, w: number, h: number) => (event: ReactDragEvent<HTMLButtonElement>) => {
    dropSize.current = { w, h };
    event.dataTransfer.setData('application/x-report-block', payload);
    event.dataTransfer.effectAllowed = 'copy';
  };

  const onDrop = (_next: Layout, item: LayoutItem | undefined, event: Event) => {
    const raw = (event as DragEvent).dataTransfer?.getData('application/x-report-block') || '';
    if (!raw || !item) return;
    const payload = JSON.parse(raw) as Omit<ReportBlock, 'id' | 'x' | 'y' | 'w' | 'h'>;
    setBlocks((prev) => [
      ...placed(prev),
      { ...payload, id: blockId(), x: item.x, y: item.y, w: item.w, h: item.h },
    ]);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveReport({
        id: reportId || undefined,
        entity_type: boundType,
        name: name.trim(),
        is_default: isDefault,
        blocks: placed(blocks),
      });
      if (!reportId) window.location.hash = `#/reports/${saved.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The print view could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="flex items-center gap-2 p-6 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading print view…</p>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100" title="Back to print views">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold text-gray-900">{reportId ? 'Edit print view' : 'New print view'}</h1>
            <p className="text-[11px] text-gray-500">Drag blocks on the page. Resize a block to set how many columns it uses.</p>
          </div>
        </div>
        <button
          type="button"
          disabled={saving || !name.trim()}
          onClick={() => void save()}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="mx-5 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-5 lg:grid-cols-[16rem_1fr]">
        <aside className="overflow-auto rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-3 space-y-2">
            <label className="block text-[11px] text-gray-500">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              Default for this entity
            </label>
          </div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Pieces</p>
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" draggable onDragStart={startDrag(JSON.stringify({ kind: 'header', text: 'Document title', left: 'Organization', right: 'Document no.\nRevision' }), 12, 3)} onClick={() => addBlock({ kind: 'header', text: 'Document title', left: 'Organization', right: 'Document no.\nRevision' })} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">Header</button>
            <button type="button" draggable onDragStart={startDrag(JSON.stringify({ kind: 'section', text: 'Section' }), 12, 1)} onClick={() => addBlock({ kind: 'section', text: 'Section' })} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">Section</button>
            <button type="button" draggable onDragStart={startDrag(JSON.stringify({ kind: 'heading', text: 'Heading' }), 12, 1)} onClick={() => addBlock({ kind: 'heading', text: 'Heading' })} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">Heading</button>
            <button type="button" draggable onDragStart={startDrag(JSON.stringify({ kind: 'text', text: 'Text' }), 12, 2)} onClick={() => addBlock({ kind: 'text', text: 'Text' })} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">Text</button>
            <button type="button" draggable onDragStart={startDrag(JSON.stringify({ kind: 'choices', field_name: '', columns: 2 }), 12, 6)} onClick={() => addBlock({ kind: 'choices', field_name: '', columns: 2 })} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">Choice grid</button>
            <button type="button" draggable onDragStart={startDrag(JSON.stringify({ kind: 'yes_no', field_name: '' }), 6, 2)} onClick={() => addBlock({ kind: 'yes_no', field_name: '' })} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">Yes / No</button>
            <button type="button" draggable onDragStart={startDrag(JSON.stringify({ kind: 'signoff', text: 'Approver', fields: [] }), 12, 4)} onClick={() => addBlock({ kind: 'signoff', text: 'Approver', fields: [] })} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">Sign-off</button>
            <button type="button" draggable onDragStart={startDrag(JSON.stringify({ kind: 'table', text: 'Table', headers: ['Name', 'Id', 'Sign'], row_count: 5 }), 12, 6)} onClick={() => addBlock({ kind: 'table', text: 'Table', headers: ['Name', 'Id', 'Sign'], row_count: 5 })} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700">Lined table</button>
          </div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Fields</p>
          <ul className="space-y-1">
            {fields.map((field) => (
              <li key={field.field_name}>
                <button
                  type="button"
                  draggable
                  onDragStart={startDrag(JSON.stringify({ kind: 'field', field_name: field.field_name }), 6, 2)}
                  onClick={() => addBlock({ kind: 'field', field_name: field.field_name })}
                  className="flex w-full cursor-grab items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-gray-800 hover:bg-gray-50"
                >
                  <GripVertical className="h-3 w-3 text-gray-300" />
                  <span>{field.label || field.field_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section className="overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-6">
          <div ref={canvasRef} className="mx-auto min-h-[640px] max-w-[720px] bg-white p-4 shadow-sm">
            <GridLayout
              width={canvasWidth - 32}
              layout={gridLayout}
              gridConfig={{ cols: COLS, rowHeight: 36, margin: [12, 12], containerPadding: [0, 0] }}
              dragConfig={{ enabled: true, handle: '.drag-handle' }}
              resizeConfig={{ enabled: true }}
              dropConfig={{ enabled: true }}
              compactor={verticalCompactor}
              droppingItem={{ i: '__dropping__', x: 0, y: 0, w: dropSize.current.w, h: dropSize.current.h }}
              onLayoutChange={onLayoutChange}
              onDrop={onDrop}
              onDropDragOver={() => dropSize.current}
              className="min-h-[600px]"
            >
              {page.map((block) => (
                <div key={block.id} className="h-full overflow-hidden rounded-md border border-gray-200 bg-white">
                  <div className="flex items-start gap-1 p-2">
                    <button type="button" className="drag-handle cursor-grab text-gray-300" title="Drag"><GripVertical className="h-3.5 w-3.5" /></button>
                    <div className="min-w-0 flex-1">
                      {block.kind === 'heading' && (
                        <input value={block.text || ''} onChange={(e) => update(block.id, { text: e.target.value })} className="w-full border-0 text-sm font-semibold text-gray-900 focus:outline-none" />
                      )}
                      {block.kind === 'section' && (
                        <input value={block.text || ''} onChange={(e) => update(block.id, { text: e.target.value })} className="w-full border-0 bg-gray-50 text-center text-xs font-semibold text-gray-900 focus:outline-none" />
                      )}
                      {block.kind === 'header' && (
                        <div className="grid grid-cols-3 gap-1 text-[10px]">
                          <textarea value={block.left || ''} onChange={(e) => update(block.id, { left: e.target.value })} rows={2} className="resize-none border border-gray-100 p-1" />
                          <input value={block.text || ''} onChange={(e) => update(block.id, { text: e.target.value })} className="border border-gray-100 text-center text-xs font-semibold" />
                          <textarea value={block.right || ''} onChange={(e) => update(block.id, { right: e.target.value })} rows={2} className="resize-none border border-gray-100 p-1" />
                        </div>
                      )}
                      {block.kind === 'text' && (
                        <textarea value={block.text || ''} onChange={(e) => update(block.id, { text: e.target.value })} rows={2} className="w-full resize-none border-0 text-xs text-gray-700 focus:outline-none" />
                      )}
                      {(block.kind === 'field' || block.kind === 'choices' || block.kind === 'yes_no') && (
                        <select value={block.field_name || ''} onChange={(e) => update(block.id, { field_name: e.target.value })} className="w-full rounded border border-gray-200 px-1 py-0.5 text-[11px]">
                          <option value="">{block.kind === 'choices' ? 'Choice field' : block.kind === 'yes_no' ? 'Yes / No field' : 'Field'}</option>
                          {fields.map((field) => <option key={field.field_name} value={field.field_name}>{field.label || field.field_name}</option>)}
                        </select>
                      )}
                      {block.kind === 'signoff' && (
                        <div className="space-y-1">
                          <input value={block.text || ''} onChange={(e) => update(block.id, { text: e.target.value })} className="w-full border-0 text-xs font-semibold focus:outline-none" placeholder="Role" />
                          <select value={(block.fields || [])[0] || ''} onChange={(e) => update(block.id, { fields: e.target.value ? [e.target.value] : [] })} className="w-full rounded border border-gray-200 px-1 py-0.5 text-[11px]">
                            <option value="">Name field, optional</option>
                            {fields.map((field) => <option key={field.field_name} value={field.field_name}>{field.label || field.field_name}</option>)}
                          </select>
                        </div>
                      )}
                      {block.kind === 'table' && (
                        <div className="space-y-1">
                          <input value={block.text || ''} onChange={(e) => update(block.id, { text: e.target.value })} className="w-full border-0 text-xs font-semibold focus:outline-none" placeholder="Table title" />
                          <input value={(block.headers || []).join(', ')} onChange={(e) => update(block.id, { headers: e.target.value.split(',').map((part) => part.trim()).filter(Boolean) })} className="w-full rounded border border-gray-200 px-1 py-0.5 text-[11px]" placeholder="Column, Column" />
                        </div>
                      )}
                      {block.kind === 'row' && (
                        <p className="truncate text-xs text-gray-800">{(block.fields || []).map((name) => labels[name] || name).join(' · ')}</p>
                      )}
                    </div>
                    <button type="button" onClick={() => setBlocks((prev) => prev.filter((item) => item.id !== block.id))} className="text-gray-300 hover:text-red-600" title="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </GridLayout>
          </div>
        </section>
      </div>
    </div>
  );
}
