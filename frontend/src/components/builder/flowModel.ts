import type { Node, Edge } from '@xyflow/react';
import type {
  WorkflowDefinition,
  WorkflowTransition,
  WorkflowChoice,
  WorkflowAction,
  WorkflowAutoTransition,
} from '../../types';

export type NodeKind = 'start' | 'state' | 'task' | 'gate' | 'router' | 'end' | 'manual' | 'wait' | 'sub' | 'comm';

export interface NodeMeta {
  name: string;
  kind: NodeKind;
  position: { x: number; y: number };
  condition_id?: string | null;
  conditions?: string[];
  description?: string;
  role_id?: string | null;
  task_instructions?: string | null;
  time_limit_hours?: number | null;
}

export type WorkflowFlowNode = Node<
  {
    label: string;
    kind: NodeKind;
    /** True when this state is a declared terminal state (cannot advance). */
    terminal?: boolean;
    condition_id?: string | null;
    condition_label?: string | null;
    conditions?: string[];
    description?: string;
    role_id?: string | null;
    role_name?: string | null;
    task_instructions?: string | null;
    time_limit_hours?: number | null;
    onRename?: (oldLabel: string, newLabel: string) => void;
    onDelete?: (id: string) => void;
    onDuplicate?: (id: string) => void;
  },
  'state'
>;
export type WorkflowFlowEdge = Edge<
  {
    event: string;
    conditions: string[];
    choices?: WorkflowChoice[];
    on_after?: WorkflowAction[];
    isRouterSource?: boolean;
    onRenameEvent?: (edgeId: string, event: string) => void;
    onDelete?: (id: string) => void;
  },
  'event'
>;

/** True when the connection has been split into conditional branches. */
export function edgeIsBranching(e: WorkflowFlowEdge): boolean {
  return (e.data?.choices?.length ?? 0) > 0;
}

/** Number of conditional branches on a connection (0 = plain transition). */
export function edgeBranchCount(e: WorkflowFlowEdge): number {
  return e.data?.choices?.length ?? 0;
}

/** Editable copy of a single edge for live editing in an inspector. */
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

export interface WorkflowDefinitionExtras {
  terminal_states?: string[];
  auto_transitions?: WorkflowAutoTransition[];
}

/** Display target for a transition: explicit `to`, or the default branch target. */
export function transitionTargetLabel(t: WorkflowTransition): string | null {
  if (t.to) return t.to;
  const choices = t.choices || [];
  const unconditional = choices.find((c) => !c.when || c.when.length === 0);
  if (unconditional) return unconditional.to;
  return choices.length > 0 ? choices[0].to : null;
}

export const NODE_KINDS: Array<{ kind: NodeKind; label: string; description: string }> = [
  { kind: 'start', label: 'Start', description: 'Entry point — new records begin here' },
  { kind: 'state', label: 'Step', description: 'A step in the process' },
  { kind: 'router', label: 'Router', description: 'Splits and routes to different target states based on conditions' },
  { kind: 'task', label: 'Task', description: 'Work by a user, e.g. an approval' },
  { kind: 'gate', label: 'Condition', description: 'Evaluates a condition' },
  { kind: 'manual', label: 'Manual Input', description: 'Prompts the user to pick an option' },
  { kind: 'wait', label: 'Wait', description: 'Pauses the workflow until a date or condition is met' },
  { kind: 'sub', label: 'Sub-Process', description: 'Starts another workflow process as a sub-routine' },
  { kind: 'comm', label: 'Communication', description: 'Sends a message or notification when reached' },
  { kind: 'end', label: 'Stop', description: 'Terminal outcome — the workflow stops here' },
];

export const KIND_LABEL: Record<NodeKind, string> = Object.fromEntries(
  NODE_KINDS.map((k) => [k.kind, k.label])
) as Record<NodeKind, string>;

export function kindDefaultLabel(kind: NodeKind): string {
  const entry = NODE_KINDS.find((k) => k.kind === kind);
  return entry ? entry.label : 'State';
}

export function defaultPositionFor(kind: NodeKind, index: number) {
  const base = layoutPosition(index);
  const offset = { start: 0, end: 0, router: 50, gate: 60, task: 0, state: 0, manual: 0, wait: 0, sub: 0, comm: 0 }[kind] || 0;
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
  const autoByState = new Map<string, WorkflowAutoTransition[]>();
  for (const at of def.auto_transitions || []) {
    const list = autoByState.get(at.from) || [];
    list.push(at);
    autoByState.set(at.from, list);
  }

  const nodes: WorkflowFlowNode[] = def.states.map((label, i) => {
    const meta = metaByName.get(label);
    let condId = meta?.condition_id || (meta?.conditions && meta.conditions[0]) || null;
    let conds = meta?.conditions || (condId ? [condId] : []);

    if ((meta?.kind === 'router' || (!meta && autoByState.has(label))) && !condId) {
      const autos = autoByState.get(label) || [];
      const trueAuto = autos.find((a) => a.event === 'TRUE');
      if (trueAuto?.when && trueAuto.when.length > 0) {
        condId = trueAuto.when[0];
        conds = [condId];
      }
    }

    return {
      id: label,
      type: 'state',
      position: meta?.position || layoutPosition(i),
      data: {
        label,
        kind: meta?.kind || 'state',
        condition_id: condId,
        conditions: conds,
        description: meta?.description,
        role_id: meta?.role_id || null,
        task_instructions: meta?.task_instructions || null,
        time_limit_hours: meta?.time_limit_hours || null,
      },
    };
  });

  const edges: WorkflowFlowEdge[] = def.transitions.map((t) => {
    const fromNodeMeta = metaByName.get(t.from);
    const isRouterSource = fromNodeMeta?.kind === 'router';
    return {
      id: `${t.from}|${t.event}|${t.to || ''}|${Math.random().toString(36).slice(2, 7)}`,
      type: 'event',
      source: t.from,
      target: transitionTargetLabel(t) || '',
      sourceHandle: isRouterSource && (t.event === 'TRUE' || t.event === 'FALSE') ? t.event : undefined,
      data: {
        event: t.event,
        conditions: t.conditions ?? t.gates ?? [],
        choices: t.choices,
        on_after: t.on_after,
        isRouterSource,
      },
    };
  });

  return { nodes, edges };
}

export function flowToDefinition(
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[],
  entityType: string,
  versionLabel: string,
  extras?: WorkflowDefinitionExtras
): WorkflowDefinition {
  // Map both node.id and node.data.label to canonical state name (node.data.label)
  const idToLabel = new Map<string, string>();
  for (const n of nodes) {
    if (n.data?.label) {
      idToLabel.set(n.id, n.data.label.trim());
      idToLabel.set(n.data.label, n.data.label.trim());
    }
  }

  const states = nodes
    .map((n) => n.data?.label?.trim())
    .filter((label, i, arr): label is string => Boolean(label) && arr.indexOf(label) === i);

  const stateSet = new Set(states);

  const meta: NodeMeta[] = nodes.map((n) => {
    const rawCondId = n.data.condition_id ?? (n.data.conditions && n.data.conditions[0]) ?? null;
    const condId = rawCondId && typeof rawCondId === 'string' && rawCondId.trim() ? rawCondId.trim() : null;
    const rawConds = n.data.conditions && n.data.conditions.length > 0 ? n.data.conditions : (condId ? [condId] : []);
    const conds = rawConds.filter((c): c is string => Boolean(c && typeof c === 'string' && c.trim())).map((c) => c.trim());
    return {
      name: n.data.label?.trim() || n.id,
      kind: n.data.kind || 'state',
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      condition_id: condId,
      conditions: conds,
      description: n.data.description,
      role_id: n.data.role_id || null,
      task_instructions: n.data.task_instructions || null,
      time_limit_hours: n.data.time_limit_hours || null,
    };
  });

  const transitions: WorkflowTransition[] = edges
    .map((e) => {
      const fromLabel = idToLabel.get(e.source) || e.source;
      const toLabel = e.target ? (idToLabel.get(e.target) || e.target) : null;

      const rawConditions = e.data?.conditions ?? [];
      const cleanConditions = Array.isArray(rawConditions)
        ? rawConditions.filter((c): c is string => Boolean(c && typeof c === 'string' && c.trim())).map((c) => c.trim())
        : [];

      const transition: WorkflowTransition = {
        from: fromLabel,
        event: e.data?.event || 'EVENT',
        to: e.data?.choices?.length ? null : toLabel,
        conditions: cleanConditions,
      };
      if (e.data?.choices?.length) {
        transition.choices = e.data.choices.map((c) => ({
          ...c,
          to: idToLabel.get(c.to) || c.to,
          when: (c.when || []).filter((w): w is string => Boolean(w && typeof w === 'string' && w.trim())).map((w) => w.trim()),
        }));
      }
      if (e.data?.on_after?.length) transition.on_after = e.data.on_after;
      return transition;
    })
    .filter((t) => stateSet.has(t.from) && (t.choices?.length || (t.to && stateSet.has(t.to))));

  // Preserve non-router auto transitions and generate router auto transitions
  const existingAuto = (extras?.auto_transitions || []).filter(
    (at) => !nodes.some((n) => n.data.kind === 'router' && (n.data.label === at.from || n.id === at.from))
  );
  const routerAuto: WorkflowAutoTransition[] = [];
  for (const n of nodes) {
    if (n.data.kind === 'router') {
      const nodeLabel = n.data.label?.trim() || n.id;
      const rawCondId = n.data.condition_id ?? (n.data.conditions && n.data.conditions[0]) ?? null;
      const condId = rawCondId && typeof rawCondId === 'string' && rawCondId.trim() ? rawCondId.trim() : null;

      const outgoing = edges.filter((e) => e.source === n.data.label || e.source === n.id);
      const trueEdge = outgoing.find((e) => e.data?.event === 'TRUE');
      const falseEdge = outgoing.find((e) => e.data?.event === 'FALSE');
      if (trueEdge) {
        routerAuto.push({
          from: nodeLabel,
          event: 'TRUE',
          when: condId ? [condId] : [],
        });
      }
      if (falseEdge) {
        routerAuto.push({
          from: nodeLabel,
          event: 'FALSE',
          when: [],
        });
      }
    }
  }

  const combinedAuto = [...existingAuto, ...routerAuto];

  const definition: WorkflowDefinition = {
    entity_type: entityType,
    version_label: versionLabel,
    states,
    transitions,
    nodes: meta,
  };
  if (combinedAuto.length > 0) definition.auto_transitions = combinedAuto;
  if (extras?.terminal_states?.length) definition.terminal_states = extras.terminal_states;
  return definition;
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

// ---- Auto arrange (layered left→right layout) -------------------------------

const ARRANGE_COL_GAP = 280;
const ARRANGE_ROW_GAP = 120;
const ARRANGE_X0 = 48;
const ARRANGE_Y0 = 48;

/**
 * Layout the workflow as a left-to-right DAG so it reads like a process flow:
 * entry states in the leftmost column, terminal states furthest right, and a
 * barycenter heuristic within each column to minimise edge crossings.
 *
 * The adjacency is derived from rendered edges plus each edge's choice-branch
 * targets (so a decision node's side branches are placed without needing a
 * visible edge). Cycles (reject/recall/cancel loops) are handled by removing
 * DFS back edges before computing longest-path layers, so they can never
 * inflate the layout.
 */
export function autoArrangePositions(
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[]
): Record<string, { x: number; y: number }> {
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const pred = new Map<string, string[]>(ids.map((id) => [id, []]));
  const succ = new Map<string, string[]>(ids.map((id) => [id, [] as string[]]));
  const pairSet = new Set<string>();
  const connect = (from: string, to: string) => {
    if (!idSet.has(from) || !idSet.has(to) || from === to) return;
    const key = `${from}\u0000${to}`;
    if (pairSet.has(key)) return;
    pairSet.add(key);
    succ.get(from)!.push(to);
    pred.get(to)!.push(from);
  };
  for (const e of edges) {
    if (e.target) connect(e.source, e.target);
    for (const c of e.data?.choices || []) if (c.to) connect(e.source, c.to);
  }
  if (ids.length === 0) return {};

  // Root = the entry (kind 'start') node, falling back to the first state.
  const root = (nodes.find((n) => n.data.kind === 'start') ?? nodes[0]).id;

  // Iterative DFS from the root; classify edges terminating on the current
  // stack as back edges (they only exist in cycles) and drop them.
  const color = new Map<string, 0 | 1 | 2>(ids.map((id) => [id, 0]));
  const idx = new Map<string, number>(ids.map((id) => [id, 0]));
  const backEdges = new Set<string>();
  const stack: string[] = [root];
  color.set(root, 1);
  while (stack.length > 0) {
    const u = stack[stack.length - 1];
    const outs = succ.get(u)!;
    let i = idx.get(u)!;
    let advanced = false;
    for (; i < outs.length; i++) {
      idx.set(u, i + 1);
      const v = outs[i];
      if (v === u) continue;
      const c = color.get(v)!;
      if (c === 0) {
        color.set(v, 1);
        stack.push(v);
        advanced = true;
        break;
      }
      if (c === 1) backEdges.add(`${u}\u0000${v}`);
    }
    if (!advanced) {
      color.set(u, 2);
      stack.pop();
    }
  }

  // Longest-path layers on the acyclic remainder via Kahn's algorithm.
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  succ.forEach((outs, u) => {
    for (const v of outs) {
      if (u !== v && !backEdges.has(`${u}\u0000${v}`)) indeg.set(v, indeg.get(v)! + 1);
    }
  });
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indeg.get(id) === 0);
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi];
    const lu = layer.get(u)!;
    for (const v of succ.get(u)!) {
      if (u === v || backEdges.has(`${u}\u0000${v}`)) continue;
      layer.set(v, Math.max(layer.get(v)!, lu + 1));
      const d = indeg.get(v)! - 1;
      indeg.set(v, d);
      if (d === 0) queue.push(v);
    }
  }
  // Safety net: any residual cycle members are parked after the deepest layer.
  const deepest = Math.max(0, ...layer.values());
  for (const id of ids) if (indeg.get(id)! > 0) layer.set(id, deepest + 1);

  // Group into layers, preserving original order within each layer.
  const layers: string[][] = [];
  for (const id of ids) {
    const l = layer.get(id)!;
    while (layers.length <= l) layers.push([]);
    layers[l].push(id);
  }

  const bary = (neighbors: string[], ranks: Map<string, number>): number => {
    const hits = neighbors.filter((n) => ranks.has(n)).map((n) => ranks.get(n)!);
    return hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : Number.NaN;
  };
  const orderBy = (group: string[], key: (id: string) => number) => {
    group.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (Number.isNaN(ka)) return Number.isNaN(kb) ? 0 : 1;
      if (Number.isNaN(kb)) return -1;
      return ka - kb;
    });
  };

  // Barycenter crossings reduction: sweep left→right on predecessors, then right→left on successors.
  for (let i = 1; i < layers.length; i++) {
    const ranks = new Map(layers[i - 1].map((id, idx) => [id, idx]));
    orderBy(layers[i], (id) => bary(pred.get(id) || [], ranks));
  }
  for (let i = layers.length - 2; i >= 0; i--) {
    const ranks = new Map(layers[i + 1].map((id, idx) => [id, idx]));
    orderBy(layers[i], (id) => bary(succ.get(id) || [], ranks));
  }

  // Uniform grid: one row per node within a column, tall columns on the global
  // row origin. Each column is shifted by whole rows so it is centred against
  // the tallest column — rows therefore stay aligned across columns instead of
  // zig-zagging, while every gap stays proportional.
  const maxColumnHeight = Math.max(0, ...layers.map((g) => g.length));
  const out: Record<string, { x: number; y: number }> = {};
  layers.forEach((group, depth) => {
    const drop = Math.round((maxColumnHeight - group.length) / 2) * ARRANGE_ROW_GAP;
    group.forEach((id, i) => {
      out[id] = {
        x: ARRANGE_X0 + depth * ARRANGE_COL_GAP,
        y: ARRANGE_Y0 + drop + i * ARRANGE_ROW_GAP,
      };
    });
  });
  return out;
}