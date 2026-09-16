import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { X, Copy, Play, Circle, ClipboardList, ShieldCheck, Flag, ListChecks, Timer, Workflow, Mail } from 'lucide-react';
import type { NodeKind } from './flowModel';

export type StateNodeData = {
  label: string;
  kind: NodeKind;
  terminal?: boolean;
  onRename?: (oldLabel: string, newLabel: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
};

const KIND_STYLES: Record<NodeKind, { dot: string; ring: string; text: string; signal: string }> = {
  start: { dot: 'bg-emerald-500', ring: 'border-emerald-300', text: 'text-emerald-800', signal: 'bg-emerald-200' },
  state: { dot: 'bg-blue-500', ring: 'border-blue-300', text: 'text-blue-800', signal: 'bg-blue-200' },
  task: { dot: 'bg-indigo-500', ring: 'border-indigo-300', text: 'text-indigo-800', signal: 'bg-indigo-200' },
  gate: { dot: 'bg-amber-500', ring: 'border-amber-300', text: 'text-amber-800', signal: 'bg-amber-200' },
  manual: { dot: 'bg-violet-500', ring: 'border-violet-300', text: 'text-violet-800', signal: 'bg-violet-200' },
  wait: { dot: 'bg-teal-500', ring: 'border-teal-300', text: 'text-teal-800', signal: 'bg-teal-200' },
  sub: { dot: 'bg-fuchsia-500', ring: 'border-fuchsia-300', text: 'text-fuchsia-800', signal: 'bg-fuchsia-200' },
  comm: { dot: 'bg-sky-500', ring: 'border-sky-300', text: 'text-sky-800', signal: 'bg-sky-200' },
  end: { dot: 'bg-rose-500', ring: 'border-rose-300', text: 'text-rose-800', signal: 'bg-rose-200' },
};

const KIND_LABEL: Record<NodeKind, string> = {
  start: 'start',
  state: 'step',
  task: 'task',
  gate: 'condition',
  manual: 'manual input',
  wait: 'wait',
  sub: 'sub-process',
  comm: 'communication',
  end: 'stop',
};

function KindIcon({ kind, className }: { kind: NodeKind; className: string }) {
  switch (kind) {
    case 'start':
      return <Play className={className} />;
    case 'gate':
      return <ShieldCheck className={className} />;
    case 'task':
      return <ClipboardList className={className} />;
    case 'manual':
      return <ListChecks className={className} />;
    case 'wait':
      return <Timer className={className} />;
    case 'sub':
      return <Workflow className={className} />;
    case 'comm':
      return <Mail className={className} />;
    case 'end':
      return <Flag className={className} />;
    default:
      return <Circle className={className} />;
  }
}

function StateNode({ id, data, selected }: NodeProps) {
  const { label, kind, terminal, onRename, onDelete, onDuplicate } = data as StateNodeData;
  const [value, setValue] = useState(label);
  const style = KIND_STYLES[kind] || KIND_STYLES.state;

  const commit = () => {
    const next = value.trim();
    setValue(next || label);
    if (next && next !== label) onRename?.(label, next);
  };

  return (
    <div
      className={`group min-w-[150px] rounded-xl border-2 bg-white shadow-sm transition-shadow ${
        selected ? 'border-blue-500 shadow-md ring-2 ring-blue-500/30' : style.ring
      }`}
    >
      {kind !== 'start' && (
        <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500" />
      )}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${style.signal} ${style.text}`}>
          <KindIcon kind={kind} className="h-3.5 w-3.5" />
        </span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="nodrag nopan w-full bg-transparent text-sm font-semibold text-gray-800 outline-none"
        />
        <div className="flex items-center">
          <button
            onClick={() => onDuplicate?.(id)}
            className="nodrag nopan rounded-md p-0.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-50 hover:text-blue-600"
            title="Duplicate"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete?.(id)}
            className="nodrag nopan rounded-md p-0.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
            title="Delete"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between px-3 pb-1.5">
        <span className={`rounded px-1 text-[9px] font-bold uppercase tracking-wider text-white ${style.dot}`}>
          {KIND_LABEL[kind] || kind}
        </span>
        {terminal && (
          <span className="rounded bg-rose-100 px-1 text-[9px] font-bold uppercase tracking-wider text-rose-600">
            ⚑ terminal
          </span>
        )}
      </div>
      {kind !== 'end' && (
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500" />
      )}
    </div>
  );
}

export default memo(StateNode);