import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Trash2,
  Copy,
  Play,
  Circle,
  ClipboardList,
  ShieldCheck,
  Flag,
  ListChecks,
  Timer,
  Workflow,
  Mail,
  GitFork,
  Zap,
  Compass,
} from 'lucide-react';
import {
  isConditionKind,
  isStopKind,
  isActionKind,
  isSubprocessKind,
  type NodeKind,
  type StateNodeData,
} from './types';

const KIND_ICON_COLORS: Record<NodeKind, string> = {
  start: 'text-emerald-600',
  stop: 'text-rose-600',
  end: 'text-rose-600',
  task: 'text-indigo-600',
  condition: 'text-purple-600',
  router: 'text-purple-600',
  gate: 'text-amber-600',
  manual: 'text-violet-600',
  action: 'text-amber-600',
  comm: 'text-sky-600',
  wait: 'text-teal-600',
  interaction: 'text-sky-600',
  subprocess: 'text-fuchsia-600',
  sub: 'text-fuchsia-600',
  state: 'text-blue-600',
};

const KIND_DEFAULT_SUBTITLES: Record<NodeKind, string> = {
  start: 'Entry point for new records',
  stop: 'Terminal outcome — process ends',
  end: 'Terminal outcome — process ends',
  task: 'User task or approval',
  condition: 'Splits by TRUE / FALSE',
  router: 'Splits by TRUE / FALSE',
  gate: 'Evaluates condition',
  manual: 'Prompts user selection',
  action: 'Automated action or notification',
  comm: 'Sends notification',
  wait: 'Pauses for timer/condition',
  interaction: 'Directs user to app tab',
  subprocess: 'Sub-routine child workflow',
  sub: 'Sub-routine child workflow',
  state: 'Standard workflow step',
};

function KindIcon({ kind, className }: { kind: NodeKind; className: string }) {
  switch (kind) {
    case 'start':
      return <Play className={className} />;
    case 'stop':
    case 'end':
      return <Flag className={className} />;
    case 'task':
      return <ClipboardList className={className} />;
    case 'condition':
    case 'router':
      return <GitFork className={className} />;
    case 'gate':
      return <ShieldCheck className={className} />;
    case 'manual':
      return <ListChecks className={className} />;
    case 'action':
      return <Zap className={className} />;
    case 'comm':
      return <Mail className={className} />;
    case 'wait':
      return <Timer className={className} />;
    case 'interaction':
      return <Compass className={className} />;
    case 'subprocess':
    case 'sub':
      return <Workflow className={className} />;
    default:
      return <Circle className={className} />;
  }
}

export function StateNode({ id, data, selected }: NodeProps) {
  const {
    label,
    kind = 'state',
    terminal,
    condition_id,
    conditions,
    description,
    role_id,
    role_name,
    time_limit_hours,
    action_type,
    interaction_app,
    interaction_tab,
    subprocess_id,
    onRename,
    onDelete,
    onDuplicate,
  } = (data || {}) as StateNodeData;

  const [value, setValue] = useState(label || '');
  const iconColor = KIND_ICON_COLORS[kind] || 'text-gray-600';
  const isCondition = isConditionKind(kind);
  const isStop = isStopKind(kind) || terminal;
  const activeCondition = (conditions && conditions[0]) || condition_id || null;

  const commit = () => {
    const next = value.trim();
    setValue(next || label);
    if (next && next !== label) onRename?.(label, next);
  };

  const subtitle = isCondition
    ? activeCondition
      ? `Condition: ${activeCondition}`
      : 'Splits by TRUE / FALSE'
    : kind === 'task' && role_id
    ? `Role: ${role_name || role_id}`
    : kind === 'wait'
    ? time_limit_hours
      ? `Duration: ${time_limit_hours < 1 ? `${Math.round(time_limit_hours * 60)}m` : `${time_limit_hours}h`}`
      : activeCondition
      ? `Until: ${activeCondition}`
      : 'Pauses for timer/condition'
    : isActionKind(kind) && action_type
    ? `Action: ${action_type}`
    : kind === 'interaction' && interaction_app
    ? `App: ${interaction_app}${interaction_tab ? ` / ${interaction_tab}` : ''}`
    : isSubprocessKind(kind) && subprocess_id
    ? `Subprocess: ${subprocess_id}`
    : description || KIND_DEFAULT_SUBTITLES[kind] || 'Workflow step';

  return (
    <div
      className={`group relative min-w-[190px] max-w-[240px] rounded-lg border bg-white transition-all select-none ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
          : isStop
          ? 'border-dashed border-gray-300 shadow-2xs hover:border-gray-400'
          : 'border-gray-300 shadow-2xs hover:border-gray-400'
      } ${isCondition ? 'pr-11' : ''}`}
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

      {/* Target Input Handle on Left (All nodes except Start node) */}
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
            if (e.key === 'Escape') {
              setValue(label);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="nodrag min-w-0 flex-1 truncate bg-transparent text-xs font-semibold text-gray-900 outline-none hover:bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500/30 rounded px-1 -mx-1"
        />
        {isStop && (
          <span className="shrink-0 rounded bg-gray-100 border border-gray-200 px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider text-gray-600">
            Stop
          </span>
        )}
      </div>

      {/* Subtitle / Metadata Display */}
      <div className="px-3 pb-2.5">
        <p className="truncate text-[11px] text-gray-500 font-normal">
          {subtitle}
        </p>
      </div>

      {/* Condition / Router Specific Handles on Right (TRUE & FALSE) */}
      {isCondition ? (
        <>
          <div className="absolute top-2 right-1 flex items-center gap-1">
            <span className="font-mono text-[9px] font-bold text-gray-600">T</span>
            <Handle
              type="source"
              id="TRUE"
              position={Position.Right}
              className="!relative !right-0 !top-0 !translate-y-0 !h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500 hover:!bg-blue-600 hover:!scale-125 transition-all"
            />
          </div>
          <div className="absolute bottom-2 right-1 flex items-center gap-1">
            <span className="font-mono text-[9px] font-bold text-gray-600">F</span>
            <Handle
              type="source"
              id="FALSE"
              position={Position.Right}
              className="!relative !right-0 !top-0 !translate-y-0 !h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500 hover:!bg-blue-600 hover:!scale-125 transition-all"
            />
          </div>
          {/* Fallback hidden handles to guarantee no edge is dropped if sourceHandle is unassigned or lowercase */}
          <Handle
            type="source"
            position={Position.Right}
            className="!opacity-0 !pointer-events-none !w-0 !h-0 !border-0 !p-0 !min-w-0 !min-h-0"
          />
          <Handle
            type="source"
            id="true"
            position={Position.Right}
            className="!opacity-0 !pointer-events-none !w-0 !h-0 !border-0 !p-0 !min-w-0 !min-h-0"
          />
          <Handle
            type="source"
            id="false"
            position={Position.Right}
            className="!opacity-0 !pointer-events-none !w-0 !h-0 !border-0 !p-0 !min-w-0 !min-h-0"
          />
        </>
      ) : (
        /* Standard Output Handle on Right (All nodes except Stop/End nodes) */
        !isStop && (
          <>
            <Handle
              type="source"
              position={Position.Right}
              className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400 hover:!bg-blue-600 hover:!scale-125 transition-all"
            />
            {/* Fallback handles for named events (NEXT, START, APPROVE, REJECT, TRUE, FALSE) */}
            <Handle
              type="source"
              id="NEXT"
              position={Position.Right}
              className="!opacity-0 !pointer-events-none !w-0 !h-0 !border-0 !p-0 !min-w-0 !min-h-0"
            />
            <Handle
              type="source"
              id="START"
              position={Position.Right}
              className="!opacity-0 !pointer-events-none !w-0 !h-0 !border-0 !p-0 !min-w-0 !min-h-0"
            />
            <Handle
              type="source"
              id="APPROVE"
              position={Position.Right}
              className="!opacity-0 !pointer-events-none !w-0 !h-0 !border-0 !p-0 !min-w-0 !min-h-0"
            />
            <Handle
              type="source"
              id="REJECT"
              position={Position.Right}
              className="!opacity-0 !pointer-events-none !w-0 !h-0 !border-0 !p-0 !min-w-0 !min-h-0"
            />
            <Handle
              type="source"
              id="TRUE"
              position={Position.Right}
              className="!opacity-0 !pointer-events-none !w-0 !h-0 !border-0 !p-0 !min-w-0 !min-h-0"
            />
            <Handle
              type="source"
              id="FALSE"
              position={Position.Right}
              className="!opacity-0 !pointer-events-none !w-0 !h-0 !border-0 !p-0 !min-w-0 !min-h-0"
            />
          </>
        )
      )}
    </div>
  );
}

export default memo(StateNode);
