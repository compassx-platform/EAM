import { useState, useEffect, useMemo } from 'react';
import {
  AlarmClock,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Info,
  Layers,
  Play,
  Plus,
  Save,
  Trash2,
  X,
  Zap,
  History,
  Shield,
  SlidersHorizontal,
  PenLine,
  ListFilter,
} from 'lucide-react';
import type { Escalation, EscalationPoint, EscalationAction, EntityTypeDefinition, EntityField, Workflow } from '../../types';
import { api } from '../../api/client';

interface EscalationEditorProps {
  escalation: Escalation | null;
  entityTypes: EntityTypeDefinition[];
  onBack: () => void;
  onSave: (esc: Partial<Escalation>) => Promise<void>;
  onRun?: (id: string) => Promise<void>;
  onViewLogs?: (id: string) => void;
}

export function EscalationEditor({
  escalation,
  entityTypes,
  onBack,
  onSave,
  onRun,
  onViewLogs,
}: EscalationEditorProps) {
  const isEdit = escalation !== null;

  const [id, setId] = useState(escalation?.id || '');
  const [name, setName] = useState(escalation?.name || '');
  const [description, setDescription] = useState(escalation?.description || '');
  const [entityType, setEntityType] = useState(escalation?.entity_type || '*');
  const [appliesTo, setAppliesTo] = useState<'entity' | 'task_assignment'>(escalation?.applies_to || 'entity');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(escalation?.status || 'ACTIVE');
  const [scheduleCron, setScheduleCron] = useState(escalation?.schedule_cron || '*/5 * * * *');
  const [conditionSql, setConditionSql] = useState(escalation?.condition_sql || '');
  const [availableFields, setAvailableFields] = useState<EntityField[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [customDateMode, setCustomDateMode] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (entityType && entityType !== '*') {
      api.listFields(entityType).then(setAvailableFields).catch(() => setAvailableFields([]));
      api.listWorkflows(entityType).then(setWorkflows).catch(() => setWorkflows([]));
    } else {
      setAvailableFields([]);
      setWorkflows([]);
    }
  }, [entityType]);

  const entityDateFields = useMemo(() => {
    if (!entityType || entityType === '*') return [];
    return availableFields
      .filter((f) => f.field_type === 'date' || f.field_type === 'datetime')
      .map((f) => ({
        value: f.field_name,
        label: `${f.label || f.field_name} (${f.field_name})`,
      }));
  }, [availableFields, entityType]);

  const systemDateFields = useMemo(() => [
    { value: 'created_at', label: 'created_at (Created Timestamp)' },
    { value: 'updated_at', label: 'updated_at (Last Update Timestamp)' },
  ], []);

  const entityLifecycleStatuses = useMemo(() => {
    if (!entityType || entityType === '*') return [];
    const currentEntityDef = entityTypes.find((et) => et.name === entityType);
    return currentEntityDef?.statuses || [];
  }, [entityType, entityTypes]);

  const workflowStages = useMemo(() => {
    if (!entityType || entityType === '*') return [];
    const stages = new Set<string>();
    for (const wf of workflows) {
      if (wf.definition?.states) {
        wf.definition.states.forEach((s) => stages.add(s));
      }
      if (wf.definition?.nodes) {
        wf.definition.nodes.forEach((n) => {
          if (n.name) stages.add(n.name);
        });
      }
    }
    return Array.from(stages);
  }, [workflows, entityType]);

  const workflowEvents = useMemo(() => {
    const events = new Set<string>();
    if (entityType && entityType !== '*') {
      for (const wf of workflows) {
        if (wf.definition?.transitions) {
          wf.definition.transitions.forEach((t) => {
            if (t.event && !['TRUE', 'FALSE'].includes(t.event)) {
              events.add(t.event);
            }
          });
        }
      }
    }
    ['EXPIRE', 'CLOSE', 'CANCEL', 'ESCALATE', 'APPROVE', 'REJECT'].forEach((e) => events.add(e));
    return Array.from(events);
  }, [workflows, entityType]);

  const standardLifecycleStatuses = useMemo(() => [
    { id: 'DRAFT', label: 'Draft' },
    { id: 'SUBMITTED', label: 'Submitted' },
    { id: 'APPROVED', label: 'Approved' },
    { id: 'ACTIVE', label: 'Active' },
    { id: 'IN_PROGRESS', label: 'In Progress' },
    { id: 'COMPLETED', label: 'Completed' },
    { id: 'CLOSED', label: 'Closed' },
    { id: 'CANCELLED', label: 'Cancelled' },
    { id: 'EXPIRED', label: 'Expired' },
  ], []);
  const [points, setPoints] = useState<EscalationPoint[]>(
    escalation?.points?.length
      ? escalation.points
      : [
          {
            id: 'point_1',
            elapsed_hours: 0,
            reference_date_field: 'created_at',
            filter_status: ['APPROVED', 'ACTIVE'],
            actions: [
              {
                action_type: 'TRANSITION_WORKFLOW',
                event: 'EXPIRE',
                actor_id: 'system:escalation-engine',
              },
            ],
          },
        ]
  );

  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit && name && !id) {
      setId(name.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, ''));
    }
  }, [name, id, isEdit]);

  const handleAddPoint = () => {
    const defaultDate = entityDateFields[0]?.value || 'created_at';
    const newPt: EscalationPoint = {
      id: `point_${points.length + 1}`,
      elapsed_hours: 0,
      reference_date_field: defaultDate,
      filter_status: ['APPROVED', 'ACTIVE'],
      actions: [
        {
          action_type: 'TRANSITION_WORKFLOW',
          event: 'EXPIRE',
        },
      ],
    };
    setPoints([...points, newPt]);
  };

  const handleRemovePoint = (idx: number) => {
    setPoints(points.filter((_, i) => i !== idx));
  };

  const handleUpdatePoint = (idx: number, patch: Partial<EscalationPoint>) => {
    const updated = [...points];
    updated[idx] = { ...updated[idx], ...patch };
    setPoints(updated);
  };

  const handleAddAction = (pointIdx: number) => {
    const pt = points[pointIdx];
    const newAction: EscalationAction = {
      action_type: 'SEND_NOTIFICATION',
      title: 'Escalation Alert',
      message: 'Record SLA threshold reached.',
    };
    handleUpdatePoint(pointIdx, { actions: [...(pt.actions || []), newAction] });
  };

  const handleRemoveAction = (pointIdx: number, actionIdx: number) => {
    const pt = points[pointIdx];
    const actions = (pt.actions || []).filter((_, i) => i !== actionIdx);
    handleUpdatePoint(pointIdx, { actions });
  };

  const handleUpdateAction = (pointIdx: number, actionIdx: number, patch: Partial<EscalationAction>) => {
    const pt = points[pointIdx];
    const actions = [...(pt.actions || [])];
    actions[actionIdx] = { ...actions[actionIdx], ...patch };
    handleUpdatePoint(pointIdx, { actions });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide an escalation name.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave({
        id: id.trim() || undefined,
        name: name.trim(),
        description: description.trim(),
        entity_type: entityType.trim(),
        applies_to: appliesTo,
        status,
        schedule_cron: scheduleCron.trim() || '*/5 * * * *',
        condition_sql: conditionSql.trim() || null,
        points,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to save escalation');
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    if (!escalation?.id || !onRun) return;
    setRunning(true);
    try {
      await onRun(escalation.id);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col min-h-0 bg-slate-50/50">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-gray-500" />
            <span>Back</span>
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight text-gray-900">
              {isEdit ? `Edit Escalation: ${escalation.name}` : 'New Escalation Definition'}
            </h1>
            {escalation?.is_system && (
              <span className="inline-flex items-center gap-0.5 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-gray-600">
                <Shield className="h-2.5 w-2.5" />
                System
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isEdit && onViewLogs && (
            <button
              type="button"
              onClick={() => onViewLogs(escalation.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
            >
              <History className="h-3.5 w-3.5 text-gray-500" />
              <span>Logs</span>
            </button>
          )}
          {isEdit && onRun && (
            <button
              type="button"
              onClick={handleRunNow}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
            >
              <Play className={`h-3.5 w-3.5 text-blue-600 ${running ? 'animate-spin' : ''}`} />
              <span>Run Now</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? 'Saving…' : 'Save Escalation'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Editor Body */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Section 1: General Definition */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">1. General Configuration</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-700">
                  Escalation Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Work Order Auto-Expiry Watchdog"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-700">
                  Escalation ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isEdit}
                  value={id}
                  onChange={(e) => setId(e.target.value.toUpperCase().replace(/[^A-Z0-9_]+/g, '_'))}
                  placeholder="e.g. WO_AUTO_EXPIRY"
                  className={`rounded-lg border px-3 py-1.5 font-mono text-xs ${
                    isEdit ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:outline-none'
                  }`}
                />
              </div>

              <div className="sm:col-span-2 flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-700">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain what this escalation monitors and what actions it executes..."
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-700">Target Entity Type</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                >
                  <option value="*">All Entity Types (*)</option>
                  {entityTypes.map((et) => (
                    <option key={et.name} value={et.name}>
                      {et.display_name || et.name} ({et.name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-700">Applies To</label>
                <select
                  value={appliesTo}
                  onChange={(e) => setAppliesTo(e.target.value as 'entity' | 'task_assignment')}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                >
                  <option value="entity">Business Entity (Work Order, Permit, etc.)</option>
                  <option value="task_assignment">Task Assignment / Workflow Task</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-700">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                >
                  <option value="ACTIVE">ACTIVE (Running in Background)</option>
                  <option value="INACTIVE">INACTIVE (Paused)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1 text-xs font-semibold text-gray-700">
                  Schedule (Cron Expression)
                  <span className="group relative">
                    <Info className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                    <span className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-60 rounded bg-slate-900 p-2 text-[11px] text-white shadow-lg group-hover:block">
                      Standard 5-part cron syntax (e.g. */5 * * * * for every 5 mins).
                    </span>
                  </span>
                </label>
                <input
                  type="text"
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  placeholder="*/5 * * * *"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-mono text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Escalation Points */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">2. Escalation Points & Actions</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Define reference date offsets and triggered workflow/status/notification actions.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddPoint}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Escalation Point</span>
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {points.map((pt, pIdx) => (
                <div key={pIdx} className="rounded-xl border border-gray-200 bg-slate-50/60 p-4">
                  <div className="flex items-center justify-between border-b border-gray-200/80 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                        {pIdx + 1}
                      </span>
                      <span className="text-xs font-bold text-gray-800">Point #{pIdx + 1}</span>
                    </div>
                    {points.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePoint(pIdx)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove Point
                      </button>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {/* Reference Date Field */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-gray-700">Reference Date Field</label>
                        <button
                          type="button"
                          onClick={() =>
                            setCustomDateMode((prev) => ({ ...prev, [pIdx]: !prev[pIdx] }))
                          }
                          className="text-[10px] text-blue-600 hover:underline"
                        >
                          {customDateMode[pIdx] ? 'Pick from list' : 'Custom text'}
                        </button>
                      </div>

                      {customDateMode[pIdx] ? (
                        <input
                          type="text"
                          value={pt.reference_date_field || ''}
                          onChange={(e) => handleUpdatePoint(pIdx, { reference_date_field: e.target.value.trim() })}
                          placeholder="e.g. valid_until, permit_expiry, created_at"
                          className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
                        />
                      ) : (
                        <select
                          value={
                            pt.reference_date_field ||
                            (entityDateFields.length > 0 ? entityDateFields[0].value : 'created_at')
                          }
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setCustomDateMode((prev) => ({ ...prev, [pIdx]: true }));
                            } else {
                              handleUpdatePoint(pIdx, { reference_date_field: e.target.value });
                            }
                          }}
                          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                        >
                          {entityType !== '*' && entityDateFields.length > 0 && (
                            <optgroup label={`${entityType.toUpperCase()} Date Fields`}>
                              {entityDateFields.map((df) => (
                                <option key={df.value} value={df.value}>
                                  {df.label}
                                </option>
                              ))}
                            </optgroup>
                          )}

                          {entityType !== '*' && entityDateFields.length === 0 && (
                            <optgroup label={`${entityType.toUpperCase()} Date Fields`}>
                              <option value="" disabled>
                                (No date fields configured for {entityType})
                              </option>
                            </optgroup>
                          )}

                          <optgroup label="System Timestamps">
                            {systemDateFields.map((sf) => (
                              <option key={sf.value} value={sf.value}>
                                {sf.label}
                              </option>
                            ))}
                          </optgroup>

                          {pt.reference_date_field &&
                            !entityDateFields.some((df) => df.value === pt.reference_date_field) &&
                            !systemDateFields.some((sf) => sf.value === pt.reference_date_field) && (
                              <optgroup label="Configured Field">
                                <option value={pt.reference_date_field}>
                                  {pt.reference_date_field}
                                </option>
                              </optgroup>
                            )}

                          <option value="__custom__">Custom / Type manually…</option>
                        </select>
                      )}
                      <span className="text-[10px] text-gray-400">
                        Date field to compare against current time.
                      </span>
                    </div>

                    {/* Elapsed Hours Offset */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-gray-700">Elapsed Hours Offset</label>
                      <input
                        type="number"
                        step="0.1"
                        value={pt.elapsed_hours ?? 0}
                        onChange={(e) => handleUpdatePoint(pIdx, { elapsed_hours: parseFloat(e.target.value) || 0 })}
                        className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
                      />
                      <span className="text-[10px] text-gray-400">
                        0 = exact expiry, -2 = 2h before, +4 = 4h after.
                      </span>
                    </div>

                    {/* Filter Statuses */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-gray-700">Filter Statuses</label>
                      
                      {/* Selected Status Badges */}
                      <div className="flex flex-wrap gap-1 min-h-[22px] mb-1">
                        {(Array.isArray(pt.filter_status) ? pt.filter_status : []).map((stId) => (
                          <span
                            key={stId}
                            className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-800 shadow-2xs"
                          >
                            <span>{stId}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Array.isArray(pt.filter_status) ? pt.filter_status : [];
                                handleUpdatePoint(pIdx, { filter_status: cur.filter((s) => s !== stId) });
                              }}
                              className="rounded text-blue-400 hover:bg-blue-100 hover:text-blue-800"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>

                      {/* Dropdown to add status */}
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          const val = e.target.value;
                          const cur = Array.isArray(pt.filter_status) ? pt.filter_status : [];
                          if (!cur.includes(val)) {
                            handleUpdatePoint(pIdx, { filter_status: [...cur, val] });
                          }
                        }}
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 shadow-2xs focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">+ Add status / stage from dropdown…</option>

                        {entityType !== '*' && entityLifecycleStatuses.length > 0 && (
                          <optgroup label={`${entityType.toUpperCase()} Lifecycle Statuses`}>
                            {entityLifecycleStatuses.map((st) => (
                              <option key={st.id} value={st.id} disabled={(pt.filter_status || []).includes(st.id)}>
                                {st.id} ({st.label})
                              </option>
                            ))}
                          </optgroup>
                        )}

                        {entityType !== '*' && workflowStages.length > 0 && (
                          <optgroup label={`${entityType.toUpperCase()} Workflow Stages`}>
                            {workflowStages.map((stage) => (
                              <option key={stage} value={stage} disabled={(pt.filter_status || []).includes(stage)}>
                                {stage}
                              </option>
                            ))}
                          </optgroup>
                        )}

                        {entityType !== '*' && entityLifecycleStatuses.length === 0 && workflowStages.length === 0 && (
                          <optgroup label={`${entityType.toUpperCase()} Statuses`}>
                            <option value="" disabled>
                              (No lifecycle statuses or workflow stages defined for {entityType})
                            </option>
                          </optgroup>
                        )}

                        {entityType === '*' && (
                          <optgroup label="Standard Lifecycle Statuses">
                            {standardLifecycleStatuses.map((st) => (
                              <option key={st.id} value={st.id} disabled={(pt.filter_status || []).includes(st.id)}>
                                {st.id} ({st.label})
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>

                      {/* Free-text input */}
                      <input
                        type="text"
                        value={Array.isArray(pt.filter_status) ? pt.filter_status.join(', ') : ''}
                        onChange={(e) =>
                          handleUpdatePoint(pIdx, {
                            filter_status: e.target.value
                              .split(',')
                              .map((s) => s.trim().toUpperCase())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Or comma-separated: APPROVED, ACTIVE..."
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-mono text-gray-800 placeholder:text-gray-400 shadow-2xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Actions sub-section */}
                  <div className="mt-4 border-t border-gray-200/80 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                        Actions for Point #{pIdx + 1} ({pt.actions?.length || 0})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddAction(pIdx)}
                        className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add Action</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(pt.actions || []).map((action, aIdx) => (
                        <div
                          key={aIdx}
                          className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex flex-wrap items-center gap-2 flex-1">
                            <select
                              value={action.action_type || 'TRANSITION_WORKFLOW'}
                              onChange={(e) =>
                                handleUpdateAction(pIdx, aIdx, {
                                  action_type: e.target.value as any,
                                })
                              }
                              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-800 focus:border-blue-500 focus:outline-none"
                            >
                              <option value="TRANSITION_WORKFLOW">Trigger Workflow Event</option>
                              <option value="CHANGE_STATUS">Set Entity Status</option>
                              <option value="SEND_NOTIFICATION">Send In-App Notification</option>
                              <option value="REASSIGN_TASK">Reassign Task Role</option>
                              <option value="UPDATE_FIELD">Update Field Value</option>
                            </select>

                            {action.action_type === 'TRANSITION_WORKFLOW' && (
                              <div className="flex items-center gap-1">
                                <select
                                  value={workflowEvents.includes(action.event || '') ? action.event : '__custom__'}
                                  onChange={(e) => {
                                    if (e.target.value !== '__custom__') {
                                      handleUpdateAction(pIdx, aIdx, { event: e.target.value });
                                    }
                                  }}
                                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-mono text-gray-800"
                                >
                                  {entityType !== '*' && (
                                    <optgroup label={`${entityType.toUpperCase()} Events`}>
                                      {workflowEvents.map((evt) => (
                                        <option key={evt} value={evt}>
                                          Event: {evt}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}

                                  {entityType === '*' && (
                                    <optgroup label="Standard Events">
                                      {workflowEvents.map((evt) => (
                                        <option key={evt} value={evt}>
                                          Event: {evt}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}

                                  <option value="__custom__">Custom event name…</option>
                                </select>
                                <input
                                  type="text"
                                  value={action.event || ''}
                                  onChange={(e) =>
                                    handleUpdateAction(pIdx, aIdx, { event: e.target.value.toUpperCase() })
                                  }
                                  placeholder="Event"
                                  className="w-28 rounded border border-gray-200 bg-white px-2 py-1 font-mono text-xs uppercase"
                                />
                              </div>
                            )}

                            {action.action_type === 'CHANGE_STATUS' && (
                              <div className="flex items-center gap-1">
                                <select
                                  value={
                                    entityLifecycleStatuses.some((s) => s.id === action.target_status) ||
                                    workflowStages.includes(action.target_status || '') ||
                                    (entityType === '*' && standardLifecycleStatuses.some((s) => s.id === action.target_status))
                                      ? action.target_status
                                      : '__custom__'
                                  }
                                  onChange={(e) => {
                                    if (e.target.value !== '__custom__') {
                                      handleUpdateAction(pIdx, aIdx, { target_status: e.target.value });
                                    }
                                  }}
                                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800"
                                >
                                  <option value="">Select Status…</option>

                                  {entityType !== '*' && entityLifecycleStatuses.length > 0 && (
                                    <optgroup label={`${entityType.toUpperCase()} Lifecycle Statuses`}>
                                      {entityLifecycleStatuses.map((st) => (
                                        <option key={st.id} value={st.id}>
                                          {st.id} ({st.label})
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}

                                  {entityType !== '*' && workflowStages.length > 0 && (
                                    <optgroup label={`${entityType.toUpperCase()} Workflow Stages`}>
                                      {workflowStages.map((stage) => (
                                        <option key={stage} value={stage}>
                                          {stage}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}

                                  {entityType === '*' && (
                                    <optgroup label="Standard Lifecycle Statuses">
                                      {standardLifecycleStatuses.map((st) => (
                                        <option key={st.id} value={st.id}>
                                          {st.id} ({st.label})
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}

                                  <option value="__custom__">Custom status…</option>
                                </select>
                                <input
                                  type="text"
                                  value={action.target_status || ''}
                                  onChange={(e) =>
                                    handleUpdateAction(pIdx, aIdx, { target_status: e.target.value.toUpperCase() })
                                  }
                                  placeholder="Status code"
                                  className="w-28 rounded border border-gray-200 bg-white px-2 py-1 font-mono text-xs uppercase"
                                />
                              </div>
                            )}

                            {action.action_type === 'SEND_NOTIFICATION' && (
                              <>
                                <input
                                  type="text"
                                  value={action.title || ''}
                                  onChange={(e) => handleUpdateAction(pIdx, aIdx, { title: e.target.value })}
                                  placeholder="Notification Title"
                                  className="w-40 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                                />
                                <input
                                  type="text"
                                  value={action.message || ''}
                                  onChange={(e) => handleUpdateAction(pIdx, aIdx, { message: e.target.value })}
                                  placeholder="Message text..."
                                  className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                                />
                              </>
                            )}

                            {action.action_type === 'REASSIGN_TASK' && (
                              <input
                                type="text"
                                value={action.target_role_id || ''}
                                onChange={(e) => handleUpdateAction(pIdx, aIdx, { target_role_id: e.target.value })}
                                placeholder="Target Role ID"
                                className="w-40 rounded border border-gray-200 bg-white px-2 py-1 font-mono text-xs"
                              />
                            )}

                            {action.action_type === 'UPDATE_FIELD' && (
                              <>
                                <input
                                  type="text"
                                  value={action.field_name || ''}
                                  onChange={(e) => handleUpdateAction(pIdx, aIdx, { field_name: e.target.value })}
                                  placeholder="Field Name"
                                  className="w-32 rounded border border-gray-200 bg-white px-2 py-1 font-mono text-xs"
                                />
                                <input
                                  type="text"
                                  value={String(action.field_value ?? '')}
                                  onChange={(e) => handleUpdateAction(pIdx, aIdx, { field_value: e.target.value })}
                                  placeholder="Value"
                                  className="w-32 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                                />
                              </>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveAction(pIdx, aIdx)}
                            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
