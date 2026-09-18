import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Users, UserCheck, Shield, ArrowRight, Loader2, RefreshCw, Filter, Layers } from 'lucide-react';
import { api } from '../../api/client';
import type { Person } from '../../types';
import { navigate } from '../../lib/router';
import { InfoTooltip } from './InfoTooltip';

interface PeopleViewProps {
  onSelectPerson?: (personId: string) => void;
}

export const PeopleView: React.FC<PeopleViewProps> = ({ onSelectPerson }) => {
  const [persons, setPersons] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPersons = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.listPersons({
        search: search.trim() || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        limit: 100,
      });
      setPersons(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to load persons:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPersons();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchPersons]);

  const handleRowClick = (personId: string) => {
    if (onSelectPerson) {
      onSelectPerson(personId);
    } else {
      navigate(`/people/${encodeURIComponent(personId)}`);
    }
  };

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden bg-slate-50/50">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/80 bg-white px-6 py-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700 border border-gray-200/80 shadow-2xs">
            <Users className="h-5 w-5 text-gray-700" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-bold text-gray-900 tracking-tight">People Directory</h1>
              <InfoTooltip text="Master human identities modeled after IBM Maximo PERSON. System identities decouple work assignments, supervisor escalations, and login credentials." />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {total} system {total === 1 ? 'identity' : 'identities'} registered · Master data system of record
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2.5">
          {/* Segmented View Switcher: People vs Groups */}
          <div className="flex items-center rounded-lg border border-gray-200/80 bg-gray-100/80 p-0.5 shadow-2xs">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 shadow-xs"
            >
              <Users className="h-3.5 w-3.5 text-gray-700" />
              <span>People</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/people/groups')}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <Layers className="h-3.5 w-3.5 text-gray-500" />
              <span>Person Groups</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchPersons(true)}
            disabled={refreshing}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors shadow-2xs"
            title="Refresh list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => navigate('/people/new')}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 hover:bg-black px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Person</span>
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
              placeholder="Search by ID, name, or email…"
              className="w-full rounded-md border border-gray-200 bg-gray-50/50 pl-8 pr-3 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Filter className="h-3 w-3 text-gray-400" />
            <span>Status:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">ACTIVE only</option>
            <option value="INACTIVE">INACTIVE only</option>
          </select>
        </div>
      </div>

      {/* Main Table Surface */}
      <div className="flex-1 overflow-y-auto min-h-0 p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500 mb-2" />
            <p className="text-xs font-medium text-gray-500">Loading people directory…</p>
          </div>
        ) : persons.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center shadow-2xs">
            <Users className="h-10 w-10 text-gray-300 mb-3" />
            <h3 className="text-sm font-semibold text-gray-800">No persons found</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm">
              {search || statusFilter !== 'ALL'
                ? 'Try adjusting your search query or status filter.'
                : 'Create your first system Person identity to start managing personnel.'}
            </p>
            {!search && statusFilter === 'ALL' && (
              <button
                type="button"
                onClick={() => navigate('/people/new')}
                className="mt-4 flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Person</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-xs">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="border-b border-gray-100 bg-gray-50/80 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th scope="col" className="px-5 py-3">Person ID & Name</th>
                  <th scope="col" className="px-4 py-3">Contact</th>
                  <th scope="col" className="px-4 py-3">Site / Shift</th>
                  <th scope="col" className="px-4 py-3">Supervisor</th>
                  <th scope="col" className="px-4 py-3">Linked User & Roles</th>
                  <th scope="col" className="px-4 py-3 text-center">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {persons.map((p) => {
                  const isActive = p.status === 'ACTIVE';
                  return (
                    <tr
                      key={p.person_id}
                      onClick={() => handleRowClick(p.person_id)}
                      className="group cursor-pointer hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Identity & Display Name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                            isActive ? 'bg-gray-100 text-gray-800 border border-gray-200' : 'bg-gray-50 text-gray-400 border border-gray-100'
                          }`}>
                            {p.first_name?.[0] || p.display_name[0] || 'P'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate">
                                {p.display_name}
                              </span>
                            </div>
                            <div className="font-mono text-[10px] text-gray-400 tracking-wider">
                              {p.person_id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3.5">
                        <div className="text-gray-700 truncate max-w-[180px]" title={p.primary_email || ''}>
                          {p.primary_email || <span className="text-gray-400 italic">No email</span>}
                        </div>
                        {p.phone && (
                          <div className="text-[11px] text-gray-400">{p.phone}</div>
                        )}
                      </td>

                      {/* Site / Shift */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-800">{p.site || 'HQ'}</span>
                          {p.primary_shift && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.2 text-[10px] font-medium text-gray-600">
                              {p.primary_shift}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Supervisor */}
                      <td className="px-4 py-3.5">
                        {p.supervisor_id ? (
                          <span className="font-mono text-xs text-gray-700 font-medium">
                            {p.supervisor_id}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px] italic">—</span>
                        )}
                      </td>

                      {/* Linked User / Roles */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {p.user_id ? (
                            <span className="flex items-center gap-1 text-[11px] text-gray-600 font-medium" title={p.user_id}>
                              <UserCheck className="h-3 w-3 text-gray-500" />
                              <span className="truncate max-w-[110px]">{p.user_id.split('@')[0]}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">No login user</span>
                          )}
                          {(p.linked_roles || []).map((r) => (
                            <span
                              key={r}
                              className="inline-flex items-center gap-0.5 rounded bg-gray-100 border border-gray-200/80 px-1.5 py-0.2 text-[10px] font-medium text-gray-700"
                            >
                              <Shield className="h-2.5 w-2.5 text-gray-500" />
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                            isActive
                              ? 'bg-gray-100 text-gray-800 border-gray-200'
                              : 'bg-gray-50 text-gray-400 border-gray-200'
                          }`}
                        >
                          {p.status}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
