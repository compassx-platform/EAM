import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Columns3,
  FileText,
  History,
  Calendar,
  Layers,
  Loader2,
  Lock,
  MinusCircle,
  PenTool,
  PlayCircle,
  Plus,
  Rocket,
  Save,
  ShieldCheck,
  Tag,
  Wrench,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { navigate } from '../../lib/router';
import type { EntityTypeDefinition, EntityTypeVersion, EntityField, EntityFieldInput } from '../../types';

const ICONS: Array<{ key: string; label: string; Icon: typeof Layers }> = [
  { key: 'ClipboardList', label: 'Work / Task', Icon: ClipboardList },
  { key: 'ShieldCheck', label: 'Safety / Permit', Icon: ShieldCheck },
  { key: 'FileText', label: 'Document / Form', Icon: FileText },
  { key: 'Wrench', label: 'Maintenance', Icon: Wrench },
  { key: 'Tag', label: 'Category', Icon: Tag },
  { key: 'Layers', label: 'Generic', Icon: Layers },
];

const FIELD_TYPES: Array<{ value: EntityFieldInput['field_type']; label: string; hint: string }> = [
  { value: 'text', label: 'Text', hint: 'Single-line text value' },
  { value: 'long_text', label: 'Long text', hint: 'Multi-line notes or description' },
  { value: 'email', label: 'Email', hint: 'Validated email address' },
  { value: 'phone', label: 'Phone', hint: 'Telephone number' },
  { value: 'url', label: 'URL', hint: 'Web address / hyperlink' },
  { value: 'number', label: 'Number', hint: 'Numeric value (comparisons in conditions)' },
  { value: 'date', label: 'Date', hint: 'Calendar date value' },
  { value: 'datetime', label: 'Date & time', hint: 'Timestamp with date and time' },
  { value: 'time', label: 'Time', hint: 'Time of day value' },
  { value: 'boolean', label: 'Yes / No', hint: 'Binary yes/no value' },
  { value: 'select', label: 'Select', hint: 'Pick one from options / published list (renders as dropdown)' },
  { value: 'selection', label: 'Radio choices', hint: 'Pick one from options shown as radio cards' },
  { value: 'checkbox_group', label: 'Checkbox group', hint: 'Pick multiple from options' },
  { value: 'entity_reference', label: 'Link to Entity', hint: 'Reference another entity type record' },
  { value: 'table', label: 'Table grid', hint: 'Dynamic multi-column row table (widget)' },
  { value: 'checklist', label: 'Checklist', hint: 'Operational checklist from a published Central List' },
  { value: 'file', label: 'Attachment', hint: 'Document or media upload (widget)' },
];

interface DesignerRow {
  localId: string;
  field_name: string;
  label: string;
  field_type: EntityFieldInput['field_type'];
  required: boolean;
  pinned: boolean;
  blockers?: string[];
}

const RESERVED = new Set([
  'id', 'entity_type', 'status', 'workflow_version', 'workflow_states',
  'version_label', 'last_event_id', 'created_at', 'updated_at', '_workflow_status',
]);

interface StepHeaderProps {
  step: number;
  icon: typeof Layers;
  title: string;
  desc: string;
}

function StepHeader({ step, icon: Icon, title, desc }: StepHeaderProps) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-blue-700 shadow-2xs">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-gray-400">Step {step} of 3</span>
        </div>
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        <p className="mt-0.5 text-xs text-gray-500">{desc}</p>
      </div>
    </div>
  );
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Sanitizes input on-the-fly while typing (keeps trailing underscore so user can type on the go). */
function fieldSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
}

/** Trims leading and trailing underscores for storage, validation, and API submission. */
function cleanFieldSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

function humanize(name: string): string {
  return name.split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function rowToInput(r: DesignerRow): EntityFieldInput {
  const cleanName = cleanFieldSlug(r.field_name);
  return {
    field_name: cleanName,
    field_type: r.field_type,
    label: (r.label || '').trim() || humanize(cleanName),
    required: r.required,
  };
}

function fieldChanged(existing: EntityField, inp: EntityFieldInput): boolean {
  return (
    existing.field_type !== inp.field_type ||
    Boolean(existing.required) !== Boolean(inp.required) ||
    (existing.label ?? '') !== (inp.label ?? '')
  );
}

function fieldFromRegistry(f: EntityField): DesignerRow {
  const isPinned = f.field_name === 'title' || f.field_name === 'description';
  return {
    localId: f.field_name,
    field_name: f.field_name,
    label: f.label || humanize(f.field_name),
    field_type: f.field_type,
    required: f.required,
    pinned: isPinned,
    blockers: f.blockers || [],
  };
}

function baselineRows(): DesignerRow[] {
  return [
    {
      localId: 'title',
      field_name: 'title',
      label: 'Title',
      field_type: 'text',
      required: true,
      pinned: true,
      blockers: [],
    },
    {
      localId: 'description',
      field_name: 'description',
      label: 'Description',
      field_type: 'text',
      required: false,
      pinned: true,
      blockers: [],
    },
  ];
}

interface EntityDesignerProps {
  entityName: string | null;
}

export function EntityDesigner({ entityName }: EntityDesignerProps) {
  const isEdit = entityName !== null;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<EntityTypeDefinition | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // ---- metadata ----
  const [displayName, setDisplayName] = useState('');
  const [name, setName] = useState(isEdit ? entityName : '');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('Layers');
  const [autoSlug, setAutoSlug] = useState(!isEdit);

  // ---- fields ----
  const [rows, setRows] = useState<DesignerRow[]>(baselineRows);
  const [originalFields, setOriginalFields] = useState<EntityField[]>([]);
  const [versionLabel, setVersionLabel] = useState('v1');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<EntityTypeVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const [knownTypes, setKnownTypes] = useState<EntityTypeDefinition[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 3500);
  }, []);

  const handleOpenHistory = async () => {
    if (!entityName) return;
    setHistoryOpen(true);
    setLoadingVersions(true);
    try {
      const list = await api.getEntityTypeHistory(entityName);
      setVersions(list);
    } catch {
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleRestoreSchemaSnapshot = (snap: EntityTypeVersion) => {
    if (snap.display_name) setDisplayName(snap.display_name);
    if (snap.description) setDescription(snap.description);
    if (snap.icon) setIcon(snap.icon);
    if (snap.fields && snap.fields.length > 0) {
      setRows(
        snap.fields.map((f) => ({
          localId: f.field_name,
          field_name: f.field_name,
          label: f.label || humanize(f.field_name),
          field_type: f.field_type,
          required: Boolean(f.required),
          pinned: f.field_name === 'title' || f.field_name === 'description',
          blockers: [],
        }))
      );
    }
    setHistoryOpen(false);
    flash('ok', `Restored schema snapshot from ${snap.version_label}`);
  };

  useEffect(() => {
    if (!autoSlug && isEdit) return;
    if (autoSlug && !isEdit) setName(slugify(displayName));
  }, [displayName, autoSlug, isEdit]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const types = await api.listEntityTypes().catch(() => []);
        if (!alive) return;
        setKnownTypes(types);

        if (isEdit && entityName) {
          const [et, fields] = await Promise.all([
            api.getEntityType(entityName),
            api.listFields(entityName),
          ]);
          if (!alive) return;
          setDisplayName(et.display_name);
          setName(et.name);
          setDescription(et.description || '');
          setIcon(et.icon || 'Layers');
          setVersionLabel(et.version_label || (et.version_number ? `v${et.version_number}` : 'v1'));
          setOriginalFields(fields);
          setRows(fields.length > 0 ? fields.map(fieldFromRegistry) : baselineRows());
        }
      } catch (e: any) {
        if (alive) flash('err', `Failed loading: ${e.message}`);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [isEdit, entityName, flash]);

  const fieldNames = useMemo(() => new Set(rows.map((r) => r.field_name).filter(Boolean)), [rows]);

  const patchRow = (localId: string, patch: Partial<DesignerRow>) => {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    const base = 'field';
    let idx = 1;
    let candidate = base;
    while (fieldNames.has(candidate)) {
      idx += 1;
      candidate = `${base}${idx}`;
    }
    setRows((prev) => [
      ...prev,
      {
        localId: `local-${Date.now()}`,
        field_name: candidate,
        label: humanize(candidate),
        field_type: 'text',
        required: false,
        pinned: false,
        blockers: [],
      },
    ]);
  };

  const removeRow = (localId: string) => {
    const target = rows.find((r) => r.localId === localId);
    if (!target || target.pinned || (target.blockers && target.blockers.length > 0)) return;
    setRows((prev) => prev.filter((r) => r.localId !== localId));
  };

  // ---- validation ----
  const metadataError = useMemo(() => {
    if (!displayName.trim()) return 'Enter a display name.';
    const slug = (isEdit ? name : (autoSlug ? slugify(displayName) : cleanFieldSlug(name))).trim();
    if (slug.length < 2) return 'Identifier must be at least 2 characters.';
    return null;
  }, [displayName, name, isEdit, autoSlug]);

  const validateFields = useCallback(() => {
    const errors: Record<string, string> = {};
    const seen = new Set<string>();
    for (const r of rows) {
      const key = cleanFieldSlug(r.field_name);
      if (key.length < 2 || !/^[a-z][a-z0-9_]*$/.test(key)) {
        errors[r.localId] = 'Field name is invalid — must start with a letter and contain only lowercase letters, numbers and underscores.';
        continue;
      }
      if (RESERVED.has(key)) {
        errors[r.localId] = `"${key}" is reserved by the platform.`;
        continue;
      }
      if (seen.has(key)) {
        errors[r.localId] = 'Duplicate field name.';
        continue;
      }
      seen.add(key);
    }
    setRowErrors(errors);
    return Object.keys(errors).length === 0;
  }, [rows]);

  const validateStep = (s: 1 | 2 | 3): boolean => {
    if (s === 1) {
      if (metadataError) {
        flash('err', metadataError);
        return false;
      }
      return true;
    }
    if (s === 2) return validateFields();
    return true;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((s) => (s === 1 ? 2 : 3) as 1 | 2 | 3);
  };

  const back = () => {
    if (step === 1) {
      navigate('/entities');
      return;
    }
    setStep((s) => (s === 3 ? 2 : 1) as 1 | 2 | 3);
  };

  // ---- save ----
  const handleSave = async () => {
    if (step >= 2 && !validateFields()) {
      setStep(2);
      flash('err', 'Fix the highlighted field errors before saving.');
      return;
    }
    if (metadataError) {
      setStep(1);
      flash('err', metadataError);
      return;
    }
    setSaving(true);
    try {
      const fieldInputs = rows.map(rowToInput);
      if (isEdit && entityName) {
        await api.updateEntityType(entityName, {
          display_name: displayName.trim(),
          description: description.trim(),
          icon,
        });
        const original = [...originalFields];
        for (const inp of fieldInputs) {
          const existing = original.find((f) => f.field_name === inp.field_name);
          if (!existing || fieldChanged(existing, inp)) {
            await api.saveField({ ...inp, entity_type: entityName });
          }
        }
        for (const f of original) {
          if (!fieldInputs.some((inp) => inp.field_name === f.field_name)) {
            await api.deleteField(entityName, f.field_name);
          }
        }
        const updated = await api.getEntityType(entityName);
        setCreated(updated);
        if (updated.version_label) setVersionLabel(updated.version_label);
        else if (updated.version_number) setVersionLabel(`v${updated.version_number}`);
        flash('ok', `Entity "${displayName}" updated.`);
      } else {
        const createdEntity = await api.createEntityType({
          name: (autoSlug ? slugify(displayName) : cleanFieldSlug(name)).toLowerCase(),
          display_name: displayName.trim(),
          description: description.trim(),
          icon,
          fields: fieldInputs,
        });
        setCreated(createdEntity);
        if (createdEntity.version_label) setVersionLabel(createdEntity.version_label);
        else if (createdEntity.version_number) setVersionLabel(`v${createdEntity.version_number}`);
        flash('ok', `Entity "${createdEntity.display_name}" created.`);
      }
    } catch (e: any) {
      flash('err', `Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin text-blue-700" />
          <span className="text-xs">Loading entity…</span>
        </div>
      </div>
    );
  }

  const effectiveName = isEdit ? name : (autoSlug ? slugify(displayName) : cleanFieldSlug(name));

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden bg-white">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
        <button
          type="button"
          onClick={() => navigate('/entities')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-gray-500" />
          <span>Entities</span>
        </button>
        <div className="mx-1 h-5 w-px bg-gray-200" />
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">Entity Designer</h1>
            <p className="text-[11px] leading-tight text-gray-500">
              {isEdit ? `Editing ${displayName || name}` : 'New entity type'}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 font-mono text-[10px] font-bold text-gray-600">
            {effectiveName || 'unnamed'}
          </span>
          <span
            title="Auto-assigned entity schema version"
            className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-700 border border-gray-200"
          >
            {versionLabel}
          </span>
          {isEdit && (
            <button
              type="button"
              onClick={handleOpenHistory}
              title="View entity schema version history"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <History className="h-3.5 w-3.5 text-gray-400" />
              <span>History</span>
            </button>
          )}
          {notice && (
            <span
              className={`flex items-center gap-1 text-xs font-medium ${notice.kind === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}
            >
              {notice.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {notice.text}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isEdit ? <Save className="h-3.5 w-3.5" /> : <Rocket className="h-3.5 w-3.5" />}
            <span>{isEdit ? 'Save Changes' : 'Save & Create'}</span>
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex shrink-0 items-center gap-1 border-b border-gray-100 bg-gray-50/60 px-6 py-2.5">
        {[
          { n: 1, label: 'Entity' },
          { n: 2, label: 'Fields' },
          { n: 3, label: 'Review' },
        ].map((s, idx) => (
          <div key={s.n} className="flex items-center">
            {idx > 0 && <ChevronRight className="mx-1 h-3.5 w-3.5 text-gray-300" />}
            <button
              type="button"
              onClick={() => (s.n < step ? setStep(s.n as 1 | 2 | 3) : undefined)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                step === s.n ? 'bg-white text-gray-900 shadow-2xs border border-gray-200' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                  step > s.n ? 'bg-emerald-100 text-emerald-700' : step === s.n ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {step > s.n ? <CheckCircle2 className="h-3 w-3" /> : s.n}
              </span>
              {s.label}
            </button>
          </div>
        ))}
        <div className="ml-auto text-[11px] text-gray-400">{rows.length} field{rows.length === 1 ? '' : 's'} defined</div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-6">
        {created ? (
          <SuccessPanel entity={created} isEdit={isEdit} />
        ) : step === 1 ? (
          <Step1
            displayName={displayName}
            onDisplayName={setDisplayName}
            name={name}
            onName={setName}
            autoSlug={autoSlug}
            onAutoSlug={setAutoSlug}
            description={description}
            onDescription={setDescription}
            icon={icon}
            onIcon={setIcon}
            isEdit={isEdit}
          />
        ) : step === 2 ? (
          <Step2
            rows={rows}
            onPatch={patchRow}
            onAdd={addRow}
            onRemove={removeRow}
            knownTypes={knownTypes}
            errors={rowErrors}
            currentType={isEdit ? entityName : (autoSlug ? slugify(displayName) : slugify(name)) || undefined}
          />
        ) : (
          <Step3
            displayName={displayName}
            name={effectiveName}
            description={description}
            icon={icon}
            rows={rows}
            isEdit={isEdit}
          />
        )}
      </div>

      {/* Footer */}
      {!created && (
        <div className="flex h-14 shrink-0 items-center justify-between border-t border-gray-200 bg-white px-6">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition-colors"
            >
              Continue
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-400">Fields, forms, and workflows reference the same schema.</span>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isEdit ? <Save className="h-3.5 w-3.5" /> : <Rocket className="h-3.5 w-3.5" />}
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save & Create'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Entity Version History Modal */}
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
                  Schema History · <span className="font-mono text-gray-600">{entityName}</span>
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
              {loadingVersions ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="ml-2 text-xs">Loading schema history…</span>
                </div>
              ) : versions.length === 0 ? (
                <p className="py-8 text-center text-xs text-gray-400">No previous schema versions found.</p>
              ) : (
                <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                  {versions.map((snap) => {
                    const isCurrent = snap.version_label === versionLabel;
                    const fieldCount = snap.fields?.length ?? 0;

                    return (
                      <div
                        key={snap.id}
                        className={`flex items-center justify-between p-3.5 transition-colors ${
                          isCurrent ? 'bg-blue-50/40' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-gray-900">{snap.version_label}</span>
                            <span className="text-xs font-medium text-gray-700">{snap.display_name}</span>
                            {isCurrent && (
                              <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-gray-500">
                            <span>{fieldCount} field{fieldCount === 1 ? '' : 's'}</span>
                            {snap.description && <span>· {snap.description}</span>}
                            {snap.created_at && (
                              <>
                                <span>·</span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3 text-gray-400" />
                                  Saved {new Date(snap.created_at).toLocaleDateString()}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleRestoreSchemaSnapshot(snap)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-2xs hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                          >
                            <span>Restore</span>
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
    </div>
  );
}

// ---------------------------------------------------------------------------

function Step1(p: {
  displayName: string;
  onDisplayName: (v: string) => void;
  name: string;
  onName: (v: string) => void;
  autoSlug: boolean;
  onAutoSlug: (v: boolean) => void;
  description: string;
  onDescription: (v: string) => void;
  icon: string;
  onIcon: (v: string) => void;
  isEdit: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <StepHeader step={1} icon={Layers} title="Define the entity" desc="This is the Maximo-equivalent of a business object — the record type forms and workflows will operate on." />

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-700">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={p.displayName}
              onChange={(e) => p.onDisplayName(e.target.value)}
              placeholder="e.g. Work Order, Incident Report, Asset"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-[10px] text-gray-400">Human-readable name shown across navigation, dropdowns, and records.</span>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-gray-700">
                System Identifier (Slug) <span className="text-red-500">*</span>
              </label>
              {!p.isEdit && (
                <button type="button" onClick={() => p.onAutoSlug(!p.autoSlug)} className="text-[10px] text-blue-600 hover:underline">
                  {p.autoSlug ? 'Edit manually' : 'Auto-generate'}
                </button>
              )}
            </div>
            <input
              type="text"
              disabled={p.isEdit || p.autoSlug}
              value={p.name}
              onChange={(e) => p.onName(fieldSlug(e.target.value))}
              placeholder="e.g. workorder"
              className={`w-full rounded-lg border px-3 py-2 font-mono text-xs ${
                p.isEdit || p.autoSlug
                  ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                  : 'border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
              }`}
            />
            <span className="text-[10px] text-gray-400">
              Unique identifier used in APIs, workflows, and condition rules — lowercase, alphanumeric with underscores.
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-700">Description</label>
            <textarea
              rows={2}
              value={p.description}
              onChange={(e) => p.onDescription(e.target.value)}
              placeholder="Brief explanation of this entity and its lifecycle purposes…"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-gray-700">Entity Icon</label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {ICONS.map((it) => {
                const Icon = it.Icon;
                const isSel = p.icon === it.key;
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => p.onIcon(it.key)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left transition-all ${
                      isSel ? 'border-blue-500 bg-blue-50/80 text-blue-700 font-semibold shadow-2xs' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isSel ? 'text-blue-700' : 'text-gray-400'}`} />
                    <span className="truncate text-[10px]">{it.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step2(p: {
  rows: DesignerRow[];
  onPatch: (id: string, patch: Partial<DesignerRow>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  knownTypes: EntityTypeDefinition[];
  errors: Record<string, string>;
  currentType?: string;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <StepHeader step={2} icon={Columns3} title="Define fields" desc="These become the field registry — forms, workflow conditions, and the runtime console all reference this schema." />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xs">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              <th className="w-44 px-3 py-2">Field name</th>
              <th className="w-48 px-3 py-2">Label</th>
              <th className="w-40 px-3 py-2">Type</th>
              <th className="w-14 px-3 py-2 text-center">Req</th>
              <th className="w-20 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {p.rows.map((r) => (
              <FieldRow
                key={r.localId}
                row={r}
                error={p.errors[r.localId]}
                onPatch={(patch) => p.onPatch(r.localId, patch)}
                onRemove={() => p.onRemove(r.localId)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={p.onAdd}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 bg-gray-50/40 px-4 py-2.5 text-xs font-semibold text-gray-600 hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add field
      </button>
    </div>
  );
}

function FieldRow(p: {
  row: DesignerRow;
  error?: string;
  onPatch: (patch: Partial<DesignerRow>) => void;
  onRemove: () => void;
}) {
  const r = p.row;
  const isBlocked = Boolean(r.blockers && r.blockers.length > 0);
  const blockerTooltip = isBlocked
    ? `Cannot delete: referenced by ${r.blockers?.join(', ')}`
    : undefined;

  return (
    <>
      <tr className={`align-top ${p.error ? 'bg-red-50/40' : 'hover:bg-gray-50/50'}`}>
        {/* Field name */}
        <td className="px-3 py-2 align-middle">
          <input
            type="text"
            value={r.field_name}
            disabled={r.pinned || isBlocked}
            onChange={(e) => {
              const slug = fieldSlug(e.target.value);
              p.onPatch({
                field_name: slug,
                label: String(r.label || '').trim() === '' || r.label === humanize(r.field_name) ? humanize(slug) : r.label,
              });
            }}
            placeholder="field_name"
            title={r.pinned ? 'Baseline field' : isBlocked ? blockerTooltip : undefined}
            className={`w-full rounded-md border px-2 py-1.5 font-mono text-xs ${
              r.pinned || isBlocked
                ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500'
                : 'border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:outline-none'
            }`}
          />
        </td>

        {/* Label */}
        <td className="px-3 py-2 align-middle">
          <input
            type="text"
            value={r.label}
            onChange={(e) => p.onPatch({ label: e.target.value })}
            placeholder="Human label"
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </td>

        {/* Type */}
        <td className="px-3 py-2 align-middle">
          <select
            value={r.field_type}
            onChange={(e) => p.onPatch({ field_type: e.target.value as DesignerRow['field_type'] })}
            disabled={r.pinned && r.field_name === 'description'}
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </td>

        {/* Required */}
        <td className="px-3 py-2 text-center align-middle">
          <input
            type="checkbox"
            checked={r.required}
            disabled={r.pinned && r.field_name === 'title'}
            onChange={(e) => p.onPatch({ required: e.target.checked })}
            title={r.pinned && r.field_name === 'title' ? 'Title is always required' : 'Required'}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </td>

        {/* Actions */}
        <td className="px-2 py-2 align-middle text-center">
          {r.pinned ? (
            <span title="Baseline field — cannot be removed" className="inline-flex items-center justify-center p-1.5 text-gray-300">
              <Lock className="h-3.5 w-3.5" />
            </span>
          ) : isBlocked ? (
            <div className="relative inline-flex items-center justify-center group/tooltip">
              <button
                type="button"
                disabled
                aria-disabled="true"
                title={blockerTooltip}
                className="rounded-md p-1.5 text-gray-300 cursor-not-allowed"
              >
                <MinusCircle className="h-4 w-4" />
              </button>
              <div className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 z-50 hidden group-hover/tooltip:flex w-max max-w-xs items-center rounded-md bg-gray-900 px-2.5 py-1.5 text-[11px] leading-tight text-white shadow-lg animate-in fade-in zoom-in-95">
                <span>{blockerTooltip}</span>
                <div className="absolute left-full top-1/2 -translate-y-1/2 -ml-1 h-2 w-2 rotate-45 bg-gray-900" />
              </div>
            </div>
          ) : (
            <span className="flex items-center justify-center gap-0.5">
              <button
                type="button"
                onClick={p.onRemove}
                title="Remove field"
                className="rounded-md p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <MinusCircle className="h-4 w-4" />
              </button>
            </span>
          )}
        </td>
      </tr>
      {p.error && (
        <tr className="bg-red-50/40">
          <td colSpan={5} className="px-4 py-1.5 text-[11px] font-medium text-red-700">
            {p.error}
          </td>
        </tr>
      )}
    </>
  );
}

function Step3(p: {
  displayName: string;
  name: string;
  description: string;
  icon: string;
  rows: DesignerRow[];
  isEdit: boolean;
}) {
  const Icon = ICONS.find((i) => i.key === p.icon)?.Icon || Layers;
  const requiredCount = p.rows.filter((r) => r.required).length;
  return (
    <div className="mx-auto max-w-3xl">
      <StepHeader step={3} icon={CheckCircle2} title="Review & create" desc="Confirm the entity schema, then save. You can keep refining fields, forms, and workflows afterwards." />

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 shadow-2xs">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">{p.displayName || 'Unnamed entity'}</h3>
              <span className="font-mono text-[11px] text-gray-400">{p.name}</span>
              {p.description && <p className="mt-1 max-w-md text-xs text-gray-500">{p.description}</p>}
            </div>
          </div>
          <span
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
              p.isEdit ? 'border-blue-100 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-600'
            }`}
          >
            {p.isEdit ? 'Custom' : 'New'}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3">
          <div className="rounded-lg bg-gray-50/80 p-2 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Fields</span>
            <span className="block font-mono text-xs font-bold text-gray-800">{p.rows.length}</span>
          </div>
          <div className="rounded-lg bg-gray-50/80 p-2 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Required</span>
            <span className="block font-mono text-xs font-bold text-gray-800">{requiredCount}</span>
          </div>
          <div className="rounded-lg bg-gray-50/80 p-2 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Form</span>
            <span className="block font-mono text-xs font-bold text-gray-800">Auto</span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              <th className="px-4 py-2">Field</th>
              <th className="px-4 py-2">Label</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2 text-right">Required</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.localId} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2 font-mono text-gray-700">{r.field_name}</td>
                <td className="px-4 py-2 text-gray-700">{r.label || humanize(r.field_name)}</td>
                <td className="px-4 py-2 text-gray-500">
                  {FIELD_TYPES.find((t) => t.value === r.field_type)?.label}
                </td>
                <td className="px-4 py-2 text-right">
                  {r.required ? <span className="font-semibold text-gray-700">Yes</span> : <span className="text-gray-400">No</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SuccessPanel({ entity, isEdit }: { entity: EntityTypeDefinition; isEdit: boolean }) {
  const handleBuildWorkflow = async () => {
    try {
      const wfs = await api.listWorkflows(entity.name);
      if (wfs && wfs.length > 0) {
        const target = wfs.find((w) => w.status === 'published') || wfs[0];
        navigate(`/workflows/${target.id}`);
      } else {
        navigate('/workflows/new', { type: entity.name });
      }
    } catch {
      navigate('/workflows/new', { type: entity.name });
    }
  };

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h2 className="text-base font-bold text-gray-900">{isEdit ? 'Entity updated' : 'Entity created'}</h2>
      <p className="mt-1 text-xs text-gray-500">
        <span className="font-mono font-semibold text-gray-700">{entity.name}</span> is ready. Fields are registered, so you can move to the next step.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => navigate('/entities')}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs"
        >
          Back to Entities
        </button>
        <button
          type="button"
          onClick={() => navigate(`/forms/${encodeURIComponent(entity.name)}`)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100/80 transition-colors shadow-2xs"
        >
          <PenTool className="h-3.5 w-3.5 text-blue-700" />
          Form Studio — open {entity.display_name || entity.name} form builder
        </button>
        <button
          type="button"
          onClick={handleBuildWorkflow}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50/70 px-4 py-2 text-xs font-semibold text-purple-800 hover:bg-purple-100/80 transition-colors shadow-2xs"
        >
          <Rocket className="h-3.5 w-3.5 text-purple-700" />
          Build Workflow — open {entity.display_name || entity.name} workflow builder
        </button>
        <button
          type="button"
          onClick={() => navigate('/records', { type: entity.name })}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/80 transition-colors shadow-2xs"
        >
          <PlayCircle className="h-3.5 w-3.5 text-emerald-700" />
          Open Records — view {entity.display_name || entity.name} runtime records
        </button>
      </div>
    </div>
  );
}