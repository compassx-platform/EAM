import { useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, GitFork, LayoutGrid, Loader2, MoreHorizontal, Pencil, Rocket, Save, Settings, Trash2 } from 'lucide-react';
import type { Workflow } from '../../../types';

export interface StudioNotice {
  kind: 'ok' | 'err';
  text: string;
}

interface HeaderBarProps {
  entityType: string;
  onEntityType: (v: string) => void;
  versionLabel: string;
  onVersionLabel: (v: string) => void;
  status: Workflow['status'];
  dirty: boolean;
  saving: boolean;
  canDelete: boolean;
  notice: StudioNotice | null;
  knownTypes: string[];
  onBack: () => void;
  onAutoArrange: () => void;
  onNewCondition: () => void;
  onOpenSettings: () => void;
  onValidate: () => void;
  onSave: () => void;
  onPublish: () => void;
  onDelete: () => void;
}

const statusPill: Record<Workflow['status'], string> = {
  draft: 'bg-amber-100 text-amber-700 border-amber-200',
  published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  deprecated: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function HeaderBar(p: HeaderBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
      <button
        type="button"
        onClick={p.onBack}
        className="flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
      >
        <ArrowLeft className="h-4 w-4" /> Workflows
      </button>

      <div className="mx-1 h-6 w-px bg-gray-200" />

      <div className="flex items-center gap-1.5">
        <input
          value={p.entityType}
          onChange={(e) => p.onEntityType(e.target.value.trim().toLowerCase())}
          list="known-entity-types"
          title="Entity type this workflow applies to (lowercase, e.g. permit)"
          className="w-36 rounded-md border border-transparent px-1.5 py-1 text-sm font-bold text-gray-800 hover:border-gray-200 focus:border-blue-500 focus:outline-none"
        />
        <span className="text-gray-300">·</span>
        <input
          value={p.versionLabel}
          onChange={(e) => p.onVersionLabel(e.target.value)}
          title="Version label"
          className="w-36 rounded-md border border-transparent px-1.5 py-1 text-sm font-semibold text-gray-600 hover:border-gray-200 focus:border-blue-500 focus:outline-none"
        />
        <datalist id="known-entity-types">
          {p.knownTypes.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusPill[p.status]}`}>
        {p.status}
      </span>

      {p.dirty && (
        <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600">
          <Pencil className="h-3 w-3" /> Unsaved
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {p.notice && (
          <span
            className={`flex items-center gap-1 text-xs ${p.notice.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}
          >
            {p.notice.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {p.notice.text}
          </span>
        )}

        <button
          type="button"
          onClick={p.onValidate}
          disabled={p.saving}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          Validate
        </button>

        <button
          type="button"
          onClick={p.onSave}
          disabled={p.saving}
          className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {p.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Draft
        </button>

        <button
          type="button"
          onClick={p.onPublish}
          disabled={p.saving}
          className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Rocket className="h-4 w-4" /> Publish
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-md border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50"
            title="More options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <MenuButton icon={<LayoutGrid className="h-4 w-4" />} label="Auto Arrange" onClick={() => { setMenuOpen(false); p.onAutoArrange(); }} />
                <MenuButton icon={<GitFork className="h-4 w-4" />} label="New condition…" onClick={() => { setMenuOpen(false); p.onNewCondition(); }} />
                <MenuButton icon={<Settings className="h-4 w-4" />} label="Workflow settings…" onClick={() => { setMenuOpen(false); p.onOpenSettings(); }} />
                {p.canDelete && (
                  <div className="my-1 border-t border-gray-100">
                    <MenuButton
                      icon={<Trash2 className="h-4 w-4" />}
                      label="Delete workflow…"
                      danger
                      onClick={() => { setMenuOpen(false); p.onDelete(); }}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuButton({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}