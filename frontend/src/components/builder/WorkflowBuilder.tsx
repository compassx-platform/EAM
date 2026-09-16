import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import { Loader2, MousePointer } from 'lucide-react';
import { api } from '../../api/client';
import type { Workflow, WorkflowAction, WorkflowAutoTransition, WorkflowChoice, ConditionDefinition, ConditionTypeInfo, EntityField } from '../../types';
import StateNode from './StateNode';
import EventEdge from './EventEdge';
import { autoArrangePositions, definitionToFlow, flowToDefinition, nextStateLabel, NODE_KINDS } from './flowModel';
import type { WorkflowFlowNode, WorkflowFlowEdge, NodeKind } from './flowModel';
import { HeaderBar, type StudioNotice } from './studio/HeaderBar';
import { LeftRail } from './studio/LeftRail';
import { NodeInspector } from './studio/NodeInspector';
import { ActionInspector } from './studio/ActionInspector';
import { ConditionModal } from './studio/ConditionModal';
import { SettingsModal } from './studio/SettingsModal';
import { DashedButton } from './studio/ui';

const nodeTypes = { state: StateNode };
const edgeTypes = { event: EventEdge };

type Selection = { kind: 'node' | 'edge'; id: string } | null;

interface BuilderInnerProps {
  workflowId: string | null;
  onBack: () => void;
  onListRefresh: () => void;
}

function BuilderInner({ workflowId, onBack, onListRefresh }: BuilderInnerProps) {
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [id, setId] = useState<string | null>(workflowId);
  const [entityType, setEntityType] = useState('workorder');
  const [versionLabel, setVersionLabel] = useState('draft_v1');
  const [status, setStatus] = useState<Workflow['status']>('draft');
  const [nodes, setNodes] = useState<WorkflowFlowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowFlowEdge[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [conditions, setConditions] = useState<ConditionDefinition[]>([]);
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

  const [conditionModalOpen, setConditionModalOpen] = useState(false);
  const [editingCondition, setEditingCondition] = useState<ConditionDefinition | null>(null);
  const [targetEdgeId, setTargetEdgeId] = useState<string | null>(null);
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 3500);
  };

  // Handlers can be captured by node/edge `data` callbacks at hydrate time, so
  // they must read the *latest* nodes/edges — never a render-scoped closure.
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

  // ---- data loading -------------------------------------------------------
  useEffect(() => {
    api
      .listWorkflows()
      .then((list) => setKnownTypes([...new Set(list.map((w) => w.entity_type))].sort()))
      .catch(() => {});
    api
      .listConditionTypes()
      .then(setConditionTypes)
      .catch(() => setConditionTypes(null));
    api
      .listActionTypes()
      .then((t) => setActionTypes(t.map((x) => ({ type: x.type, name: x.name, description: x.description }))))
      .catch(() => setActionTypes([]));
  }, []);

  useEffect(() => {
    api.listConditions(entityType).then(setConditions).catch(() => setConditions([]));
    api.listFields(entityType).then(setFields).catch(() => setFields([]));
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
        .catch((err) => setNotice({ kind: 'err', text: err.message }))
        .finally(() => setLoading(false));
    } else {
      const seed = definitionToFlow({
        entity_type: 'workorder',
        version_label: 'draft_v1',
        states: ['Start'],
        nodes: [{ name: 'Start', kind: 'start', position: { x: 48, y: 64 } }],
        transitions: [],
      });
      setNodes(hydrateNodes(seed.nodes));
      setEdges(hydrateEdges(seed.edges));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // Keep node terminal badges in sync with the declared terminal states.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({ ...n, data: { ...n.data, terminal: terminalStates.includes(n.data.label) } }))
    );
  }, [terminalStates]);

  // ---- react flow state ----------------------------------------------------
  const onNodesChange = useCallback(
    (changes: NodeChange<WorkflowFlowNode>[]) => setNodes((nds) => applyNodeChanges(changes, nds) as WorkflowFlowNode[]),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowFlowEdge>[]) => setEdges((eds) => applyEdgeChanges(changes, eds) as WorkflowFlowEdge[]),
    []
  );

  // All declarative behaviour lives here so every node/edge carries the current
  // handlers regardless of how it was created or re-hydrated.
  function dataOf(e: WorkflowFlowEdge): WorkflowFlowEdge['data'] {
    const sourceNode = nodesRef.current.find((n) => n.id === e.source);
    const isRouterSource = sourceNode?.data?.kind === 'router';
    return {
      event: e.data?.event ?? 'EVENT',
      conditions: e.data?.conditions ?? [],
      choices: e.data?.choices,
      on_after: e.data?.on_after,
      isRouterSource: isRouterSource ?? e.data?.isRouterSource,
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
        kind: n.data.kind || 'state',
        terminal: terminalStates.includes(n.data.label),
        onRename: handleRenameState,
        onDelete: handleDeleteNode,
        onDuplicate: handleDuplicateNode,
      },
    }));

  const hydrateEdges = (eds: WorkflowFlowEdge[]): WorkflowFlowEdge[] => eds.map(withEdgeCallbacks);

  const handleConnect = useCallback((connection: Connection) => {
    const sourceNode = nodesRef.current.find((n) => n.id === connection.source);
    const isRouter = sourceNode?.data?.kind === 'router';

    let defaultEvent = 'EVENT';
    let sourceHandle = connection.sourceHandle;

    if (isRouter) {
      if (sourceHandle === 'TRUE' || sourceHandle === 'FALSE') {
        defaultEvent = sourceHandle;
      } else {
        const existingEdges = edgesRef.current.filter((e) => e.source === connection.source);
        const hasTrue = existingEdges.some((e) => e.data?.event === 'TRUE');
        const hasFalse = existingEdges.some((e) => e.data?.event === 'FALSE');
        defaultEvent = !hasTrue ? 'TRUE' : !hasFalse ? 'FALSE' : 'TRUE';
        sourceHandle = defaultEvent;
      }

      // Router outlets allow strictly ONE connection per branch (TRUE / FALSE)
      const existingBranchEdge = edgesRef.current.find(
        (e) => e.source === connection.source && e.data?.event === defaultEvent
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
    }

    const edgeId = `${connection.source}|${defaultEvent}|${connection.target}|${Math.random().toString(36).slice(2, 8)}`;
    setEdges((eds) => {
      const newEdge = withEdgeCallbacks({
        id: edgeId,
        type: 'event',
        source: connection.source as string,
        target: connection.target as string,
        sourceHandle: sourceHandle || undefined,
        data: { event: defaultEvent, conditions: [], isRouterSource: isRouter },
      });
      return addEdge(newEdge, eds) as WorkflowFlowEdge[];
    });
    if (isRouter) {
      setSelection({ kind: 'node', id: connection.source as string });
    } else {
      setSelection({ kind: 'edge', id: edgeId });
    }
    setDirty(true);
    setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      setNotice(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [screenToFlowPosition]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // ---- mutations -------------------------------------------------------------
  async function handleRenameState(oldLabel: string, newLabel: string) {
    setNodes((nds) =>
      nds.map((n) => (n.id === oldLabel ? { ...n, id: newLabel, data: { ...n.data, label: newLabel } } : n))
    );
    setTerminalStates((ts) => ts.map((s) => (s === oldLabel ? newLabel : s)));
    setEdges((eds) =>
      eds.map((e) => {
        const remapped = {
          ...e,
          source: e.source === oldLabel ? newLabel : e.source,
          target: e.target === oldLabel ? newLabel : e.target,
        };
        const choices = (remapped.data?.choices ?? []).map((c) =>
          c.to === oldLabel ? { ...c, to: newLabel } : c
        );
        if (!remapped.data?.choices?.length) return remapped;
        const fallback = (choices.find((c) => !c.when || c.when.length === 0)?.to ?? choices[0]?.to) || remapped.target;
        return { ...remapped, target: fallback, data: { ...dataOf(remapped), choices } };
      })
    );
    setSelection((sel) => (sel?.kind === 'node' && sel.id === oldLabel ? { kind: 'node', id: newLabel } : sel));
    setDirty(true);
  }

  async function handleRenameEvent(edgeId: string, event: string) {
    setEdges((eds) =>
      eds.map((e) => (e.id === edgeId ? { ...e, data: { ...dataOf(e), event } } : e))
    );
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

  const handleAddRoute = useCallback(
    (sourceId: string, targetId: string) => {
      const id = `${sourceId}|EVENT|${targetId}|${Math.random().toString(36).slice(2, 7)}`;
      const newEdge: WorkflowFlowEdge = withEdgeCallbacks({
        id,
        type: 'event',
        source: sourceId,
        target: targetId,
        data: {
          event: 'EVENT',
          conditions: [],
        },
      });
      setEdges((eds) => [...eds, newEdge]);
      setDirty(true);
      return id;
    },
    [withEdgeCallbacks]
  );

  function handleSetEdgeOnAfter(edgeId: string, on_after: WorkflowAction[]) {
    setEdges((eds) => eds.map((e) => (e.id === edgeId ? { ...e, data: { ...dataOf(e), on_after } } : e)));
    setDirty(true);
  }

  function handleOnNodesDelete(nodesDeleted: WorkflowFlowNode[]) {
    const ids = new Set(nodesDeleted.map((n) => n.id));
    setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    setSelection(null);
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

  function handleSetRouterBranch(nodeId: string, branch: 'TRUE' | 'FALSE', targetState: string) {
    setEdges((eds) => {
      const existing = eds.find((e) => e.source === nodeId && e.data?.event === branch);
      if (!targetState) {
        return existing ? eds.filter((e) => e.id !== existing.id) : eds;
      }
      if (existing) {
        return eds.map((e) =>
          e.id === existing.id
            ? {
                ...e,
                target: targetState,
                sourceHandle: branch,
                data: dataOf({ ...e, target: targetState }),
              }
            : e
        );
      }
      const edgeId = `${nodeId}|${branch}|${targetState}|${Math.random().toString(36).slice(2, 7)}`;
      const newEdge: WorkflowFlowEdge = withEdgeCallbacks({
        id: edgeId,
        type: 'event',
        source: nodeId,
        target: targetState,
        sourceHandle: branch,
        data: {
          event: branch,
          conditions: [],
        },
      });
      return [...eds, newEdge];
    });
    setDirty(true);
  }

  function handleSetNodeKind(nodeId: string, kind: NodeKind) {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, kind } } : n)));
    setDirty(true);
  }

  // ---- auto arrange -------------------------------------------------------
  function handleAutoArrange() {
    setNodes((nds) => {
      const positions = autoArrangePositions(nds, edges);
      return nds.map((n) => ({ ...n, position: positions[n.id] ?? n.position }));
    });
    setDirty(true);
    setNotice(null);
    window.requestAnimationFrame(() => fitView({ maxZoom: 1, padding: 0.15 }));
  }

  // ---- persistence ---------------------------------------------------------
  const buildDefinition = () =>
    flowToDefinition(nodes, edges, entityType, versionLabel, {
      terminal_states: terminalStates,
      auto_transitions: autoTransitions,
    });

  const handleSave = async () => {
    if (nodes.length === 0) {
      flash('err', 'Add at least one state before saving.');
      return;
    }
    setSaving(true);
    try {
      const saved = await api.saveDraft({
        id: id || undefined,
        entity_type: entityType,
        version_label: versionLabel,
        definition: buildDefinition(),
      });
      setId(saved.id);
      setStatus(saved.status);
      setDirty(false);
      onListRefresh();
      flash('ok', 'Draft saved.');
    } catch (err: any) {
      flash('err', `Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!id) await handleSave();
    setSaving(true);
    try {
      const res = await api.publishWorkflow(id!);
      setId(res.workflow.id);
      setStatus(res.workflow.status);
      setDirty(false);
      onListRefresh();
      const warnings = res.warnings?.length ? ` (${res.warnings.length} warning(s))` : '';
      flash('ok', `Workflow published${warnings}.`);
    } catch (err: any) {
      flash('err', `Publish failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    if (!id) {
      flash('err', 'Save the draft first, then validate.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.validateWorkflow(id);
      if (res.valid) flash('ok', 'Validation passed.');
      else flash('err', `Validation failed: ${res.errors.join('; ') || 'invalid workflow'}`);
    } catch (err: any) {
      flash('err', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!id) return;
    if (!window.confirm(`Delete workflow "${versionLabel}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await api.deleteWorkflow(id);
      onListRefresh();
      onBack();
    } catch (err: any) {
      flash('err', `Delete failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ---- inspector ------------------------------------------------------------
  const selectedNode = selection?.kind === 'node' ? nodes.find((n) => n.id === selection.id) ?? null : null;
  const selectedEdge = selection?.kind === 'edge' ? edges.find((e) => e.id === selection.id) ?? null : null;

  return (
    <div className="flex h-full flex-col">
      <HeaderBar
        entityType={entityType}
        onEntityType={(v) => {
          setEntityType(v);
          setDirty(true);
        }}
        versionLabel={versionLabel}
        onVersionLabel={(v) => {
          setVersionLabel(v);
          setDirty(true);
        }}
        status={status}
        dirty={dirty}
        saving={saving}
        canDelete={!!id}
        notice={notice}
        knownTypes={knownTypes}
        onBack={onBack}
        onAutoArrange={handleAutoArrange}
        onNewCondition={() => setConditionModalOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onValidate={handleValidate}
        onSave={handleSave}
        onPublish={handlePublish}
        onDelete={handleDeleteWorkflow}
      />

      <div className="flex min-h-0 flex-1">
        <LeftRail onAdd={handleAddNode} onAutoArrange={handleAutoArrange} onOpenSettings={() => setSettingsOpen(true)} />

        {/* Canvas */}
        <div className="relative min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onDrop={handleDrop}
            onDragOver={onDragOver}
            onNodeClick={(_, node) => setSelection({ kind: 'node', id: node.id })}
            onEdgeClick={(_, edge) => {
              const isRouter = nodes.find((n) => n.id === edge.source)?.data?.kind === 'router';
              if (isRouter) {
                setSelection({ kind: 'node', id: edge.source });
              } else {
                setSelection({ kind: 'edge', id: edge.id });
              }
            }}
            onPaneClick={() => setSelection(null)}
            onNodesDelete={handleOnNodesDelete}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
            className="bg-[#f8fafc]"
          >
            <Background gap={16} size={1} color="#e2e8f0" />
            <Controls />
            <MiniMap pannable zoomable className="!bg-white" nodeColor="#bfdbfe" maskColor="rgba(148,163,184,0.12)" />
          </ReactFlow>

          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          )}

          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-slate-800/80 px-3 py-1 text-[11px] text-slate-100">
            Drag a state to add · drag between handles to connect · click anything to edit
          </div>
        </div>

        {/* Contextual inspector */}
        {(() => {
          const isSelectedEdgeRouterOutlet =
            selectedEdge && nodes.find((n) => n.id === selectedEdge.source)?.data?.kind === 'router';
          const activeNode =
            selectedNode || (isSelectedEdgeRouterOutlet ? nodes.find((n) => n.id === selectedEdge.source) : null);
          const activeEdge = !isSelectedEdgeRouterOutlet ? selectedEdge : null;

          return (
            <div className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-white">
              {activeNode && (
                <NodeInspector
                  key={activeNode.id}
                  node={activeNode}
                  nodes={nodes}
                  edges={edges}
                  nodeLabels={nodes.map((n) => n.data.label)}
                  conditions={conditions}
                  onKind={handleSetNodeKind}
                  onRename={handleRenameState}
                  onDuplicate={handleDuplicateNode}
                  onDelete={handleDeleteNode}
                  onTarget={handleSetEdgeTarget}
                  onConditions={handleSetEdgeConditions}
                  onNodeConditions={handleSetNodeConditions}
                  onSetRouterBranch={handleSetRouterBranch}
                  onEvent={handleRenameEvent}
                  onRemoveConnection={handleDeleteEdge}
                  onAddRoute={handleAddRoute}
                  onEditCondition={(c) => {
                    setEditingCondition(c);
                    setConditionModalOpen(true);
                  }}
                  onNewCondition={(edgeId, nodeId) => {
                    setTargetEdgeId(edgeId || null);
                    setTargetNodeId(nodeId || null);
                    setEditingCondition(null);
                    setConditionModalOpen(true);
                  }}
                />
              )}

              {!activeNode && activeEdge && (
                <ActionInspector
                  key={activeEdge.id}
                  edge={activeEdge}
                  nodeLabels={nodes.map((n) => n.data.label)}
                  conditions={conditions}
                  actionTypes={actionTypes}
                  isRouterSource={false}
                  onEvent={handleRenameEvent}
                  onTarget={handleSetEdgeTarget}
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
                    <span className="font-semibold text-gray-700">connection</span> on the canvas to edit it here.
                  </p>
                  <div className="flex flex-col items-start gap-1.5">
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
          );
        })()}
      </div>

      {conditionModalOpen && (
        <ConditionModal
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
    </div>
  );
}

interface WorkflowBuilderProps {
  workflowId?: string | null;
  onBack: () => void;
  onListRefresh: () => void;
}

export function WorkflowBuilder({ workflowId = null, onBack, onListRefresh }: WorkflowBuilderProps) {
  return (
    <ReactFlowProvider>
      <BuilderInner workflowId={workflowId} onBack={onBack} onListRefresh={onListRefresh} />
    </ReactFlowProvider>
  );
}