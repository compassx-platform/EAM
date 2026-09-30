import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  MarkerType,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type Edge,
} from '@xyflow/react';
import { MousePointer, History, Calendar, X, Loader2 } from 'lucide-react';
import type {
  Workflow,
  WorkflowAction,
  WorkflowAutoTransition,
  ConditionDefinition,
  ConditionTypeInfo,
  EntityField,
  WorkflowRole,
  EntityLifecycleStatus,
  FormTab,
} from '../../types';
import {
  HeaderBar,
  LeftRail,
  NodeInspector,
  ActionInspector,
  ConditionModal,
  SettingsModal,
  TemplateImportModal,
  StateNode,
  EventEdge,
  DashedButton,
} from '../workflow-ui';
import {
  autoArrangePositions,
  definitionToFlow,
  flowToDefinition,
  validateGraphTopology,
} from '../workflow-ui/graphUtils';
import {
  NODE_KINDS,
  kindDefaultLabel,
  nextStateLabel,
  isConditionKind,
  isStopKind,
  isSingleOutgoingKind,
  defaultEventForKind,
  type WorkflowFlowNode,
  type WorkflowFlowEdge,
  type EventEdgeData,
  type NodeKind,
  type StateNodeData,
  type StudioNotice,
} from '../workflow-ui/types';
import { api } from '../../api/client';
import { useHashRoute, navigate } from '../../lib/router';

const nodeTypes = { state: StateNode };
const edgeTypes = { event: EventEdge, default: EventEdge };

type Selection = { kind: 'node' | 'edge'; id: string } | null;

interface BuilderInnerProps {
  workflowId: string | null;
  onBack: () => void;
  onListRefresh: () => void;
}

function BuilderInner({ workflowId, onBack, onListRefresh }: BuilderInnerProps) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const route = useHashRoute();
  const initialType = route.query.get('type') || '';

  const [id, setId] = useState<string | null>(workflowId);
  const [entityType, setEntityType] = useState(initialType);
  const [versionLabel, setVersionLabel] = useState('v1.0');
  const [status, setStatus] = useState<Workflow['status']>('draft');
  const [nodes, setNodes] = useState<WorkflowFlowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowFlowEdge[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [conditions, setConditions] = useState<ConditionDefinition[]>([]);
  const [roles, setRoles] = useState<WorkflowRole[]>([]);
  const [entityStatuses, setEntityStatuses] = useState<EntityLifecycleStatus[]>([]);
  const [knownTypes, setKnownTypes] = useState<string[]>([]);
  const [terminalStates, setTerminalStates] = useState<string[]>([]);
  const [autoTransitions, setAutoTransitions] = useState<WorkflowAutoTransition[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<StudioNotice | null>(null);

  const [conditionTypes, setConditionTypes] = useState<ConditionTypeInfo | null>(null);
  const [actionTypes, setActionTypes] = useState<Array<{ type: string; name: string; description: string }>>([]);
  const [fields, setFields] = useState<EntityField[]>([]);
  const [formTabs, setFormTabs] = useState<FormTab[]>([]);

  const [conditionModalOpen, setConditionModalOpen] = useState(false);
  const [editingCondition, setEditingCondition] = useState<ConditionDefinition | null>(null);
  const [targetEdgeId, setTargetEdgeId] = useState<string | null>(null);
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [workflowHistory, setWorkflowHistory] = useState<Workflow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 3500);
  };

  const nodesRef = useRef<WorkflowFlowNode[]>(nodes);
  const edgesRef = useRef<WorkflowFlowEdge[]>(edges);
  const terminalStatesRef = useRef<string[]>(terminalStates);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(() => {
    terminalStatesRef.current = terminalStates;
  }, [terminalStates]);

  const handleOpenHistory = async () => {
    setHistoryOpen(true);
    setLoadingHistory(true);
    try {
      const history = await api.getWorkflowHistory(entityType);
      setWorkflowHistory(history);
    } catch {
      setWorkflowHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleExportBundle = async () => {
    try {
      let exportId = id;
      if (!exportId) {
        const def = flowToDefinition(nodes, edges, entityType || 'workorder', versionLabel || 'v1.0', {
          terminal_states: terminalStates,
          auto_transitions: autoTransitions,
        });
        const liveBundle = {
          manifest: {
            schema_version: 'compassx-workflow-bundle/v1',
            exported_at: new Date().toISOString(),
            name: `${entityType || 'Custom'} Draft Process`,
            description: `Exported draft workflow definition for ${entityType || 'custom process'}`,
            entity_type: entityType || 'workorder',
            version_label: versionLabel,
            status: status,
            state_count: def.states.length,
            transition_count: def.transitions.length,
            condition_count: conditions.length,
            role_count: roles.length,
          },
          workflow: def,
          conditions: conditions.filter((c) => c.entity_type === entityType || c.entity_type === 'global'),
          roles: roles,
        };
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(liveBundle, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', dataStr);
        downloadAnchor.setAttribute('download', `workflow-${entityType || 'process'}-${versionLabel}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        flash('ok', 'Workflow package exported successfully.');
        return;
      }
      const bundle = await api.exportWorkflow(exportId);
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(bundle, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `workflow-${entityType}-${versionLabel}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      flash('ok', 'Workflow package exported successfully.');
    } catch (err: any) {
      flash('err', err.message || 'Failed to export workflow package');
    }
  };

  const handleLoadWorkflowSnapshot = (wf: Workflow) => {
    setId(wf.id);
    setEntityType(wf.entity_type);
    setVersionLabel(wf.version_label);
    setStatus(wf.status);
    const flow = definitionToFlow(wf.definition);
    setNodes(hydrateNodes(flow.nodes));
    setEdges(hydrateEdges(flow.edges));
    setTerminalStates(wf.definition.terminal_states || []);
    setAutoTransitions(wf.definition.auto_transitions || []);
    setDirty(false);
    setHistoryOpen(false);
    flash('ok', `Loaded version ${wf.version_label}`);
  };

  // Load registered types, fields, conditions, roles, action catalog
  useEffect(() => {
    api
      .listEntityTypes()
      .then((list) => {
        const names = list.map((et) => et.name);
        setKnownTypes(names);
        if (!initialType && names.length > 0) {
          setEntityType((cur) => cur || names[0]);
        }
      })
      .catch(() => {
        api
          .listWorkflows()
          .then((wfs) => {
            const names: string[] = Array.from(new Set(wfs.map((w: Workflow) => w.entity_type))).sort();
            setKnownTypes(names);
            if (!initialType && names.length > 0) {
              setEntityType((cur) => cur || names[0]);
            }
          })
          .catch(() => {});
      });

    api
      .listConditionTypes()
      .then(setConditionTypes)
      .catch(() => setConditionTypes(null));

    api
      .listActionTypes()
      .then((t) => setActionTypes(t.map((x) => ({ type: x.type, name: x.name, description: x.description }))))
      .catch(() => setActionTypes([]));

    api
      .listRoles()
      .then((r) => setRoles(r.items))
      .catch(() => setRoles([]));
  }, []);

  useEffect(() => {
    if (!entityType) return;
    api.listConditions(entityType).then(setConditions).catch(() => setConditions([]));
    api.listFields(entityType).then(setFields).catch(() => setFields([]));
    api
      .getEntityType(entityType)
      .then((et) => setEntityStatuses(et.statuses || []))
      .catch(() => setEntityStatuses([]));
    api
      .getForm(entityType)
      .then((f) => setFormTabs(f.tabs || []))
      .catch(() => setFormTabs([]));
  }, [entityType]);

  useEffect(() => {
    if (workflowId) {
      setLoading(true);
      api
        .getWorkflow(workflowId)
        .then((wf) => {
          setId(wf.id);
          setEntityType(wf.entity_type);
          setVersionLabel(wf.version_label);
          setStatus(wf.status);
          const flow = definitionToFlow(wf.definition);
          setNodes(hydrateNodes(flow.nodes));
          setEdges(hydrateEdges(flow.edges));
          setTerminalStates(wf.definition.terminal_states || []);
          setAutoTransitions(wf.definition.auto_transitions || []);
        })
        .catch((err) => flash('err', err.message))
        .finally(() => setLoading(false));
    } else {
      const seed = definitionToFlow({
        entity_type: entityType || initialType || 'workorder',
        version_label: 'v1.0',
        states: ['Draft'],
        nodes: [{ name: 'Draft', kind: 'start', position: { x: 48, y: 64 } }],
        transitions: [],
      });
      setNodes(hydrateNodes(seed.nodes));
      setEdges(hydrateEdges(seed.edges));
    }
  }, [workflowId]);

  // Keep terminal state badges in sync with declared terminal states
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({ ...n, data: { ...n.data, terminal: terminalStates.includes(n.data.label) } }))
    );
  }, [terminalStates]);

  // Post-mount layout stabilization: trigger fitView once container and handles have mounted
  useEffect(() => {
    if (nodes.length > 0) {
      const timer = window.setTimeout(() => {
        fitView({ padding: 0.2, duration: 150 });
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [id, nodes.length, fitView]);

  const onNodesChange = useCallback(
    (changes: NodeChange<WorkflowFlowNode>[]) => setNodes((nds) => applyNodeChanges(changes, nds) as WorkflowFlowNode[]),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowFlowEdge>[]) => setEdges((eds) => applyEdgeChanges(changes, eds) as WorkflowFlowEdge[]),
    []
  );

  function dataOf(e: WorkflowFlowEdge): WorkflowFlowEdge['data'] {
    const sourceNode = nodesRef.current.find((n) => n.id === e.source || n.data?.label === e.source);
    const isRouterSource = isConditionKind(sourceNode?.data?.kind);
    return {
      event: e.data?.event ?? 'EVENT',
      label: e.data?.label,
      button_label: e.data?.button_label,
      button_style: e.data?.button_style,
      is_system: e.data?.is_system,
      description: e.data?.description,
      conditions: e.data?.conditions ?? [],
      choices: e.data?.choices,
      on_after: e.data?.on_after,
      isRouterSource: isRouterSource ?? e.data?.isRouterSource,
      sourceNodeKind: sourceNode?.data?.kind ?? e.data?.sourceNodeKind,
      sourceNodeLabel: sourceNode?.data?.label ?? e.data?.sourceNodeLabel,
      onRenameEvent: handleRenameEvent,
      onDelete: handleDeleteEdge,
    };
  }

  const withEdgeCallbacks = (edge: WorkflowFlowEdge): WorkflowFlowEdge => ({ ...edge, data: dataOf(edge) });

  const hydrateNodes = (nds: WorkflowFlowNode[]): WorkflowFlowNode[] =>
    nds.map((n) => ({
      ...n,
      data: {
        ...n.data,
        kind: n.data.kind || 'task',
        terminal: terminalStates.includes(n.data.label) || isStopKind(n.data.kind),
        onRename: handleRenameState,
        onDelete: handleDeleteNode,
        onDuplicate: handleDuplicateNode,
      },
    }));

  const hydrateEdges = (eds: WorkflowFlowEdge[]): WorkflowFlowEdge[] => eds.map(withEdgeCallbacks);

  const handleNodeDataChange = (nodeId: string, updates: Partial<StateNodeData>) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)));
    setDirty(true);
  };

  const handleEdgeDataChange = (edgeId: string, updates: Partial<EventEdgeData>) => {
    setEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, data: { ...e.data, ...updates } } : e)));
    setDirty(true);
  };

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    // 1. Enterprise constraint: Cannot connect a node to itself directly
    if (connection.source === connection.target) return false;

    // 2. Enterprise constraint: Start node cannot receive incoming connections
    const targetNode = nodesRef.current.find((n) => n.id === connection.target || n.data?.label === connection.target);
    if (targetNode?.data?.kind === 'start') return false;

    // 3. Enterprise constraint: Stop / End node cannot have outgoing connections
    const sourceNode = nodesRef.current.find((n) => n.id === connection.source || n.data?.label === connection.source);
    if (isStopKind(sourceNode?.data?.kind) || sourceNode?.data?.terminal) return false;

    return true;
  }, []);

  const handleConnect = useCallback((connection: Connection) => {
    if (!isValidConnection(connection)) return;

    const sourceNode = nodesRef.current.find((n) => n.id === connection.source || n.data?.label === connection.source);
    const isRouter = isConditionKind(sourceNode?.data?.kind);
    const isSingleOut = isSingleOutgoingKind(sourceNode?.data?.kind);

    let defaultEvent = 'EVENT';
    let sourceHandle = connection.sourceHandle;

    if (isRouter) {
      if (sourceHandle === 'TRUE' || sourceHandle === 'FALSE') {
        defaultEvent = sourceHandle;
      } else {
        const existingEdges = edgesRef.current.filter(
          (e) => e.source === connection.source || e.source === sourceNode?.id || e.source === sourceNode?.data?.label
        );
        const hasTrue = existingEdges.some((e) => e.data?.event === 'TRUE');
        const hasFalse = existingEdges.some((e) => e.data?.event === 'FALSE');
        defaultEvent = !hasTrue ? 'TRUE' : !hasFalse ? 'FALSE' : 'TRUE';
        sourceHandle = defaultEvent;
      }

      // Enterprise Condition / Router constraint: Strictly ONE connection per branch (TRUE / FALSE)
      const existingBranchEdge = edgesRef.current.find(
        (e) =>
          (e.source === connection.source || e.source === sourceNode?.id || e.source === sourceNode?.data?.label) &&
          e.data?.event === defaultEvent
      );

      if (existingBranchEdge) {
        setEdges((eds) =>
          eds.map((e) =>
            e.id === existingBranchEdge.id
              ? {
                  ...e,
                  target: connection.target as string,
                  sourceHandle: sourceHandle || undefined,
                  data: dataOf({ ...e, target: connection.target as string }),
                }
              : e
          )
        );
        setSelection({ kind: 'node', id: connection.source as string });
        setDirty(true);
        return;
      }
    } else if (isSingleOut) {
      // Enterprise Single-Outgoing constraint (Start, Action, Wait, Interaction, Subprocess): Strictly ONE outgoing connection
      const existingOutgoing = edgesRef.current.filter(
        (e) => e.source === connection.source || e.source === sourceNode?.id || e.source === sourceNode?.data?.label
      );

      defaultEvent = defaultEventForKind(sourceNode?.data?.kind, 0);

      if (existingOutgoing.length > 0) {
        const existingEdge = existingOutgoing[0];
        setEdges((eds) =>
          eds.map((e) =>
            e.id === existingEdge.id
              ? {
                  ...e,
                  target: connection.target as string,
                  data: dataOf({ ...e, target: connection.target as string, data: { ...e.data, event: e.data?.event || defaultEvent } }),
                }
              : e
          )
        );
        setSelection({ kind: 'edge', id: existingEdge.id });
        setDirty(true);
        return;
      }
    } else {
      // Multi-action decisions (Task, Manual, standard State)
      const existingOutgoing = edgesRef.current.filter(
        (e) => e.source === connection.source || e.source === sourceNode?.id || e.source === sourceNode?.data?.label
      );
      const usedEvents = new Set(existingOutgoing.map((e) => e.data?.event));
      defaultEvent = defaultEventForKind(sourceNode?.data?.kind, existingOutgoing.length);
      if (usedEvents.has(defaultEvent)) {
        let suffix = 2;
        while (usedEvents.has(`${defaultEvent}_${suffix}`)) {
          suffix++;
        }
        defaultEvent = `${defaultEvent}_${suffix}`;
      }
    }

    const edgeId = `${connection.source}|${defaultEvent}|${connection.target}|${Math.random().toString(36).slice(2, 8)}`;
    const isSystemTrigger = isSingleOut || isRouter;
    const defaultButtonLabel = isRouter ? undefined : defaultEvent.replace(/_/g, ' ');
    setEdges((eds) => {
      const newEdge = withEdgeCallbacks({
        id: edgeId,
        type: 'event',
        source: connection.source as string,
        target: connection.target as string,
        sourceHandle: sourceHandle || undefined,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: isRouter ? '#64748b' : '#94a3b8',
        },
        data: {
          event: defaultEvent,
          label: defaultButtonLabel,
          button_label: defaultButtonLabel,
          button_style: 'primary',
          is_system: isSystemTrigger,
          conditions: [],
          isRouterSource: isRouter,
          sourceNodeKind: sourceNode?.data?.kind,
          sourceNodeLabel: sourceNode?.data?.label,
        },
      });
      return addEdge(newEdge, eds) as WorkflowFlowEdge[];
    });

    if (isRouter) {
      setSelection({ kind: 'node', id: connection.source as string });
    } else {
      setSelection({ kind: 'edge', id: edgeId });
    }
    setDirty(true);
  }, [isValidConnection]);

  const makeNode = (kind: NodeKind, position: { x: number; y: number }): WorkflowFlowNode => {
    const label = nextStateLabel(nodesRef.current, kind);
    return {
      id: label,
      type: 'state',
      position,
      data: {
        label,
        kind,
        terminal: terminalStatesRef.current.includes(label),
        onRename: handleRenameState,
        onDelete: handleDeleteNode,
        onDuplicate: handleDuplicateNode,
      },
    };
  };

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData('application/reactflow') as NodeKind;
      if (!NODE_KINDS.some((k) => k.kind === kind)) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const node = makeNode(kind, { x: position.x - 75, y: position.y - 25 });
      setNodes((nds) => [...nds, node]);
      setSelection({ kind: 'node', id: node.id });
      setDirty(true);
    },
    [screenToFlowPosition]
  );

  const handleAddNode = useCallback(
    (kind: NodeKind) => {
      const center = screenToFlowPosition({ x: window.innerWidth / 2 - 160, y: 200 });
      const node = makeNode(kind, {
        x: center.x - 60 + Math.floor(Math.random() * 60),
        y: center.y - 20 + Math.floor(Math.random() * 60),
      });
      setNodes((nds) => [...nds, node]);
      setSelection({ kind: 'node', id: node.id });
      setDirty(true);
    },
    [screenToFlowPosition]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  async function handleRenameState(oldLabel: string, newLabel: string) {
    if (!newLabel || !newLabel.trim()) return;
    const cleanNewLabel = newLabel.trim();
    if (cleanNewLabel === oldLabel) return;

    setNodes((nds) =>
      nds.map((n) =>
        n.id === oldLabel || n.data?.label === oldLabel
          ? { ...n, id: cleanNewLabel, data: { ...n.data, label: cleanNewLabel } }
          : n
      )
    );
    setTerminalStates((ts) => ts.map((s) => (s === oldLabel ? cleanNewLabel : s)));
    setEdges((eds) =>
      eds.map((e) => {
        const remapped = {
          ...e,
          source: e.source === oldLabel ? cleanNewLabel : e.source,
          target: e.target === oldLabel ? cleanNewLabel : e.target,
        };
        const choices = (remapped.data?.choices ?? []).map((c) =>
          c.to === oldLabel ? { ...c, to: cleanNewLabel } : c
        );
        if (!remapped.data?.choices?.length) return remapped;
        const fallback = (choices.find((c) => !c.when || c.when.length === 0)?.to ?? choices[0]?.to) || remapped.target;
        return { ...remapped, target: fallback, data: { ...dataOf(remapped), choices } };
      })
    );
    setSelection((sel) =>
      sel?.kind === 'node' && (sel.id === oldLabel || sel.id === cleanNewLabel) ? { kind: 'node', id: cleanNewLabel } : sel
    );
    setDirty(true);
  }

  async function handleRenameEvent(edgeId: string, event: string) {
    setEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, data: { ...dataOf(e), event } } : e)));
    setDirty(true);
  }

  function handleDeleteNode(id: string) {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelection((sel) => (sel?.id === id ? null : sel));
    setDirty(true);
  }

  function handleDuplicateNode(id: string) {
    const src = nodesRef.current.find((n) => n.id === id);
    if (!src) return;
    const label = nextStateLabel(nodesRef.current, src.data.kind);
    const dup: WorkflowFlowNode = {
      ...src,
      id: label,
      position: { x: src.position.x + 48, y: src.position.y + 48 },
      data: { ...src.data, label, terminal: terminalStatesRef.current.includes(label) },
    };
    const copiedEdges = edgesRef.current
      .filter((e) => e.source === id)
      .map((e) =>
        withEdgeCallbacks({
          ...e,
          id: `${label}-${e.data?.event ?? 'EVENT'}-${Math.random().toString(36).slice(2, 7)}`,
          source: label,
        })
      );
    setNodes((nds) => [...nds, dup]);
    setEdges((eds) => [...eds, ...copiedEdges]);
    setSelection({ kind: 'node', id: label });
    setDirty(true);
  }

  function handleDeleteEdge(edgeId: string) {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    setSelection(null);
    setDirty(true);
  }

  function handleSetEdgeConditions(edgeId: string, conditionIds: string[]) {
    setEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, data: { ...dataOf(e), conditions: conditionIds } } : e)));
    setDirty(true);
  }

  function handleSetEdgeTarget(edgeId: string, to: string) {
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id !== edgeId) return e;
        const choices = e.data?.choices;
        if (choices?.length) {
          const next = choices.map((c) => (c.when && c.when.length ? c : { ...c, to }));
          const fallback = next.find((c) => !c.when || c.when.length === 0)?.to ?? next[0]?.to ?? to;
          return { ...e, target: fallback, data: { ...dataOf(e), choices: next } };
        }
        return { ...e, target: to, data: dataOf(e) };
      })
    );
    setDirty(true);
  }

  const handleAddRoute = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const targetNode = nodesRef.current.find((n) => n.id === targetId || n.data?.label === targetId);
    if (targetNode?.data?.kind === 'start') return;

    const sourceNode = nodesRef.current.find((n) => n.id === sourceId || n.data?.label === sourceId);
    if (isStopKind(sourceNode?.data?.kind) || sourceNode?.data?.terminal) return;

    const isRouter = isConditionKind(sourceNode?.data?.kind);
    const isSingleOut = isSingleOutgoingKind(sourceNode?.data?.kind);

    const existingEdges = edgesRef.current.filter(
      (e) => e.source === sourceId || e.source === sourceNode?.id || e.source === sourceNode?.data?.label
    );

    if (isSingleOut && existingEdges.length > 0) {
      const existing = existingEdges[0];
      handleSetEdgeTarget(existing.id, targetId);
      return existing.id;
    }

    let defaultEvent = defaultEventForKind(sourceNode?.data?.kind, existingEdges.length);
    const usedEvents = new Set(existingEdges.map((e) => e.data?.event));
    if (usedEvents.has(defaultEvent)) {
      let suffix = 2;
      while (usedEvents.has(`${defaultEvent}_${suffix}`)) {
        suffix++;
      }
      defaultEvent = `${defaultEvent}_${suffix}`;
    }
    const id = `${sourceId}|${defaultEvent}|${targetId}|${Math.random().toString(36).slice(2, 7)}`;
    const isSystemTrigger = isSingleOut || isRouter;
    const defaultButtonLabel = isRouter ? undefined : defaultEvent.replace(/_/g, ' ');
    const newEdge: WorkflowFlowEdge = withEdgeCallbacks({
      id,
      type: 'event',
      source: sourceId,
      target: targetId,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: isRouter ? '#64748b' : '#94a3b8',
      },
      data: {
        event: defaultEvent,
        label: defaultButtonLabel,
        button_label: defaultButtonLabel,
        button_style: 'primary',
        is_system: isSystemTrigger,
        conditions: [],
        isRouterSource: isRouter,
        sourceNodeKind: sourceNode?.data?.kind,
        sourceNodeLabel: sourceNode?.data?.label,
      },
    });
    setEdges((eds) => [...eds, newEdge]);
    setDirty(true);
    return id;
  }, []);

  function handleSetEdgeOnAfter(edgeId: string, on_after: WorkflowAction[]) {
    setEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, data: { ...dataOf(e), on_after } } : e)));
    setDirty(true);
  }

  function handleSetNodeConditions(nodeId: string, conditionIds: string[]) {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                conditions: conditionIds,
                condition_id: conditionIds[0] || null,
              },
            }
          : n
      )
    );
    setDirty(true);
  }

  function handleSetNodeTaskAssignment(
    nodeId: string,
    updates: {
      role_id?: string | null;
      role_name?: string | null;
      task_instructions?: string | null;
      time_limit_hours?: number | null;
    }
  ) {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                ...updates,
              },
            }
          : n
      )
    );
    setDirty(true);
  }

  function handleSetRouterBranch(nodeId: string, branch: 'TRUE' | 'FALSE', targetState: string) {
    const node = nodesRef.current.find((n) => n.id === nodeId || n.data?.label === nodeId);
    if (!node) return;

    const sourceKey = node.data?.label || node.id;
    const existingBranchEdge = edgesRef.current.find(
      (e) => (e.source === sourceKey || e.source === node.id) && e.data?.event === branch
    );

    if (existingBranchEdge) {
      if (!targetState) {
        setEdges((eds) => eds.filter((e) => e.id !== existingBranchEdge.id));
      } else {
        setEdges((eds) =>
          eds.map((e) =>
            e.id === existingBranchEdge.id
              ? {
                  ...e,
                  target: targetState,
                  sourceHandle: branch,
                  data: dataOf({ ...e, target: targetState, data: { ...(e.data || { conditions: [] }), event: branch, isRouterSource: true } }),
                }
              : e
          )
        );
      }
    } else if (targetState) {
      const edgeId = `${sourceKey}|${branch}|${targetState}|${Math.random().toString(36).slice(2, 7)}`;
      const newEdge: WorkflowFlowEdge = withEdgeCallbacks({
        id: edgeId,
        type: 'event',
        source: sourceKey,
        target: targetState,
        sourceHandle: branch,
        data: {
          event: branch,
          conditions: [],
          isRouterSource: true,
        },
      });
      setEdges((eds) => [...eds, newEdge]);
    }
    setDirty(true);
  }

  const handleAutoArrange = useCallback(() => {
    const newPositions = autoArrangePositions(nodes, edges);
    setNodes((nds) =>
      nds.map((n) => {
        const p = newPositions[n.id];
        return p ? { ...n, position: p } : n;
      })
    );
    setDirty(true);
    window.setTimeout(() => fitView({ padding: 0.2 }), 50);
  }, [nodes, edges, fitView]);

  async function handleSave() {
    setSaving(true);
    try {
      const def = flowToDefinition(nodes, edges, entityType, versionLabel, {
        terminal_states: terminalStates,
        auto_transitions: autoTransitions,
      });
      const isPrevPublished = status === 'published';
      const saved = await api.saveDraft({
        id: id || undefined,
        entity_type: entityType,
        version_label: versionLabel,
        definition: def,
      });
      setId(saved.id);
      setVersionLabel(saved.version_label);
      setStatus(saved.status);
      setDirty(false);
      flash('ok', isPrevPublished ? `Created draft revision ${saved.version_label}` : `Saved draft revision ${saved.version_label}`);
      onListRefresh();
    } catch (e: any) {
      flash('err', e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    const localVal = validateGraphTopology(nodes, edges);
    if (!localVal.valid) {
      flash('err', localVal.errors[0]);
      return;
    }

    setSaving(true);
    try {
      const def = flowToDefinition(nodes, edges, entityType, versionLabel, {
        terminal_states: terminalStates,
        auto_transitions: autoTransitions,
      });
      const savedDraft = await api.saveDraft({
        id: id || undefined,
        entity_type: entityType,
        version_label: versionLabel,
        definition: def,
      });
      setId(savedDraft.id);

      const pubRes = await api.publishWorkflow(savedDraft.id);
      setStatus('published');
      setVersionLabel(pubRes.workflow.version_label);
      setDirty(false);
      flash('ok', `Activated process revision ${pubRes.workflow.version_label} — now routing live records.`);
      onListRefresh();
    } catch (e: any) {
      flash('err', e.message || 'Activation failed');
    } finally {
      setSaving(false);
    }
  }

  const handleValidate = () => {
    const localVal = validateGraphTopology(nodes, edges);
    if (!localVal.valid) {
      flash('err', localVal.errors[0]);
      return;
    }
    if (localVal.warnings.length > 0) {
      flash('ok', `Process valid with warnings (${localVal.warnings[0]})`);
      return;
    }
    flash('ok', 'Process validation successful. Structure is 100% valid.');
  };

  const activeNode = selection?.kind === 'node' ? nodes.find((n) => n.id === selection.id) : null;
  const activeEdge = selection?.kind === 'edge' ? edges.find((e) => e.id === selection.id) : null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50">
      <HeaderBar
        entityType={entityType}
        onEntityType={(et) => {
          setEntityType(et);
          navigate('workflows', { type: et });
        }}
        versionLabel={versionLabel}
        status={status}
        dirty={dirty}
        saving={saving}
        canDelete={status !== 'published'}
        notice={notice}
        knownTypes={knownTypes}
        onAutoArrange={handleAutoArrange}
        onNewCondition={() => {
          setTargetEdgeId(null);
          setTargetNodeId(null);
          setEditingCondition(null);
          setConditionModalOpen(true);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={handleOpenHistory}
        onOpenTemplates={() => setTemplateModalOpen(true)}
        onExportBundle={handleExportBundle}
        onValidate={handleValidate}
        onSave={handleSave}
        onPublish={handlePublish}
        onDelete={async () => {
          if (!id) return;
          if (!confirm(`Delete workflow ${versionLabel}?`)) return;
          try {
            await api.deleteWorkflow(id);
            onListRefresh();
            onBack();
          } catch (e: any) {
            flash('err', e.message || 'Delete failed');
          }
        }}
        onDeprecate={async () => {
          if (!id) return;
          try {
            const dep = await api.deprecateWorkflow(id);
            setStatus(dep.status);
            flash('ok', `Workflow ${dep.version_label} deprecated.`);
            onListRefresh();
          } catch (e: any) {
            flash('err', e.message || 'Deprecation failed');
          }
        }}
      />

      <div className="relative flex flex-1 overflow-hidden">
        <LeftRail
          onAdd={handleAddNode}
          onAutoArrange={handleAutoArrange}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="relative flex-1" onDrop={handleDrop} onDragOver={onDragOver}>
          {loading ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              isValidConnection={isValidConnection}
              onNodeClick={(_, node) => setSelection({ kind: 'node', id: node.id })}
              onEdgeClick={(_, edge) => {
                const sourceNode = nodes.find((n) => n.id === edge.source);
                if (isConditionKind(sourceNode?.data?.kind)) {
                  // Context routing rule: redirect selection directly to source Router/Condition Node inspector
                  setSelection({ kind: 'node', id: sourceNode.id });
                } else {
                  setSelection({ kind: 'edge', id: edge.id });
                }
              }}
              onPaneClick={() => setSelection(null)}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              minZoom={0.2}
              maxZoom={1.5}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#cbd5e1" />
              <Controls className="!border-gray-200 !bg-white !shadow-xs" />
              <MiniMap
                className="!border-gray-200 !bg-white !shadow-xs"
                nodeColor={(n) => {
                  if (n.data?.kind === 'start') return '#10b981';
                  if (isStopKind(n.data?.kind)) return '#f43f5e';
                  if (isConditionKind(n.data?.kind)) return '#9333ea';
                  if (n.data?.kind === 'task') return '#6366f1';
                  if (n.data?.kind === 'wait') return '#0d9488';
                  if (n.data?.kind === 'action') return '#d97706';
                  return '#3b82f6';
                }}
              />
            </ReactFlow>
          )}
        </div>

        {/* Right Sidebar Properties Inspector */}
        <div className="w-84 shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
          {activeNode && (
            <NodeInspector
              node={activeNode}
              nodes={nodes}
              edges={edges}
              nodeLabels={nodes.map((n) => n.data.label)}
              conditions={conditions}
              roles={roles}
              entityStatuses={entityStatuses}
              formTabs={formTabs}
              onKind={(nodeId, kind) => {
                setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, kind } } : n)));
                setDirty(true);
              }}
              onRename={handleRenameState}
              onDuplicate={handleDuplicateNode}
              onDelete={handleDeleteNode}
              onTarget={(nodeId, to) => {
                const existing = edges.find((e) => e.source === nodeId);
                if (existing) {
                  handleSetEdgeTarget(existing.id, to);
                } else {
                  handleAddRoute(nodeId, to);
                }
              }}
              onConditions={(nodeId, conds) => handleSetNodeConditions(nodeId, conds)}
              onNodeConditions={(nodeId, conds) => handleSetNodeConditions(nodeId, conds)}
              onNodeTaskAssignment={handleSetNodeTaskAssignment}
              onNodeDataChange={handleNodeDataChange}
              onSetRouterBranch={handleSetRouterBranch}
              onEvent={handleRenameEvent}
              onRemoveConnection={handleDeleteEdge}
              onAddRoute={handleAddRoute}
              onEditCondition={(c) => {
                setEditingCondition(c);
                setConditionModalOpen(true);
              }}
              onNewCondition={(_, nodeId) => {
                setTargetNodeId(nodeId || activeNode.id);
                setTargetEdgeId(null);
                setEditingCondition(null);
                setConditionModalOpen(true);
              }}
              onOpenRolesModule={() => navigate('people', { tab: 'roles' })}
            />
          )}

          {activeEdge && !activeNode && (
            <ActionInspector
              edge={activeEdge}
              sourceNode={nodes.find((n) => n.id === activeEdge.source || n.data?.label === activeEdge.source)}
              nodeLabels={nodes.map((n) => n.data.label)}
              conditions={conditions}
              actionTypes={actionTypes}
              isRouterSource={activeEdge.data?.isRouterSource}
              onEvent={handleRenameEvent}
              onEdgeDataChange={handleEdgeDataChange}
              onTarget={(edgeId, to) => handleSetEdgeTarget(edgeId, to)}
              onConditions={handleSetEdgeConditions}
              onOnAfter={handleSetEdgeOnAfter}
              onDelete={handleDeleteEdge}
              onEditCondition={(c) => {
                setEditingCondition(c);
                setConditionModalOpen(true);
              }}
              onNewCondition={() => {
                setTargetEdgeId(activeEdge.id);
                setTargetNodeId(null);
                setEditingCondition(null);
                setConditionModalOpen(true);
              }}
            />
          )}

          {!activeNode && !activeEdge && (
            <div className="flex flex-col items-start gap-3 p-5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <MousePointer className="h-3 w-3" /> Nothing selected
              </p>
              <p className="text-sm leading-snug text-gray-500">
                Select a <span className="font-semibold text-gray-700">state</span> or{' '}
                <span className="font-semibold text-gray-700">connection</span> on the canvas to inspect and configure it here.
              </p>
              <div className="flex flex-col items-start gap-1.5 mt-2">
                <DashedButton onClick={handleAutoArrange}>Auto Arrange canvas</DashedButton>
                <DashedButton onClick={() => setSettingsOpen(true)}>Workflow settings…</DashedButton>
                <DashedButton
                  onClick={() => {
                    setTargetEdgeId(null);
                    setTargetNodeId(null);
                    setEditingCondition(null);
                    setConditionModalOpen(true);
                  }}
                >
                  New condition…
                </DashedButton>
              </div>
            </div>
          )}
        </div>
      </div>

      {conditionModalOpen && (
        <ConditionModal
          variant="dialog"
          entityType={entityType}
          conditionTypes={conditionTypes}
          fields={fields}
          initial={editingCondition}
          onClose={() => {
            setEditingCondition(null);
            setTargetEdgeId(null);
            setTargetNodeId(null);
            setConditionModalOpen(false);
          }}
          onSaved={(savedCond) => {
            api
              .listConditions(entityType)
              .then((latest) => {
                setConditions(latest);
                const edgeId = targetEdgeId || (selection?.kind === 'edge' ? selection.id : null);
                const nodeId = targetNodeId || (selection?.kind === 'node' ? selection.id : null);
                if (savedCond) {
                  if (targetNodeId || (!targetEdgeId && selection?.kind === 'node' && nodeId)) {
                    handleSetNodeConditions(nodeId!, [savedCond.id]);
                  } else if (edgeId) {
                    handleSetEdgeConditions(edgeId, [savedCond.id]);
                  }
                }
                setTargetEdgeId(null);
                setTargetNodeId(null);
              })
              .catch(() => setConditions([]));
            setEditingCondition(null);
            setConditionModalOpen(false);
            flash('ok', `Condition "${savedCond.label}" saved.`);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          nodeLabels={nodes.map((n) => n.data.label)}
          terminalStates={terminalStates}
          autoTransitions={autoTransitions}
          onTerminal={(v) => {
            setTerminalStates(v);
            setDirty(true);
          }}
          onAutoTransitions={(v) => {
            setAutoTransitions(v);
            setDirty(true);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onMouseDown={() => setHistoryOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-gray-500" />
                <h3 className="text-sm font-bold text-gray-900">
                  Process Revisions · <span className="font-mono text-gray-600">{entityType}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="ml-2 text-xs">Loading process revisions…</span>
                </div>
              ) : workflowHistory.length === 0 ? (
                <p className="py-8 text-center text-xs text-gray-400">No previous process revisions found.</p>
              ) : (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                  {workflowHistory.map((wf) => {
                    const isCurrent = wf.id === id;
                    const stateCount = wf.definition?.states?.length ?? 0;
                    const transitionCount = wf.definition?.transitions?.length ?? 0;
                    const statusLabel = wf.status === 'published' ? 'ACTIVE' : wf.status === 'deprecated' ? 'INACTIVE' : 'DRAFT';
                    const statusStyle =
                      wf.status === 'published'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : wf.status === 'deprecated'
                        ? 'border-gray-200 bg-gray-100 text-gray-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800';

                    return (
                      <div
                        key={wf.id}
                        className={`flex items-center justify-between p-3.5 transition-colors ${
                          isCurrent ? 'bg-blue-50/40' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-gray-900">{wf.version_label}</span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusStyle}`}
                            >
                              {statusLabel}
                            </span>
                            {isCurrent && (
                              <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                                Loaded in Canvas
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500">
                            <span>{stateCount} states</span>
                            <span>·</span>
                            <span>{transitionCount} transitions</span>
                            {wf.published_at && (
                              <>
                                <span>·</span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3 text-gray-400" />
                                  Activated {new Date(wf.published_at).toLocaleDateString()}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleLoadWorkflowSnapshot(wf)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                          >
                            <span>Load Revision</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end border-t border-gray-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Packages & Import Modal */}
      <TemplateImportModal
        isOpen={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        initialEntityType={entityType}
        onImportSuccess={(res) => {
          setTemplateModalOpen(false);
          onListRefresh();
          const def = res.workflow.definition;
          setId(res.workflow.id);
          setEntityType(res.workflow.entity_type);
          setVersionLabel(res.workflow.version_label);
          setStatus(res.workflow.status);
          const flow = definitionToFlow(def);
          setNodes(hydrateNodes(flow.nodes));
          setEdges(hydrateEdges(flow.edges));
          setTerminalStates(def.terminal_states || []);
          setAutoTransitions(def.auto_transitions || []);
          setDirty(false);
          flash('ok', `Loaded imported workflow package: ${res.workflow.version_label}`);
        }}
      />
    </div>
  );
}

export function WorkflowBuilder(props: BuilderInnerProps) {
  return (
    <ReactFlowProvider>
      <BuilderInner {...props} />
    </ReactFlowProvider>
  );
}
export default WorkflowBuilder;