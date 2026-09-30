import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Layers, Building2, Store, ArrowRight, ShieldCheck, Check, AlertCircle, RefreshCw, X } from 'lucide-react';
import { api } from '../../api/client';
import type { CompanySet } from '../../types';
import { InfoTooltip } from '../people/InfoTooltip';

interface CompanySetsViewProps {
  onSelectSet: (setId: string) => void;
}

export const CompanySetsView: React.FC<CompanySetsViewProps> = ({ onSelectSet }) => {
  const [sets, setSets] = useState<CompanySet[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [loading, setLoading] = useState(true);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  // New set modal state
  const [newSetId, setNewSetId] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAutoAdd, setNewAutoAdd] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchSets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listCompanySets({
        search: search.trim() || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      });
      setSets(res);
    } catch (err) {
      console.error('Failed to load company sets:', err);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchSets();
  }, [fetchSets]);

  const handleCreateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetId.trim()) return;

    setCreating(true);
    setCreateError(null);
    try {
      await api.createCompanySet({
        set_id: newSetId.trim().toUpperCase(),
        description: newDesc.trim() || undefined,
        auto_add_companies: newAutoAdd,
      });
      setIsNewModalOpen(false);
      setNewSetId('');
      setNewDesc('');
      setNewAutoAdd(false);
      fetchSets();
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create company set.');
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
              placeholder="Search company sets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-64 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </div>

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
          <span>New Company Set</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-xs text-gray-500">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Loading Company Sets...
          </div>
        ) : sets.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
            <Layers className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-xs font-semibold text-gray-800">No Company Sets Found</p>
            <p className="text-[11px] text-gray-500 mt-1 max-w-sm">
              Company Sets govern how vendor catalogs are partitioned and shared across organizations in Enterprise.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sets.map((set) => (
              <div
                key={set.set_id}
                onClick={() => onSelectSet(set.set_id)}
                className="group cursor-pointer rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-gray-700 border border-gray-200/80">
                        <Layers className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-mono text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {set.set_id}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                        set.status === 'ACTIVE'
                          ? 'bg-slate-50 text-gray-700 border-gray-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}
                    >
                      {set.status}
                    </span>
                  </div>

                  <p className="mt-2.5 text-xs text-gray-600 line-clamp-2">
                    {set.description || 'No description provided.'}
                  </p>

                  {/* Auto-Add Companies Rule badge */}
                  <div className="mt-3.5 flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium border ${
                        set.auto_add_companies
                          ? 'bg-blue-50/80 text-blue-800 border-blue-200'
                          : 'bg-gray-100 text-gray-700 border-gray-200'
                      }`}
                    >
                      <ShieldCheck className="h-3 w-3" />
                      <span>
                        {set.auto_add_companies ? 'Auto-Add to Master: ON' : 'Strict Governance (Master Required)'}
                      </span>
                    </span>
                    <InfoTooltip
                      text={
                        set.auto_add_companies
                          ? "'Automatically Add Companies to Company Master' is active. Creating vendors in local organizations automatically populates this master set."
                          : "Strict Governance mode. Vendors cannot be added to organizations unless they already exist in this Company Master set."
                      }
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-medium text-gray-700">
                      <Building2 className="h-3.5 w-3.5 text-gray-400" />
                      {set.organizations_count || 0} Orgs
                    </span>
                    <span className="flex items-center gap-1 font-medium text-gray-700">
                      <Store className="h-3.5 w-3.5 text-gray-400" />
                      {set.companies_count || 0} Masters
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                    <span>Manage Set</span>
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Company Set Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-sm font-bold text-gray-900">Create Company Set</h3>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSet} className="p-6 space-y-4">
              {createError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Company Set ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. GLOBAL_SET"
                  value={newSetId}
                  onChange={(e) => setNewSetId(e.target.value.toUpperCase())}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs uppercase text-gray-800 focus:border-blue-500 focus:outline-none"
                  required
                />
                <span className="text-[10px] text-gray-400">Uppercase identifier (SET_ID)</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Global Enterprise Vendor Master"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Enterprise Auto Add Companies Flag */}
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAutoAdd}
                    onChange={(e) => setNewAutoAdd(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-0"
                  />
                  <div>
                    <span className="text-xs font-semibold text-gray-800">
                      Automatically Add Companies to Company Master
                    </span>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-normal">
                      When enabled, creating a company in any organization will automatically register it in the Company Master.
                    </p>
                  </div>
                </label>
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
                  {creating ? 'Creating...' : 'Create Company Set'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
