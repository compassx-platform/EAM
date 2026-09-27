import type { Node, Edge } from '@xyflow/react';
import type {
  WorkflowChoice,
  WorkflowAction,
  ConditionDefinition,
  WorkflowRole,
} from '../../types';

export type NodeKind =
  | 'start'
  | 'stop'
  | 'end'
  | 'task'
  | 'condition'
  | 'router'
  | 'gate'
  | 'manual'
  | 'action'
  | 'comm'
  | 'subprocess'
  | 'sub'
  | 'wait'
  | 'interaction'
  | 'state';

export interface NodeMeta {
  name: string;
  kind: NodeKind;
  position: { x: number; y: number };
  entity_status?: string | null;
  condition_id?: string | null;
  conditions?: string[];
  description?: string;
  role_id?: string | null;
  task_instructions?: string | null;
  time_limit_hours?: number | null;
  action_type?: string | null;
  action_target_field?: string | null;
  action_value?: string | null;
  action_message?: string | null;
  interaction_app?: string | null;
  interaction_tab?: string | null;
  subprocess_id?: string | null;
  subprocess_entity_type?: string | null;
  autocreate_child?: boolean;
  resume_event?: string | null;
  on_child_terminal_states?: string[];
}

export type StateNodeData = {
  label: string;
  kind: NodeKind;
  terminal?: boolean;
  entity_status?: string | null;
  condition_id?: string | null;
  condition_label?: string | null;
  conditions?: string[];
  description?: string;
  role_id?: string | null;
  role_name?: string | null;
  task_instructions?: string | null;
  time_limit_hours?: number | null;
  action_type?: string | null;
  action_target_field?: string | null;
  action_value?: string | null;
  action_message?: string | null;
  interaction_app?: string | null;
  interaction_tab?: string | null;
  subprocess_id?: string | null;
  subprocess_entity_type?: string | null;
  autocreate_child?: boolean;
  resume_event?: string | null;
  on_child_terminal_states?: string[];
  onRename?: (oldLabel: string, newLabel: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
};

export type EventEdgeData = {
  event: string;
  label?: string | null;
  button_label?: string | null;
  button_style?: 'primary' | 'secondary' | 'danger' | 'default' | null;
  is_system?: boolean | null;
  description?: string | null;
  conditions: string[];
  choices?: WorkflowChoice[];
  on_after?: WorkflowAction[];
  isRouterSource?: boolean;
  sourceNodeKind?: NodeKind;
  sourceNodeLabel?: string;
  onRenameEvent?: (edgeId: string, event: string) => void;
  onDelete?: (id: string) => void;
};

export type WorkflowFlowNode = Node<StateNodeData, 'state'>;
export type WorkflowFlowEdge = Edge<EventEdgeData, 'event'>;

export interface StudioNotice {
  kind: 'ok' | 'err';
  text: string;
}

export function isConditionKind(kind?: unknown): boolean {
  return kind === 'condition' || kind === 'router' || kind === 'gate';
}

export function isStopKind(kind?: unknown): boolean {
  return kind === 'stop' || kind === 'end';
}

export function isSubprocessKind(kind?: unknown): boolean {
  return kind === 'subprocess' || kind === 'sub';
}

export function isActionKind(kind?: unknown): boolean {
  return kind === 'action' || kind === 'comm';
}

export function isSingleOutgoingKind(kind?: unknown): boolean {
  return (
    kind === 'start' ||
    isActionKind(kind) ||
    kind === 'wait' ||
    kind === 'interaction' ||
    isSubprocessKind(kind)
  );
}

export function defaultEventForKind(kind: NodeKind | undefined, existingEventCount: number = 0): string {
  if (kind === 'start') return 'START';
  if (isActionKind(kind) || kind === 'wait' || kind === 'interaction' || isSubprocessKind(kind)) return 'NEXT';
  if (kind === 'task') {
    if (existingEventCount === 0) return 'APPROVE';
    if (existingEventCount === 1) return 'REJECT';
    if (existingEventCount === 2) return 'REROUTE';
    if (existingEventCount === 3) return 'RETURN';
    return `ACTION_${existingEventCount + 1}`;
  }
  if (kind === 'manual') {
    return `OPTION ${existingEventCount + 1}`;
  }
  return existingEventCount === 0 ? 'EVENT' : `EVENT_${existingEventCount + 1}`;
}

export const NODE_KINDS: Array<{ kind: NodeKind; label: string; description: string }> = [
  { kind: 'start', label: 'Start', description: 'Entry point — records enter the workflow process here' },
  { kind: 'task', label: 'Task', description: 'Assigns work or approvals to a Role, Person, or Group' },
  { kind: 'condition', label: 'Condition', description: 'Evaluates a condition rule and branches along TRUE or FALSE outlets' },
  { kind: 'manual', label: 'Manual Input', description: 'Prompts user with a list of interactive choices/actions' },
  { kind: 'action', label: 'Action', description: 'Automates actions (status change, set field, or notification)' },
  { kind: 'wait', label: 'Wait', description: 'Pauses workflow until a time duration passes or date condition is met' },
  { kind: 'interaction', label: 'Interaction', description: 'Directs the user to a specific application tab or view' },
  { kind: 'subprocess', label: 'Subprocess', description: 'Launches a child workflow process as a sub-routine' },
  { kind: 'stop', label: 'Stop', description: 'Terminal outcome — the record exits the workflow process' },
];

export const KIND_LABEL: Record<NodeKind, string> = Object.fromEntries(
  NODE_KINDS.map((k) => [k.kind, k.label])
) as Record<NodeKind, string>;

export function kindDefaultLabel(kind: NodeKind): string {
  const entry = NODE_KINDS.find((k) => k.kind === kind);
  return entry ? entry.label : 'Task';
}

export function nextStateLabel(nodes: WorkflowFlowNode[], kind: NodeKind = 'task'): string {
  const used = new Set(nodes.map((n) => n.data.label));
  const base = kindDefaultLabel(kind);
  let label = base;
  let i = 2;
  while (used.has(label)) {
    label = `${base} ${i}`;
    i++;
  }
  return label;
}

/** True when the connection has conditional branches */
export function edgeIsBranching(e: WorkflowFlowEdge): boolean {
  return (e.data?.choices?.length ?? 0) > 0;
}

/** Number of conditional branches on a connection */
export function edgeBranchCount(e: WorkflowFlowEdge): number {
  return e.data?.choices?.length ?? 0;
}

/** Summary description of an edge connection */
export function edgeDescription(e: WorkflowFlowEdge): {
  from: string;
  event: string;
  to: string | null;
  guardCount: number;
  branchCount: number;
} {
  const branches = e.data?.choices ?? [];
  const fallback = branches.find((c) => !c.when || c.when.length === 0)?.to ?? branches[0]?.to ?? null;
  return {
    from: e.source,
    event: e.data?.event ?? 'EVENT',
    to: e.data?.choices?.length ? fallback : e.target || fallback,
    guardCount: e.data?.conditions?.length ?? 0,
    branchCount: branches.length,
  };
}
