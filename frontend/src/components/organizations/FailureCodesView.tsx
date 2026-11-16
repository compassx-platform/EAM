import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { FailureNode, Organization } from '../../types';

export const FailureCodesView: React.FC = () => {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState('');
  const [nodes, setNodes] = useState<FailureNode[]>([]);
  const [classId, setClassId] = useState('');
  const [problemId, setProblemId] = useState('');
  const [causeId, setCauseId] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async (org: string) => {
    const rows = await api.listFailureNodes(org);
    setNodes(rows);
  };

  useEffect(() => {
    api.listOrganizations().then((rows) => {
      setOrgs(rows);
      if (rows[0]) setOrgId(rows[0].org_id);
    }).catch((err) => setError(err instanceof Error ? err.message : 'Organizations could not be loaded.'));
  }, []);

  useEffect(() => {
    if (!orgId) return;
    setClassId('');
    setProblemId('');
    setCauseId('');
    load(orgId).catch((err) => setError(err instanceof Error ? err.message : 'The failure list could not be loaded.'));
  }, [orgId]);

  const classes = nodes.filter((node) => node.node_type === 'class');
  const problems = nodes.filter((node) => node.node_type === 'problem' && node.parent_id === classId);
  const causes = nodes.filter((node) => node.node_type === 'cause' && node.parent_id === problemId);
  const remedies = nodes.filter((node) => node.node_type === 'remedy' && node.parent_id === causeId);
  const selected = nodes.find((node) => node.id === (causeId || problemId || classId));

  const add = async (nodeType: FailureNode['node_type'], parentId?: string) => {
    setError(null);
    try {
      await api.createFailureNode({
        org_id: orgId,
        code: code.trim(),
        description: description.trim(),
        node_type: nodeType,
        parent_id: parentId,
      });
      setCode('');
      setDescription('');
      await load(orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The failure code could not be added.');
    }
  };

  const remove = async (node: FailureNode) => {
    setError(null);
    try {
      await api.deleteFailureNode(node.id);
      if (node.id === classId) setClassId('');
      if (node.id === problemId) setProblemId('');
      if (node.id === causeId) setCauseId('');
      await load(orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The failure code could not be removed.');
    }
  };

  const rename = async () => {
    if (!selected) return;
    setError(null);
    try {
      await api.updateFailureCode(orgId, selected.code, description.trim() || selected.description);
      setDescription('');
      await load(orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The description could not be saved.');
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Failure codes</h1>
          <p className="text-xs text-gray-500">A shared list for the organization. Equipment class does not set this.</p>
        </div>
        <label className="text-xs text-gray-600">
          Organization
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="ml-2 h-8 rounded-lg border border-gray-200 px-2 text-xs">
            {orgs.map((org) => <option key={org.org_id} value={org.org_id}>{org.org_id}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-3">
        <Column title="Class" nodes={classes} selectedId={classId} onSelect={(id) => { setClassId(id); setProblemId(''); setCauseId(''); }} onAdd={() => add('class')} onRemove={remove} code={code} description={description} setCode={setCode} setDescription={setDescription} />
        <Column title="Problem" nodes={problems} selectedId={problemId} disabled={!classId} onSelect={(id) => { setProblemId(id); setCauseId(''); }} onAdd={() => add('problem', classId)} onRemove={remove} code={code} description={description} setCode={setCode} setDescription={setDescription} />
        <Column title="Cause" nodes={causes} selectedId={causeId} disabled={!problemId} onSelect={setCauseId} onAdd={() => add('cause', problemId)} onRemove={remove} code={code} description={description} setCode={setCode} setDescription={setDescription} />
        <Column title="Remedy" nodes={remedies} selectedId="" disabled={!causeId} onSelect={() => undefined} onAdd={() => add('remedy', causeId)} onRemove={remove} code={code} description={description} setCode={setCode} setDescription={setDescription} />
      </div>
      {selected && (
        <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
          <span className="text-xs text-gray-500">Description for {selected.code} is shared everywhere that code is used.</span>
          <button type="button" onClick={rename} className="rounded-lg border border-gray-200 px-2 py-1 text-xs">Save description</button>
        </div>
      )}
    </div>
  );
};

function Column({
  title, nodes, selectedId, disabled, onSelect, onAdd, onRemove, code, description, setCode, setDescription,
}: {
  title: string;
  nodes: FailureNode[];
  selectedId: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (node: FailureNode) => void;
  code: string;
  description: string;
  setCode: (value: string) => void;
  setDescription: (value: string) => void;
}) {
  return (
    <section className={`flex min-h-0 flex-col rounded-xl border border-gray-200 ${disabled ? 'opacity-50' : ''}`}>
      <h2 className="border-b border-gray-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      <ul className="min-h-0 flex-1 overflow-auto">
        {nodes.map((node) => (
          <li key={node.id} className={`flex items-center justify-between gap-2 px-3 py-2 text-xs ${selectedId === node.id ? 'bg-gray-50' : ''}`}>
            <button type="button" onClick={() => onSelect(node.id)} className="min-w-0 text-left">
              <span className="font-mono font-semibold">{node.code}</span>
              <span className="ml-2 text-gray-600">{node.description}</span>
            </button>
            <button type="button" onClick={() => onRemove(node)} className="text-gray-400 hover:text-red-700">Remove</button>
          </li>
        ))}
      </ul>
      <div className="space-y-1 border-t border-gray-100 p-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Code" disabled={disabled} className="h-7 w-full rounded border border-gray-200 px-2 font-mono text-[11px]" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" disabled={disabled} className="h-7 w-full rounded border border-gray-200 px-2 text-[11px]" />
        <button type="button" disabled={disabled} onClick={onAdd} className="h-7 w-full rounded bg-gray-900 text-[11px] font-semibold text-white disabled:bg-gray-300">Add {title.toLowerCase()}</button>
      </div>
    </section>
  );
}
