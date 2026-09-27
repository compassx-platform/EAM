import { memo, useEffect, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { GitFork, ShieldCheck, Zap } from 'lucide-react';
import {
  isConditionKind,
  isActionKind,
  isSubprocessKind,
  type EventEdgeData,
} from './types';

export function EventEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  data,
}: EdgeProps) {
  const {
    event,
    label,
    button_label,
    button_style,
    is_system,
    conditions = [],
    choices,
    on_after = [],
    onRenameEvent,
    isRouterSource,
    sourceNodeKind,
  } = (data || {}) as EventEdgeData;

  const displayLabel = button_label || label || event || '';
  const [value, setValue] = useState(displayLabel);
  const branchCount = choices?.length ?? 0;
  const sideEffectCount = on_after?.length ?? 0;

  useEffect(() => {
    setValue(button_label || label || event || '');
  }, [button_label, label, event]);

  const isValidCoord =
    typeof sourceX === 'number' &&
    typeof sourceY === 'number' &&
    typeof targetX === 'number' &&
    typeof targetY === 'number' &&
    !Number.isNaN(sourceX) &&
    !Number.isNaN(sourceY) &&
    !Number.isNaN(targetX) &&
    !Number.isNaN(targetY);

  if (!isValidCoord) {
    return null;
  }

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const commit = () => {
    const next = value.trim();
    setValue(next || button_label || label || event || '');
    if (next && next !== (button_label || label || event)) onRenameEvent?.(id, next);
  };

  const guarded = (conditions?.length ?? 0) > 0;
  const branching = branchCount > 0;
  const isTrue = event === 'TRUE';
  const isFalse = event === 'FALSE';
  const isCondition = isConditionKind(sourceNodeKind);
  const isRouterBranch = Boolean(isRouterSource || (isTrue && isRouterSource) || (isFalse && isRouterSource) || isCondition || isTrue || isFalse);

  // Connectors without user actions (Start, Action, Wait, Interaction, Subprocess, or automated progression)
  const isAutoProgression =
    sourceNodeKind === 'start' ||
    isActionKind(sourceNodeKind) ||
    sourceNodeKind === 'wait' ||
    sourceNodeKind === 'interaction' ||
    isSubprocessKind(sourceNodeKind) ||
    event === 'START' ||
    event === 'NEXT' ||
    (Boolean(is_system) && !isRouterBranch);

  const showLabel = isRouterBranch || !isAutoProgression;

  const strokeColor = selected
    ? '#2563eb'
    : isRouterBranch
    ? '#64748b'
    : branching
    ? '#d97706'
    : isAutoProgression
    ? '#94a3b8'
    : button_style === 'danger'
    ? '#e11d48'
    : '#94a3b8';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          strokeWidth: selected ? 2.5 : isRouterBranch ? 2 : 1.75,
          stroke: strokeColor,
          strokeDasharray: selected ? undefined : isRouterBranch || isAutoProgression ? undefined : is_system ? '2 2' : branching || guarded ? '4 3' : undefined,
        }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute flex flex-col items-center gap-0.5"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
          {isRouterBranch ? (
            <div
              className={`flex max-w-[380px] items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider shadow-2xs pointer-events-none select-none truncate ${
                isTrue
                  ? 'border-gray-300 bg-white text-gray-800'
                  : isFalse
                  ? 'border-gray-200 bg-gray-50 text-gray-600'
                  : 'border-gray-200 bg-white text-gray-700'
              }`}
              title={isTrue ? 'TRUE' : isFalse ? 'FALSE' : event}
            >
              <span className="truncate">{isTrue ? 'TRUE' : isFalse ? 'FALSE' : event}</span>
            </div>
          ) : (
            <>
              <input
                value={value}
                title={value || event}
                onChange={(e) => setValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    setValue(displayLabel);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Action Label"
                style={{
                  width: `${Math.max(6, (value || 'Action').length + 2.5)}ch`,
                  maxWidth: '380px',
                }}
                className={`nodrag nopan rounded border px-2 py-0.5 text-center text-[10px] font-semibold tracking-wide shadow-2xs outline-none transition-colors truncate ${
                  is_system
                    ? 'border-gray-200 bg-gray-50 text-gray-500 font-mono italic'
                    : button_style === 'danger'
                    ? 'border-rose-200 bg-rose-50/70 text-rose-700'
                    : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300 focus:border-blue-500 focus:text-blue-700 focus:ring-1 focus:ring-blue-500/20'
                }`}
              />
              <div className="flex items-center gap-0.5">
                {branching && (
                  <span className="flex items-center gap-0.5 rounded bg-orange-50 border border-orange-200 px-1 py-px text-[9px] font-semibold text-orange-700">
                    <GitFork className="h-2.5 w-2.5" /> {branchCount}
                  </span>
                )}
                {guarded && (
                  <span className="flex items-center gap-0.5 rounded bg-amber-50 border border-amber-200 px-1 py-px text-[9px] font-semibold text-amber-700">
                    <ShieldCheck className="h-2.5 w-2.5" /> condition
                  </span>
                )}
                {sideEffectCount > 0 && (
                  <span className="flex items-center gap-0.5 rounded bg-sky-50 border border-sky-200 px-1 py-px text-[9px] font-semibold text-sky-700" title={`${sideEffectCount} side effect(s) on arrival`}>
                    <Zap className="h-2.5 w-2.5" /> {sideEffectCount}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(EventEdge);
