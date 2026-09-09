import { memo, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { ShieldCheck } from 'lucide-react';

export type EventEdgeData = {
  event: string;
  gates: string[];
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
  const { event, gates = [], onRenameEvent } = (data || {}) as EventEdgeData;
  const [value, setValue] = useState(event);

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

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          strokeWidth: 2,
          stroke: selected ? '#2563eb' : '#94a3b8',
          strokeDasharray: selected ? undefined : gates.length ? '2 3' : '5 4',
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute flex flex-col items-center gap-0.5"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
        >
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
          {gates.length > 0 && (
            <span className="flex items-center gap-0.5 rounded bg-amber-100 px-1 py-px text-[9px] font-semibold text-amber-700">
              <ShieldCheck className="h-2.5 w-2.5" /> {gates.length} gate{gates.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(EventEdge);