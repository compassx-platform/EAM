import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Building2, Layers, Store, MapPin, ArrowRight, RefreshCw, X, AlertCircle } from 'lucide-react';
import { api } from '../../api/client';
import type { Organization, CompanySet } from '../../types';
import { InfoTooltip } from '../people/InfoTooltip';

interface OrganizationsViewProps {
  onSelectOrg: (orgId: string) => void;
  onNewOrg: () => void;
}

export const OrganizationsView: React.FC<OrganizationsViewProps> = ({
  onSelectOrg,
  onNewOrg,
}) => {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [sets, setSets] = useState<CompanySet[]>([]);
  const [search, setSearch] = useState('');
  const [selectedSet, setSelectedSet] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [loading, setLoading] = useState(true);

  // New Organization Quick Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newOrgId, setNewOrgId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSetId, setNewSetId] = useState('');
  const [newCurrency, setNewCurrency] = useState('USD');
  const [newClearing, setNewClearing] = useState('1990-000-00');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [orgsData, setsData] = await Promise.all([
        api.listOrganizations({
          search: search.trim() || undefined,
          company_set_id: selectedSet === 'ALL' ? undefined : selectedSet,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
        }),
        api.listCompanySets(),
      ]);
      setOrgs(orgsData);
      setSets(setsData);
      if (setsData.length > 0 && !newSetId) {
        setNewSetId(setsData[0].set_id);
      }
    } catch (err) {
      console.error('Failed to load organizations:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedSet, statusFilter, newSetId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgId.trim() || !newName.trim() || !newSetId) return;

    setCreating(true);
    setCreateError(null);
    try {
      await api.createOrganization({
        org_id: newOrgId.trim().toUpperCase(),
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        company_set_id: newSetId,
        base_currency_1: newCurrency.trim().toUpperCase() || 'USD',
        clearing_account: newClearing.trim() || undefined,
      });
      setIsNewModalOpen(false);
      setNewOrgId('');
      setNewName('');
      setNewDesc('');
      fetchData();
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create organization.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden bg-slate-50/50">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 bg-white px-6 py-3.5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-60 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Company Set Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-gray-500">Company Set:</span>
            <select
              value={selectedSet}
              onChange={(e) => setSelectedSet(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">All Sets</option>
              {sets.map((s) => (
                <option key={s.set_id} value={s.set_id}>
                  {s.set_id} ({s.description || s.set_id})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center rounded-lg border border-gray-200/80 bg-gray-100/80 p-0.5 text-xs">
            {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-white font-semibold text-gray-800 shadow-2xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            setIsNewModalOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>New Organization</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-xs text-gray-500">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Loading Organizations...
          </div>
        ) : orgs.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
            <Building2 className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-xs font-semibold text-gray-800">No Organizations Found</p>
            <p className="text-[11px] text-gray-500 mt-1 max-w-sm">
              Organizations represent independent legal entities, fiscal years, currencies, and business rules in Enterprise.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200/80 bg-white shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">Organization</th>
                  <th className="px-4 py-3">Company Set</th>
                  <th className="px-4 py-3">Base Currency</th>
                  <th className="px-4 py-3">Operational Sites</th>
                  <th className="px-4 py-3">Active Vendors</th>
                  <th className="px-4 py-3">Clearing Account</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {orgs.map((org) => (
                  <tr
                    key={org.org_id}
                    onClick={() => onSelectOrg(org.org_id)}
                    className="group cursor-pointer hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-gray-700 border border-gray-200/80">
                          <Building2 className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <div className="font-mono font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                            {org.org_id}
                          </div>
                          <div className="text-[11px] text-gray-500 font-medium">
                            {org.name}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] font-medium text-gray-700">
                        <Layers className="h-3 w-3 text-gray-400" />
                        {org.company_set_id}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-gray-800 shadow-2xs">
                        {org.base_currency_1}
                      </span>
                      {org.base_currency_2 && (
                        <span className="ml-1 font-mono text-[10px] text-gray-400">
                          / {org.base_currency_2}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        {org.sites_count || 0} Sites
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                        <Store className="h-3 w-3 text-gray-400" />
                        {org.companies_count || 0} Vendors
                      </span>
                    </td>

                    <td className="px-4 py-3 font-mono text-[11px] text-gray-600">
                      {org.clearing_account || '—'}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                          org.status === 'ACTIVE'
                            ? 'bg-slate-50 text-gray-700 border-gray-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200'
                        }`}
                      >
                        {org.status}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                        <span>Configure</span>
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Organization Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-sm font-bold text-gray-900">Create Organization</h3>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOrg} className="p-6 space-y-4">
              {createError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Organization ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. EAGLENA"
                    value={newOrgId}
                    onChange={(e) => setNewOrgId(e.target.value.toUpperCase())}
                    className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs uppercase text-gray-800 focus:border-blue-500 focus:outline-none"
                    required
                  />
                  <span className="text-[10px] text-gray-400">Uppercase identifier (ORG_ID)</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Organization Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Eagle North America"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. North American Manufacturing and Distribution"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Set Binding (Enterprise Rule: Mandatory and Immutable once active) */}
              <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="text-xs font-semibold text-gray-700">
                      Company Set <span className="text-red-500">*</span>
                    </label>
                    <InfoTooltip text="Rule: An organization must be bound to exactly one Company Set. This controls vendor sharing across legal entities." />
                  </div>
                  <select
                    value={newSetId}
                    onChange={(e) => setNewSetId(e.target.value)}
                    className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                    required
                  >
                    {sets.map((s) => (
                      <option key={s.set_id} value={s.set_id}>
                        {s.set_id} ({s.description || 'Set'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Base Currency <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
                    className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs uppercase text-gray-800 focus:border-blue-500 focus:outline-none"
                    required
                  />
                  <span className="text-[10px] text-gray-400">GL transaction currency (e.g. USD, EUR)</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  General Ledger Clearing Account
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1990-000-00"
                  value={newClearing}
                  onChange={(e) => setNewClearing(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
