import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Loader2,
  Layers,
  Users,
  Shield,
  Plus,
  Minus,
  MoreVertical,
  Trash2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../../api/client';
import type { Person, PersonGroup, PersonGroupMember } from '../../types';
import { navigate } from '../../lib/router';
import { InfoTooltip } from './InfoTooltip';
import { AnchoredDialog } from './AnchoredDialog';

interface GroupEditorProps {
  groupName: string;
  onBack?: () => void;
}

export const GroupEditor: React.FC<GroupEditorProps> = ({ groupName, onBack }) => {
  const isNew = groupName === 'new';

  // Group fields
  const [name, setName] = useState(isNew ? '' : groupName);
  const [description, setDescription] = useState('');
  const [isCrewWorkGroup, setIsCrewWorkGroup] = useState(false);
  const [useForSite, setUseForSite] = useState('');
  const [useForOrg, setUseForOrg] = useState('');
  const [members, setMembers] = useState<PersonGroupMember[]>([]);

  // Auxiliary data
  const [allPersons, setAllPersons] = useState<Person[]>([]);

  // UI state
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [blockers, setBlockers] = useState<string[] | null>(null);

  // Level 2 Dialog state
  const [activeDialog, setActiveDialog] = useState<'add-member' | 'edit-member' | null>(null);
  const [dialogAnchorY, setDialogAnchorY] = useState<number>(180);

  // Add Member state
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [memberSeq, setMemberSeq] = useState(1);
  const [memberGroupDefault, setMemberGroupDefault] = useState(false);
  const [memberSiteDefault, setMemberSiteDefault] = useState(false);
  const [memberOrgDefault, setMemberOrgDefault] = useState(false);
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberErr, setMemberErr] = useState<string | null>(null);

  // Edit Member state
  const [editingMember, setEditingMember] = useState<PersonGroupMember | null>(null);

  const handleBack = () => {
    if (onBack) onBack();
    else navigate('/people/groups');
  };

  const loadGroupData = useCallback(async () => {
    try {
      const personsRes = await api.listPersons({ status: 'ACTIVE', limit: 200 });
      setAllPersons(personsRes.items);
    } catch (e) {
      console.error(e);
    }

    if (isNew) return;

    setLoading(true);
    setErr(null);
    try {
      const group = await api.getPersonGroup(groupName);
      setName(group.group_name);
      setDescription(group.description || '');
      setIsCrewWorkGroup(group.is_crew_work_group || false);
      setUseForSite(group.use_for_site || '');
      setUseForOrg(group.use_for_org || '');
      setMembers(group.members || []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load person group');
    } finally {
      setLoading(false);
    }
  }, [groupName, isNew]);

  useEffect(() => {
    loadGroupData();
  }, [loadGroupData]);

  const openAddMemberDialog = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDialogAnchorY(rect.top + rect.height / 2);
    setSelectedPersonId('');
    setMemberSeq(members.length + 1);
    setMemberGroupDefault(members.length === 0);
    setMemberSiteDefault(false);
    setMemberOrgDefault(false);
    setMemberErr(null);
    setActiveDialog('add-member');
  };

  const openEditMemberDialog = (m: PersonGroupMember, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDialogAnchorY(rect.top + rect.height / 2);
    setEditingMember(m);
    setMemberSeq(m.sequence);
    setMemberGroupDefault(m.is_group_default);
    setMemberSiteDefault(m.is_site_default);
    setMemberOrgDefault(m.is_org_default);
    setMemberErr(null);
    setActiveDialog('edit-member');
  };

  const handleSaveGroup = async () => {
    if (!name.trim()) {
      setErr('Group Name is required');
      return;
    }

    setSaving(true);
    setErr(null);
    setSuccess(false);

    try {
      const groupKey = name.trim().toUpperCase();
      if (isNew) {
        const res = await api.createPersonGroup({
          group_name: groupKey,
          description: description.trim() || undefined,
          is_crew_work_group: isCrewWorkGroup,
          use_for_site: useForSite.trim() || undefined,
          use_for_org: useForOrg.trim() || undefined,
          members: members.map((m) => ({
            person_id: m.person_id,
            sequence: m.sequence,
            is_group_default: m.is_group_default,
            is_site_default: m.is_site_default,
            is_org_default: m.is_org_default,
          })),
        });
        setSuccess(true);
        setTimeout(() => {
          navigate(`/people/groups/${encodeURIComponent(res.group_name)}`);
        }, 300);
      } else {
        await api.updatePersonGroup(groupName, {
          description: description.trim() || undefined,
          is_crew_work_group: isCrewWorkGroup,
          use_for_site: useForSite.trim() || undefined,
          use_for_org: useForOrg.trim() || undefined,
        });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2500);
      }
    } catch (e: any) {
      setErr(e.message || 'Failed to save person group');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!confirm(`Are you sure you want to delete person group "${groupName}"?`)) return;
    try {
      await api.deletePersonGroup(groupName);
      navigate('/people/groups');
    } catch (e: any) {
      const detail = e.body || {};
      if (detail.blockers && Array.isArray(detail.blockers)) {
        setBlockers(detail.blockers);
      } else {
        alert(e.message || 'Delete failed');
      }
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPersonId) {
      setMemberErr('Please select a person to add');
      return;
    }

    if (isNew) {
      // Local draft state for new group
      const personObj = allPersons.find((p) => p.person_id === selectedPersonId);
      const newM: PersonGroupMember = {
        group_name: name || 'NEW',
        person_id: selectedPersonId,
        sequence: memberSeq || members.length + 1,
        is_group_default: memberGroupDefault,
        is_site_default: memberSiteDefault,
        is_org_default: memberOrgDefault,
        display_name: personObj?.display_name || selectedPersonId,
        status: personObj?.status || 'ACTIVE',
      };
      setMembers([...members, newM]);
      setActiveDialog(null);
      return;
    }

    setMemberSaving(true);
    setMemberErr(null);
    try {
      const updated = await api.addGroupMember(groupName, {
        person_id: selectedPersonId,
        sequence: memberSeq,
        is_group_default: memberGroupDefault,
        is_site_default: memberSiteDefault,
        is_org_default: memberOrgDefault,
      });
      setMembers(updated.members || []);
      setActiveDialog(null);
    } catch (err: any) {
      setMemberErr(err.message || 'Failed to add member');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    if (isNew) {
      setMembers(
        members.map((m) =>
          m.person_id === editingMember.person_id
            ? {
                ...m,
                sequence: memberSeq,
                is_group_default: memberGroupDefault,
                is_site_default: memberSiteDefault,
                is_org_default: memberOrgDefault,
              }
            : m
        )
      );
      setActiveDialog(null);
      return;
    }

    setMemberSaving(true);
    setMemberErr(null);
    try {
      const updated = await api.updateGroupMember(groupName, editingMember.person_id, {
        sequence: memberSeq,
        is_group_default: memberGroupDefault,
        is_site_default: memberSiteDefault,
        is_org_default: memberOrgDefault,
      });
      setMembers(updated.members || []);
      setActiveDialog(null);
    } catch (err: any) {
      setMemberErr(err.message || 'Failed to update member');
    } finally {
      setMemberSaving(false);
    }
  };

  const handleRemoveMember = async (personId: string) => {
    if (isNew) {
      setMembers(members.filter((m) => m.person_id !== personId));
      return;
    }

    try {
      await api.removeGroupMember(groupName, personId);
      const updated = await api.getPersonGroup(groupName);
      setMembers(updated.members || []);
    } catch (err: any) {
      alert(err.message || 'Failed to remove member');
    }
  };

  // Sort members by sequence
  const sortedMembers = [...members].sort((a, b) => a.sequence - b.sequence);
  const existingPersonIds = new Set(members.map((m) => m.person_id));

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
            <span>Person Groups</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gray-900">
                {isNew ? 'New Person Group' : groupName}
              </h1>
              {isCrewWorkGroup && (
                <span className="inline-flex items-center rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-800">
                  Crew Work Group
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isNew
                ? 'Define a new person group for team routing and work assignment.'
                : `GROUP: ${groupName} · ${members.length} registered members`}
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
            <button
              type="button"
              onClick={handleDeleteGroup}
              className="rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors shadow-2xs"
              title="Delete person group (blocked if assigned to active records)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveGroup}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 hover:bg-black px-4 py-1.5 text-xs font-semibold text-white shadow-xs disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{isNew ? 'Create Group' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto min-h-0 p-6 sm:p-10 bg-slate-50/50">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Deletion Blocker Notice */}
          {blockers && blockers.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 shadow-xs animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Cannot delete person group due to active dependencies:</span>
              </div>
              <ul className="mt-2 space-y-1 pl-6 list-disc text-xs text-amber-800">
                {blockers.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Form Card */}
          <div className="rounded-xl border border-gray-200/80 bg-white p-6 sm:p-8 shadow-xs space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading group…
              </div>
            ) : (
              <>
                {/* SECTION 1: Group Configuration */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-gray-700" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                        Group Details
                      </span>
                      <InfoTooltip text="Unique uppercase GROUP_NAME used in condition rules and entity_reference fields." />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Group Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={name}
                        disabled={!isNew}
                        onChange={(e) => setName(e.target.value.toUpperCase())}
                        placeholder="e.g. SHIFT_CREW_A"
                        className="w-full font-mono rounded-md border border-gray-200 bg-gray-50/50 px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:bg-white focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Description
                      </label>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Primary Electrical Maintenance Crew"
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Site Scope <span className="text-gray-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={useForSite}
                        onChange={(e) => setUseForSite(e.target.value)}
                        placeholder="e.g. HQ or BEDFORD"
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Organization Scope <span className="text-gray-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={useForOrg}
                        onChange={(e) => setUseForOrg(e.target.value)}
                        placeholder="e.g. EAGLENA"
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isCrewWorkGroup}
                        onChange={(e) => setIsCrewWorkGroup(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-blue-500"
                      />
                      <span className="text-xs font-medium text-gray-700">
                        Crew Work Group (dedicated multi-person shift crew)
                      </span>
                    </label>
                  </div>
                </div>

                {/* SECTION 2: Members & Escalation Order */}
                <div className="border-t border-gray-100 pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-gray-700" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                        Group Members & Escalation Sequence
                      </span>
                      <InfoTooltip text="Ordered member list. Sequence specifies the escalation chain order. Group default designates the primary assignee." />
                    </div>

                    <button
                      type="button"
                      onClick={openAddMemberDialog}
                      title="Add group member"
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {sortedMembers.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
                      No members assigned to this group yet. Click the &ldquo;+&rdquo; button above to add members.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-gray-100 bg-gray-50/80 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          <tr>
                            <th scope="col" className="px-3 py-2 w-16 text-center">Seq</th>
                            <th scope="col" className="px-4 py-2">Member</th>
                            <th scope="col" className="px-3 py-2">Defaults</th>
                            <th scope="col" className="px-3 py-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {sortedMembers.map((m) => (
                            <tr key={m.person_id} className="hover:bg-slate-50/60 transition-colors">
                              {/* Sequence Badge */}
                              <td className="px-3 py-2.5 text-center font-mono text-xs font-semibold text-gray-600">
                                {m.sequence}
                              </td>

                              {/* Member Identity */}
                              <td className="px-4 py-2.5">
                                <div className="font-semibold text-gray-900">
                                  {m.display_name || m.person_id}
                                </div>
                                <div className="font-mono text-[10px] text-gray-400">
                                  {m.person_id}
                                </div>
                              </td>

                              {/* Defaults */}
                              <td className="px-3 py-2.5">
                                <div className="flex flex-wrap gap-1">
                                  {m.is_group_default && (
                                    <span className="rounded bg-blue-50 border border-blue-200/80 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-blue-700">
                                      Group Default
                                    </span>
                                  )}
                                  {m.is_site_default && (
                                    <span className="rounded bg-gray-100 border border-gray-200 px-1.5 py-0.2 font-mono text-[9px] font-medium text-gray-600">
                                      Site Default
                                    </span>
                                  )}
                                  {m.is_org_default && (
                                    <span className="rounded bg-gray-100 border border-gray-200 px-1.5 py-0.2 font-mono text-[9px] font-medium text-gray-600">
                                      Org Default
                                    </span>
                                  )}
                                  {!m.is_group_default && !m.is_site_default && !m.is_org_default && (
                                    <span className="text-[10px] text-gray-400 italic">—</span>
                                  )}
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="px-3 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => openEditMemberDialog(m, e)}
                                    title="Configure member sequence and defaults"
                                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                                  >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMember(m.person_id)}
                                    title="Remove member"
                                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* LEVEL 2: CONTEXTUAL ANCHORED DIALOGS */}

      {/* Add Member Dialog */}
      <AnchoredDialog
        isOpen={activeDialog === 'add-member'}
        onClose={() => setActiveDialog(null)}
        title="Add Group Member"
        anchorY={dialogAnchorY}
        widthClass="w-[380px]"
      >
        <form onSubmit={handleAddMember} className="space-y-3">
          {memberErr && <div className="text-xs text-red-600">{memberErr}</div>}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Select Person <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPersonId}
              required
              onChange={(e) => setSelectedPersonId(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-600 focus:outline-none"
            >
              <option value="">Choose an active person…</option>
              {allPersons
                .filter((p) => !existingPersonIds.has(p.person_id) && p.status === 'ACTIVE')
                .map((p) => (
                  <option key={p.person_id} value={p.person_id}>
                    {p.display_name} ({p.person_id})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Escalation Sequence
            </label>
            <input
              type="number"
              min={1}
              value={memberSeq}
              onChange={(e) => setMemberSeq(parseInt(e.target.value, 10) || 1)}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="space-y-2 pt-1 border-t border-gray-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={memberGroupDefault}
                onChange={(e) => setMemberGroupDefault(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
              />
              <span className="text-xs text-gray-700 font-medium">Group Default Assignee</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={memberSiteDefault}
                onChange={(e) => setMemberSiteDefault(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
              />
              <span className="text-xs text-gray-700">Site Default Assignee</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={memberOrgDefault}
                onChange={(e) => setMemberOrgDefault(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
              />
              <span className="text-xs text-gray-700">Organization Default Assignee</span>
            </label>
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
              disabled={memberSaving}
              className="flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {memberSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>Add Member</span>
            </button>
          </div>
        </form>
      </AnchoredDialog>

      {/* Edit Member Dialog */}
      <AnchoredDialog
        isOpen={activeDialog === 'edit-member'}
        onClose={() => setActiveDialog(null)}
        title={`Configure Member: ${editingMember?.person_id || ''}`}
        anchorY={dialogAnchorY}
        widthClass="w-[380px]"
      >
        <form onSubmit={handleUpdateMember} className="space-y-3">
          {memberErr && <div className="text-xs text-red-600">{memberErr}</div>}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Escalation Sequence
            </label>
            <input
              type="number"
              min={1}
              value={memberSeq}
              onChange={(e) => setMemberSeq(parseInt(e.target.value, 10) || 1)}
              className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="space-y-2 pt-1 border-t border-gray-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={memberGroupDefault}
                onChange={(e) => setMemberGroupDefault(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
              />
              <span className="text-xs text-gray-700 font-medium">Group Default Assignee</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={memberSiteDefault}
                onChange={(e) => setMemberSiteDefault(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
              />
              <span className="text-xs text-gray-700">Site Default Assignee</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={memberOrgDefault}
                onChange={(e) => setMemberOrgDefault(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900"
              />
              <span className="text-xs text-gray-700">Organization Default Assignee</span>
            </label>
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
              disabled={memberSaving}
              className="flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              {memberSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>Save Member</span>
            </button>
          </div>
        </form>
      </AnchoredDialog>
    </div>
  );
};
