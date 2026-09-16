import { LayoutGrid, Settings, Play, Circle, ClipboardList, ShieldCheck, Flag, ListChecks, Timer, Workflow, Mail } from 'lucide-react';
import { NODE_KINDS, type NodeKind } from '../flowModel';

const KIND_ICONS: Record<NodeKind, typeof Play> = {
  start: Play,
  state: Circle,
  task: ClipboardList,
  gate: ShieldCheck,
  manual: ListChecks,
  wait: Timer,
  sub: Workflow,
  comm: Mail,
  end: Flag,
};

const KIND_STYLES: Record<NodeKind, string> = {
  start: 'text-emerald-700 hover:bg-emerald-50',
  state: 'text-blue-700 hover:bg-blue-50',
  task: 'text-indigo-700 hover:bg-indigo-50',
  gate: 'text-amber-700 hover:bg-amber-50',
  manual: 'text-violet-700 hover:bg-violet-50',
  wait: 'text-teal-700 hover:bg-teal-50',
  sub: 'text-fuchsia-700 hover:bg-fuchsia-50',
  comm: 'text-sky-700 hover:bg-sky-50',
  end: 'text-rose-700 hover:bg-rose-50',
};

interface LeftRailProps {
  onAdd: (kind: NodeKind) => void;
  onAutoArrange: () => void;
  onOpenSettings: () => void;
}

/**
 * Databricks-style collapsible rail: a compact icon strip that expands on
 * hover to reveal labels — every tool is discoverable, nothing crowds the
 * canvas at rest.
 */
export function LeftRail({ onAdd, onAutoArrange, onOpenSettings }: LeftRailProps) {
  return (
    <div className="group flex w-12 shrink-0 flex-col items-start gap-1 overflow-hidden border-r border-gray-200 bg-white py-2 transition-all duration-200 hover:w-56">
      <p className="w-full whitespace-nowrap px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
        Add state
      </p>

      {NODE_KINDS.map(({ kind, label, description }) => {
        const Icon = KIND_ICONS[kind];
        return (
          <button
            key={kind}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/reactflow', kind);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onClick={() => onAdd(kind)}
            title={description}
            className={`flex w-full cursor-grab items-center gap-2 whitespace-nowrap px-2.5 py-1.5 text-sm font-medium transition-colors active:cursor-grabbing ${KIND_STYLES[kind]}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">{label}</span>
          </button>
        );
      })}

      <div className="mx-2.5 my-1.5 h-px w-[calc(100%-1.25rem)] bg-gray-100" />

      <button
        type="button"
        onClick={onAutoArrange}
        title="Auto arrange the canvas"
        className="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
      >
        <LayoutGrid className="h-4 w-4 shrink-0" />
        <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">Auto Arrange</span>
      </button>

      <button
        type="button"
        onClick={onOpenSettings}
        title="Workflow settings"
        className="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
      >
        <Settings className="h-4 w-4 shrink-0" />
        <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">Settings</span>
      </button>

      <p className="w-full whitespace-nowrap px-2.5 pt-2 text-[10px] text-gray-400">
        Drag onto the canvas · click to add
      </p>
    </div>
  );
}