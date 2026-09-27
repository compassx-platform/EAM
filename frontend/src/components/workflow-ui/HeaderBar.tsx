import { useRef, useState } from 'react';
import { Archive, CheckCircle2, Download, History, LayoutGrid, Loader2, MoreHorizontal, Package, Pencil, Plus, Rocket, Save, Settings, Sparkles, Trash2 } from 'lucide-react';
import type { Workflow } from '../../types';
import type { StudioNotice } from './types';

export interface HeaderBarProps {
  entityType: string;
  onEntityType: (v: string) => void;
  versionLabel: string;
  status: Workflow['status'];
  dirty: boolean;
  saving: boolean;
  canDelete: boolean;
  notice: StudioNotice | null;
  knownTypes: string[];
  onAutoArrange: () => void;
  onNewCondition: () => void;
  onOpenSettings: () => void;
  onOpenHistory?: () => void;
  onOpenTemplates?: () => void;
  onExportBundle?: () => void;
  onValidate: () => void;
  onSave: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onDeprecate?: () => void;
  onCreateRevision?: () => void;
}

const statusPill: Record<Workflow['status'], { label: string; style: string; title: string }> = {
  draft: {
    label: 'DRAFT',
    style: 'bg-amber-50 text-amber-800 border-amber-200',
    title: 'Draft Revision — in design/development, not active for record routing',
  },
  published: {
    label: 'ACTIVE',
    style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    title: 'Active Process — enabled in production for record routing',
  },
  deprecated: {
    label: 'INACTIVE',
    style: 'bg-gray-100 text-gray-700 border-gray-200',
    title: 'Inactive / Deactivated Revision — superseded or disabled',
  },
};

export function HeaderBar(p: HeaderBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isPublished = p.status === 'published';
  const isDeprecated = p.status === 'deprecated';
  const statusMeta = statusPill[p.status] || statusPill.draft;

  return (
    <div className="relative flex h-14 shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-1.5">
        <select
          value={p.entityType}
          onChange={(e) => p.onEntityType(e.target.value)}
          title="Entity type this process applies to"
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-900 shadow-2xs hover:border-gray-300 focus:border-blue-500 focus:outline-none transition-colors"
        >
          {p.knownTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-gray-300 font-medium">/</span>
        <span
          className="font-mono text-xs font-bold text-gray-800"
          title={`Revision: ${p.versionLabel}`}
        >
          {p.versionLabel}
        </span>
        <span
          title={statusMeta.title}
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusMeta.style}`}
        >
          {statusMeta.label}
        </span>
        {p.dirty && (
          <span
            className="flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
            title="Unsaved changes on the canvas"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Unsaved
          </span>
        )}
      </div>

      {p.notice && (
        <div
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium shadow-2xs animate-in fade-in slide-in-from-top-1 duration-150 ${
            p.notice.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {p.notice.kind === 'ok' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
          )}
          <span>{p.notice.text}</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={p.onAutoArrange}
          title="Auto arrange nodes"
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <LayoutGrid className="h-3.5 w-3.5 text-gray-500" />
          <span>Layout</span>
        </button>

        {p.onOpenHistory && (
          <button
            type="button"
            onClick={p.onOpenHistory}
            title="View process revisions and history"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <History className="h-3.5 w-3.5 text-gray-500" />
            <span>Revisions</span>
          </button>
        )}

        <button
          type="button"
          onClick={p.onOpenSettings}
          title="Process settings & terminal states"
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <Settings className="h-3.5 w-3.5 text-gray-500" />
          <span>Settings</span>
        </button>

        <button
          type="button"
          onClick={p.onValidate}
          title="Validate process syntax and routing topology"
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-gray-500" />
          <span>Validate Process</span>
        </button>

        <button
          type="button"
          disabled={p.saving}
          onClick={p.onSave}
          title={isPublished ? 'Create a new draft revision from this active process' : 'Save draft changes'}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-2xs hover:border-gray-400 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {p.saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isPublished ? (
            <Pencil className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          <span>{isPublished ? 'Revise Process' : 'Save Draft'}</span>
        </button>

        {isPublished ? (
          <div
            title="This process revision is active and routing live records"
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-800"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Active Process</span>
          </div>
        ) : (
          <button
            type="button"
            disabled={p.saving}
            onClick={p.onPublish}
            title={isDeprecated ? 'Re-activate this process revision for record routing' : 'Activate this draft process revision for record routing'}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Rocket className="h-3.5 w-3.5" />
            <span>{isDeprecated ? 'Reactivate Process' : 'Activate Process'}</span>
          </button>
        )}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            title="More actions"
            className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-500 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800 transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full z-50 mt-1 flex w-52 flex-col rounded-lg border border-gray-200 bg-white py-1 shadow-lg animate-in fade-in zoom-in-95 duration-100"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  p.onNewCondition();
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                <Plus className="h-3.5 w-3.5 text-gray-500" />
                <span>New Condition…</span>
              </button>

              {p.onOpenTemplates && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    p.onOpenTemplates?.();
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  <span>Templates & Import…</span>
                </button>
              )}

              {p.onExportBundle && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    p.onExportBundle?.();
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  <Download className="h-3.5 w-3.5 text-gray-500" />
                  <span>Export Package (.json)</span>
                </button>
              )}

              {p.onDeprecate && isPublished && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    p.onDeprecate();
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-amber-700 hover:bg-amber-50"
                >
                  <Archive className="h-3.5 w-3.5" />
                  <span>Deactivate Process</span>
                </button>
              )}

              {p.canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    p.onDelete();
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Draft</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
