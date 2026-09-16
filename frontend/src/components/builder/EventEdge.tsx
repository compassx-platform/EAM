import { memo, useEffect, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { GitFork, ShieldCheck } from 'lucide-react';
import type { WorkflowChoice, WorkflowAction } from '../../types';

export type EventEdgeData = {
  event: string;
  conditions: string[];
  choices?: WorkflowChoice[];
  on_after?: WorkflowAction[];
  isRouterSource?: boolean;
  onRenameEvent?: (edgeId: string, event: string) => void;
};

function EventEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  const { event, conditions = [], choices, onRenameEvent, isRouterSource } = (data || {}) as EventEdgeData;
  const [value, setValue] = useState(event);
  const branchCount = choices?.length ?? 0;

  // Keep the on-canvas label in sync when the event is renamed elsewhere
  // (e.g. from the node inspector's event popup).
  useEffect(() => {
    setValue(event);
  }, [event]);

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
    setValue(next || event);
    if (next && next !== event) onRenameEvent?.(id, next);
  };

  const guarded = (conditions?.length ?? 0) > 0;
  const branching = branchCount > 0;
  const isTrue = event === 'TRUE';
  const isFalse = event === 'FALSE';
  const isRouterBranch = Boolean(isRouterSource || (isTrue && isRouterSource) || (isFalse && isRouterSource));

  const strokeColor = selected
    ? '#2563eb'
    : isRouterBranch
    ? '#64748b'
    : branching
    ? '#d97706'
    : '#94a3b8';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          strokeWidth: isRouterBranch ? 2.5 : 2,
          stroke: strokeColor,
          strokeDasharray: selected ? undefined : isRouterBranch ? undefined : branching || guarded ? '4 3' : '5 4',
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute flex flex-col items-center gap-0.5"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {isRouterBranch ? (
            <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-gray-700 shadow-sm pointer-events-none select-none">
              <span>{isTrue ? 'TRUE' : isFalse ? 'FALSE' : event}</span>
            </div>
          ) : (
            <>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    setValue(event);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="EVENT"
                className="rounded border border-blue-200 bg-white px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold tracking-wide text-blue-700 shadow-sm outline-none focus:border-blue-500"
                style={{ width: 'auto', minWidth: '4rem' }}
              />
              <div className="flex items-center gap-0.5">
                {branching && (
                  <span className="flex items-center gap-0.5 rounded bg-orange-100 px-1 py-px text-[9px] font-semibold text-orange-700">
                    <GitFork className="h-2.5 w-2.5" /> {branchCount}
                  </span>
                )}
                {guarded && (
                  <span className="flex items-center gap-0.5 rounded bg-amber-100 px-1 py-px text-[9px] font-semibold text-amber-700">
                    <ShieldCheck className="h-2.5 w-2.5" /> condition
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(EventEdge);