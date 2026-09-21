import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, UserCheck, Users, Layers, Shield, ArrowRight, Loader2, RefreshCw, Filter, AtSign, Database, User, Users2, Info } from 'lucide-react';
import { api } from '../../api/client';
import type { WorkflowRole, RoleType } from '../../types';
import { navigate } from '../../lib/router';
import { InfoTooltip } from '../people/InfoTooltip';

interface RolesViewProps {
  onSelectRole?: (roleId: string) => void;
}

const ROLE_TYPE_ICONS: Record<RoleType, typeof User> = {
  PERSON: User,
  PERSON_GROUP: Users2,
  DATASET_ATTRIBUTE: Database,
  EMAIL_ADDRESS: AtSign,
};

const ROLE_TYPE_LABELS: Record<RoleType, string> = {
  PERSON: 'Person',
  PERSON_GROUP: 'Person Group',
  DATASET_ATTRIBUTE: 'Dataset Attribute',
  EMAIL_ADDRESS: 'Email Address',
};

export const RolesView: React.FC<RolesViewProps> = ({ onSelectRole }) => {
  const [roles, setRoles] = useState<WorkflowRole[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | RoleType>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRoles = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await api.listRoles(
        search.trim() || undefined,
        typeFilter === 'ALL' ? undefined : typeFilter
      );
      setRoles(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to load roles:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRoles();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchRoles]);

  const handleRowClick = (roleId: string) => {
    if (onSelectRole) {
      onSelectRole(roleId);
    } else {
      navigate(`/people/roles/${encodeURIComponent(roleId)}`);
    }
  };

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden bg-slate-50/50">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/80 bg-white px-6 py-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-700 border border-gray-200/80 shadow-2xs">
            <UserCheck className="h-5 w-5 text-gray-700" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-bold text-gray-900 tracking-tight">Roles & Routing</h1>
              <InfoTooltip text="Dynamic recipient resolvers modeled after IBM Maximo MAXROLE. Roles decouple workflow assignments and tasks from hardcoded persons, dynamically evaluating recipients via Persons, Person Groups, or Record Attributes with calendar availability and delegation awareness." />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {total} dynamic {total === 1 ? 'role' : 'roles'} configured · Task assignment & notification engine
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2.5">
          {/* Segmented View Switcher: People vs Groups vs Roles */}
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
              onClick={() => navigate('/people/groups')}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <Layers className="h-3.5 w-3.5 text-gray-500" />
              <span>Person Groups</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 shadow-xs"
            >
              <UserCheck className="h-3.5 w-3.5 text-gray-700" />
              <span>Roles</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchRoles(true)}
            disabled={refreshing}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors shadow-2xs"
            title="Refresh list"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-gray-700' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => navigate('/people/roles/new')}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Role</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 bg-white/70 px-6 py-2.5 backdrop-blur-xs shrink-0">
        {/* Search */}
        <div className="relative min-w-[260px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by role ID, name, person, or group…"
            className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>

        {/* Role Type Filter Pills */}
        <div className="flex items-center gap-1">
          {(['ALL', 'PERSON', 'PERSON_GROUP', 'DATASET_ATTRIBUTE', 'EMAIL_ADDRESS'] as const).map((t) => {
            const active = typeFilter === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {t === 'ALL' ? 'All Types' : ROLE_TYPE_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Role Cards List / Table Area */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {loading && !refreshing ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : roles.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white/50 p-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-400 mb-3">
              <UserCheck className="h-5 w-5 text-gray-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">No roles found</h3>
            <p className="mt-1 max-w-sm text-xs text-gray-500">
              {search || typeFilter !== 'ALL'
                ? 'Try adjusting your search filters.'
                : 'Create your first dynamic workflow role to assign tasks and notifications.'}
            </p>
            {(!search && typeFilter === 'ALL') && (
              <button
                type="button"
                onClick={() => navigate('/people/roles/new')}
                className="mt-4 flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Role</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {roles.map((role) => {
              const Icon = ROLE_TYPE_ICONS[role.role_type] || User;
              const typeLabel = ROLE_TYPE_LABELS[role.role_type] || role.role_type;

              let targetSummary = 'Unconfigured';
              if (role.role_type === 'PERSON') {
                targetSummary = role.person_name ? `${role.person_name} (${role.person_id})` : role.person_id || '—';
              } else if (role.role_type === 'PERSON_GROUP') {
                const strat = role.resolution_strategy === 'sequence_first_available' ? 'Sequence' : role.resolution_strategy === 'default_member' ? 'Default' : 'Broadcast';
                targetSummary = `${role.group_name || '—'} · ${strat}`;
              } else if (role.role_type === 'DATASET_ATTRIBUTE') {
                targetSummary = `Field: ${role.field_name || '—'}`;
              } else if (role.role_type === 'EMAIL_ADDRESS') {
                targetSummary = role.email_address || '—';
              }

              return (
                <div
                  key={role.id}
                  onClick={() => handleRowClick(role.id)}
                  className="group flex flex-col justify-between rounded-xl border border-gray-200/80 bg-white p-4 shadow-2xs hover:border-gray-300 hover:shadow-xs transition-all cursor-pointer"
                >
                  <div>
                    {/* Top Row: Icon, Role ID, Type Pill */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-600 border border-gray-200/60">
                          <Icon className="h-3.5 w-3.5 text-gray-700" />
                        </div>
                        <div>
                          <span className="font-mono text-[11px] font-bold text-gray-800 tracking-tight">
                            {role.id}
                          </span>
                        </div>
                      </div>
                      <span className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-200/60">
                        {typeLabel}
                      </span>
                    </div>

                    {/* Role Name & Description */}
                    <h3 className="mt-2 text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {role.name}
                    </h3>
                    {role.description && (
                      <p className="mt-0.5 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                        {role.description}
                      </p>
                    )}
                  </div>

                  {/* Target Summary Footer */}
                  <div className="mt-3.5 flex items-center justify-between border-t border-gray-100 pt-2.5 text-[11px] text-gray-500">
                    <div className="flex items-center gap-1 truncate">
                      <span className="text-gray-400">Target:</span>
                      <span className="font-medium text-gray-700 truncate">{targetSummary}</span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
