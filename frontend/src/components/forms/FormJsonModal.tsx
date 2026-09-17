import { useState } from 'react';
import {
  Code2,
  Copy,
  ClipboardCheck,
  Upload,
  X,
} from 'lucide-react';
import type { EntityFormItem } from '../../types';
import { normalizeFormLayout } from './formUtils';

interface FormJsonModalProps {
  entityType: string;
  items: EntityFormItem[];
  cols: number;
  rowHeight: number;
  onClose: () => void;
  onImport: (items: EntityFormItem[], cols: number, rowHeight: number) => void;
}

export function FormJsonModal({
  entityType,
  items,
  cols,
  rowHeight,
  onClose,
  onImport,
}: FormJsonModalProps) {
  const initialJson = JSON.stringify(
    {
      entity_type: entityType,
      cols,
      row_height: rowHeight,
      layout: items.map((it) => {
        const copy: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(it)) {
          if (v !== undefined && v !== null) copy[k] = v;
        }
        return copy;
      }),
    },
    null,
    2
  );

  const [jsonDraft, setJsonDraft] = useState(initialJson);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonDraft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Unable to copy automatically. Please select text manually.');
    }
  };

  const handleImport = () => {
    setError(null);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonDraft);
    } catch {
      setError('Invalid JSON syntax — please check formatting and comma placement.');
      return;
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.layout)) {
      setError('Imported JSON must be an object with a "layout" array.');
      return;
    }

    const nextCols = Number(parsed.cols) >= 1 ? Math.round(Number(parsed.cols)) : cols;
    const nextRowHeight =
      Number(parsed.row_height) >= 1 ? Math.round(Number(parsed.row_height)) : rowHeight;

    const normalized = normalizeFormLayout(parsed.layout, nextCols);
    onImport(normalized, nextCols, nextRowHeight);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs" onMouseDown={onClose}>
      <div
        className="flex h-[80vh] max-h-[700px] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Code2 className="h-5 w-5 text-blue-700" />
            <div>
              <h3 className="text-sm font-bold text-gray-900">Form Schema JSON</h3>
              <p className="text-[11px] text-gray-400">
                View, copy to export, or paste schema to import a form layout.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {copied ? <ClipboardCheck className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
              <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="flex items-center gap-1.5 rounded-md bg-blue-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-800"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import Layout</span>
            </button>
          </div>

          <span className="text-[11px] text-gray-400 font-mono">
            {items.length} item(s) · {cols} cols · {rowHeight}px row height
          </span>
        </div>

        {/* Error message */}
        {error && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        {/* Textarea Editor */}
        <div className="flex min-h-0 flex-1 p-4 bg-gray-950">
          <textarea
            value={jsonDraft}
            onChange={(e) => {
              setJsonDraft(e.target.value);
              if (error) setError(null);
            }}
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent font-mono text-xs leading-relaxed text-emerald-400 outline-none"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Apply Changes</span>
          </button>
        </div>
      </div>
    </div>
  );
}
