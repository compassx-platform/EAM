import { MarkerType } from '@xyflow/react';
import type {
  WorkflowDefinition,
  WorkflowTransition,
  WorkflowChoice,
  WorkflowAutoTransition,
} from '../../types';
import type {
  WorkflowFlowNode,
  WorkflowFlowEdge,
  NodeMeta,
  NodeKind,
} from './types';
import {
  kindDefaultLabel,
  NODE_KINDS,
  isConditionKind,
  isStopKind,
  isActionKind,
  isSubprocessKind,
  isSingleOutgoingKind,
} from './types';

export interface WorkflowDefinitionExtras {
  terminal_states?: string[];
  auto_transitions?: WorkflowAutoTransition[];
}

const COLUMN_GAP = 280;
const ROW_GAP = 120;
const COLS = 3;

export function layoutPosition(index: number) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return { x: 48 + col * COLUMN_GAP, y: 48 + row * ROW_GAP };
}

export function defaultPositionFor(kind: NodeKind, index: number) {
  const base = layoutPosition(index);
  const offset = {
    start: 0,
    stop: 0,
    end: 0,
    condition: 40,
    router: 40,
    gate: 50,
    task: 0,
    state: 0,
    manual: 0,
    action: 0,
    comm: 0,
    wait: 0,
    interaction: 0,
    subprocess: 0,
    sub: 0,
  }[kind] || 0;
  return { x: base.x + offset, y: base.y };
}

/** Display target for a transition: explicit `to`, or the default branch target. */
export function transitionTargetLabel(t: WorkflowTransition): string | null {
  if (t.to) return t.to;
  const choices = t.choices || [];
  const unconditional = choices.find((c) => !c.when || c.when.length === 0);
  if (unconditional) return unconditional.to;
  return choices.length > 0 ? choices[0].to : null;
}

/**
 * Converts backend WorkflowDefinition into React Flow nodes and edges.
 */
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

    if ((isConditionKind(meta?.kind) || (!meta && autoByState.has(label))) && !condId) {
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
        kind: meta?.kind || (i === 0 ? 'start' : (def.terminal_states || []).includes(label) ? 'stop' : 'task'),
        entity_status: meta?.entity_status || null,
        condition_id: condId,
        conditions: conds,
        description: meta?.description,
        role_id: meta?.role_id || null,
        task_instructions: meta?.task_instructions || null,
        time_limit_hours: meta?.time_limit_hours || null,
        action_type: meta?.action_type || null,
        action_target_field: meta?.action_target_field || null,
        action_value: meta?.action_value || null,
        action_message: meta?.action_message || null,
        interaction_app: meta?.interaction_app || null,
        interaction_tab: meta?.interaction_tab || null,
        subprocess_id: meta?.subprocess_id || null,
        subprocess_entity_type: meta?.subprocess_entity_type || null,
        autocreate_child: meta?.autocreate_child ?? true,
        resume_event: meta?.resume_event || null,
        on_child_terminal_states: meta?.on_child_terminal_states || [],
      },
    };
  });

  const edges: WorkflowFlowEdge[] = def.transitions.map((t) => {
    const fromNodeMeta = metaByName.get(t.from);
    const eventUpper = (t.event || '').toUpperCase();
    const isRouterSource = isConditionKind(fromNodeMeta?.kind) || eventUpper === 'TRUE' || eventUpper === 'FALSE';
    const sourceHandle = isRouterSource && (eventUpper === 'TRUE' || eventUpper === 'FALSE') ? eventUpper : undefined;
    return {
      id: `${t.from}|${t.event}|${t.to || ''}|${Math.random().toString(36).slice(2, 7)}`,
      type: 'event',
      source: t.from,
      target: transitionTargetLabel(t) || '',
      sourceHandle,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: isRouterSource ? '#64748b' : '#94a3b8',
      },
      data: {
        event: t.event,
        label: t.label || t.button_label,
        button_label: t.button_label || t.label,
        button_style: t.button_style,
        is_system: t.is_system,
        description: t.description,
        conditions: t.conditions ?? t.gates ?? [],
        choices: t.choices,
        on_after: t.on_after,
        isRouterSource,
        sourceNodeKind: fromNodeMeta?.kind,
        sourceNodeLabel: t.from,
      },
    };
  });

  return { nodes, edges };
}

/**
 * Converts React Flow nodes and edges back into clean backend WorkflowDefinition.
 */
export function flowToDefinition(
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[],
  entityType: string,
  versionLabel: string,
  extras?: WorkflowDefinitionExtras
): WorkflowDefinition {
  const idToLabel = new Map<string, string>();
  const nodeKindByIdOrLabel = new Map<string, NodeKind>();
  for (const n of nodes) {
    if (n.data?.label) {
      idToLabel.set(n.id, n.data.label.trim());
      idToLabel.set(n.data.label, n.data.label.trim());
      nodeKindByIdOrLabel.set(n.id, n.data.kind);
      nodeKindByIdOrLabel.set(n.data.label.trim(), n.data.kind);
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
      kind: n.data.kind || 'task',
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      entity_status: n.data.entity_status ? n.data.entity_status.trim() : null,
      condition_id: condId,
      conditions: conds,
      description: n.data.description,
      role_id: n.data.role_id || null,
      task_instructions: n.data.task_instructions || null,
      time_limit_hours: n.data.time_limit_hours || null,
      action_type: n.data.action_type || null,
      action_target_field: n.data.action_target_field || null,
      action_value: n.data.action_value || null,
      action_message: n.data.action_message || null,
      interaction_app: n.data.interaction_app || null,
      interaction_tab: n.data.interaction_tab || null,
      subprocess_id: n.data.subprocess_id || null,
      subprocess_entity_type: n.data.subprocess_entity_type || null,
      autocreate_child: n.data.autocreate_child ?? true,
      resume_event: n.data.resume_event || null,
      on_child_terminal_states: n.data.on_child_terminal_states || [],
    };
  });

  const transitions: WorkflowTransition[] = edges
    .map((e) => {
      const fromLabel = idToLabel.get(e.source) || e.source;
      const toLabel = e.target ? (idToLabel.get(e.target) || e.target) : null;
      const srcKind = nodeKindByIdOrLabel.get(e.source) || nodeKindByIdOrLabel.get(fromLabel);
      const isAutoKind = srcKind === 'start' || isActionKind(srcKind) || srcKind === 'wait' || isConditionKind(srcKind);

      const rawConditions = e.data?.conditions ?? [];
      const cleanConditions = Array.isArray(rawConditions)
        ? rawConditions.filter((c): c is string => Boolean(c && typeof c === 'string' && c.trim())).map((c) => c.trim())
        : [];

      const eventKey = e.data?.event || (e.data?.label ? e.data.label.toUpperCase().replace(/\s+/g, '_') : 'EVENT');
      const isSystemTransition = e.data?.is_system !== undefined ? Boolean(e.data.is_system) : isAutoKind;

      const transition: WorkflowTransition = {
        from: fromLabel,
        event: eventKey,
        to: e.data?.choices?.length ? null : toLabel,
        conditions: cleanConditions,
        label: e.data?.label || e.data?.button_label || undefined,
        button_label: e.data?.button_label || e.data?.label || undefined,
        button_style: e.data?.button_style || undefined,
        is_system: isSystemTransition ? true : undefined,
        description: e.data?.description || undefined,
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

  // Preserve non-auto generated transitions and generate router/action/start auto transitions
  const existingAuto = (extras?.auto_transitions || []).filter(
    (at) => !nodes.some((n) => (isConditionKind(n.data.kind) || isActionKind(n.data.kind) || n.data.kind === 'start') && (n.data.label === at.from || n.id === at.from))
  );
  const generatedAuto: WorkflowAutoTransition[] = [];
  for (const n of nodes) {
    const nodeLabel = n.data.label?.trim() || n.id;
    const outgoing = edges.filter((e) => e.source === n.data.label || e.source === n.id);

    if (isConditionKind(n.data.kind)) {
      const rawCondId = n.data.condition_id ?? (n.data.conditions && n.data.conditions[0]) ?? null;
      const condId = rawCondId && typeof rawCondId === 'string' && rawCondId.trim() ? rawCondId.trim() : null;

      const trueEdge = outgoing.find((e) => e.data?.event === 'TRUE');
      const falseEdge = outgoing.find((e) => e.data?.event === 'FALSE');
      if (trueEdge) {
        generatedAuto.push({
          from: nodeLabel,
          event: 'TRUE',
          when: condId ? [condId] : [],
        });
      }
      if (falseEdge) {
        generatedAuto.push({
          from: nodeLabel,
          event: 'FALSE',
          when: [],
        });
      }
    } else if (isActionKind(n.data.kind) || n.data.kind === 'start') {
      if (outgoing.length > 0) {
        const outEdge = outgoing[0];
        const eventKey = outEdge.data?.event || (n.data.kind === 'start' ? 'START' : 'NEXT');
        generatedAuto.push({
          from: nodeLabel,
          event: eventKey,
          when: [],
        });
      }
    }
  }

  const combinedAuto = [...existingAuto, ...generatedAuto];

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

// ---- Auto arrange (layered left→right layout) -------------------------------

const ARRANGE_COL_GAP = 280;
const ARRANGE_ROW_GAP = 120;
const ARRANGE_X0 = 48;
const ARRANGE_Y0 = 48;

/**
 * Layout the workflow as a left-to-right DAG:
 * entry states in leftmost column, terminal states furthest right,
 * with barycenter heuristic within each column to minimize edge crossings.
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

  const root = (nodes.find((n) => n.data.kind === 'start') ?? nodes[0]).id;

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
  const deepest = Math.max(0, ...layer.values());
  for (const id of ids) if (indeg.get(id)! > 0) layer.set(id, deepest + 1);

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

  for (let i = 1; i < layers.length; i++) {
    const ranks = new Map(layers[i - 1].map((id, idx) => [id, idx]));
    orderBy(layers[i], (id) => bary(pred.get(id) || [], ranks));
  }
  for (let i = layers.length - 2; i >= 0; i--) {
    const ranks = new Map(layers[i + 1].map((id, idx) => [id, idx]));
    orderBy(layers[i], (id) => bary(succ.get(id) || [], ranks));
  }

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

/**
 * Validates the in-memory graph topology and returns errors/warnings.
 */
export function validateGraphTopology(
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[]
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (nodes.length === 0) {
    errors.push('Workflow must contain at least one state');
    return { valid: false, errors, warnings };
  }

  const startNodes = nodes.filter((n) => n.data.kind === 'start');
  if (startNodes.length === 0) {
    warnings.push('No Start node found. Records will begin at the first state.');
  } else if (startNodes.length > 1) {
    errors.push('Workflow cannot have multiple Start nodes (Rule: exactly 1 Start node).');
  }

  const endNodes = nodes.filter((n) => isStopKind(n.data.kind) || n.data.terminal);
  if (endNodes.length === 0) {
    warnings.push('No declared terminal (Stop) states. Process may run indefinitely.');
  }

  // Check for self-loops (Rule: no direct self-loops)
  for (const e of edges) {
    if (e.source && e.target && e.source === e.target) {
      errors.push(`Invalid connection: self-loop detected on node '${e.source}'`);
    }
  }

  // Check Start node constraints (Rule: 0 incoming, strictly 1 outgoing)
  for (const sNode of startNodes) {
    const sLabel = sNode.data.label;
    const incomingToStart = edges.filter((e) => e.target === sNode.id || e.target === sLabel);
    if (incomingToStart.length > 0) {
      errors.push(`Start node '${sLabel}' cannot receive incoming connections (Rule: 0 incoming).`);
    }
    const outgoingFromStart = edges.filter((e) => e.source === sNode.id || e.source === sLabel);
    if (outgoingFromStart.length === 0) {
      warnings.push(`Start node '${sLabel}' has no outgoing connection.`);
    } else if (outgoingFromStart.length > 1) {
      errors.push(`Start node '${sLabel}' cannot have more than 1 outgoing connection.`);
    }
  }

  // Check Stop / End node constraints (Rule: 0 outgoing)
  for (const eNode of endNodes) {
    const eLabel = eNode.data.label;
    const outgoingFromStop = edges.filter((e) => e.source === eNode.id || e.source === eLabel);
    if (outgoingFromStop.length > 0) {
      errors.push(`Stop node '${eLabel}' cannot have outgoing connections (terminal outcome).`);
    }
  }

  // Check Condition / Router nodes
  for (const n of nodes) {
    const nodeLabel = n.data.label;
    const outgoing = edges.filter((e) => e.source === n.id || e.source === nodeLabel);

    if (isConditionKind(n.data.kind)) {
      const hasCond = Boolean(n.data.condition_id || (n.data.conditions && n.data.conditions.length > 0));
      if (!hasCond) {
        errors.push(`Condition node '${nodeLabel}' must have a condition assigned.`);
      }
      const hasTrue = outgoing.some((e) => e.data?.event === 'TRUE');
      const hasFalse = outgoing.some((e) => e.data?.event === 'FALSE');
      if (!hasTrue) errors.push(`Condition node '${nodeLabel}' is missing an outgoing TRUE branch.`);
      if (!hasFalse) errors.push(`Condition node '${nodeLabel}' is missing an outgoing FALSE branch.`);
    }

    if (isSingleOutgoingKind(n.data.kind) && n.data.kind !== 'start') {
      if (outgoing.length === 0) {
        warnings.push(`${kindDefaultLabel(n.data.kind)} node '${nodeLabel}' has no outgoing connection.`);
      } else if (outgoing.length > 1) {
        errors.push(`${kindDefaultLabel(n.data.kind)} node '${nodeLabel}' cannot have more than 1 outgoing connection.`);
      }
    }

    if (n.data.kind === 'task') {
      if (!n.data.role_id) {
        warnings.push(`Task node '${nodeLabel}' has no dynamic Role assigned.`);
      }
      if (outgoing.length === 0) {
        warnings.push(`Task node '${nodeLabel}' has no outgoing actions.`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
