import { useState, useRef, useEffect } from 'react';
import {
  MousePointerClick,
  Trash2,
  Plus,
  Minus,
  X,
  Eye,
  EyeOff,
  Layers,
  Info,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ListFilter,
  Paperclip,
  Settings2,
} from 'lucide-react';
import type {
  EntityFormItem,
  OptionListSummary,
  ResolvedList,
  ChecklistItem,
  ConditionDefinition,
  GenericFieldType,
} from '../../types';
import { FIELD_TYPE_DEFS } from './formUtils';

interface FormInspectorProps {
  selectedItem: EntityFormItem | null;
  allItems: EntityFormItem[];
  cols: number;
  publishedLists: OptionListSummary[];
  resolvedLists: Record<string, ResolvedList>;
  conditions: ConditionDefinition[];
  entityType: string;
  onPatchItem: (id: string, patch: Partial<EntityFormItem>) => void;
  onRemoveItem: (id: string) => void;
  onEnsureResolved: (keys: (string | null | undefined)[]) => void;
  onOpenConditionModal: (condition?: ConditionDefinition | null, anchorY?: number | null) => void;
  onCreateGroup: () => string; // returns new group ID
}

const INPUT_CLS =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

function computeAnchoredDialogStyle(anchorY?: number | null, estimatedHeight = 440) {
  const PADDING = 16;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  if (anchorY === null || anchorY === undefined) {
    return {
      top: 64,
      arrowTop: null,
    };
  }
  const desiredTop = anchorY - 48;
  const top = Math.max(PADDING, Math.min(vh - estimatedHeight - PADDING, desiredTop));
  const arrowTop = Math.max(16, Math.min(estimatedHeight - 20, anchorY - top - 7));
  return { top, arrowTop };
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <Info className="h-3 w-3 cursor-default text-gray-400 transition-colors hover:text-gray-600" />
      <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-56 rounded-md border border-gray-700 bg-slate-900 px-2 py-1.5 text-[10px] font-medium normal-case leading-snug text-white shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}

function InspectorField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          {label}
        </label>
        {hint && <InfoTooltip text={hint} />}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modals for Progressive Deep Configuration
// ---------------------------------------------------------------------------

function ItemVisibilityModal({
  title,
  listKey,
  items,
  hiddenOptions,
  anchorY,
  onSave,
  onClose,
}: {
  title: string;
  listKey: string;
  items: (string | ChecklistItem)[];
  hiddenOptions: string[];
  anchorY?: number | null;
  onSave: (hidden: string[]) => void;
  onClose: () => void;
}) {
  const [localHidden, setLocalHidden] = useState<string[]>(hiddenOptions || []);
  const [search, setSearch] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const { top, arrowTop } = computeAnchoredDialogStyle(anchorY, 440);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutside);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [onClose]);

  const hiddenSet = new Set(localHidden);

  const filteredItems = items.filter((raw) => {
    const label = typeof raw === 'string' ? raw : raw.label;
    return label.toLowerCase().includes(search.toLowerCase());
  });

  const toggleItem = (label: string) => {
    const next = new Set(hiddenSet);
    if (next.has(label)) {
      next.delete(label);
    } else {
      next.add(label);
    }
    const updated = Array.from(next);
    setLocalHidden(updated);
    onSave(updated);
  };

  const handleShowAll = () => {
    setLocalHidden([]);
    onSave([]);
  };

  const handleHideAll = () => {
    const allLabels = items.map((raw) => (typeof raw === 'string' ? raw : raw.label));
    setLocalHidden(allLabels);
    onSave(allLabels);
  };

  return (
    <div
      ref={dialogRef}
      style={{ top: `${top}px` }}
      className="fixed right-[332px] z-40 flex max-h-[88vh] w-[380px] flex-col rounded-xl border border-gray-200 bg-white shadow-2xl origin-right animate-in fade-in zoom-in-95 duration-150"
    >
      {arrowTop !== null && (
        <div
          className="pointer-events-none absolute -right-[7px] z-10 h-3.5 w-3.5 rotate-45 border-r border-t border-gray-200 bg-white"
          style={{ top: `${arrowTop}px` }}
        />
      )}
      {/* Dialog Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Item Visibility on Form</h3>
          <p className="text-xs text-gray-500 truncate max-w-[260px]">
            {title} &bull; <span className="font-mono text-gray-700">{listKey}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search & Batch Actions */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/50 px-4 py-2">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleShowAll}
          className="shrink-0 rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
        >
          Show All
        </button>
        <button
          type="button"
          onClick={handleHideAll}
          className="shrink-0 rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
        >
          Hide All
        </button>
      </div>

      {/* List of Items */}
      <div className="flex-1 divide-y divide-gray-100 overflow-y-auto p-2">
        {filteredItems.length === 0 ? (
          <p className="p-4 text-center text-xs text-gray-400">No items found</p>
        ) : (
          filteredItems.map((raw) => {
            const label = typeof raw === 'string' ? raw : raw.label;
            const isHidden = hiddenSet.has(label);
            return (
              <div
                key={label}
                onClick={() => toggleItem(label)}
                className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs transition-colors ${
                  isHidden ? 'bg-gray-50 text-gray-400' : 'hover:bg-blue-50/40 text-gray-800'
                }`}
              >
                <span className={isHidden ? 'line-through opacity-60' : 'font-medium'}>
                  {label}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold ${
                    isHidden
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  <span>{isHidden ? 'Hidden' : 'Visible'}</span>
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Dialog Footer */}
      <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-4 py-2.5">
        <span className="text-xs text-gray-500">
          {items.length - hiddenOptions.length} of {items.length} visible
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-blue-600 px-4 py-1 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function CustomOptionsModal({
  title,
  isTable,
  options,
  anchorY,
  onSave,
  onClose,
}: {
  title: string;
  isTable: boolean;
  options: string[];
  anchorY?: number | null;
  onSave: (options: string[]) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { top, arrowTop } = computeAnchoredDialogStyle(anchorY, 400);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutside);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [onClose]);

  const currentOpts = options && options.length ? options : ['Option 1', 'Option 2'];

  const handleUpdate = (idx: number, val: string) => {
    const next = [...currentOpts];
    next[idx] = val;
    onSave(next);
  };

  const handleRemove = (idx: number) => {
    const next = currentOpts.filter((_, i) => i !== idx);
    onSave(next);
  };

  const handleAdd = () => {
    const n = currentOpts.length + 1;
    const next = [...currentOpts, isTable ? `Column ${n}` : `Option ${n}`];
    onSave(next);
  };

  return (
    <div
      ref={dialogRef}
      style={{ top: `${top}px` }}
      className="fixed right-[332px] z-40 flex max-h-[88vh] w-[380px] flex-col rounded-xl border border-gray-200 bg-white shadow-2xl origin-right animate-in fade-in zoom-in-95 duration-150"
    >
      {arrowTop !== null && (
        <div
          className="pointer-events-none absolute -right-[7px] z-10 h-3.5 w-3.5 rotate-45 border-r border-t border-gray-200 bg-white"
          style={{ top: `${arrowTop}px` }}
        />
      )}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">
            {isTable ? 'Edit Table Columns' : 'Edit Choices'}
          </h3>
          <p className="text-xs text-gray-500 truncate max-w-[260px]">
            {title} &bull; Form-specific choices
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {currentOpts.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-5 text-right font-mono text-xs text-gray-400">{idx + 1}.</span>
            <input
              type="text"
              value={opt}
              onChange={(e) => handleUpdate(idx, e.target.value)}
              placeholder={`Option ${idx + 1}`}
              className="flex-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              title="Remove choice"
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={handleAdd}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-600 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{isTable ? 'Add Column' : 'Add Option'}</span>
        </button>
      </div>

      <div className="flex items-center justify-end border-t border-gray-100 bg-gray-50/50 px-4 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-blue-600 px-4 py-1 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function FileUploadRulesModal({
  title,
  accept,
  maxFileSizeMb,
  allowMultiple,
  maxFiles,
  anchorY,
  onSave,
  onClose,
}: {
  title: string;
  accept?: string;
  maxFileSizeMb?: number;
  allowMultiple?: boolean;
  maxFiles?: number;
  anchorY?: number | null;
  onSave: (patch: { accept?: string; maxFileSizeMb?: number; allowMultiple?: boolean; maxFiles?: number }) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { top, arrowTop } = computeAnchoredDialogStyle(anchorY, 460);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutside);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [onClose]);

  const presets = [
    { label: 'All files', val: '' },
    { label: 'PDF only', val: '.pdf' },
    { label: 'Images', val: 'image/*,.png,.jpg,.jpeg' },
    { label: 'Documents', val: '.pdf,.doc,.docx,.txt' },
    { label: 'Spreadsheets', val: '.xlsx,.xls,.csv' },
  ];

  return (
    <div
      ref={dialogRef}
      style={{ top: `${top}px` }}
      className="fixed right-[332px] z-40 flex max-h-[88vh] w-[380px] flex-col rounded-xl border border-gray-200 bg-white shadow-2xl origin-right animate-in fade-in zoom-in-95 duration-150"
    >
      {arrowTop !== null && (
        <div
          className="pointer-events-none absolute -right-[7px] z-10 h-3.5 w-3.5 rotate-45 border-r border-t border-gray-200 bg-white"
          style={{ top: `${arrowTop}px` }}
        />
      )}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">File Upload Rules</h3>
          <p className="text-xs text-gray-500 truncate max-w-[260px]">{title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-700">Accepted File Formats</label>
          <input
            type="text"
            value={accept ?? ''}
            onChange={(e) => onSave({ accept: e.target.value })}
            placeholder="e.g. .pdf, .png, .jpg, image/*"
            className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 font-mono text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
          />
          <div className="mt-1 flex flex-wrap gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onSave({ accept: p.val })}
                className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  (accept ?? '') === p.val
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-700">Max File Size (MB)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={maxFileSizeMb ?? 10}
            onChange={(e) => onSave({ maxFileSizeMb: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
          <input
            type="checkbox"
            checked={Boolean(allowMultiple)}
            onChange={(e) => onSave({ allowMultiple: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 accent-blue-600"
          />
          <div>
            <span className="block text-xs font-semibold text-gray-800">Allow Multiple Files</span>
            <span className="block text-[11px] text-gray-500">Users can upload more than one file</span>
          </div>
        </label>

        {allowMultiple && (
          <div className="space-y-1.5 pl-6">
            <label className="text-xs font-semibold text-gray-700">Max Number of Files</label>
            <input
              type="number"
              min={2}
              max={50}
              value={maxFiles ?? 5}
              onChange={(e) => onSave({ maxFiles: Math.max(2, parseInt(e.target.value, 10) || 2) })}
              className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-end border-t border-gray-100 bg-gray-50/50 px-4 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-blue-600 px-4 py-1 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function GeneralSettingsModal({
  title,
  fieldName,
  placeholder,
  w,
  h,
  cols,
  required,
  showPlaceholder,
  showRequired = true,
  anchorY,
  onSave,
  onClose,
}: {
  title: string;
  fieldName?: string;
  placeholder?: string;
  w: number;
  h: number;
  cols: number;
  required?: boolean;
  showPlaceholder?: boolean;
  showRequired?: boolean;
  anchorY?: number | null;
  onSave: (patch: { fieldName?: string; placeholder?: string; w?: number; h?: number; required?: boolean }) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { top, arrowTop } = computeAnchoredDialogStyle(anchorY, 440);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutside);
    }, 10);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      style={{ top: `${top}px` }}
      className="fixed right-[332px] z-40 flex max-h-[88vh] w-[380px] flex-col rounded-xl border border-gray-200 bg-white shadow-2xl origin-right animate-in fade-in zoom-in-95 duration-150"
    >
      {arrowTop !== null && (
        <div
          className="pointer-events-none absolute -right-[7px] z-10 h-3.5 w-3.5 rotate-45 border-r border-t border-gray-200 bg-white"
          style={{ top: `${arrowTop}px` }}
        />
      )}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">General Settings</h3>
          <p className="text-xs text-gray-500 truncate max-w-[260px]">{title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Storage Key (if applicable) */}
        {fieldName !== undefined && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700">Storage Key (Field Name)</label>
              <InfoTooltip text="Key name used when saving payload to entity records." />
            </div>
            <input
              type="text"
              value={fieldName}
              onChange={(e) => onSave({ fieldName: e.target.value })}
              placeholder="e.g. equipment_type"
              className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 font-mono text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}

        {showPlaceholder && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700">Placeholder / Prompt Text</label>
            <input
              type="text"
              value={placeholder ?? ''}
              onChange={(e) => onSave({ placeholder: e.target.value })}
              placeholder="Optional placeholder hint"
              className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}

        {/* Grid Sizing */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-700">Grid Sizing</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-500">Width (Columns 1-{cols})</span>
              <input
                type="number"
                min={1}
                max={cols}
                value={w}
                onChange={(e) => onSave({ w: Math.max(1, Math.min(cols, Number(e.target.value) || 1)) })}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-500">Height (Rows)</span>
              <input
                type="number"
                min={1}
                max={20}
                value={h}
                onChange={(e) => onSave({ h: Math.max(1, Number(e.target.value) || 1) })}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Required Field Checkbox */}
        {showRequired && (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
            <input
              type="checkbox"
              checked={Boolean(required)}
              onChange={(e) => onSave({ required: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 accent-blue-600"
            />
            <div>
              <span className="block text-xs font-semibold text-gray-800">Required Field</span>
              <span className="block text-[11px] text-gray-500">
                Prevents form submission if this field is left empty
              </span>
            </div>
          </label>
        )}
      </div>

      <div className="flex items-center justify-end border-t border-gray-100 bg-gray-50/50 px-4 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-blue-600 px-4 py-1 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}

export function FormInspector({
  selectedItem,
  allItems,
  cols,
  publishedLists,
  resolvedLists,
  conditions,
  onPatchItem,
  onRemoveItem,
  onEnsureResolved,
  onOpenConditionModal,
  onCreateGroup,
}: FormInspectorProps) {
  // Modal state tracker
  const [activeModal, setActiveModal] = useState<
    'visibility' | 'custom_options' | 'file_rules' | 'general_settings' | null
  >(null);
  const [modalAnchorY, setModalAnchorY] = useState<number | null>(null);
  const [optionsPickerOpen, setOptionsPickerOpen] = useState(false);
  const [conditionPickerOpen, setConditionPickerOpen] = useState(false);
  const optionsPickerRef = useRef<HTMLDivElement>(null);
  const conditionPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (optionsPickerRef.current && !optionsPickerRef.current.contains(e.target as Node)) {
        setOptionsPickerOpen(false);
      }
      if (conditionPickerRef.current && !conditionPickerRef.current.contains(e.target as Node)) {
        setConditionPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  if (!selectedItem) {
    return (
      <aside className="flex w-80 shrink-0 flex-col border-l border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Inspector</h3>
          <p className="mt-0.5 text-xs text-gray-500">Form Element Properties</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <MousePointerClick className="h-7 w-7 text-gray-300" />
          <p className="text-xs font-semibold text-gray-700">No element selected</p>
          <p className="max-w-[200px] text-[11px] leading-relaxed text-gray-400">
            Click any field, section heading, or form group on the canvas to configure properties and condition rules.
          </p>
        </div>
      </aside>
    );
  }

  const isGroup = Boolean(selectedItem.isGroup ?? selectedItem.is_group);
  const isHeader = Boolean(selectedItem.isHeader ?? selectedItem.is_header);

  const availableGroups = allItems
    .filter((it) => it.isGroup)
    .map((it) => ({
      id: it.groupId || it.i,
      title: it.groupTitle || it.label || it.i,
      item: it,
    }));

  const parentGroup = selectedItem.groupId
    ? availableGroups.find((g) => g.id === selectedItem.groupId)
    : null;

  // -------------------------------------------------------------------------
  // 1. Form Group Inspector
  // -------------------------------------------------------------------------
  if (isGroup) {
    const memberCount = allItems.filter(
      (it) => !it.isHeader && !it.isGroup && it.groupId === (selectedItem.groupId || selectedItem.i)
    ).length;
    const hasCondition = Boolean(
      selectedItem.visibilityCondition?.condition_id ||
      selectedItem.visibilityCondition?.rules?.length ||
      selectedItem.visibilityCondition?.field
    );

    return (
      <aside className="flex w-80 shrink-0 flex-col border-l border-gray-200 bg-white">
        {/* Title: Inline Editable Group Label */}
        <div className="px-4 pt-3.5 pb-1">
          <input
            type="text"
            value={selectedItem.label ?? selectedItem.groupTitle ?? ''}
            onChange={(e) =>
              onPatchItem(selectedItem.i, { label: e.target.value, groupTitle: e.target.value })
            }
            placeholder="Untitled Form Group"
            className="w-full rounded bg-transparent px-1.5 py-1 text-sm font-bold text-purple-900 placeholder:text-gray-400 hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
          {/* Members Summary */}
          <div className="flex flex-col gap-1.5 pb-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-900">Member Fields</span>
              <span className="rounded bg-purple-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-800">
                {memberCount} field(s)
              </span>
            </div>
            <p className="text-[11px] text-purple-800 leading-snug">
              Fields assigned to this group will move together and inherit its visibility conditions.
            </p>
          </div>

          {/* Conditional Logic Section */}
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                  Conditional Logic
                </span>
                <InfoTooltip text="Group-level condition cascades to all assigned member fields." />
              </div>

              {!hasCondition && (
                <button
                  type="button"
                  onClick={(e) => {
                    if (conditions.length > 0) {
                      onPatchItem(selectedItem.i, {
                        visibilityCondition: { action: 'show', condition_id: conditions[0].id },
                        visibility_condition: { action: 'show', condition_id: conditions[0].id },
                      });
                    } else {
                      const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                      onOpenConditionModal(null, anchor);
                    }
                  }}
                  title="Add condition"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {hasCondition && (
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedItem.visibilityCondition?.condition_id ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__new__') {
                      const rect = e.currentTarget.getBoundingClientRect();
                      onOpenConditionModal(null, rect.top + rect.height / 2);
                    } else {
                      const patch = {
                        action: selectedItem.visibilityCondition?.action || 'show',
                        condition_id: val || null,
                      };
                      onPatchItem(selectedItem.i, {
                        visibilityCondition: patch,
                        visibility_condition: patch,
                      });
                    }
                  }}
                  className={`${INPUT_CLS} flex-1 text-xs`}
                >
                  {conditions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || c.id}
                    </option>
                  ))}
                  <option value="__new__">+ Create new condition…</option>
                </select>

                <button
                  type="button"
                  onClick={(e) => {
                    const selectedDef = conditions.find(
                      (c) => c.id === selectedItem.visibilityCondition?.condition_id
                    );
                    const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                    onOpenConditionModal(selectedDef || null, anchor);
                  }}
                  title="Edit in Condition Builder"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onPatchItem(selectedItem.i, {
                      visibilityCondition: null,
                      visibility_condition: null,
                    })
                  }
                  title="Remove Condition"
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* General Settings (Grid Sizing) Section */}
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                  General Settings
                </span>
                <InfoTooltip text="Grid layout sizing for this container." />
              </div>

              <button
                type="button"
                onClick={(e) => {
                  const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                  setModalAnchorY(anchor);
                  setActiveModal('general_settings');
                }}
                title="Configure container size"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-600 px-1 py-0.5">
              <span className="text-gray-500">Container Size</span>
              <span className="font-mono text-[11px] font-medium text-gray-700">
                {selectedItem.w} cols &times; {selectedItem.h} rows
              </span>
            </div>
          </div>

          {/* Delete Button */}
          <div className="mt-auto border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => onRemoveItem(selectedItem.i)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Group</span>
            </button>
          </div>
        </div>

        {/* Modal for Group General Settings */}
        {activeModal === 'general_settings' && (
          <GeneralSettingsModal
            title={selectedItem.label ?? 'Form Group'}
            w={selectedItem.w}
            h={selectedItem.h}
            cols={cols}
            showRequired={false}
            anchorY={modalAnchorY}
            onSave={(patch) => onPatchItem(selectedItem.i, patch)}
            onClose={() => setActiveModal(null)}
          />
        )}
      </aside>
    );
  }

  // -------------------------------------------------------------------------
  // 2. Section Heading Inspector
  // -------------------------------------------------------------------------
  if (isHeader) {
    const hasCondition = Boolean(
      selectedItem.visibilityCondition?.condition_id ||
      selectedItem.visibilityCondition?.rules?.length ||
      selectedItem.visibilityCondition?.field
    );

    return (
      <aside className="flex w-80 shrink-0 flex-col border-l border-gray-200 bg-white">
        {/* Title: Inline Editable Section Label */}
        <div className="px-4 pt-3.5 pb-1">
          <input
            type="text"
            value={selectedItem.label ?? ''}
            onChange={(e) => onPatchItem(selectedItem.i, { label: e.target.value })}
            placeholder="Section Heading"
            className="w-full rounded bg-transparent px-1.5 py-1 text-sm font-bold text-indigo-900 placeholder:text-gray-400 hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
          {/* Conditional Logic Section */}
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                  Conditional Logic
                </span>
                <InfoTooltip text="Hide or show this entire section heading dynamically." />
              </div>

              {!hasCondition && (
                <button
                  type="button"
                  onClick={(e) => {
                    if (conditions.length > 0) {
                      onPatchItem(selectedItem.i, {
                        visibilityCondition: { action: 'show', condition_id: conditions[0].id },
                        visibility_condition: { action: 'show', condition_id: conditions[0].id },
                      });
                    } else {
                      const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                      onOpenConditionModal(null, anchor);
                    }
                  }}
                  title="Add condition"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {hasCondition && (
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedItem.visibilityCondition?.condition_id ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__new__') {
                      const rect = e.currentTarget.getBoundingClientRect();
                      onOpenConditionModal(null, rect.top + rect.height / 2);
                    } else {
                      const patch = {
                        action: selectedItem.visibilityCondition?.action || 'show',
                        condition_id: val || null,
                      };
                      onPatchItem(selectedItem.i, {
                        visibilityCondition: patch,
                        visibility_condition: patch,
                      });
                    }
                  }}
                  className={`${INPUT_CLS} flex-1 text-xs`}
                >
                  {conditions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || c.id}
                    </option>
                  ))}
                  <option value="__new__">+ Create new condition…</option>
                </select>

                <button
                  type="button"
                  onClick={(e) => {
                    const selectedDef = conditions.find(
                      (c) => c.id === selectedItem.visibilityCondition?.condition_id
                    );
                    const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                    onOpenConditionModal(selectedDef || null, anchor);
                  }}
                  title="Edit in Condition Builder"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onPatchItem(selectedItem.i, {
                      visibilityCondition: null,
                      visibility_condition: null,
                    })
                  }
                  title="Remove Condition"
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* General Settings (Grid Sizing) Section */}
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                  General Settings
                </span>
                <InfoTooltip text="Grid layout sizing for this section heading." />
              </div>

              <button
                type="button"
                onClick={(e) => {
                  const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                  setModalAnchorY(anchor);
                  setActiveModal('general_settings');
                }}
                title="Configure section width"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-600 px-1 py-0.5">
              <span className="text-gray-500">Section Width</span>
              <span className="font-mono text-[11px] font-medium text-gray-700">
                {selectedItem.w} cols &times; {selectedItem.h} rows
              </span>
            </div>
          </div>

          {/* Delete Button */}
          <div className="mt-auto border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => onRemoveItem(selectedItem.i)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Section</span>
            </button>
          </div>
        </div>

        {/* Modal for Section General Settings */}
        {activeModal === 'general_settings' && (
          <GeneralSettingsModal
            title={selectedItem.label ?? 'Section Heading'}
            w={selectedItem.w}
            h={selectedItem.h}
            cols={cols}
            showRequired={false}
            anchorY={modalAnchorY}
            onSave={(patch) => onPatchItem(selectedItem.i, patch)}
            onClose={() => setActiveModal(null)}
          />
        )}
      </aside>
    );
  }

  // -------------------------------------------------------------------------
  // 3. Regular Form Field Inspector
  // -------------------------------------------------------------------------
  const fieldType = selectedItem.fieldType || 'text';
  const isOptionsType = ['selection', 'checkbox_group', 'dropdown', 'table', 'checklist'].includes(
    fieldType
  );
  const isFileType = ['file', 'file_attachment', 'attachment'].includes(fieldType);

  const optionLists = publishedLists.filter((l) => l.kind === 'options');
  const checklistLists = publishedLists.filter((l) => l.kind === 'checklist');
  const relevantLists = fieldType === 'checklist' ? checklistLists : optionLists;

  const resolved = selectedItem.optionsList ? resolvedLists[selectedItem.optionsList] : null;

  // Configuration check states
  const hasOptions = Boolean(
    selectedItem.optionsList || (selectedItem.options && selectedItem.options.length > 0)
  );
  const hasCondition = Boolean(
    selectedItem.visibilityCondition?.condition_id ||
    selectedItem.visibilityCondition?.rules?.length ||
    selectedItem.visibilityCondition?.field
  );
  const hasGroup = Boolean(selectedItem.groupId);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-gray-200 bg-white">
      {/* Panel Title: Inline Editable Field Label */}
      <div className="px-4 pt-3.5 pb-1">
        <input
          type="text"
          value={selectedItem.label ?? ''}
          onChange={(e) => onPatchItem(selectedItem.i, { label: e.target.value })}
          placeholder="Untitled Field"
          className="w-full rounded bg-transparent px-1.5 py-1 text-sm font-bold text-gray-900 placeholder:text-gray-400 hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
        />
      </div>

      {/* Single Continuous Panel with 1-Level Progressive Sections */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* Field Type Selection */}
        <InspectorField label="Field Type">
          <select
            value={selectedItem.fieldType ?? 'text'}
            onChange={(e) => {
              const t = e.target.value as GenericFieldType;
              const def = FIELD_TYPE_DEFS.find((d) => d.type === t);
              onPatchItem(selectedItem.i, {
                fieldType: t,
                options:
                  t === 'selection' || t === 'checkbox_group' || t === 'dropdown' || t === 'table'
                    ? selectedItem.options?.length
                      ? selectedItem.options
                      : [...(def?.defaultOptions ?? [])]
                    : selectedItem.options,
              });
            }}
            className={INPUT_CLS}
          >
            {FIELD_TYPE_DEFS.map((def) => (
              <option key={def.type} value={def.type}>
                {def.label} ({def.type})
              </option>
            ))}
          </select>
        </InspectorField>

        {/* Placeholder (if plain text / number input) */}
        {!isOptionsType && !isFileType && (
          <InspectorField label="Placeholder / Prompt">
            <input
              value={selectedItem.placeholder ?? ''}
              onChange={(e) => onPatchItem(selectedItem.i, { placeholder: e.target.value })}
              placeholder="Optional prompt text"
              className={INPUT_CLS}
            />
          </InspectorField>
        )}

        {/* -------------------------------------------------------------------
            High-Level Section 1: Options & Choices (Progressive 1-Level)
        ------------------------------------------------------------------- */}
        {isOptionsType && (
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ListFilter className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                  Options & Choices
                </span>
                <InfoTooltip text="Source of selectable choices or checklist tasks for this field." />
              </div>

              {!hasOptions && (
                <div ref={optionsPickerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setOptionsPickerOpen((v) => !v)}
                    title="Add options or list"
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>

                  {optionsPickerOpen && (
                    <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl text-xs">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {fieldType === 'checklist' ? 'Checklist Lists' : 'Central Shared Lists'}
                      </div>
                      {relevantLists.map((l) => (
                        <button
                          key={l.list_key}
                          type="button"
                          onClick={() => {
                            setOptionsPickerOpen(false);
                            onPatchItem(selectedItem.i, {
                              optionsList: l.list_key,
                              hiddenOptions: [],
                            });
                            onEnsureResolved([l.list_key]);
                          }}
                          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-700 hover:bg-gray-50 hover:text-blue-600"
                        >
                          <span className="truncate">{l.list_key}</span>
                          <span className="font-mono text-[10px] text-gray-400">
                            v{l.published_version}
                          </span>
                        </button>
                      ))}
                      {relevantLists.length === 0 && (
                        <div className="px-2 py-1 text-[11px] text-gray-400 italic">
                          No central lists found.
                        </div>
                      )}
                      {fieldType !== 'checklist' && (
                        <>
                          <div className="my-1 border-t border-gray-100" />
                          <button
                            type="button"
                            onClick={() => {
                              setOptionsPickerOpen(false);
                              onPatchItem(selectedItem.i, {
                                optionsList: null,
                                options: selectedItem.options?.length
                                  ? selectedItem.options
                                  : ['Option 1', 'Option 2'],
                                hiddenOptions: [],
                              });
                            }}
                            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left font-medium text-blue-600 hover:bg-blue-50"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Custom Choices (Form-specific)</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {hasOptions && (
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedItem.optionsList ? selectedItem.optionsList : '__custom__'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      onPatchItem(selectedItem.i, {
                        optionsList: null,
                        options: selectedItem.options?.length
                          ? selectedItem.options
                          : ['Option 1', 'Option 2'],
                        hiddenOptions: [],
                      });
                    } else {
                      onPatchItem(selectedItem.i, { optionsList: val, hiddenOptions: [] });
                      onEnsureResolved([val]);
                    }
                  }}
                  className={`${INPUT_CLS} flex-1 text-xs`}
                >
                  <optgroup
                    label={fieldType === 'checklist' ? 'Checklists' : 'Central Shared Lists'}
                  >
                    {relevantLists.map((l) => (
                      <option key={l.list_key} value={l.list_key}>
                        List: {l.list_key} (v{l.published_version})
                      </option>
                    ))}
                  </optgroup>
                  {fieldType !== 'checklist' && (
                    <optgroup label="Form Specific">
                      <option value="__custom__">
                        Custom Choices ({selectedItem.options?.length || 0} items)
                      </option>
                    </optgroup>
                  )}
                </select>

                {/* ⋯ Deep Configuration Popover / Modal Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                    setModalAnchorY(anchor);
                    if (selectedItem.optionsList) {
                      onEnsureResolved([selectedItem.optionsList]);
                      setActiveModal('visibility');
                    } else {
                      setActiveModal('custom_options');
                    }
                  }}
                  title={
                    selectedItem.optionsList
                      ? 'Configure item visibility on form'
                      : 'Edit custom choices'
                  }
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>

                {/* Remove Options Button */}
                <button
                  type="button"
                  onClick={() =>
                    onPatchItem(selectedItem.i, {
                      options: [],
                      optionsList: null,
                      hiddenOptions: [],
                    })
                  }
                  title="Remove options configuration"
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Subtle Summary Subtext if items are hidden */}
            {hasOptions && selectedItem.optionsList && selectedItem.hiddenOptions && selectedItem.hiddenOptions.length > 0 && (
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>{selectedItem.hiddenOptions.length} item(s) hidden</span>
                <button
                  type="button"
                  onClick={(e) => {
                    const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                    setModalAnchorY(anchor);
                    onEnsureResolved([selectedItem.optionsList]);
                    setActiveModal('visibility');
                  }}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Edit visibility
                </button>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------------------------
            High-Level Section 2: Conditional Logic (Progressive 1-Level)
        ------------------------------------------------------------------- */}
        <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                Conditional Logic
              </span>
              <InfoTooltip text="Link condition definitions from the Central Conditions module." />
            </div>

            {!hasCondition && (
              <div ref={conditionPickerRef} className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    if (conditions.length > 0) {
                      setConditionPickerOpen((v) => !v);
                    } else {
                      const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                      onOpenConditionModal(null, anchor);
                    }
                  }}
                  title="Add condition"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>

                {conditionPickerOpen && (
                  <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl text-xs">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Link Condition
                    </div>
                    {conditions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setConditionPickerOpen(false);
                          onPatchItem(selectedItem.i, {
                            visibilityCondition: { action: 'show', condition_id: c.id },
                            visibility_condition: { action: 'show', condition_id: c.id },
                          });
                        }}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-gray-700 hover:bg-gray-50 hover:text-blue-600"
                      >
                        <span className="truncate">{c.label || c.id}</span>
                      </button>
                    ))}
                    <div className="my-1 border-t border-gray-100" />
                    <button
                      type="button"
                      onClick={(e) => {
                        setConditionPickerOpen(false);
                        const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                        onOpenConditionModal(null, anchor);
                      }}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left font-medium text-blue-600 hover:bg-blue-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Create New Condition…</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {hasCondition && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedItem.visibilityCondition?.condition_id ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__new__') {
                    const rect = e.currentTarget.getBoundingClientRect();
                    onOpenConditionModal(null, rect.top + rect.height / 2);
                  } else {
                    const patch = {
                      action: selectedItem.visibilityCondition?.action || 'show',
                      condition_id: val || null,
                    };
                    onPatchItem(selectedItem.i, {
                      visibilityCondition: patch,
                      visibility_condition: patch,
                    });
                  }
                }}
                className={`${INPUT_CLS} flex-1 text-xs`}
              >
                {conditions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label || c.id}
                  </option>
                ))}
                <option value="__new__">+ Create new condition…</option>
              </select>

              {/* ⋯ Open in full Condition Builder Modal */}
              <button
                type="button"
                onClick={(e) => {
                  const selectedDef = conditions.find(
                    (c) => c.id === selectedItem.visibilityCondition?.condition_id
                  );
                  const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                  onOpenConditionModal(selectedDef || null, anchor);
                }}
                title="Edit in Condition Builder Modal"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>

              {/* Clear Condition */}
              <button
                type="button"
                onClick={() =>
                  onPatchItem(selectedItem.i, {
                    visibilityCondition: null,
                    visibility_condition: null,
                  })
                }
                title="Remove Condition"
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Group Inheritance Note */}
          {parentGroup && (parentGroup.item.visibilityCondition || parentGroup.item.visibility_condition) && (
            <div className="rounded border border-purple-200 bg-purple-50/50 px-2.5 py-1.5 text-[11px] text-purple-900">
              <span className="font-semibold">Inherited from {parentGroup.title}:</span> Group condition rules also apply.
            </div>
          )}
        </div>

        {/* -------------------------------------------------------------------
            High-Level Section 3: Form Group (Progressive 1-Level)
        ------------------------------------------------------------------- */}
        <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-gray-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                Form Group
              </span>
              <InfoTooltip text="Assign field to a container that cascades visibility rules and moves as a unit." />
            </div>

            {!hasGroup && (
              <button
                type="button"
                onClick={() => {
                  if (availableGroups.length > 0) {
                    onPatchItem(selectedItem.i, {
                      groupId: availableGroups[0].id,
                      groupTitle: availableGroups[0].title,
                    });
                  } else {
                    const newId = onCreateGroup();
                    onPatchItem(selectedItem.i, { groupId: newId });
                  }
                }}
                title="Assign to form group"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {hasGroup && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedItem.groupId ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__new__') {
                    const newId = onCreateGroup();
                    onPatchItem(selectedItem.i, { groupId: newId });
                  } else {
                    const match = availableGroups.find((g) => g.id === val);
                    onPatchItem(selectedItem.i, {
                      groupId: val || null,
                      groupTitle: match ? match.title : null,
                    });
                  }
                }}
                className={`${INPUT_CLS} flex-1 text-xs`}
              >
                {availableGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    Group: {g.title}
                  </option>
                ))}
                <option value="__new__">+ Create new group…</option>
              </select>

              <button
                type="button"
                onClick={() => onPatchItem(selectedItem.i, { groupId: null, groupTitle: null })}
                title="Unassign Group"
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* -------------------------------------------------------------------
            High-Level Section 4: File Upload Rules (if File Type)
        ------------------------------------------------------------------- */}
        {isFileType && (
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                  File Upload Rules
                </span>
                <InfoTooltip text="File format constraints, size limits, and multi-file options." />
              </div>

              <button
                type="button"
                onClick={(e) => {
                  const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                  setModalAnchorY(anchor);
                  setActiveModal('file_rules');
                }}
                title="Configure file upload rules"
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-600 px-1 py-0.5">
              <span className="truncate font-mono text-[11px]">
                {selectedItem.accept ? selectedItem.accept : 'All file types'}
              </span>
              <span className="shrink-0 font-medium text-[10px] text-gray-400">
                {selectedItem.maxFileSizeMb ?? 10}MB{' '}
                {selectedItem.allowMultiple
                  ? `• up to ${selectedItem.maxFiles ?? 5}`
                  : '• single'}
              </span>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------
            High-Level Section 5: General Settings (Key, Grid, Required)
        ------------------------------------------------------------------- */}
        <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Settings2 className="h-3.5 w-3.5 text-gray-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                General Settings
              </span>
              <InfoTooltip text="Storage key name, grid layout sizing, and validation rules." />
            </div>

            <button
              type="button"
              onClick={(e) => {
                const anchor = e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2;
                setModalAnchorY(anchor);
                setActiveModal('general_settings');
              }}
              title="Configure general settings"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-600 px-1 py-0.5">
            <div className="flex items-center gap-1.5 truncate">
              <span className="truncate font-mono text-[11px] text-gray-700">
                {selectedItem.fieldName ? selectedItem.fieldName : selectedItem.i}
              </span>
              {selectedItem.required && (
                <span className="rounded border border-amber-200 bg-amber-50 px-1 py-0.2 text-[9px] font-bold text-amber-700">
                  Required
                </span>
              )}
            </div>
            <span className="shrink-0 font-medium text-[10px] text-gray-400">
              {selectedItem.w}&times;{selectedItem.h} grid
            </span>
          </div>
        </div>

        {/* Remove Field Button */}
        <div className="mt-auto border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => onRemoveItem(selectedItem.i)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Remove Field from Form</span>
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------------
          Modals for Deep Configuration
      --------------------------------------------------------------------- */}
      {activeModal === 'visibility' && selectedItem.optionsList && (
        <ItemVisibilityModal
          title={selectedItem.label ?? 'Field'}
          listKey={selectedItem.optionsList}
          items={resolved?.items ?? []}
          hiddenOptions={selectedItem.hiddenOptions ?? []}
          anchorY={modalAnchorY}
          onSave={(hidden) => onPatchItem(selectedItem.i, { hiddenOptions: hidden })}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'custom_options' && (
        <CustomOptionsModal
          title={selectedItem.label ?? 'Field'}
          isTable={fieldType === 'table'}
          options={selectedItem.options ?? []}
          anchorY={modalAnchorY}
          onSave={(opts) => onPatchItem(selectedItem.i, { options: opts })}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'file_rules' && (
        <FileUploadRulesModal
          title={selectedItem.label ?? 'File Field'}
          accept={selectedItem.accept}
          maxFileSizeMb={selectedItem.maxFileSizeMb}
          allowMultiple={selectedItem.allowMultiple}
          maxFiles={selectedItem.maxFiles}
          anchorY={modalAnchorY}
          onSave={(patch) => onPatchItem(selectedItem.i, patch)}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal === 'general_settings' && (
        <GeneralSettingsModal
          title={selectedItem.label ?? 'Field'}
          fieldName={selectedItem.fieldName}
          placeholder={selectedItem.placeholder}
          w={selectedItem.w}
          h={selectedItem.h}
          cols={cols}
          required={selectedItem.required}
          showPlaceholder={!isOptionsType && !isFileType}
          anchorY={modalAnchorY}
          onSave={(patch) => onPatchItem(selectedItem.i, patch)}
          onClose={() => setActiveModal(null)}
        />
      )}
    </aside>
  );
}
