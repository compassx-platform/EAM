import { useCallback, useEffect, useState } from 'react';
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
import { ArrowLeft, CheckCircle2, Pencil, Rocket, Save, Trash2, Loader2, AlertTriangle, Plus, LayoutGrid } from 'lucide-react';
import { api } from '../../api/client';
import type { Workflow, WorkflowAction, WorkflowAutoTransition } from '../../types';
import StateNode from './StateNode';
import EventEdge from './EventEdge';
import { NodePalette } from './NodePalette';
import { autoArrangePositions, definitionToFlow, flowToDefinition, nextStateLabel, NODE_KINDS } from './flowModel';
import type { WorkflowFlowNode, WorkflowFlowEdge, NodeKind } from './flowModel';

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
  const [gates, setGates] = useState<Array<{ id: string; label: string }>>([]);
  const [knownTypes, setKnownTypes] = useState<string[]>([]);
  const [terminalStates, setTerminalStates] = useState<string[]>([]);
  const [autoTransitions, setAutoTransitions] = useState<WorkflowAutoTransition[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // ---- data loading -------------------------------------------------------
  useEffect(() => {
    api
      .listWorkflows()
      .then((list) => setKnownTypes([...new Set(list.map((w) => w.entity_type))].sort()))
      .catch(() => {});
  }, []);
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
      const seed = definitionToFlow({ entity_type: 'workorder', version_label: 'draft_v1', states: ['Draft'], transitions: [] });
      setNodes(hydrateNodes(seed.nodes));
      setEdges(hydrateEdges(seed.edges));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  useEffect(() => {
    api.listGates(entityType).then(setGates).catch(() => setGates([]));
  }, [entityType]);

  useEffect(() => {
    api
      .listGateTypes()
      .then((types) => setGateTypes(types))
      .catch(() => setGateTypes([]));
  }, []);

  const [showGateForm, setShowGateForm] = useState(false);
  const [gateTypes, setGateTypes] = useState<Array<{ gate_type: string; name: string; description: string }>>([]);
  const [actionTypes, setActionTypes] = useState<Array<{ type: string; name: string }>>([]);

  useEffect(() => {
    api
      .listActionTypes()
      .then((types) => setActionTypes(types.map((t) => ({ type: t.type, name: t.name }))))
      .catch(() => setActionTypes([]));
  }, []);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 3500);
  };

  // ---- react flow state ----------------------------------------------------
  const onNodesChange = useCallback(
    (changes: NodeChange<WorkflowFlowNode>[]) => setNodes((nds) => applyNodeChanges(changes, nds) as WorkflowFlowNode[]),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<WorkflowFlowEdge>[]) => setEdges((eds) => applyEdgeChanges(changes, eds) as WorkflowFlowEdge[]),
    []
  );

  const withEdgeCallbacks = (edge: WorkflowFlowEdge): WorkflowFlowEdge => ({
    ...edge,
    data: {
      event: edge.data?.event ?? 'EVENT',
      gates: edge.data?.gates ?? [],
      choices: edge.data?.choices,
      on_after: edge.data?.on_after,
      onRenameEvent: handleRenameEvent,
    },
  });

  const hydrateNodes = (nds: WorkflowFlowNode[]): WorkflowFlowNode[] =>
    nds.map((n) => ({
      ...n,
      data: { ...n.data, kind: n.data.kind || 'state', onRename: handleRenameState, onDelete: handleDeleteNode },
    }));

  const hydrateEdges = (eds: WorkflowFlowEdge[]): WorkflowFlowEdge[] => eds.map(withEdgeCallbacks);

  const handleConnect = useCallback((connection: Connection) => {
    setEdges((eds) => {
      const newEdge = withEdgeCallbacks({
        id: `${connection.source}|${connection.target}|${Math.random().toString(36).slice(2, 8)}`,
        type: 'event',
        source: connection.source as string,
        target: connection.target as string,
        data: { event: 'EVENT', gates: [] },
      });
      return addEdge(newEdge, eds) as WorkflowFlowEdge[];
    });
    setDirty(true);
    setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData('application/reactflow') as NodeKind;
      if (!NODE_KINDS.some((k) => k.kind === kind)) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setNodes((nds) => {
        const label = nextStateLabel(nds, kind);
        const node: WorkflowFlowNode = {
          id: label,
          type: 'state',
          position: { x: position.x - 75, y: position.y - 25 },
          data: { label, kind, onRename: handleRenameState, onDelete: handleDeleteNode },
        };
        return [...nds, node];
      });
      setDirty(true);
      setNotice(null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [screenToFlowPosition]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // must come before use in withEdgeCallbacks/closures referenced above? JS hoists function declarations.
  // ---- mutations -------------------------------------------------------------
  async function handleRenameState(oldLabel: string, newLabel: string) {
    setNodes((nds) =>
      nds.map((n) => (n.id === oldLabel ? { ...n, id: newLabel, data: { ...n.data, label: newLabel } } : n))
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        source: e.source === oldLabel ? newLabel : e.source,
        target: e.target === oldLabel ? newLabel : e.target,
      }))
    );
    setSelection((sel) => (sel?.kind === 'node' && sel.id === oldLabel ? { kind: 'node', id: newLabel } : sel));
    setDirty(true);
  }

  async function handleRenameEvent(edgeId: string, event: string) {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId
          ? {
              ...e,
              data: {
                event,
                gates: e.data?.gates ?? [],
                choices: e.data?.choices,
                on_after: e.data?.on_after,
                onRenameEvent: handleRenameEvent,
              },
            }
          : e
      )
    );
    setDirty(true);
  }

  function handleDeleteNode(id: string) {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelection((sel) => (sel?.id === id ? null : sel));
    setDirty(true);
  }

  function handleDeleteEdge(edgeId: string) {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    setSelection(null);
    setDirty(true);
  }

  function handleSetEdgeGates(edgeId: string, gatesList: string[]) {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId
          ? {
              ...e,
              data: {
                event: e.data?.event ?? 'EVENT',
                gates: gatesList,
                choices: e.data?.choices,
                on_after: e.data?.on_after,
                onRenameEvent: handleRenameEvent,
              },
            }
          : e
      )
    );
    setDirty(true);
  }

  function handleSetEdgeChoices(edgeId: string, choices: any[]) {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId
          ? {
              ...e,
              data: {
                event: e.data?.event ?? 'EVENT',
                gates: e.data?.gates ?? [],
                choices,
                on_after: e.data?.on_after,
                onRenameEvent: handleRenameEvent,
              },
            }
          : e
      )
    );
    setDirty(true);
  }

  function handleSetEdgeOnAfter(edgeId: string, on_after: WorkflowAction[]) {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId
          ? {
              ...e,
              data: {
                event: e.data?.event ?? 'EVENT',
                gates: e.data?.gates ?? [],
                choices: e.data?.choices,
                on_after,
                onRenameEvent: handleRenameEvent,
              },
            }
          : e
      )
    );
    setDirty(true);
  }

  function handleOnNodesDelete(nodesDeleted: WorkflowFlowNode[]) {
    const ids = new Set(nodesDeleted.map((n) => n.id));
    setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    setSelection(null);
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
      flash('err', err.message);
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
  const selectedNode = selection?.kind === 'node' ? nodes.find((n) => n.id === selection.id) : null;
  const selectedEdge = selection?.kind === 'edge' ? edges.find((e) => e.id === selection.id) : null;

  const statusColor: Record<Workflow['status'], string> = {
    draft: 'bg-amber-100 text-amber-700 border-amber-200',
    published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    deprecated: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" /> Workflows
        </button>

        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusColor[status]}`}>
          {status}
        </span>

        {dirty && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600">
            <Pencil className="h-3 w-3" /> Unsaved changes
          </span>
        )}

        <div className="mx-2 h-6 w-px bg-gray-200" />

        <input
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value.trim().toLowerCase());
            setDirty(true);
          }}
          placeholder="entity_type"
          list="known-entity-types"
          className="w-48 rounded-md border border-gray-300 px-2 py-1.5 font-mono text-sm text-gray-700"
          title="Entity type this workflow applies to (lowercase, e.g. workorder)"
        />
        <datalist id="known-entity-types">
          {knownTypes.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <input
          value={versionLabel}
          onChange={(e) => setVersionLabel(e.target.value)}
          placeholder="version_label"
          className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700"
          title="Version label"
        />

        <div className="ml-auto flex items-center gap-2">
          {notice && (
            <span
              className={`flex items-center gap-1 text-xs ${notice.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}
            >
              {notice.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {notice.text}
            </span>
          )}

          <button
            onClick={handleAutoArrange}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <span className="flex items-center gap-1.5">
              <LayoutGrid className="h-4 w-4" /> Auto Arrange
            </span>
          </button>

          <button
            onClick={handleValidate}
            disabled={saving}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Validate
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Draft
          </button>

          <button
            onClick={handlePublish}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Rocket className="h-4 w-4" /> Publish
          </button>

          {id && (
            <button
              onClick={handleDeleteWorkflow}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Workspace */}
      <div className="flex min-h-0 flex-1">
        {/* Palette */}
        <div className="w-56 shrink-0 border-r border-gray-200 bg-gray-50">
          <NodePalette />
        </div>

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
            onEdgeClick={(_, edge) => setSelection({ kind: 'edge', id: edge.id })}
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
            Drag a node to add · Drag between handles to connect · Backspace to delete
          </div>
        </div>

        {/* Inspector */}
        <div className="w-72 shrink-0 border-l border-gray-200 bg-white">
          {selectedNode && (
              <div className="flex flex-col gap-3 p-4">
                <h3 className="text-sm font-bold text-gray-800">Node Inspector</h3>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Node type</label>
                  <select
                    value={selectedNode.data.kind || 'state'}
                    onChange={(e) => handleSetNodeKind(selectedNode.id, e.target.value as NodeKind)}
                    className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
                  >
                    {NODE_KINDS.map((k) => (
                      <option key={k.kind} value={k.kind}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">State name</label>
                  <StateNameEditor key={selectedNode.id} value={selectedNode.data.label} onCommit={(v) => handleRenameState(selectedNode.id, v)} />
                </div>
                <button
                  onClick={() => handleDeleteNode(selectedNode.id)}
                  className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" /> Delete node
                </button>
              </div>
            )}

            {selectedEdge && (
              <div className="flex flex-col gap-3 p-4">
                <h3 className="text-sm font-bold text-gray-800">Connection Inspector</h3>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Transition event</label>
                  <EventNameEditor key={selectedEdge.id} value={selectedEdge.data?.event ?? 'EVENT'} onCommit={(v) => handleRenameEvent(selectedEdge.id, v)} />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Gates ({entityType})
                  </label>
                  {gates.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      No gates registered for <span className="font-mono">{entityType}</span> yet.
                    </p>
                  ) : (
                    <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
                      {gates.map((g) => {
                        const checked = (selectedEdge.data?.gates || []).includes(g.id);
                        return (
                          <label key={g.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 px-2 py-1.5 hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const current = selectedEdge.data?.gates || [];
                                const next = e.target.checked
                                  ? [...current, g.id]
                                  : current.filter((x) => x !== g.id);
                                handleSetEdgeGates(selectedEdge.id, next);
                              }}
                              className="mt-0.5 h-3.5 w-3.5 accent-blue-600"
                            />
                            <span className="text-xs text-gray-700">
                              <span className="block font-mono text-[11px] text-blue-700">{g.id}</span>
                              <span className="block text-[11px] text-gray-500">{g.label}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={() => setShowGateForm((s) => !s)}
                    className="mt-1 flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" /> Register a gate for {entityType}
                  </button>

                  {showGateForm && (
                    <GateRegisterForm
                      entityType={entityType}
                      gateTypes={gateTypes}
                      onSaved={() => {
                        setShowGateForm(false);
                        api.listGates(entityType).then(setGates).catch(() => setGates([]));
                      }}
                    />
                  )}
                </div>

                <ChoicesEditor
                  key={`${selectedEdge.id}-choices`}
                  edge={selectedEdge}
                  nodeLabels={nodes.map((n) => n.data.label)}
                  gateOptions={gates.map((g) => g.id)}
                  onChange={(choices) => handleSetEdgeChoices(selectedEdge.id, choices)}
                />

                <OnAfterEditor
                  key={`${selectedEdge.id}-onAfter`}
                  value={selectedEdge.data?.on_after || []}
                  availableTypes={actionTypes.map((a) => a.type)}
                  onChange={(on_after) => handleSetEdgeOnAfter(selectedEdge.id, on_after)}
                />

                <button
                  onClick={() => handleDeleteEdge(selectedEdge.id)}
                  className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" /> Remove connection
                </button>
              </div>
            )}

            {!selectedNode && !selectedEdge && (
              <WorkflowSettingsPanel
                terminalStates={terminalStates}
                autoTransitions={autoTransitions}
                nodeLabels={nodes.map((n) => n.data.label)}
                onTerminalStatesChange={(v) => {
                  setTerminalStates(v);
                  setDirty(true);
                }}
                onAutoTransitionsChange={(v) => {
                  setAutoTransitions(v);
                  setDirty(true);
                }}
              />
            )}
          </div>
      </div>
    </div>
  );
}

function StateNameEditor({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v.trim() !== value && onCommit(v.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
    />
  );
}

function EventNameEditor({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v.trim() !== value && onCommit(v.trim().toUpperCase())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="rounded-md border border-gray-300 px-2 py-1.5 font-mono text-sm text-gray-800 focus:border-blue-500 focus:outline-none"
    />
  );
}

function GateRegisterForm({
  entityType,
  gateTypes,
  onSaved,
}: {
  entityType: string;
  gateTypes: Array<{ gate_type: string; name: string; description: string }>;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState('');
  const [gateType, setGateType] = useState(gateTypes[0]?.gate_type ?? '');
  const [paramsText, setParamsText] = useState('{}');
  const [paramsErr, setParamsErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedType = gateTypes.find((t) => t.gate_type === gateType);

  const submit = async () => {
    if (!label.trim() || !gateType) return;
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(paramsText || '{}');
    } catch {
      setParamsErr('params must be valid JSON');
      return;
    }
    setSaving(true);
    setErr(null);
    setParamsErr(null);
    try {
      await api.createGate({ entity_type: entityType, gate_type: gateType, label: label.trim(), params });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 rounded-md border border-gray-200 bg-gray-50 p-2">
      {gateTypes.length > 0 && (
        <select
          value={gateType || gateTypes[0].gate_type}
          onChange={(e) => {
            setGateType(e.target.value);
            const t = gateTypes.find((x) => x.gate_type === e.target.value);
            if (t && /attribute_condition|expression_threshold/.test(t.gate_type)) setParamsText('{\n  "field": "",\n  "operator": ""\n}');
            else setParamsText('{}');
          }}
          className="rounded-md border border-gray-300 px-1.5 py-1 text-xs text-gray-700"
        >
          {gateTypes.map((t) => (
            <option key={t.gate_type} value={t.gate_type}>
              {t.name} ({t.gate_type})
            </option>
          ))}
        </select>
      )}
      {selectedType?.description && (
        <p className="text-[11px] leading-snug text-gray-500">{selectedType.description}</p>
      )}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={label || 'gate label e.g. "Approve budget"'}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="rounded-md border border-gray-300 px-1.5 py-1 text-xs text-gray-800 placeholder:text-gray-400"
      />
      <textarea
        value={paramsText}
        onChange={(e) => setParamsText(e.target.value)}
        rows={4}
        spellCheck={false}
        placeholder='JSON params, e.g. {"field":"worktype","operator":"eq","value":"EM"}'
        className="rounded-md border border-gray-300 px-1.5 py-1 font-mono text-[11px] text-gray-700 placeholder:text-gray-400"
      />
      {paramsErr && <p className="text-[11px] text-red-600">{paramsErr}</p>}
      {err && <p className="text-[11px] text-red-600">{err}</p>}
      <button
        onClick={submit}
        disabled={saving || !label.trim() || !gateType}
        className="flex items-center justify-center gap-1 rounded-md bg-blue-700 px-2 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Create gate
      </button>
    </div>
  );
}

function ChoicesEditor({
  edge,
  nodeLabels,
  gateOptions,
  onChange,
}: {
  edge: WorkflowFlowEdge;
  nodeLabels: string[];
  gateOptions: string[];
  onChange: (choices: any[]) => void;
}) {
  const choices = edge.data?.choices || [];
  const [err, setErr] = useState<string | null>(null);

  const commit = (next: any[]) => {
    try {
      onChange(next.map((c) => (c && typeof c === 'object' ? c : JSON.parse(String(c)))));
      setErr(null);
    } catch {
      setErr('Invalid JSON — applied nothing.');
    }
  };

  const updateRow = (i: number, patch: Record<string, unknown>) => {
    const next = choices.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    commit(next);
  };

  return (
    <div className="flex flex-col gap-1 border-t border-gray-100 pt-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Conditional branches (choices)
        </label>
        <button
          onClick={() => commit([...choices, { to: '', when: [] }])}
          className="rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700"
        >
          + branch
        </button>
      </div>
      <p className="text-[11px] leading-snug text-gray-400">
        First branch whose <span className="font-mono">when</span> gates all pass wins. Empty{' '}
        <span className="font-mono">when</span> = unconditional default.
      </p>
      {choices.length === 0 && <p className="text-[11px] text-gray-400">None — plain transition to target.</p>}
      {choices.map((c, i) => {
        const when = (c.when || []).join(', ');
        return (
          <div key={i} className="flex flex-col gap-1 rounded-md border border-gray-200 bg-gray-50 p-2">
            <div className="flex items-center gap-1.5">
              <select
                value={c.to || ''}
                onChange={(e) => updateRow(i, { to: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-1.5 py-1 text-xs text-gray-700"
              >
                <option value="">→ target…</option>
                {nodeLabels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                onClick={() => commit(choices.filter((_, idx) => idx !== i))}
                className="text-red-500 hover:text-red-700"
                title="Remove branch"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              value={when}
              onChange={(e) =>
                updateRow(i, {
                  when: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder={`when: ${gateOptions.slice(0, 3).join(', ')}${gateOptions.length > 3 ? ', …' : ''}`}
              list="choice-gate-ids"
              className="rounded-md border border-gray-300 px-1.5 py-1 font-mono text-[11px] text-gray-700"
            />
            <datalist id="choice-gate-ids">
              {gateOptions.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
        );
      })}
      {err && <p className="text-[11px] text-red-600">{err}</p>}
    </div>
  );
}

function OnAfterEditor({
  value,
  availableTypes,
  onChange,
}: {
  value: WorkflowAction[];
  availableTypes: string[];
  onChange: (on_after: WorkflowAction[]) => void;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);

  const currentRaw = () => {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('must be a JSON array');
      return parsed;
    } catch (e: any) {
      return { error: e.message };
    }
  };

  const apply = () => {
    const parsed = currentRaw();
    if ('error' in parsed) {
      setErr(parsed.error);
      return;
    }
    onChange(parsed);
    setErr(null);
  };

  return (
    <div className="flex flex-col gap-1 border-t border-gray-100 pt-2">
      <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
        Side effects on arrival (on_after)
      </label>
      <p className="text-[11px] leading-snug text-gray-400">
        Types: {availableTypes.length ? availableTypes.join(', ') : 'update_related_entity_field, create_related_entity, transition_related_entity'}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        spellCheck={false}
        className="rounded-md border border-gray-300 p-1.5 font-mono text-[11px] text-gray-700 focus:border-blue-500 focus:outline-none"
      />
      <button
        onClick={apply}
        className="self-start rounded border border-dashed border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700"
      >
        Apply
      </button>
      {err && <p className="text-[11px] text-red-600">{err}</p>}
    </div>
  );
}

function WorkflowSettingsPanel({
  terminalStates,
  autoTransitions,
  nodeLabels,
  onTerminalStatesChange,
  onAutoTransitionsChange,
}: {
  terminalStates: string[];
  autoTransitions: WorkflowAutoTransition[];
  nodeLabels: string[];
  onTerminalStatesChange: (v: string[]) => void;
  onAutoTransitionsChange: (v: WorkflowAutoTransition[]) => void;
}) {
  const [autoText, setAutoText] = useState(JSON.stringify(autoTransitions, null, 2));
  const [err, setErr] = useState<string | null>(null);

  const applyAuto = () => {
    try {
      const parsed = JSON.parse(autoText);
      if (!Array.isArray(parsed)) throw new Error('must be a JSON array');
      onAutoTransitionsChange(parsed);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-bold text-gray-800">Workflow Settings</h3>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Terminal states</label>
        <input
          value={terminalStates.join(', ')}
          onChange={(e) =>
            onTerminalStatesChange(
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          placeholder={nodeLabels.slice(0, 4).join(', ') || 'e.g. CLOSED, CANCELED'}
          className="rounded-md border border-gray-300 px-2 py-1.5 font-mono text-sm text-gray-700"
        />
        <p className="text-[11px] leading-snug text-gray-400">
          Terminal states cannot advance; the UI stops offering transitions there.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Automatic conditional routing (auto_transitions)
        </label>
        <p className="text-[11px] leading-snug text-gray-400">
          Fired automatically after any transition as the <span className="font-mono">system:workflow-engine</span> actor.
        </p>
        <textarea
          value={autoText}
          onChange={(e) => setAutoText(e.target.value)}
          rows={6}
          spellCheck={false}
          className="rounded-md border border-gray-300 p-1.5 font-mono text-[11px] text-gray-700 focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={applyAuto}
          className="self-start rounded border border-dashed border-gray-300 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700"
        >
          Apply
        </button>
        {err && <p className="text-[11px] text-red-600">{err}</p>}
      </div>
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