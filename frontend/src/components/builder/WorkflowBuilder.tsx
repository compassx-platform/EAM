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
import { ArrowLeft, CheckCircle2, Pencil, Rocket, Save, Trash2, Loader2, AlertTriangle, Plus } from 'lucide-react';
import { api } from '../../api/client';
import type { Workflow } from '../../types';
import StateNode from './StateNode';
import EventEdge from './EventEdge';
import { NodePalette } from './NodePalette';
import { definitionToFlow, flowToDefinition, nextStateLabel, NODE_KINDS } from './flowModel';
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
  const { screenToFlowPosition } = useReactFlow();

  const [id, setId] = useState<string | null>(workflowId);
  const [entityType, setEntityType] = useState('workorder');
  const [versionLabel, setVersionLabel] = useState('draft_v1');
  const [status, setStatus] = useState<Workflow['status']>('draft');
  const [nodes, setNodes] = useState<WorkflowFlowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowFlowEdge[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [gates, setGates] = useState<Array<{ id: string; label: string }>>([]);
  const [knownTypes, setKnownTypes] = useState<string[]>([]);
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
        e.id === edgeId ? { ...e, data: { event, gates: e.data?.gates ?? [], onRenameEvent: handleRenameEvent } } : e
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
        e.id === edgeId ? { ...e, data: { event: e.data?.event ?? 'EVENT', gates: gatesList, onRenameEvent: handleRenameEvent } } : e
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

  // ---- persistence ---------------------------------------------------------
  const buildDefinition = () => flowToDefinition(nodes, edges, entityType, versionLabel);

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
        {(selectedNode || selectedEdge) && (
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

                <button
                  onClick={() => handleDeleteEdge(selectedEdge.id)}
                  className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" /> Remove connection
                </button>
              </div>
            )}
          </div>
        )}
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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!label.trim() || !gateType) return;
    setSaving(true);
    setErr(null);
    try {
      await api.createGate({ entity_type: entityType, gate_type: gateType, label: label.trim() });
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
          onChange={(e) => setGateType(e.target.value)}
          className="rounded-md border border-gray-300 px-1.5 py-1 text-xs text-gray-700"
        >
          {gateTypes.map((t) => (
            <option key={t.gate_type} value={t.gate_type}>
              {t.name} ({t.gate_type})
            </option>
          ))}
        </select>
      )}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={label || 'gate label e.g. "Approve budget"'}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="rounded-md border border-gray-300 px-1.5 py-1 text-xs text-gray-800 placeholder:text-gray-400"
      />
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