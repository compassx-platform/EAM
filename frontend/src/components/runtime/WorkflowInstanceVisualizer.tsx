import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type NodeProps,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  X,
  Workflow,
  CheckCircle2,
  Clock,
  Zap,
  TrendingUp,
  User,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowRight,
  ListTodo,
  FileText,
  AlertCircle,
  Play,
  Flag,
  ClipboardList,
  GitFork,
  ListChecks,
  Timer,
  Compass,
  Circle,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../api/client';
import type {
  EntityRecord,
  EntityEvent,
  TaskAssignment,
  WorkflowDefinition,
  Workflow as WorkflowType,
} from '../../types';
import { definitionToFlow } from '../workflow-ui/graphUtils';
import { isConditionKind, isStopKind } from '../workflow-ui/types';
import { EventEdge } from '../workflow-ui/EventEdge';

export function useLiveCountdown(
  targetDate: Date | string | null | undefined,
  enteredDate?: Date | string | null | undefined
) {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (!targetDate) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (!targetDate) {
    return { hasTimer: false, remainingSeconds: 0, formatted: '', formattedDigital: '', isExpired: false, progressPct: 0 };
  }

  const targetMs = new Date(targetDate).getTime();
  const enteredMs = enteredDate ? new Date(enteredDate).getTime() : targetMs - 60000;
  const totalDurationMs = Math.max(1000, targetMs - enteredMs);
  const diffMs = targetMs - now;
  const remainingSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const isExpired = diffMs <= 0;

  const elapsedMs = Math.max(0, now - enteredMs);
  const progressPct = Math.min(100, Math.max(0, (elapsedMs / totalDurationMs) * 100));

  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  let formatted = '';
  if (hours > 0) {
    formatted = `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  } else if (minutes > 0) {
    formatted = `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  } else {
    formatted = `${seconds}s`;
  }

  const formattedDigital =
    hours > 0
      ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return {
    hasTimer: true,
    remainingSeconds,
    formatted,
    formattedDigital,
    isExpired,
    progressPct,
    targetDate: new Date(targetDate),
    enteredDate: enteredDate ? new Date(enteredDate) : null,
  };
}

interface VisualizerNodeData {
  label: string;
  kind?: string;
  description?: string;
  isCurrentActive?: boolean;
  isVisited?: boolean;
  stepNumbers?: number[];
  taskAssignments?: TaskAssignment[];
  events?: EntityEvent[];
  timeLimitHours?: number | null;
  targetDueTime?: string | null;
  enteredTime?: string | null;
  [key: string]: unknown;
}

// Custom Node Component for Runtime Workflow Visualizer
function VisualizerNode({ id, data, selected }: NodeProps) {
  const {
    label,
    kind = 'state',
    isCurrentActive = false,
    isVisited = false,
    stepNumbers = [],
    taskAssignments = [],
    timeLimitHours,
    targetDueTime,
    enteredTime,
  } = (data || {}) as VisualizerNodeData;

  const countdown = useLiveCountdown(isCurrentActive ? targetDueTime : null, enteredTime);

  const isCondition = isConditionKind(kind as any);
  const isStop = isStopKind(kind as any);

  let borderStyle = 'border-gray-200 bg-gray-50/60 text-gray-400 opacity-50';
  if (isCurrentActive) {
    borderStyle = 'border-2 border-blue-600 bg-blue-50/50 text-gray-900 ring-4 ring-blue-500/20 shadow-md opacity-100';
  } else if (isVisited) {
    borderStyle = 'border-slate-300 bg-white text-gray-700 shadow-2xs opacity-90 hover:border-slate-400';
  } else if (selected) {
    borderStyle = 'border-blue-400 bg-white text-gray-800 shadow-xs opacity-90';
  }

  return (
    <div
      className={`group relative min-w-[210px] max-w-[260px] rounded-xl border p-3 transition-all select-none ${borderStyle}`}
    >
      {/* Target Handle */}
      {kind !== 'start' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400"
        />
      )}

      {/* Header Row */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {kind === 'start' ? (
            <Play className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          ) : isStop ? (
            <Flag className="h-3.5 w-3.5 text-rose-600 shrink-0" />
          ) : kind === 'task' ? (
            <ClipboardList className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
          ) : isCondition ? (
            <GitFork className="h-3.5 w-3.5 text-purple-600 shrink-0" />
          ) : kind === 'wait' ? (
            <Timer className="h-3.5 w-3.5 text-teal-600 shrink-0" />
          ) : kind === 'action' ? (
            <Zap className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-blue-600 shrink-0" />
          )}
          <span className={`text-xs font-bold truncate ${isCurrentActive ? 'text-blue-900' : isVisited ? 'text-gray-900' : 'text-gray-500'}`}>
            {label}
          </span>
        </div>

        {/* Trajectory Step Badge / Active Badge */}
        {isCurrentActive ? (
          <span className="shrink-0 flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-2xs animate-pulse">
            <Zap className="h-2.5 w-2.5" />
            Active
          </span>
        ) : isVisited && stepNumbers.length > 0 ? (
          <span className="shrink-0 flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-slate-700 shadow-2xs">
            <CheckCircle2 className="h-2.5 w-2.5 text-slate-500" />
            Step {stepNumbers.join(', ')}
          </span>
        ) : null}
      </div>

      {/* Node Kind Tag & Subtitle */}
      <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
        <span className="capitalize font-medium">{kind} node</span>
        {taskAssignments.length > 0 && (
          <span className="font-mono text-gray-600 bg-gray-100 px-1 rounded">
            {taskAssignments.length} task{taskAssignments.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Live Countdown Timer Box on Active Node */}
      {isCurrentActive && countdown.hasTimer && (
        <div className="mt-2 flex flex-col gap-1 rounded-lg border border-teal-200 bg-teal-50/90 p-2 text-teal-950 shadow-2xs">
          <div className="flex items-center justify-between text-[10px] font-bold">
            <span className="flex items-center gap-1 text-teal-700">
              <Timer className="h-3 w-3 animate-spin text-teal-600" />
              <span>{countdown.isExpired ? 'Timer Elapsed' : 'Timer Running'}</span>
            </span>
            <span className="font-mono text-xs font-black text-teal-900">
              {countdown.isExpired ? '00:00' : countdown.formattedDigital}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-teal-200/70">
            <div
              className="h-full bg-teal-600 transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${countdown.progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[9px] text-teal-700">
            <span>
              Duration: {timeLimitHours ? (timeLimitHours < 1 ? `${Math.round(timeLimitHours * 60)}m` : `${timeLimitHours}h`) : 'Timer'}
            </span>
            <span className="font-semibold">
              {countdown.isExpired ? 'Auto-advancing…' : `${countdown.formatted} pending`}
            </span>
          </div>
        </div>
      )}

      {/* Source Handles */}
      {isCondition ? (
        <>
          <div className="absolute right-2 top-[30%] -translate-y-1/2 flex items-center pointer-events-none select-none">
            <span className="text-[8px] font-mono font-bold text-gray-600">TRUE</span>
          </div>
          <Handle
            id="TRUE"
            type="source"
            position={Position.Right}
            style={{ top: '30%' }}
            className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500"
          />

          <div className="absolute right-2 top-[70%] -translate-y-1/2 flex items-center pointer-events-none select-none">
            <span className="text-[8px] font-mono font-bold text-gray-600">FALSE</span>
          </div>
          <Handle
            id="FALSE"
            type="source"
            position={Position.Right}
            style={{ top: '70%' }}
            className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-500"
          />

          {/* Fallback hidden handles */}
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
      ) : !isStop ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400"
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
      ) : null}
    </div>
  );
}

function InspectorTimerCard({
  nodeData,
  isCurrentActive,
}: {
  nodeData: VisualizerNodeData;
  isCurrentActive: boolean;
}) {
  const timeLimitHours = (nodeData.timeLimitHours ?? (nodeData as any).time_limit_hours) as number | null | undefined;
  const targetDueTime = isCurrentActive ? nodeData.targetDueTime : null;
  const enteredTime = nodeData.enteredTime;

  const countdown = useLiveCountdown(targetDueTime, enteredTime);

  const durationDisplay = timeLimitHours
    ? Number(timeLimitHours) < 1
      ? `${Math.round(Number(timeLimitHours) * 60)} minutes`
      : Number(timeLimitHours) === 1
        ? '1 hour'
        : `${timeLimitHours} hours`
    : null;

  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
        Timer & Auto-Expiry
      </h4>
      <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3.5 text-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-teal-950">
            <Timer className="h-4 w-4 text-teal-600" />
            <span>{isCurrentActive ? (countdown.isExpired ? 'Timer Elapsed' : 'Timer Running') : 'Configured Timer'}</span>
          </div>
          {isCurrentActive && (
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${countdown.isExpired ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'}`}>
              <Clock className="h-3 w-3" />
              {countdown.isExpired ? 'Expired' : 'Active'}
            </span>
          )}
        </div>

        {durationDisplay && (
          <div className="flex items-center justify-between text-gray-600">
            <span>Configured Duration:</span>
            <span className="font-semibold text-gray-900">{durationDisplay}</span>
          </div>
        )}

        {isCurrentActive && countdown.hasTimer && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Time Remaining:</span>
              <span className="font-mono text-sm font-bold text-teal-900">
                {countdown.isExpired ? '00:00 (Elapsed)' : countdown.formatted}
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-teal-200/70">
              <div
                className="h-full bg-teal-600 transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${countdown.progressPct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-teal-800">
              <span>Progress: {Math.round(countdown.progressPct)}%</span>
              <span>
                {countdown.isExpired
                  ? 'Auto-advancing to next state…'
                  : `Expires at ${countdown.targetDate?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
              </span>
            </div>
          </>
        )}

        {enteredTime && isCurrentActive && (
          <div className="text-[10px] text-gray-500 pt-1 border-t border-teal-100/80">
            Entered state at: {new Date(enteredTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = {
  state: VisualizerNode,
  visualizer: VisualizerNode,
};

const edgeTypes = {
  event: EventEdge,
  default: EventEdge,
};

export interface WorkflowInstanceVisualizerProps {
  entity: EntityRecord;
  entityType: string;
  events?: EntityEvent[];
  taskAssignments?: TaskAssignment[];
  isOpen: boolean;
  onClose: () => void;
}

interface StepTraceItem {
  stepIndex: number;
  state: string;
  fromState: string | null;
  eventType: string;
  actorId: string;
  actorType: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export const WorkflowInstanceVisualizer: React.FC<WorkflowInstanceVisualizerProps> = ({
  entity,
  entityType,
  events = [],
  taskAssignments = [],
  isOpen,
  onClose,
}) => {
  const [workflowDef, setWorkflowDef] = useState<WorkflowDefinition | null>(null);
  const [workflowMeta, setWorkflowMeta] = useState<WorkflowType | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(entity.status);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // 1. Calculate Chronological Step History Trajectory
  const { trajectory, visitedStates, stepMap, traversedEdgeKeys } = useMemo(() => {
    const traj: StepTraceItem[] = [];
    const visited = new Set<string>();
    const steps = new Map<string, number[]>();
    const traversedEdges = new Set<string>();

    let idx = 1;
    // Filter events that represent state changes or creation
    const stateEvents = events.filter(
      (e) => e.to_state || e.event_type === 'CREATED' || e.event_type === 'TRANSITION'
    );

    for (const ev of stateEvents) {
      const toState = ev.to_state || (ev.event_type === 'CREATED' ? entity.status : null);
      if (!toState) continue;

      traj.push({
        stepIndex: idx,
        state: toState,
        fromState: ev.from_state || null,
        eventType: ev.event_type,
        actorId: ev.actor_id || 'system',
        actorType: ev.actor_type || 'user',
        timestamp: ev.transaction_time,
        payload: ev.payload || {},
      });

      visited.add(toState);
      const existing = steps.get(toState) || [];
      existing.push(idx);
      steps.set(toState, existing);

      if (ev.from_state && toState) {
        traversedEdges.add(`${ev.from_state}->${toState}`);
      }

      idx += 1;
    }

    // Always ensure current state is marked as visited
    if (entity.status) {
      visited.add(entity.status);
      if (!steps.has(entity.status)) {
        steps.set(entity.status, [idx]);
      }
    }

    return {
      trajectory: traj,
      visitedStates: visited,
      stepMap: steps,
      traversedEdgeKeys: traversedEdges,
    };
  }, [events, entity.status]);

  // 2. Fetch workflow definition for this entity
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.listWorkflows(entityType)
      .then((workflows) => {
        let matching = workflows.find((w) => w.version_label === entity.workflow_version);
        if (!matching) matching = workflows.find((w) => w.status === 'published');
        if (!matching && workflows.length > 0) matching = workflows[0];

        if (matching) {
          setWorkflowMeta(matching);
          setWorkflowDef(matching.definition);
        }
      })
      .catch((err) => console.error('Failed to load workflow for visualizer:', err))
      .finally(() => setLoading(false));
  }, [isOpen, entityType, entity.workflow_version]);

  // 3. Transform workflow definition into highlighted React Flow nodes and edges
  useEffect(() => {
    if (!workflowDef) return;

    const { nodes: flowNodes, edges: flowEdges } = definitionToFlow(workflowDef);

    // Enrich Nodes with execution status and timer metadata
    const enrichedNodes: Node[] = flowNodes.map((n) => {
      const isCurrentActive = n.id === entity.status;
      const isVisited = visitedStates.has(n.id);
      const stepNumbers = stepMap.get(n.id) || [];
      const nodeTasks = taskAssignments.filter((t) => t.state_name === n.id || t.node_id === n.id);
      const nodeEvents = events.filter((e) => e.to_state === n.id);

      const nodeData = n.data as any;
      const timeLimitHours = nodeData?.time_limit_hours ?? null;
      let targetDueTime: string | null = null;
      let enteredTime: string | null = null;

      if (isCurrentActive) {
        const entryEvent = events.filter((e) => e.to_state === entity.status).slice(-1)[0];
        enteredTime = entryEvent?.transaction_time || entity.updated_at || entity.created_at || new Date().toISOString();

        if (timeLimitHours && Number(timeLimitHours) > 0) {
          const enteredMs = new Date(enteredTime).getTime();
          const dueMs = enteredMs + Number(timeLimitHours) * 3600 * 1000;
          targetDueTime = new Date(dueMs).toISOString();
        } else if (entity.custom_fields || ((entity as any).data && typeof (entity as any).data === 'object')) {
          const customFields = entity.custom_fields || (entity as any).data || {};
          const expiryField = customFields.valid_to || customFields.expires_at || customFields.due_date;
          if (expiryField) {
            targetDueTime = new Date(expiryField).toISOString();
          }
        }
      }

      return {
        ...n,
        type: 'visualizer',
        data: {
          ...n.data,
          isCurrentActive,
          isVisited,
          stepNumbers,
          taskAssignments: nodeTasks,
          events: nodeEvents,
          timeLimitHours,
          targetDueTime,
          enteredTime,
        },
      };
    });

    // Find latest event to identify active incoming edge
    const latestEvent = events.length > 0 ? events[events.length - 1] : null;
    const activeIncomingEdgeKey =
      latestEvent && latestEvent.from_state && latestEvent.to_state
        ? `${latestEvent.from_state}->${latestEvent.to_state}`
        : null;

    // Enrich Edges with traversed trajectory styles
    const enrichedEdges: Edge[] = flowEdges.map((e) => {
      const edgeKey = `${e.source}->${e.target}`;
      const isCurrentActiveEdge = edgeKey === activeIncomingEdgeKey && e.target === entity.status;
      const isTraversed = traversedEdgeKeys.has(edgeKey);

      if (isCurrentActiveEdge) {
        return {
          ...e,
          animated: true,
          style: { stroke: '#2563eb', strokeWidth: 2.5 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#2563eb',
            width: 16,
            height: 16,
          },
        };
      }

      if (isTraversed) {
        return {
          ...e,
          animated: false,
          style: { stroke: '#64748b', strokeWidth: 1.75 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#64748b',
            width: 14,
            height: 14,
          },
        };
      }

      return {
        ...e,
        animated: false,
        style: { stroke: '#cbd5e1', strokeWidth: 1.25 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#94a3b8',
          width: 12,
          height: 12,
        },
      };
    });

    setNodes(enrichedNodes);
    setEdges(enrichedEdges);
  }, [workflowDef, entity.status, visitedStates, stepMap, traversedEdgeKeys, taskAssignments, events, setNodes, setEdges]);

  // Handle outside Esc key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectedNodeData = nodes.find((n) => n.id === selectedNodeId)?.data as VisualizerNodeData | undefined;
  const selectedNodeTasks = taskAssignments.filter((t) => t.state_name === selectedNodeId);
  const selectedNodeEvents = events.filter((e) => e.to_state === selectedNodeId);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      {/* Visualizer Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
            <Workflow className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900">
                Workflow Instance Visualizer
              </h2>
              <span className="font-mono text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                {entityType.toUpperCase()}: {entity.id}
              </span>
              {entity.status && (
                <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                  <Zap className="h-2.5 w-2.5" />
                  Active: {entity.status}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              Workflow Version: {workflowMeta?.version_label || entity.workflow_version || 'v1.0'} · Traversed {trajectory.length} steps
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            title="Close Visualizer (Esc)"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Visualizer Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-50">
        {/* Left / Center: React Flow Canvas */}
        <div className="relative flex-1 h-full min-w-0">
          {loading ? (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <Workflow className="h-6 w-6 animate-spin text-blue-600 mr-2" />
              <span>Loading workflow trace graph...</span>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              fitView
              minZoom={0.2}
              maxZoom={1.8}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#cbd5e1" gap={18} size={1} />
              <Controls position="bottom-left" showInteractive={false} />
              <MiniMap
                position="top-right"
                nodeColor={(n) => {
                  if (n.id === entity.status) return '#2563eb';
                  if (visitedStates.has(n.id)) return '#475569';
                  return '#e2e8f0';
                }}
                className="!m-4 !border !border-gray-200 !rounded-lg !shadow-xs"
              />
            </ReactFlow>
          )}

          {/* Chronological Bottom Stepper Bar */}
          <div className="absolute bottom-4 left-16 right-4 z-10 flex items-center gap-2 overflow-x-auto rounded-xl border border-gray-200/90 bg-white/95 p-2 shadow-lg backdrop-blur-xs max-h-16">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0 px-2">
              Execution Path:
            </span>
            {trajectory.map((step) => {
              const isSelected = selectedNodeId === step.state;
              const isCurrent = entity.status === step.state;
              return (
                <button
                  key={step.stepIndex}
                  type="button"
                  onClick={() => setSelectedNodeId(step.state)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all shrink-0 border ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold shadow-2xs'
                      : isCurrent
                        ? 'border-blue-300 bg-white text-blue-700 font-semibold'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-800 text-[9px] font-mono font-bold text-white">
                    {step.stepIndex}
                  </span>
                  <span>{step.state}</span>
                  <span className="font-mono text-[9px] text-gray-400 uppercase">
                    ({step.eventType})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Step & State Inspector Sidebar */}
        <div className="w-[340px] shrink-0 border-l border-gray-200 bg-white flex flex-col min-h-0 overflow-y-auto shadow-xs">
          <div className="border-b border-gray-100 p-4 bg-slate-50/60">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                State Step Inspector
              </span>
              {selectedNodeId === entity.status && (
                <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-[10px] font-bold">
                  Active Now
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-gray-900">
              {selectedNodeId || 'Select a state node'}
            </h3>
            <p className="text-[11px] text-gray-500">
              {selectedNodeData?.kind?.toUpperCase() || 'STATE'} Node
            </p>
          </div>

          <div className="p-4 space-y-5 flex-1 overflow-y-auto">
            {/* Step Trajectory Status */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                Trajectory Status
              </h4>
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Execution State:</span>
                  {selectedNodeId === entity.status ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-800">
                      <Zap className="h-3 w-3" /> Active Stage
                    </span>
                  ) : visitedStates.has(selectedNodeId || '') ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 font-semibold text-slate-700">
                      <CheckCircle2 className="h-3 w-3 text-slate-500" /> Historical Step
                    </span>
                  ) : (
                    <span className="text-gray-400">Not Reached</span>
                  )}
                </div>

                {stepMap.has(selectedNodeId || '') && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Traversed Sequence:</span>
                    <span className="font-mono font-bold text-gray-800">
                      Step #{stepMap.get(selectedNodeId || '')?.join(', #')}
                    </span>
                  </div>
                )}

                {/* Explanation text */}
                <div className="pt-2 border-t border-gray-200/60 text-[11px]">
                  {selectedNodeId === entity.status ? (
                    <p className="text-blue-900 font-medium">
                      This is the current active stage of this record. Actions taken will advance the workflow from here.
                    </p>
                  ) : visitedStates.has(selectedNodeId || '') ? (
                    <p className="text-gray-600">
                      This stage was traversed during historical execution (Step #{stepMap.get(selectedNodeId || '')?.join(', #')}) and subsequent actions transitioned the record forward. It is not currently active.
                    </p>
                  ) : (
                    <p className="text-gray-400 italic">
                      This stage has not been reached by this record yet.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Timer & SLA Expiry Card */}
            {selectedNodeData && (selectedNodeData.timeLimitHours || selectedNodeData.kind === 'wait' || (selectedNodeId === entity.status && (selectedNodeData.targetDueTime || (entity.custom_fields as any)?.valid_to || (entity.custom_fields as any)?.expires_at))) && (
              <InspectorTimerCard
                nodeData={selectedNodeData}
                isCurrentActive={selectedNodeId === entity.status}
              />
            )}

            {/* Interaction Node Directives */}
            {(selectedNodeData?.kind === 'interaction' || selectedNodeData?.interaction_app) && (
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Interaction Directives
                </h4>
                <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Target View / Tab:</span>
                    <span className="font-semibold text-sky-900 capitalize">
                      {String(selectedNodeData.interaction_tab || 'Details')}
                    </span>
                  </div>
                  {Boolean(selectedNodeData.task_instructions || selectedNodeData.description) && (
                    <div className="pt-1 border-t border-sky-100">
                      <span className="text-[10px] uppercase font-bold text-sky-700">Guidance:</span>
                      <p className="text-[11px] text-gray-700 mt-0.5">
                        {String(selectedNodeData.task_instructions || selectedNodeData.description)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Subprocess Node Configuration */}
            {(selectedNodeData?.kind === 'subprocess' || selectedNodeData?.subprocess_id) && (
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Subprocess Configuration
                </h4>
                <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/50 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Child Process ID:</span>
                    <span className="font-mono font-semibold text-fuchsia-900">
                      {String(selectedNodeData.subprocess_id || 'child_sub')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Target Entity Type:</span>
                    <span className="font-semibold text-fuchsia-900 capitalize">
                      {String(selectedNodeData.subprocess_entity_type || entityType)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Auto-Launch:</span>
                    <span className="font-semibold text-gray-700">
                      {selectedNodeData.autocreate_child !== false ? 'Enabled' : 'Manual'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Task Assignments for this State */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Task Assignments ({selectedNodeTasks.length})
                </h4>
              </div>

              {selectedNodeTasks.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  No task assignments configured for this state.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedNodeTasks.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border border-gray-200 bg-white p-2.5 text-xs shadow-2xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">
                          {t.assigned_person_name || t.assigned_person_id || 'Unassigned'}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            t.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : t.status === 'ESCALATED'
                                ? 'bg-amber-100 text-amber-800'
                                : t.status === 'DELEGATED'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>

                      {t.role_name && (
                        <p className="text-[11px] text-gray-500">Role: {t.role_name}</p>
                      )}

                      {t.instructions && (
                        <p className="text-[11px] text-gray-600 bg-gray-50 p-1.5 rounded border border-gray-100">
                          "{t.instructions}"
                        </p>
                      )}

                      {t.escalated_to_person_id && (
                        <div className="flex items-center gap-1 text-[10px] text-amber-700 font-medium">
                          <TrendingUp className="h-3 w-3" />
                          <span>Escalated to: {t.escalated_to_person_name || t.escalated_to_person_id}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Event Log & Audit Transitions into this state */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
                Transition Events ({selectedNodeEvents.length})
              </h4>
              {selectedNodeEvents.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No transition events recorded.</p>
              ) : (
                <div className="space-y-2">
                  {selectedNodeEvents.map((ev) => (
                    <div
                      key={ev.event_id}
                      className="rounded-lg border border-gray-200 bg-slate-50/60 p-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-gray-800">
                          {ev.event_type}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(ev.transaction_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500">
                        From: <span className="font-medium text-gray-700">{ev.from_state || 'None (Created)'}</span>
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Actor: <span className="font-medium text-gray-700">{ev.actor_id} ({ev.actor_type})</span>
                      </div>
                      {ev.payload && Object.keys(ev.payload).length > 0 && (
                        <div className="text-[10px] text-gray-600 bg-white p-1 rounded border border-gray-100 font-mono">
                          {JSON.stringify(ev.payload)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
