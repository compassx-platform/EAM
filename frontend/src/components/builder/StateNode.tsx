import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Trash2, Copy, Play, Circle, ClipboardList, ShieldCheck, Flag, ListChecks, Timer, Workflow, Mail, GitFork } from 'lucide-react';
import type { NodeKind } from './flowModel';

export type StateNodeData = {
  label: string;
  kind: NodeKind;
  terminal?: boolean;
  condition_id?: string | null;
  conditions?: string[];
  description?: string;
  onRename?: (oldLabel: string, newLabel: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
};

const KIND_ICON_COLORS: Record<NodeKind, string> = {
  start: 'text-emerald-600',
  state: 'text-blue-600',
  router: 'text-purple-600',
  task: 'text-indigo-600',
  gate: 'text-amber-600',
  manual: 'text-violet-600',
  wait: 'text-teal-600',
  sub: 'text-fuchsia-600',
  comm: 'text-sky-600',
  end: 'text-rose-600',
};

const KIND_DEFAULT_SUBTITLES: Record<NodeKind, string> = {
  start: 'Entry point for new records',
  state: 'Step in the process',
  router: 'Splits by TRUE / FALSE',
  task: 'User task or approval',
  gate: 'Evaluates condition',
  manual: 'Prompts user selection',
  wait: 'Pauses for timer/condition',
  sub: 'Sub-routine workflow',
  comm: 'Sends notification',
  end: 'Terminal outcome',
};

function KindIcon({ kind, className }: { kind: NodeKind; className: string }) {
  switch (kind) {
    case 'start':
      return <Play className={className} />;
    case 'router':
      return <GitFork className={className} />;
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
  const { label, kind, terminal, condition_id, conditions, description, onRename, onDelete, onDuplicate } = data as StateNodeData;
  const [value, setValue] = useState(label);
  const iconColor = KIND_ICON_COLORS[kind] || 'text-gray-600';
  const activeCondition = (conditions && conditions[0]) || condition_id || null;

  const commit = () => {
    const next = value.trim();
    setValue(next || label);
    if (next && next !== label) onRename?.(label, next);
  };

  const subtitle =
    kind === 'router'
      ? activeCondition
        ? `Condition: ${activeCondition}`
        : 'Splits by TRUE / FALSE'
      : description || KIND_DEFAULT_SUBTITLES[kind] || 'Workflow step';

  return (
    <div
      className={`group relative min-w-[190px] max-w-[240px] rounded-lg border bg-white transition-all select-none ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
          : kind === 'end'
          ? 'border-dashed border-gray-300 shadow-2xs hover:border-gray-400'
          : 'border-gray-300 shadow-2xs hover:border-gray-400'
      } ${kind === 'router' ? 'pr-11' : ''}`}
    >
      {/* Floating Action Bar on Hover/Selected */}
      <div className="absolute -top-7 right-1 z-20 hidden items-center gap-0.5 rounded-md border border-gray-200 bg-white p-0.5 shadow-xs group-hover:flex">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate?.(id);
          }}
          className="nodrag nopan rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          title="Duplicate node"
        >
          <Copy className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.(id);
          }}
          className="nodrag nopan rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          title="Delete node"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Target Input Handle on Left */}
      {kind !== 'start' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400 hover:!bg-blue-600 hover:!scale-125 transition-all"
        />
      )}

      {/* Top Row: Icon + Editable Name + Terminal Tag */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-0.5">
        <KindIcon kind={kind} className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="nodrag nopan w-full truncate bg-transparent text-xs font-semibold text-gray-950 outline-none hover:bg-gray-50 focus:bg-white rounded px-1 -mx-1 transition-colors"
        />
        {terminal && (
          <span className="shrink-0 rounded bg-rose-50 border border-rose-200 px-1 py-0.2 font-mono text-[9px] font-semibold text-rose-700">
            stop
          </span>
        )}
      </div>

      {/* Description / Subtitle Row */}
      <div className="px-3 pb-2.5 pt-0.5">
        <p className="truncate text-[11px] text-gray-500 leading-snug" title={subtitle}>
          {subtitle}
        </p>
      </div>

      {/* Right Handles (Dedicated TRUE/FALSE for Router, or Standard Output) */}
      {kind === 'router' ? (
        <>
          <div className="absolute right-2 top-[30%] -translate-y-1/2 flex items-center pointer-events-none select-none">
            <span className="text-[9px] font-mono font-bold text-gray-500">
              TRUE
            </span>
          </div>
          <Handle
            id="TRUE"
            type="source"
            position={Position.Right}
            style={{ top: '30%' }}
            className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400 hover:!bg-blue-600 hover:!scale-125 transition-all"
          />

          <div className="absolute right-2 top-[70%] -translate-y-1/2 flex items-center pointer-events-none select-none">
            <span className="text-[9px] font-mono font-bold text-gray-500">
              FALSE
            </span>
          </div>
          <Handle
            id="FALSE"
            type="source"
            position={Position.Right}
            style={{ top: '70%' }}
            className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400 hover:!bg-blue-600 hover:!scale-125 transition-all"
          />
        </>
      ) : kind !== 'end' ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400 hover:!bg-blue-600 hover:!scale-125 transition-all"
        />
      ) : null}
    </div>
  );
}

export default memo(StateNode);