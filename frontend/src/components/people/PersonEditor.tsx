import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  UserCheck,
  Shield,
  Calendar,
  Clock,
  Briefcase,
  Layers,
  Plus,
  Minus,
  MoreVertical,
  Trash2,
  Power,
  Check,
  AlertTriangle,
  UserPlus,
} from 'lucide-react';
import { api } from '../../api/client';
import type { Person, PersonAvailability, PersonRelated } from '../../types';
import { navigate } from '../../lib/router';
import { InfoTooltip } from './InfoTooltip';
import { AnchoredDialog } from './AnchoredDialog';

interface PersonEditorProps {
  personId: string;
  onBack?: () => void;
}

export const PersonEditor: React.FC<PersonEditorProps> = ({ personId, onBack }) => {
  const isNew = personId === 'new';

  // Form fields
  const [pid, setPid] = useState(isNew ? '' : personId);
  const [displayName, setDisplayName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [site, setSite] = useState('HQ');
  const [primaryShift, setPrimaryShift] = useState('Day');
  const [primaryCalendar, setPrimaryCalendar] = useState('');
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [delegateId, setDelegateId] = useState<string | null>(null);
  const [delegateFrom, setDelegateFrom] = useState('');
  const [delegateTo, setDelegateTo] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [userId, setUserId] = useState<string | null>(null);
  const [linkedRoles, setLinkedRoles] = useState<string[]>([]);

  // Auxiliary data
  const [allPersons, setAllPersons] = useState<Person[]>([]);
  const [availabilityList, setAvailabilityList] = useState<PersonAvailability[]>([]);
  const [related, setRelated] = useState<PersonRelated | null>(null);

  // UI state
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inactivateBlockers, setInactivateBlockers] = useState<string[] | null>(null);

  // Level 2 Anchored Dialog state
  const [activeDialog, setActiveDialog] = useState<
    'supervisor' | 'delegate' | 'availability' | null
  >(null);
  const [dialogAnchorY, setDialogAnchorY] = useState<number>(180);

  // Availability form state for Level 2 dialog
  const [newAvailReason, setNewAvailReason] = useState<'Holiday' | 'Sick' | 'Overtime' | 'Other'>('Holiday');
  const [newAvailFrom, setNewAvailFrom] = useState('');
  const [newAvailTo, setNewAvailTo] = useState('');
  const [availSaving, setAvailSaving] = useState(false);
  const [availErr, setAvailErr] = useState<string | null>(null);

  const handleBack = () => {
    if (onBack) onBack();
    else navigate('/people');
  };

  const loadPerson = useCallback(async () => {
    if (isNew) {
      try {
        const personsRes = await api.listPersons({ status: 'ACTIVE', limit: 200 });
        setAllPersons(personsRes.items);
      } catch (e) {
        console.error(e);
      }
      return;
    }

    setLoading(true);
    setErr(null);
    try {
      const [person, personsRes, availRes, relatedRes] = await Promise.all([
        api.getPerson(personId),
        api.listPersons({ status: 'ACTIVE', limit: 200 }).catch(() => ({ items: [] })),
        api.listPersonAvailability(personId).catch(() => ({ items: [] })),
        api.getPersonRelated(personId).catch(() => null),
      ]);

      setPid(person.person_id);
      setDisplayName(person.display_name || '');
      setFirstName(person.first_name || '');
      setLastName(person.last_name || '');
      setPrimaryEmail(person.primary_email || '');
      setPhone(person.phone || '');
      setSite(person.site || 'HQ');
      setPrimaryShift(person.primary_shift || 'Day');
      setPrimaryCalendar(person.primary_calendar || '');
      setSupervisorId(person.supervisor_id || null);
      setDelegateId(person.workflow_delegate_id || null);
      setDelegateFrom(person.delegate_from ? person.delegate_from.slice(0, 16) : '');
      setDelegateTo(person.delegate_to ? person.delegate_to.slice(0, 16) : '');
      setStatus(person.status);
      setUserId(person.user_id || null);
      setLinkedRoles(person.linked_roles || []);

      setAllPersons(personsRes.items || []);
      setAvailabilityList(availRes.items || []);
      setRelated(relatedRes);
    } catch (e: any) {
      setErr(e.message || 'Failed to load person');
    } finally {
      setLoading(false);
    }
  }, [personId, isNew]);

  useEffect(() => {
    loadPerson();
  }, [loadPerson]);

  const openDialog = (
    type: 'supervisor' | 'delegate' | 'availability',
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDialogAnchorY(rect.top + rect.height / 2);
    setActiveDialog(type);
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      setErr('Display Name is required');
      return;
    }
    if (isNew && !pid.trim() && !primaryEmail.trim()) {
      setErr('Person ID or Email is required');
      return;
    }

    setSaving(true);
    setErr(null);
    setSuccess(false);

    try {
      const payload: Partial<Person> & { display_name: string } = {
        person_id: isNew ? (pid.trim() ? pid.trim().toUpperCase() : undefined) : pid,
        display_name: displayName.trim(),
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        primary_email: primaryEmail.trim() || undefined,
        phone: phone.trim() || undefined,
        site: site.trim() || undefined,
        primary_shift: primaryShift.trim() || undefined,
        primary_calendar: primaryCalendar.trim() || undefined,
        supervisor_id: supervisorId || undefined,
        workflow_delegate_id: delegateId || undefined,
        delegate_from: delegateFrom ? new Date(delegateFrom).toISOString() : undefined,
        delegate_to: delegateTo ? new Date(delegateTo).toISOString() : undefined,
      };

      if (isNew) {
        const res = await api.createPerson(payload);
        setSuccess(true);
        setTimeout(() => {
          navigate(`/people/${encodeURIComponent(res.person_id)}`);
        }, 300);
      } else {
        await api.updatePerson(personId, payload);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2500);
      }
    } catch (e: any) {
      setErr(e.message || 'Failed to save person');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    setErr(null);
    setInactivateBlockers(null);

    try {
      if (status === 'ACTIVE') {
        const res = await api.inactivatePerson(personId);
        if (res.inactivated) {
          setStatus('INACTIVE');
          loadPerson();
        }
      } else {
        const res = await api.activatePerson(personId);
        if (res.activated) {
          setStatus('ACTIVE');
          loadPerson();
        }
      }
    } catch (e: any) {
      const detail = e.body || {};
      if (detail.blockers && Array.isArray(detail.blockers)) {
        setInactivateBlockers(detail.blockers);
      } else {
        setErr(e.message || 'Action failed');
      }
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete person "${personId}"?`)) return;
    try {
      await api.deletePerson(personId);
      navigate('/people');
    } catch (e: any) {
      const detail = e.body || {};
      if (detail.blockers && Array.isArray(detail.blockers)) {
        alert(`Cannot delete: ${detail.message}\nBlockers:\n- ` + detail.blockers.join('\n- '));
      } else {
        alert(e.message || 'Delete failed');
      }
    }
  };

  const handleAddAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAvailFrom || !newAvailTo) {
      setAvailErr('Both start and end dates are required');
      return;
    }
    setAvailSaving(true);
    setAvailErr(null);
    try {
      await api.createPersonAvailability(personId, {
        reason: newAvailReason,
        available_from: new Date(newAvailFrom).toISOString(),
        available_to: new Date(newAvailTo).toISOString(),
      });
      setNewAvailFrom('');
      setNewAvailTo('');
      setActiveDialog(null);
      const res = await api.listPersonAvailability(personId);
      setAvailabilityList(res.items);
    } catch (err: any) {
      setAvailErr(err.message || 'Failed to add availability');
    } finally {
      setAvailSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden bg-white">
      {/* Surface Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/80 bg-white px-6 py-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 shadow-2xs transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>People</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gray-900">
                {isNew ? 'New System Identity' : displayName || pid}
              </h1>
              {!isNew && (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                    status === 'ACTIVE'
                      ? 'bg-gray-100 text-gray-800 border-gray-200'
                      : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}
                >
                  {status}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isNew
                ? 'Create a new root person record before assigning work or creating login accounts.'
                : `PERSONID: ${pid} · Master Identity`}
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {err && <span className="text-xs text-red-600 mr-2">{err}</span>}
          {success && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium mr-2">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          )}

          {!isNew && (
            <>
              <button
                type="button"
                onClick={handleToggleStatus}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors shadow-2xs ${
                  status === 'ACTIVE'
                    ? 'border-gray-200 text-gray-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                    : 'border-gray-200 bg-white text-gray-800 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                <span>{status === 'ACTIVE' ? 'Inactivate' : 'Activate'}</span>
              </button>

              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors shadow-2xs"
                title="Delete person (only allowed if unreferenced)"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 hover:bg-black px-4 py-1.5 text-xs font-semibold text-white shadow-xs disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{isNew ? 'Create Person' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Main Body with Level 1 Inspector Sections */}
      <div className="flex-1 overflow-y-auto min-h-0 p-6 sm:p-10 bg-slate-50/50">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Inactivation Blocker Notice */}
          {inactivateBlockers && inactivateBlockers.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 shadow-xs animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Cannot inactivate person due to active dependencies:</span>
              </div>
              <ul className="mt-2 space-y-1 pl-6 list-disc text-xs text-amber-800">
                {inactivateBlockers.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-amber-700 italic">
                Per Maximo governance rules, complete/reassign open work, supervisees, and group memberships before inactivating.
              </p>
            </div>
          )}

          {/* Form Card (Unboxed sections inside single clean white card) */}
          <div className="rounded-xl border border-gray-200/80 bg-white p-6 sm:p-8 shadow-xs space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading identity…
              </div>
            ) : (
              <>
                {/* SECTION 1: Identity */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-gray-700" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                        Identity
                      </span>
                      <InfoTooltip text="The PERSONID is the unique capital-letter key used across the system (e.g. ALICE.SAFETY)." />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Person ID {isNew && <span className="text-gray-400 font-normal">(Optional, auto-generated)</span>}
                      </label>
                      <input
                        type="text"
                        value={pid}
                        disabled={!isNew}
                        onChange={(e) => setPid(e.target.value.toUpperCase())}
                        placeholder={primaryEmail ? primaryEmail.split('@')[0].toUpperCase() : 'e.g. CHUCK.STONE'}
                        className="w-full font-mono rounded-md border border-gray-200 bg-gray-50/50 px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:bg-white focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Display Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. Charlie Stone"
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        First Name
                      </label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="e.g. Charlie"
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Last Name
                      </label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="e.g. Stone"
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 2: Contact & Location */}
                <div className="border-t border-gray-100 pt-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5 text-gray-700" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                        Contact & Location
                      </span>
                      <InfoTooltip text="Primary email and site location context." />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Primary Email
                      </label>
                      <input
                        type="email"
                        value={primaryEmail}
                        onChange={(e) => setPrimaryEmail(e.target.value)}
                        placeholder="charlie.tech@compassx.io"
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+1-555-0199"
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Default Site
                      </label>
                      <input
                        type="text"
                        value={site}
                        onChange={(e) => setSite(e.target.value)}
                        placeholder="HQ"
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 3: Shift & Work Schedule */}
                <div className="border-t border-gray-100 pt-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-gray-700" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                        Shift & Schedule
                      </span>
                      <InfoTooltip text="Standard shift patterns for labor allocation." />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Primary Shift
                      </label>
                      <select
                        value={primaryShift}
                        onChange={(e) => setPrimaryShift(e.target.value)}
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-blue-600 focus:outline-none"
                      >
                        <option value="Day">Day Shift (08:00 - 16:30)</option>
                        <option value="Night">Night Shift (20:00 - 04:30)</option>
                        <option value="Swing">Swing Shift (16:00 - 00:30)</option>
                        <option value="Rotating">Rotating Crew</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Primary Calendar
                      </label>
                      <input
                        type="text"
                        value={primaryCalendar}
                        onChange={(e) => setPrimaryCalendar(e.target.value)}
                        placeholder="e.g. CAL-HQ-STANDARD"
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* SECTION 4: Supervision & Escalation */}
                <div className="border-t border-gray-100 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-gray-700" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                        Supervisor
                      </span>
                      <InfoTooltip text="Supervisor record for approval routing and escalation." />
                    </div>

                    {!supervisorId && (
                      <button
                        type="button"
                        onClick={(e) => openDialog('supervisor', e)}
                        title="Assign Supervisor"
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {supervisorId ? (
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-slate-50/60 px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-gray-900">{supervisorId}</span>
                        {allPersons.find((p) => p.person_id === supervisorId)?.display_name && (
                          <span className="text-xs text-gray-500">
                            ({allPersons.find((p) => p.person_id === supervisorId)?.display_name})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => openDialog('supervisor', e)}
                          title="Change supervisor"
                          className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSupervisorId(null)}
                          title="Remove supervisor"
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No supervisor assigned</p>
                  )}
                </div>

                {/* SECTION 5: Workflow Delegate */}
                <div className="border-t border-gray-100 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-gray-700" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                        Workflow Delegate
                      </span>
                      <InfoTooltip text="Temporary routing delegate for workflows during vacation or leave." />
                    </div>

                    {!delegateId && (
                      <button
                        type="button"
                        onClick={(e) => openDialog('delegate', e)}
                        title="Assign Delegate"
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {delegateId ? (
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-slate-50/60 px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-gray-900">{delegateId}</span>
                        {delegateFrom && delegateTo && (
                          <span className="text-[11px] text-gray-500 font-sans">
                            ({new Date(delegateFrom).toLocaleDateString()} – {new Date(delegateTo).toLocaleDateString()})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => openDialog('delegate', e)}
                          title="Configure delegate"
                          className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDelegateId(null);
                            setDelegateFrom('');
                            setDelegateTo('');
                          }}
                          title="Remove delegate"
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No active delegate configured</p>
                  )}
                </div>

                {/* SECTION 6: Availability (Phase 1-lite) */}
                {!isNew && (
                  <div className="border-t border-gray-100 pt-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-gray-700" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                          Availability & Leaves
                        </span>
                        <InfoTooltip text="Maximo Modify Person Availability analogue. Tracks sickness, holidays, and overtime windows." />
                      </div>

                      <button
                        type="button"
                        onClick={(e) => openDialog('availability', e)}
                        title="Add availability window"
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {availabilityList.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No special availability or leave records recorded.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {availabilityList.map((av) => (
                          <div
                            key={av.id}
                            className="flex items-center justify-between rounded-lg border border-gray-200 bg-slate-50/50 px-3 py-1.5 text-xs text-gray-800"
                          >
                            <span className="font-semibold">{av.reason}</span>
                            <span className="font-mono text-[11px] text-gray-500">
                              {new Date(av.available_from).toLocaleDateString()} → {new Date(av.available_to).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* SECTION 7: Related Work & Group Memberships */}
                {!isNew && related && (
                  <div className="border-t border-gray-100 pt-5 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-gray-700" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                        Related Assignments & Teams
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-gray-200 bg-slate-50/50 p-3">
                        <div className="font-semibold text-gray-700 mb-1">Assigned Work Orders</div>
                        {related.workorders.length === 0 ? (
                          <span className="text-gray-400 italic text-[11px]">None</span>
                        ) : (
                          <ul className="space-y-1">
                            {related.workorders.map((wo) => (
                              <li key={wo.id} className="flex items-center justify-between text-[11px]">
                                <span className="font-mono font-medium">{wo.id}</span>
                                <span className="rounded bg-gray-200 px-1.5 py-0.2 font-mono text-[10px]">{wo.status}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-slate-50/50 p-3">
                        <div className="font-semibold text-gray-700 mb-1">Person Groups (Teams)</div>
                        {related.groups.length === 0 ? (
                          <span className="text-gray-400 italic text-[11px]">No group memberships</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {related.groups.map((g) => (
                              <span
                                key={g}
                                className="rounded bg-gray-200 px-2 py-0.5 font-mono text-[10px] font-semibold text-gray-800"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* LEVEL 2: CONTEXTUAL ANCHORED DIALOGS */}

      {/* Supervisor Picker Dialog */}
      <AnchoredDialog
        isOpen={activeDialog === 'supervisor'}
        onClose={() => setActiveDialog(null)}
        title="Select Supervisor"
        anchorY={dialogAnchorY}
        widthClass="w-[360px]"
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Choose an active person to serve as the supervisor for approval escalations.
          </p>
          <div className="max-h-56 overflow-y-auto space-y-1 divide-y divide-gray-50">
            {allPersons
              .filter((p) => p.person_id !== pid && p.status === 'ACTIVE')
              .map((p) => (
                <button
                  key={p.person_id}
                  type="button"
                  onClick={() => {
                    setSupervisorId(p.person_id);
                    setActiveDialog(null);
                  }}
                  className={`flex w-full items-center justify-between p-2 text-left text-xs rounded-lg hover:bg-slate-50 transition-colors ${
                    supervisorId === p.person_id ? 'bg-blue-50/60 text-blue-700 font-semibold' : 'text-gray-800'
                  }`}
                >
                  <div>
                    <div className="font-semibold">{p.display_name}</div>
                    <div className="font-mono text-[10px] text-gray-400">{p.person_id}</div>
                  </div>
                  {supervisorId === p.person_id && <Check className="h-4 w-4 text-blue-700" />}
                </button>
              ))}
          </div>
        </div>
      </AnchoredDialog>

      {/* Delegate Configuration Dialog */}
      <AnchoredDialog
        isOpen={activeDialog === 'delegate'}
        onClose={() => setActiveDialog(null)}
        title="Configure Workflow Delegate"
        anchorY={dialogAnchorY}
        widthClass="w-[380px]"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Delegate Person</label>
            <select
              value={delegateId || ''}
              onChange={(e) => setDelegateId(e.target.value || null)}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="">Select a person…</option>
              {allPersons
                .filter((p) => p.person_id !== pid && p.status === 'ACTIVE')
                .map((p) => (
                  <option key={p.person_id} value={p.person_id}>
                    {p.display_name} ({p.person_id})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Active From</label>
            <input
              type="datetime-local"
              value={delegateFrom}
              onChange={(e) => setDelegateFrom(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Active To</label>
            <input
              type="datetime-local"
              value={delegateTo}
              onChange={(e) => setDelegateTo(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
            >
              Done
            </button>
          </div>
        </div>
      </AnchoredDialog>

      {/* Availability Window Dialog */}
      <AnchoredDialog
        isOpen={activeDialog === 'availability'}
        onClose={() => setActiveDialog(null)}
        title="Add Availability Window"
        anchorY={dialogAnchorY}
        widthClass="w-[380px]"
      >
        <form onSubmit={handleAddAvailability} className="space-y-3">
          {availErr && <div className="text-xs text-red-600">{availErr}</div>}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Reason</label>
            <select
              value={newAvailReason}
              onChange={(e) => setNewAvailReason(e.target.value as any)}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="Holiday">Holiday (Annual Leave)</option>
              <option value="Sick">Sick Leave</option>
              <option value="Overtime">Overtime Available</option>
              <option value="Other">Other Unavailable</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Available From</label>
            <input
              type="datetime-local"
              required
              value={newAvailFrom}
              onChange={(e) => setNewAvailFrom(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Available To</label>
            <input
              type="datetime-local"
              required
              value={newAvailTo}
              onChange={(e) => setNewAvailTo(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setActiveDialog(null)}
              className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={availSaving}
              className="flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {availSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>Add Window</span>
            </button>
          </div>
        </form>
      </AnchoredDialog>
    </div>
  );
};
