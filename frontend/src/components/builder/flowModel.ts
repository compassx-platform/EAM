import type { Node, Edge } from '@xyflow/react';
import type { WorkflowDefinition, WorkflowTransition } from '../../types';

export type NodeKind = 'start' | 'state' | 'task' | 'gate' | 'end';

export interface NodeMeta {
  name: string;
  kind: NodeKind;
  position: { x: number; y: number };
}

export type WorkflowFlowNode = Node<
  {
    label: string;
    kind: NodeKind;
    onRename?: (oldLabel: string, newLabel: string) => void;
    onDelete?: (id: string) => void;
  },
  'state'
>;
export type WorkflowFlowEdge = Edge<
  { event: string; gates: string[]; onRenameEvent?: (edgeId: string, event: string) => void },
  'event'
>;

export const NODE_KINDS: Array<{ kind: NodeKind; label: string; description: string }> = [
  { kind: 'start', label: 'Start', description: 'Entry point of the workflow' },
  { kind: 'state', label: 'State', description: 'Generic workflow step' },
  { kind: 'task', label: 'Task', description: 'Action being performed' },
  { kind: 'gate', label: 'Gate Check', description: 'Step subject to gate enforcement' },
  { kind: 'end', label: 'End', description: 'Terminal outcome' },
];

export function kindDefaultLabel(kind: NodeKind): string {
  const entry = NODE_KINDS.find((k) => k.kind === kind);
  return entry ? entry.label : 'State';
}

export function defaultPositionFor(kind: NodeKind, index: number) {
  const base = layoutPosition(index);
  const offset = { start: 0, end: 0, gate: 60, task: 0, state: 0 }[kind] || 0;
  return { x: base.x + offset, y: base.y };
}

const COLUMN_GAP = 240;
const ROW_GAP = 130;
const COLS = 3;

export function layoutPosition(index: number) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return { x: 48 + col * COLUMN_GAP, y: 48 + row * ROW_GAP };
}

export function definitionToFlow(def: WorkflowDefinition): { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] } {
  const metaByName = new Map<string, NodeMeta>((def.nodes || []).map((m) => [m.name, m]));

  const nodes: WorkflowFlowNode[] = def.states.map((label, i) => {
    const meta = metaByName.get(label);
    return {
      id: label,
      type: 'state',
      position: meta?.position || layoutPosition(i),
      data: { label, kind: meta?.kind || 'state' },
    };
  });

  const edges: WorkflowFlowEdge[] = def.transitions.map((t) => ({
    id: `${t.from}|${t.event}|${t.to}|${Math.random().toString(36).slice(2, 7)}`,
    type: 'event',
    source: t.from,
    target: t.to,
    data: { event: t.event, gates: t.gates || [] },
  }));

  return { nodes, edges };
}

export function flowToDefinition(
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[],
  entityType: string,
  versionLabel: string
): WorkflowDefinition {
  const states = nodes
    .map((n) => n.data.label)
    .filter((label, i, arr) => label && arr.indexOf(label) === i);

  const meta: NodeMeta[] = nodes.map((n) => ({
    name: n.data.label,
    kind: n.data.kind || 'state',
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
  }));

  const transitions: WorkflowTransition[] = edges.map((e) => ({
    from: e.source,
    event: e.data?.event || 'EVENT',
    to: e.target,
    gates: e.data?.gates || [],
  }));

  return { entity_type: entityType, version_label: versionLabel, states, transitions, nodes: meta };
}

export function nextStateLabel(nodes: WorkflowFlowNode[], kind: NodeKind = 'state'): string {
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