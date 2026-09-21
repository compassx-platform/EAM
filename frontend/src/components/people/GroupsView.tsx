import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Users, Layers, Shield, ArrowRight, Loader2, RefreshCw, UserCheck } from 'lucide-react';
import { api } from '../../api/client';
import type { PersonGroup } from '../../types';
import { navigate } from '../../lib/router';
import { InfoTooltip } from './InfoTooltip';

interface GroupsViewProps {
  onSelectGroup?: (groupName: string) => void;
}

export const GroupsView: React.FC<GroupsViewProps> = ({ onSelectGroup }) => {
  const [groups, setGroups] = useState<PersonGroup[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGroups = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.listPersonGroups(search.trim() || undefined);
      setGroups(res.items);
    } catch (err) {
      console.error('Failed to load person groups:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchGroups();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchGroups]);

  const handleRowClick = (groupName: string) => {
    if (onSelectGroup) {
      onSelectGroup(groupName);
    } else {
      navigate(`/people/groups/${encodeURIComponent(groupName)}`);
    }
  };

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden bg-slate-50/50">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/80 bg-white px-6 py-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700 border border-gray-200/80 shadow-2xs">
            <Layers className="h-5 w-5 text-gray-700" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-bold text-gray-900 tracking-tight">Person Groups</h1>
              <InfoTooltip text="Person Groups modeled after IBM Maximo PERSONGROUP. Used for work routing, crew assignments, and multi-tier approval escalations." />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {groups.length} {groups.length === 1 ? 'group' : 'groups'} defined · Master data system of record
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2.5">
          {/* Segmented View Switcher: People vs Groups */}
          <div className="flex items-center rounded-lg border border-gray-200/80 bg-gray-100/80 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => navigate('/people')}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <Users className="h-3.5 w-3.5 text-gray-500" />
              <span>People</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 shadow-xs"
            >
              <Layers className="h-3.5 w-3.5 text-gray-700" />
              <span>Person Groups</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/people/roles')}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <UserCheck className="h-3.5 w-3.5 text-gray-500" />
              <span>Roles</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchGroups(true)}
            disabled={refreshing}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors shadow-2xs"
            title="Refresh list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => navigate('/people/groups/new')}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 hover:bg-black px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Group</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white px-6 py-2.5 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search groups by name or description…"
              className="w-full rounded-md border border-gray-200 bg-gray-50/50 pl-8 pr-3 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Main Table Surface */}
      <div className="flex-1 overflow-y-auto min-h-0 p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500 mb-2" />
            <p className="text-xs font-medium text-gray-500">Loading person groups…</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center shadow-2xs">
            <Layers className="h-10 w-10 text-gray-300 mb-3" />
            <h3 className="text-sm font-semibold text-gray-800">No person groups found</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm">
              {search
                ? 'Try adjusting your search query.'
                : 'Create your first Person Group to start grouping personnel for work and workflow routing.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={() => navigate('/people/groups/new')}
                className="mt-4 flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Group</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-xs">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="border-b border-gray-100 bg-gray-50/80 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-5 py-3">Group Name & Description</th>
                  <th scope="col" className="px-4 py-3">Group Type</th>
                  <th scope="col" className="px-4 py-3">Scope / Site</th>
                  <th scope="col" className="px-4 py-3 text-center">Members</th>
                  <th scope="col" className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groups.map((g) => (
                  <tr
                    key={g.group_name}
                    onClick={() => handleRowClick(g.group_name)}
                    className="group cursor-pointer hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Name & Description */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200">
                          {g.group_name[0] || 'G'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-gray-900 group-hover:text-blue-700 transition-colors truncate">
                              {g.group_name}
                            </span>
                          </div>
                          {g.description && (
                            <div className="text-xs text-gray-500 truncate max-w-sm">
                              {g.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Group Type */}
                    <td className="px-4 py-3.5">
                      {g.is_crew_work_group ? (
                        <span className="inline-flex items-center gap-1 rounded bg-gray-100 border border-gray-200/80 px-2 py-0.5 text-[10px] font-semibold text-gray-800">
                          <Shield className="h-2.5 w-2.5 text-gray-600" />
                          Crew Work Group
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-500">Standard Routing</span>
                      )}
                    </td>

                    {/* Scope / Site */}
                    <td className="px-4 py-3.5">
                      <div className="text-gray-700">
                        {g.use_for_site ? (
                          <span className="font-medium">Site: {g.use_for_site}</span>
                        ) : g.use_for_org ? (
                          <span className="font-medium">Org: {g.use_for_org}</span>
                        ) : (
                          <span className="text-gray-400 italic">Enterprise / Global</span>
                        )}
                      </div>
                    </td>

                    {/* Member Count */}
                    <td className="px-4 py-3.5 text-center">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-gray-700 border border-gray-200">
                        {g.member_count} {g.member_count === 1 ? 'member' : 'members'}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 group-hover:text-blue-700 transition-colors">
                        <span>Inspect</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
