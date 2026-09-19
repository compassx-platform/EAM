import {
  ArrowLeft,
  CheckCircle2,
  Code2,
  Eye,
  History,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type { ConditionDefinition } from '../../types';

interface FormToolbarProps {
  entityType: string;
  versionLabel?: string;
  itemCount: number;
  conditions: ConditionDefinition[];
  dirty: boolean;
  saving: boolean;
  deleting: boolean;
  notice: { kind: 'ok' | 'err'; text: string } | null;
  onBack: () => void;
  onSave: () => void;
  onDelete: () => void;
  onOpenJson: () => void;
  onOpenPreview: () => void;
  onOpenHistory?: () => void;
  onOpenConditionsList?: () => void;
}

export function FormToolbar({
  entityType,
  versionLabel,
  itemCount,
  conditions,
  dirty,
  saving,
  deleting,
  notice,
  onBack,
  onSave,
  onDelete,
  onOpenJson,
  onOpenPreview,
  onOpenHistory,
  onOpenConditionsList,
}: FormToolbarProps) {
  return (
    <header className="flex h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4">
      {/* Left side: Back & Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-gray-500" />
          <span>Forms</span>
        </button>

        <div className="h-4 w-px bg-gray-200" />

        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold text-gray-900">Form Builder</h1>
          <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-700 border border-gray-200">
            {entityType}
          </span>
          <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-700 border border-gray-200" title="Auto-assigned form layout version">
            {versionLabel || 'v1'}
          </span>
          <span className="hidden text-xs text-gray-400 sm:inline">
            · {itemCount} item{itemCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Right side: Actions & Status */}
      <div className="flex items-center gap-2">
        {/* Status / Notice */}
        {dirty && !notice && (
          <span className="hidden items-center gap-1.5 text-xs font-medium text-amber-600 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes
          </span>
        )}
        {notice && (
          <span
            className={`hidden items-center gap-1 text-xs font-medium sm:inline-flex ${
              notice.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {notice.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {notice.text}
          </span>
        )}

        {/* Form History button */}
        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            title="View form layout version history"
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <History className="h-3.5 w-3.5 text-gray-500" />
            <span className="hidden sm:inline">History</span>
          </button>
        )}

        {/* Central Conditions shortcut */}
        {onOpenConditionsList && (
          <button
            type="button"
            onClick={onOpenConditionsList}
            title="View Central Conditions for this entity type"
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-blue-700" />
            <span className="hidden md:inline">Conditions</span>
            <span className="rounded bg-gray-100 px-1 font-mono text-[10px] text-gray-600">
              {conditions.length}
            </span>
          </button>
        )}

        {/* Live Test & Preview Button */}
        <button
          type="button"
          onClick={onOpenPreview}
          title="Interactive form fill preview with live condition testing"
          className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
        >
          <Eye className="h-3.5 w-3.5 text-gray-500" />
          <span className="hidden sm:inline">Preview &amp; Test</span>
        </button>

        {/* JSON Import/Export */}
        <button
          type="button"
          onClick={onOpenJson}
          title="View, edit, or copy form schema as JSON"
          className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <Code2 className="h-3.5 w-3.5 text-gray-500" />
          <span className="hidden sm:inline">JSON</span>
        </button>

        {/* Delete Layout */}
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting || saving}
          title="Delete form layout"
          className="flex items-center gap-1 rounded-md border border-gray-200 bg-white p-1.5 text-xs text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>

        {/* Save Primary Button */}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          <span>Save Form</span>
        </button>
      </div>
    </header>
  );
}
