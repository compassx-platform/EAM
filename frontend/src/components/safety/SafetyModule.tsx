import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../../api/client';
import type { Hazard, Precaution, SafetyPlan, TagOut } from '../../types';

type Tab = 'hazards' | 'precautions' | 'tagouts' | 'plans';

export function SafetyModule() {
  const [tab, setTab] = useState<Tab>('plans');
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [precautions, setPrecautions] = useState<Precaution[]>([]);
  const [tagouts, setTagouts] = useState<TagOut[]>([]);
  const [plans, setPlans] = useState<SafetyPlan[]>([]);
  const [error, setError] = useState('');

  const reload = async () => {
    try {
      const [h, p, t, s] = await Promise.all([
        api.listHazards(),
        api.listPrecautions(),
        api.listTagOuts(),
        api.listSafetyPlans(),
      ]);
      setHazards(h);
      setPrecautions(p);
      setTagouts(t);
      setPlans(s);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load safety records');
    }
  };

  useEffect(() => {
    reload();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Safety</h1>
          <p className="text-xs text-gray-500">Hazards, precautions, tag outs, and the plans copied onto a record.</p>
        </div>
      </div>
      <div className="flex gap-1 border-b border-gray-100 px-5">
        {(['plans', 'hazards', 'precautions', 'tagouts'] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`border-b-2 px-3 py-2 text-xs font-medium capitalize ${tab === item ? 'border-[#0B5CAD] text-[#0B5CAD]' : 'border-transparent text-gray-500'}`}
          >
            {item === 'tagouts' ? 'Tag outs' : item}
          </button>
        ))}
      </div>
      {error && <p className="px-5 py-2 text-xs text-red-600">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === 'precautions' && <PrecautionPane rows={precautions} onChanged={reload} />}
        {tab === 'hazards' && <HazardPane rows={hazards} precautions={precautions} onChanged={reload} />}
        {tab === 'tagouts' && <TagOutPane rows={tagouts} hazards={hazards} onChanged={reload} />}
        {tab === 'plans' && <PlanPane rows={plans} hazards={hazards} tagouts={tagouts} onChanged={reload} />}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
      {label}
      {children}
    </label>
  );
}

const inputCls = 'rounded-md border border-gray-300 px-2 py-1.5 text-xs font-normal text-gray-900';

function PrecautionPane({ rows, onChanged }: { rows: Precaution[]; onChanged: () => void }) {
  const [precautionId, setPrecautionId] = useState('');
  const [description, setDescription] = useState('');
  const save = async () => {
    await api.createPrecaution({ precaution_id: precautionId, description });
    setPrecautionId('');
    setDescription('');
    onChanged();
  };
  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Precaution id"><input className={inputCls} value={precautionId} onChange={(e) => setPrecautionId(e.target.value)} required /></Field>
        <Field label="Description"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} required /></Field>
        <button type="submit" className="rounded-md bg-[#0B5CAD] px-3 py-1.5 text-xs font-medium text-white">Add precaution</button>
      </form>
      <RecordList rows={rows.map((row) => ({ id: row.precaution_id, title: row.precaution_id, detail: row.description }))} />
    </div>
  );
}

function HazardPane({ rows, precautions, onChanged }: { rows: Hazard[]; precautions: Precaution[]; onChanged: () => void }) {
  const [hazardId, setHazardId] = useState('');
  const [description, setDescription] = useState('');
  const [material, setMaterial] = useState(false);
  const [precautionId, setPrecautionId] = useState('');
  const save = async () => {
    await api.createHazard({
      hazard_id: hazardId,
      description,
      is_hazardous_material: material,
      precaution_ids: precautionId ? [precautionId] : [],
    });
    setHazardId('');
    setDescription('');
    setMaterial(false);
    onChanged();
  };
  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Hazard id"><input className={inputCls} value={hazardId} onChange={(e) => setHazardId(e.target.value)} required /></Field>
        <Field label="Description"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} required /></Field>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={material} onChange={(e) => setMaterial(e.target.checked)} />
          Hazardous material
        </label>
        <Field label="Precaution">
          <select className={inputCls} value={precautionId} onChange={(e) => setPrecautionId(e.target.value)}>
            <option value="">None</option>
            {precautions.map((row) => <option key={row.precaution_id} value={row.precaution_id}>{row.precaution_id}</option>)}
          </select>
        </Field>
        <button type="submit" className="rounded-md bg-[#0B5CAD] px-3 py-1.5 text-xs font-medium text-white">Add hazard</button>
      </form>
      <RecordList rows={rows.map((row) => ({
        id: row.hazard_id,
        title: row.hazard_id,
        detail: `${row.description}${row.is_hazardous_material ? ' · material' : ''}${row.precaution_ids.length ? ` · ${row.precaution_ids.join(', ')}` : ''}`,
      }))} />
    </div>
  );
}

function TagOutPane({ rows, hazards, onChanged }: { rows: TagOut[]; hazards: Hazard[]; onChanged: () => void }) {
  const [tagoutId, setTagoutId] = useState('');
  const [hazardId, setHazardId] = useState('');
  const [description, setDescription] = useState('');
  const [device, setDevice] = useState('');
  const save = async () => {
    await api.createTagOut({ tagout_id: tagoutId, hazard_id: hazardId, description, device });
    setTagoutId('');
    setDescription('');
    setDevice('');
    onChanged();
  };
  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Tag out id"><input className={inputCls} value={tagoutId} onChange={(e) => setTagoutId(e.target.value)} required /></Field>
        <Field label="Hazard">
          <select className={inputCls} value={hazardId} onChange={(e) => setHazardId(e.target.value)} required>
            <option value="">Select</option>
            {hazards.map((row) => <option key={row.hazard_id} value={row.hazard_id}>{row.hazard_id}</option>)}
          </select>
        </Field>
        <Field label="Description"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} required /></Field>
        <Field label="Device"><input className={inputCls} value={device} onChange={(e) => setDevice(e.target.value)} /></Field>
        <button type="submit" className="rounded-md bg-[#0B5CAD] px-3 py-1.5 text-xs font-medium text-white">Add tag out</button>
      </form>
      <RecordList rows={rows.map((row) => ({ id: row.tagout_id, title: row.tagout_id, detail: `${row.description} · ${row.hazard_id}` }))} />
    </div>
  );
}

function PlanPane({
  rows,
  hazards,
  tagouts,
  onChanged,
}: {
  rows: SafetyPlan[];
  hazards: Hazard[];
  tagouts: TagOut[];
  onChanged: () => void;
}) {
  const [planId, setPlanId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [description, setDescription] = useState('');
  const [pdf, setPdf] = useState<File | null>(null);
  const [hazardId, setHazardId] = useState('');
  const [tagoutId, setTagoutId] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const save = async () => {
    setBusy(true);
    setLocalError('');
    try {
      const created = await api.createSafetyPlan({
        safety_plan_id: planId,
        site_id: siteId,
        description,
        hazards: hazardId ? [{ hazard_id: hazardId }] : [],
        tagouts: tagoutId ? [{ tagout_id: tagoutId }] : [],
      });
      if (pdf) await api.uploadSafetyPlanPdf(created.safety_plan_id, pdf);
      setPlanId('');
      setDescription('');
      setPdf(null);
      onChanged();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not save the safety plan');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Plan id"><input className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)} required /></Field>
        <Field label="Site id"><input className={inputCls} value={siteId} onChange={(e) => setSiteId(e.target.value)} required /></Field>
        <Field label="Description"><input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} required /></Field>
        <Field label="PDF">
          <input
            className={inputCls}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setPdf(e.target.files?.[0] || null)}
          />
        </Field>
        <Field label="Hazard">
          <select className={inputCls} value={hazardId} onChange={(e) => setHazardId(e.target.value)}>
            <option value="">None yet</option>
            {hazards.map((row) => <option key={row.hazard_id} value={row.hazard_id}>{row.hazard_id}</option>)}
          </select>
        </Field>
        <Field label="Tag out">
          <select className={inputCls} value={tagoutId} onChange={(e) => setTagoutId(e.target.value)}>
            <option value="">None yet</option>
            {tagouts.map((row) => <option key={row.tagout_id} value={row.tagout_id}>{row.tagout_id}</option>)}
          </select>
        </Field>
        {localError && <p className="text-xs text-red-600">{localError}</p>}
        <button type="submit" disabled={busy} className="rounded-md bg-[#0B5CAD] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
          {busy ? 'Saving…' : 'Add safety plan'}
        </button>
      </form>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {rows.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">Nothing saved yet.</li>}
        {rows.map((row) => (
          <li key={row.safety_plan_id} className="flex flex-col gap-2 px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-gray-900">{row.safety_plan_id} · {row.site_id}</p>
              <p className="text-xs text-gray-500">{row.description} · {row.hazards.length} hazards</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {row.document_id ? (
                <a
                  className="text-xs font-medium text-[#0B5CAD] hover:underline"
                  href={`/api/documents/${row.document_id}/download`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.document_file_name || 'Open PDF'}
                </a>
              ) : (
                <span className="text-xs text-gray-400">No PDF attached</span>
              )}
              <label className="cursor-pointer text-xs font-medium text-gray-700">
                {row.document_id ? 'Replace PDF' : 'Attach PDF'}
                <input
                  className="sr-only"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      await api.uploadSafetyPlanPdf(row.safety_plan_id, file);
                      onChanged();
                    } catch (err) {
                      setLocalError(err instanceof Error ? err.message : 'Could not attach the PDF');
                    }
                  }}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecordList({ rows }: { rows: Array<{ id: string; title: string; detail: string }> }) {
  if (rows.length === 0) return <p className="text-xs text-gray-400">Nothing saved yet.</p>;
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
      {rows.map((row) => (
        <li key={row.id} className="px-3 py-2">
          <p className="text-xs font-semibold text-gray-900">{row.title}</p>
          <p className="text-xs text-gray-500">{row.detail}</p>
        </li>
      ))}
    </ul>
  );
}
