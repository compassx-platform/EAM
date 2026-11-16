import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { api } from '../../api/client';
import { navigate } from '../../lib/router';
import { printPieces } from '../../lib/printValue';
import type { EntityField, EntityRecord, ReportBlock, ReportLayout, ResolvedList } from '../../types';

interface PrintPageProps {
  entityType: string;
  recordId: string;
  reportId: string;
}

function placedBlocks(blocks: ReportBlock[]) {
  let cursor = 0;
  return blocks.map((block) => {
    const h = block.h ?? (block.kind === 'heading' || block.kind === 'section' ? 1 : block.kind === 'header' ? 3 : block.kind === 'choices' || block.kind === 'table' ? 6 : block.kind === 'signoff' ? 4 : 2);
    const w = block.w ?? (block.kind === 'field' || block.kind === 'yes_no' ? 6 : 12);
    const x = block.x ?? 0;
    const y = block.y ?? cursor;
    cursor = Math.max(cursor, y + h);
    return { ...block, x, y, w, h };
  });
}

function FieldValue({ value }: { value: unknown }) {
  const pieces = printPieces(value);
  return (
    <div className="min-h-6 border-b border-gray-300 pb-1 text-sm text-gray-900">
      {pieces.map((piece, index) => piece.type === 'image' ? (
        <img key={index} src={piece.src} alt={piece.alt} className="mt-1 max-h-48 max-w-full" />
      ) : (
        <span key={index}>{piece.text}{index < pieces.length - 1 ? ', ' : ''}</span>
      ))}
    </div>
  );
}

function FieldBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <FieldValue value={value} />
    </div>
  );
}

export function PrintPage({ entityType, recordId, reportId }: PrintPageProps) {
  const [layout, setLayout] = useState<ReportLayout | null>(null);
  const [record, setRecord] = useState<EntityRecord | null>(null);
  const [fields, setFields] = useState<EntityField[]>([]);
  const [lists, setLists] = useState<Record<string, ResolvedList>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [report, loaded, registry] = await Promise.all([
          api.getReport(reportId),
          api.getEntity(entityType, recordId),
          api.listFields(entityType),
        ]);
        if (!alive) return;
        if (report.entity_type !== entityType) {
          setError('This print view belongs to a different entity.');
          return;
        }
        setLayout(report);
        setRecord(loaded.entity);
        setFields(registry);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'The print view could not be opened.');
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, [entityType, recordId, reportId]);

  useEffect(() => {
    const keys = fields.map((field) => field.option_list_key).filter((key): key is string => Boolean(key));
    if (keys.length === 0) return;
    let alive = true;
    api.resolveLists(keys).then((result) => { if (alive) setLists(result.resolved); }).catch(() => undefined);
    return () => { alive = false; };
  }, [fields]);

  const labelFor = (name: string) => fields.find((field) => field.field_name === name)?.label || name;
  const valueFor = (name: string) => record?.custom_fields?.[name];
  const fieldFor = (name: string) => fields.find((field) => field.field_name === name);
  const optionsFor = (name: string): string[] => {
    const field = fieldFor(name);
    if (!field) return [];
    if (field.select_options?.length) return field.select_options;
    const list = field.option_list_key ? lists[field.option_list_key] : undefined;
    if (!list) return [];
    return list.items.map((item) => typeof item === 'string' ? item : item.label).filter(Boolean);
  };
  const chosen = (value: unknown) => new Set(
    printPieces(value)
      .flatMap((piece) => piece.type === 'text' ? piece.text.split(',') : [])
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );

  const renderBlock = (block: ReportBlock) => {
    if (block.kind === 'heading') {
      return <h1 className="text-xl font-semibold text-gray-900">{block.text}</h1>;
    }
    if (block.kind === 'section') {
      return <h2 className="border border-gray-800 bg-gray-50 px-2 py-1 text-center text-sm font-semibold">{block.text}</h2>;
    }
    if (block.kind === 'header') {
      return (
        <div className="grid grid-cols-3 border border-gray-800 text-xs">
          <p className="whitespace-pre-wrap border-r border-gray-800 p-2">{block.left}</p>
          <p className="flex items-center justify-center p-2 text-center text-base font-semibold">{block.text}</p>
          <p className="whitespace-pre-wrap border-l border-gray-800 p-2">{block.right}</p>
        </div>
      );
    }
    if (block.kind === 'text') {
      return <p className="whitespace-pre-wrap text-sm text-gray-800">{block.text}</p>;
    }
    if (block.kind === 'field' && block.field_name) {
      return <FieldBlock label={labelFor(block.field_name)} value={valueFor(block.field_name)} />;
    }
    if (block.kind === 'choices' && block.field_name) {
      const marks = chosen(valueFor(block.field_name));
      const options = optionsFor(block.field_name);
      const shown = options.length > 0 ? options : [...marks];
      const columns = block.columns || 2;
      return (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">{labelFor(block.field_name)}</p>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {shown.map((option) => (
              <label key={option} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 inline-flex h-3.5 w-3.5 items-center justify-center border border-gray-800 text-[10px]">{marks.has(option.toLowerCase()) ? '✓' : ''}</span>
                <span>{option}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }
    if (block.kind === 'yes_no' && block.field_name) {
      const marks = chosen(valueFor(block.field_name));
      const yes = marks.has('yes') || marks.has('y');
      const no = marks.has('no') || marks.has('n');
      return (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>{labelFor(block.field_name)}</span>
          <span className="flex gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center border border-gray-800 text-xs">{yes ? 'Y' : ''}</span>
            <span className="inline-flex h-6 w-6 items-center justify-center border border-gray-800 text-xs">{no ? 'N' : ''}</span>
          </span>
        </div>
      );
    }
    if (block.kind === 'signoff') {
      const bound = block.fields || [];
      return (
        <div className="space-y-2 text-sm">
          <p className="font-semibold">{block.text}</p>
          {bound.length === 0 ? (
            <>
              <p>Name <span className="inline-block min-w-40 border-b border-gray-800" /></p>
              <p>Date <span className="inline-block min-w-24 border-b border-gray-800" /> Time <span className="inline-block min-w-16 border-b border-gray-800" /></p>
            </>
          ) : bound.map((name) => (
            <FieldBlock key={name} label={labelFor(name)} value={valueFor(name)} />
          ))}
          <p className="pt-2">Signature <span className="inline-block min-w-48 border-b border-gray-800" /></p>
        </div>
      );
    }
    if (block.kind === 'table') {
      const headers = block.headers || [];
      const count = block.row_count || 5;
      return (
        <div>
          <p className="mb-1 text-sm font-semibold">{block.text}</p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>{headers.map((header) => <th key={header} className="border border-gray-800 px-2 py-1 text-left">{header}</th>)}</tr>
            </thead>
            <tbody>
              {Array.from({ length: count }, (_, index) => (
                <tr key={index}>{headers.map((header) => <td key={header} className="h-7 border border-gray-800" />)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (block.kind === 'row') {
      return (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max((block.fields || []).filter(Boolean).length, 1)}, minmax(0, 1fr))` }}>
          {(block.fields || []).filter(Boolean).map((name, index) => (
            <FieldBlock key={`${name}-${index}`} label={labelFor(name)} value={valueFor(name)} />
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <div className="no-print flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <button type="button" onClick={() => navigate('/records', { type: entityType, selected: recordId })} className="text-xs text-gray-600 hover:text-gray-900">
          Back to record
        </button>
        <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white">
          <Printer className="h-3.5 w-3.5" />
          Print
        </button>
      </div>
      <main className="mx-auto my-6 max-w-[800px] bg-white p-10 shadow-sm print:my-0 print:max-w-none print:shadow-none">
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!error && !layout && <p className="text-sm text-gray-500">Preparing the page…</p>}
        {layout && (
          <div>
            <p className="mb-4 text-[11px] uppercase tracking-wide text-gray-400">{layout.name}</p>
            <div className="grid grid-cols-12 gap-x-4 gap-y-3" style={{ gridAutoRows: 'minmax(1.75rem, auto)' }}>
              {placedBlocks(layout.blocks).map((block) => (
                <div key={block.id} style={{ gridColumn: `${block.x + 1} / span ${block.w}`, gridRow: `${block.y + 1} / span ${block.h}` }}>
                  {renderBlock(block)}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>
    </div>
  );
}
