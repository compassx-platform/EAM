import { Play, Circle, ClipboardList, ShieldCheck, Flag, MousePointer } from 'lucide-react';
import { NODE_KINDS, type NodeKind } from './flowModel';

const KIND_ICONS: Record<NodeKind, typeof Play> = {
  start: Play,
  state: Circle,
  task: ClipboardList,
  gate: ShieldCheck,
  end: Flag,
};

const KIND_STYLES: Record<NodeKind, string> = {
  start: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100',
  state: 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400 hover:bg-blue-100',
  task: 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100',
  gate: 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100',
  end: 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100',
};

export function NodePalette() {
  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Node Palette</p>

      {NODE_KINDS.map(({ kind, label, description }) => {
        const Icon = KIND_ICONS[kind];
        return (
          <div
            key={kind}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/reactflow', kind);
              e.dataTransfer.effectAllowed = 'move';
            }}
            title={description}
            className={`flex cursor-grab items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition-all active:cursor-grabbing ${KIND_STYLES[kind]}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{label}</span>
            <span className="text-[9px] font-normal opacity-70">{description.split(' ')[0]}</span>
          </div>
        );
      })}

      <p className="px-1 pt-2 text-[10px] leading-relaxed text-gray-400">
        Drag a node onto the canvas, then connect nodes via the circular handles.
      </p>

      <div className="mt-1 flex items-center gap-1.5 px-1 text-[10px] text-gray-400">
        <MousePointer className="h-3 w-3" />
        Click a node or connection to edit it in the inspector.
      </div>
    </div>
  );
}