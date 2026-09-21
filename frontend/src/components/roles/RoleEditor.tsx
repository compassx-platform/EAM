import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  User,
  UserCheck,
  Users2,
  Database,
  AtSign,
  Shield,
  Sparkles,
  ArrowRight,
  Clock,
  Mail,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../api/client';
import type { WorkflowRole, RoleType, RoleResolutionStrategy, RoleResolutionResult, Person, PersonGroup } from '../../types';
import { navigate } from '../../lib/router';
import { InfoTooltip } from '../people/InfoTooltip';

interface RoleEditorProps {
  roleId?: string; // 'new' or specific role ID
  onBack?: () => void;
}

const ROLE_TYPES: Array<{ type: RoleType; label: string; description: string; Icon: typeof User }> = [
  {
    type: 'PERSON',
    label: 'Person',
    description: 'Routes to a single, static master identity from the People module (with delegate awareness).',
    Icon: User,
  },
  {
    type: 'PERSON_GROUP',
    label: 'Person Group',
    description: 'Routes to a team or sequenced pool from the Person Groups module (broadcast, default, or sequence).',
    Icon: Users2,
  },
  {
    type: 'DATASET_ATTRIBUTE',
    label: 'Dataset Attribute',
    description: 'Resolves dynamically from a field on the active record (e.g. reported_by, supervisor_id, lead_tech).',
    Icon: Database,
  },
  {
    type: 'EMAIL_ADDRESS',
    label: 'Email Address',
    description: 'Routes to a static or external email address for notifications and sign-offs.',
    Icon: AtSign,
  },
];

export const RoleEditor: React.FC<RoleEditorProps> = ({ roleId = 'new', onBack }) => {
  const isNew = roleId === 'new';

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [roleType, setRoleType] = useState<RoleType>('PERSON');
  const [personId, setPersonId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [resolutionStrategy, setResolutionStrategy] = useState<RoleResolutionStrategy>('broadcast');

  // Directory choices
  const [persons, setPersons] = useState<Person[]>([]);
  const [groups, setGroups] = useState<PersonGroup[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live Resolution Preview State
  const [previewResult, setPreviewResult] = useState<RoleResolutionResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mockCustomField, setMockCustomField] = useState('ALICE_SUP');

  const handleBack = () => {
    if (onBack) onBack();
    else navigate('/people/roles');
  };

  // Load persons and groups for dropdown selection
  useEffect(() => {
    Promise.all([
      api.listPersons({ limit: 100 }),
      api.listPersonGroups(),
    ])
      .then(([pRes, gRes]) => {
        setPersons(pRes.items);
        setGroups(gRes.items);
      })
      .catch((err) => console.error('Failed to load people directory:', err));
  }, []);

  // Load existing role
  useEffect(() => {
    if (isNew) {
      setId('');
      setName('');
      setDescription('');
      setRoleType('PERSON');
      setPersonId('');
      setGroupName('');
      setFieldName('');
      setEmailAddress('');
      setResolutionStrategy('broadcast');
      setLoading(false);
      return;
    }

    setLoading(true);
    api
      .getRole(roleId)
      .then((r) => {
        setId(r.id);
        setName(r.name);
        setDescription(r.description || '');
        setRoleType(r.role_type);
        setPersonId(r.person_id || '');
        setGroupName(r.group_name || '');
        setFieldName(r.field_name || '');
        setEmailAddress(r.email_address || '');
        setResolutionStrategy(r.resolution_strategy || 'broadcast');
      })
      .catch((err) => {
        setError(err.message || 'Failed to load role');
      })
      .finally(() => setLoading(false));
  }, [roleId, isNew]);

  // Live Dynamic Resolution Preview Tester
  const triggerResolutionPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const payload: Record<string, any> = {};
      if (roleType === 'DATASET_ATTRIBUTE' && fieldName.trim()) {
        payload[fieldName.trim()] = mockCustomField.trim();
      }

      const res = await api.previewRoleResolution(
        {
          id: id.trim().toUpperCase() || 'PREVIEW_ROLE',
          name: name.trim() || 'Preview Role',
          role_type: roleType,
          person_id: personId || undefined,
          group_name: groupName || undefined,
          field_name: fieldName.trim() || undefined,
          email_address: emailAddress.trim() || undefined,
          resolution_strategy: resolutionStrategy,
        },
        { custom_fields: payload }
      );
      setPreviewResult(res);
    } catch (err) {
      console.error('Preview resolution error:', err);
    } finally {
      setPreviewLoading(false);
    }
  }, [id, name, roleType, personId, groupName, fieldName, emailAddress, resolutionStrategy, mockCustomField]);

  // Debounced auto-preview on changes
  useEffect(() => {
    const timer = setTimeout(() => {
      triggerResolutionPreview();
    }, 200);
    return () => clearTimeout(timer);
  }, [triggerResolutionPreview]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Role Name is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const created = await api.createRole({
          id: id.trim().toUpperCase() || undefined,
          name: name.trim(),
          description: description.trim() || undefined,
          role_type: roleType,
          person_id: roleType === 'PERSON' ? personId || undefined : undefined,
          group_name: roleType === 'PERSON_GROUP' ? groupName || undefined : undefined,
          field_name: roleType === 'DATASET_ATTRIBUTE' ? fieldName.trim() || undefined : undefined,
          email_address: roleType === 'EMAIL_ADDRESS' ? emailAddress.trim() || undefined : undefined,
          resolution_strategy: roleType === 'PERSON_GROUP' ? resolutionStrategy : undefined,
        });
        navigate(`/people/roles/${encodeURIComponent(created.id)}`);
      } else {
        await api.updateRole(roleId, {
          name: name.trim(),
          description: description.trim() || undefined,
          role_type: roleType,
          person_id: roleType === 'PERSON' ? personId || undefined : undefined,
          group_name: roleType === 'PERSON_GROUP' ? groupName || undefined : undefined,
          field_name: roleType === 'DATASET_ATTRIBUTE' ? fieldName.trim() || undefined : undefined,
          email_address: roleType === 'EMAIL_ADDRESS' ? emailAddress.trim() || undefined : undefined,
          resolution_strategy: roleType === 'PERSON_GROUP' ? resolutionStrategy : undefined,
        });
        handleBack();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete role "${id || name}"?`)) return;
    try {
      await api.deleteRole(roleId);
      handleBack();
    } catch (err: any) {
      setError(err.message || 'Failed to delete role');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden bg-slate-50/50">
      {/* Top Surface Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/80 bg-white px-6 py-3.5 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-2xs"
            title="Back to roles"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gray-900 tracking-tight">
                {isNew ? 'New Workflow Role' : name || id}
              </h1>
              <span className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 border border-gray-200">
                {roleType}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isNew ? 'Configure dynamic assignment and notification recipient resolver' : `ID: ${id}`}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 shadow-2xs hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{isNew ? 'Create Role' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Pane: Level 1 Form + Live Resolution Preview */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        <div className="mx-auto max-w-5xl flex flex-col lg:flex-row gap-6">
          {/* Left Column: Role Configuration Form (Level 1 Surface) */}
          <div className="flex-1 flex flex-col gap-5 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-xs">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {/* Section 1: Role Identity */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-gray-700" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">Role Identity</h2>
                <InfoTooltip text="Unique identifier and display label for the role. Role IDs are capitalized according to IBM Maximo standards (e.g. ROLE_SUPERVISOR)." />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-700">
                    Role ID <span className="text-gray-400 font-normal">(e.g. ROLE_SAFETY_LEAD)</span>
                  </label>
                  <input
                    type="text"
                    value={id}
                    onChange={(e) => setId(e.target.value.toUpperCase())}
                    disabled={!isNew}
                    placeholder="ROLE_NAME"
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-mono text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-gray-700">
                    Role Label / Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Safety Review Officer"
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-gray-700">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Explain who receives assignments or notifications under this role…"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* Section 2: Role Resolution Type */}
            <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
              <div className="flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-gray-700" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">Role Resolution Type</h2>
                <InfoTooltip text="Specifies how this role resolves to real human assignees or notification recipients when a workflow executes." />
              </div>

              {/* Type Selection Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROLE_TYPES.map((t) => {
                  const Icon = t.Icon;
                  const active = roleType === t.type;
                  return (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => setRoleType(t.type)}
                      className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
                        active
                          ? 'border-gray-900 bg-gray-50/90 shadow-2xs'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                      }`}
                    >
                      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${
                        active ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-900">{t.label}</span>
                          {active && <Check className="h-3.5 w-3.5 text-gray-900" />}
                        </div>
                        <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">
                          {t.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Target Details based on Role Type */}
            <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-gray-700" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">Target Configuration</h2>
              </div>

              {/* 1. PERSON */}
              {roleType === 'PERSON' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-gray-700">
                    Assigned Person from People Module
                  </label>
                  <select
                    value={personId}
                    onChange={(e) => setPersonId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                  >
                    <option value="">— Select a Person —</option>
                    {persons.map((p) => (
                      <option key={p.person_id} value={p.person_id}>
                        {p.display_name} ({p.person_id}) {p.primary_email ? `· ${p.primary_email}` : ''} {p.workflow_delegate_id ? `[Delegate: ${p.workflow_delegate_id}]` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400">
                    If this person has an active delegation window configured in the People module, workflow tasks will automatically route to their active delegate.
                  </p>
                </div>
              )}

              {/* 2. PERSON_GROUP */}
              {roleType === 'PERSON_GROUP' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-gray-700">
                      Assigned Person Group
                    </label>
                    <select
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                    >
                      <option value="">— Select a Person Group —</option>
                      {groups.map((g) => (
                        <option key={g.group_name} value={g.group_name}>
                          {g.group_name} {g.description ? `· ${g.description}` : ''} ({g.member_count} members)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-gray-700">
                      Group Resolution Strategy
                    </label>
                    <select
                      value={resolutionStrategy}
                      onChange={(e) => setResolutionStrategy(e.target.value as RoleResolutionStrategy)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-gray-500 focus:outline-none"
                    >
                      <option value="broadcast">Broadcast (All Active Members)</option>
                      <option value="sequence_first_available">First Available by Sequence (Checks Sick/Leave Availability & Delegates)</option>
                      <option value="default_member">Group Default Member (With Fallback)</option>
                    </select>
                    <p className="text-[11px] text-gray-400">
                      Strategy determines whether tasks broadcast to all members or route round-robin to the first available member in the group's sequence priority.
                    </p>
                  </div>
                </div>
              )}

              {/* 3. DATASET_ATTRIBUTE */}
              {roleType === 'DATASET_ATTRIBUTE' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-gray-700">
                      Record Field / Attribute Name
                    </label>
                    <input
                      type="text"
                      value={fieldName}
                      onChange={(e) => setFieldName(e.target.value)}
                      placeholder="e.g. reported_by, supervisor_id, lead_tech"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-gray-400">
                      At runtime, the workflow engine reads the value of this field from the active record, finds the matching Person identity, and checks availability and delegation.
                    </p>
                  </div>
                </div>
              )}

              {/* 4. EMAIL_ADDRESS */}
              {roleType === 'EMAIL_ADDRESS' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-gray-700">
                    Static Email Address
                  </label>
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="e.g. vendor.dispatch@contractor.com"
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Dynamic Resolution Inspector (Progressive Feedback) */}
          <div className="w-full lg:w-96 flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-gray-700" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Live Maximo Resolution
                </h2>
                <InfoTooltip text="Simulates real-time role resolution against live People, Person Groups, active calendar availability overlays, and delegation rules." />
              </div>
              <button
                type="button"
                onClick={triggerResolutionPreview}
                disabled={previewLoading}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                title="Re-evaluate resolution"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${previewLoading ? 'animate-spin text-gray-700' : ''}`} />
              </button>
            </div>

            {roleType === 'DATASET_ATTRIBUTE' && (
              <div className="flex flex-col gap-1 bg-gray-50 p-2.5 rounded-lg border border-gray-200/70">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Mock Field Value for '{fieldName || 'field'}'
                </label>
                <input
                  type="text"
                  value={mockCustomField}
                  onChange={(e) => setMockCustomField(e.target.value)}
                  placeholder="e.g. TECH_BOB"
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-mono text-gray-800 focus:outline-none"
                />
              </div>
            )}

            {/* Resolved Assignees Summary */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Resolved Assignee(s) ({previewResult?.resolved_persons.length || previewResult?.resolved_emails.length || 0})
              </span>

              {previewLoading ? (
                <div className="flex h-20 items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              ) : previewResult && previewResult.resolved_persons.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {previewResult.resolved_persons.map((p, idx) => (
                    <div
                      key={`${p.person_id}-${idx}`}
                      className="flex items-start justify-between gap-2 rounded-lg border border-gray-200/80 bg-gray-50/60 p-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-gray-900 truncate">{p.display_name}</span>
                          <span className="font-mono text-[10px] text-gray-500">({p.person_id})</span>
                        </div>
                        {p.primary_email && (
                          <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5 truncate">
                            <Mail className="h-3 w-3 text-gray-400 shrink-0" />
                            <span className="truncate">{p.primary_email}</span>
                          </div>
                        )}
                        {p.is_delegate && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 border border-amber-200">
                            <Clock className="h-2.5 w-2.5" /> Delegated from {p.original_person_id}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : previewResult && previewResult.resolved_emails.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {previewResult.resolved_emails.map((em, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs text-gray-800 font-mono">
                      <AtSign className="h-3.5 w-3.5 text-gray-400" />
                      <span>{em}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-4 text-center text-xs text-gray-400">
                  No assignees currently resolved for this configuration.
                </div>
              )}
            </div>

            {/* Resolution Trace Log */}
            {previewResult && previewResult.trace.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Resolution Trace
                </span>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-lg bg-gray-900 p-2.5 text-[11px] font-mono text-gray-200">
                  {previewResult.trace.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-1 leading-snug">
                      <span className="text-gray-500 shrink-0">›</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
