import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, GitFork, LayoutGrid, Loader2, MoreHorizontal, Pencil, Rocket, Save, Settings, Trash2 } from 'lucide-react';
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
  onAutoArrange: () => void;
  onNewCondition: () => void;
  onOpenSettings: () => void;
  onValidate: () => void;
  onSave: () => void;
  onPublish: () => void;
  onDelete: () => void;
}

const statusPill: Record<Workflow['status'], string> = {
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  deprecated: 'bg-gray-50 text-gray-600 border-gray-200',
};

export function HeaderBar(p: HeaderBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative flex h-14 shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-1.5">
        <select
          value={p.entityType}
          onChange={(e) => p.onEntityType(e.target.value)}
          title="Entity type this workflow applies to"
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-900 shadow-2xs hover:border-gray-300 focus:border-blue-500 focus:outline-none transition-colors"
        >
          {p.knownTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-gray-300 font-medium">/</span>
        <input
          value={p.versionLabel}
          onChange={(e) => p.onVersionLabel(e.target.value)}
          placeholder="draft_v1"
          title="Version label"
          className="w-28 rounded-md border border-transparent px-2 py-1 text-xs font-semibold text-gray-600 hover:border-gray-200 hover:bg-gray-50 focus:border-blue-500 focus:bg-white focus:outline-none transition-colors"
        />
      </div>

      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusPill[p.status]}`}>
        {p.status}
      </span>

      {p.dirty && (
        <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          <Pencil className="h-3 w-3" /> Unsaved
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {p.notice && (
          <span
            className={`flex items-center gap-1 text-xs font-medium ${p.notice.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}
          >
            {p.notice.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {p.notice.text}
          </span>
        )}

        <button
          type="button"
          onClick={p.onValidate}
          disabled={p.saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 transition-colors"
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-gray-400" />
          <span>Validate</span>
        </button>

        <button
          type="button"
          onClick={p.onSave}
          disabled={p.saving}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 transition-colors"
        >
          {p.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" /> : <Save className="h-3.5 w-3.5 text-gray-400" />}
          <span>Save Draft</span>
        </button>

        <button
          type="button"
          onClick={p.onPublish}
          disabled={p.saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          <Rocket className="h-3.5 w-3.5" />
          <span>Publish</span>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700 transition-colors"
            title="More options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <MenuButton icon={<LayoutGrid className="h-4 w-4 text-gray-400" />} label="Auto Arrange" onClick={() => { setMenuOpen(false); p.onAutoArrange(); }} />
                <MenuButton icon={<GitFork className="h-4 w-4 text-gray-400" />} label="New condition…" onClick={() => { setMenuOpen(false); p.onNewCondition(); }} />
                <MenuButton icon={<Settings className="h-4 w-4 text-gray-400" />} label="Workflow settings…" onClick={() => { setMenuOpen(false); p.onOpenSettings(); }} />
                {p.canDelete && (
                  <div className="my-1 border-t border-gray-100">
                    <MenuButton
                      icon={<Trash2 className="h-4 w-4 text-red-500" />}
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
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
      } transition-colors`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}