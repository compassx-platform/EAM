import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  Store,
  Building2,
  Power,
  Edit2,
  Trash2,
  AlertCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import type { CompanyOrg, Organization, CompanyMaster } from '../../types';
import { InfoTooltip } from '../people/InfoTooltip';
import { CompanyOrgEditor } from './CompanyOrgEditor';

export const CompaniesView: React.FC = () => {
  const [companies, setCompanies] = useState<CompanyOrg[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');
  const [loading, setLoading] = useState(true);

  // Editor Modal
  const [editingCompany, setEditingCompany] = useState<{ orgId: string; comp: CompanyOrg } | null>(null);

  // Add Company to Organization Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addOrgId, setAddOrgId] = useState('');
  const [addCompany, setAddCompany] = useState('');
  const [addName, setAddName] = useState('');
  const [addPaymentTerms, setAddPaymentTerms] = useState('NET30');
  const [addFreightTerms, setAddFreightTerms] = useState('PREPAID');
  const [addFob, setAddFob] = useState('DESTINATION');
  const [addCustomerAccount, setAddCustomerAccount] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Company Master catalog selection state
  const [availableMasters, setAvailableMasters] = useState<CompanyMaster[]>([]);
  const [loadingMasters, setLoadingMasters] = useState(false);
  const [useManualCode, setUseManualCode] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const orgsData = await api.listOrganizations();
      setOrganizations(orgsData);
      if (orgsData.length > 0 && !addOrgId) {
        setAddOrgId(orgsData[0].org_id);
      }

      let compsData: CompanyOrg[] = [];
      if (selectedOrgId === 'ALL') {
        compsData = await api.listAllCompanies({
          search: search.trim() || undefined,
        });
      } else {
        compsData = await api.listOrgCompanies(selectedOrgId, {
          search: search.trim() || undefined,
          disabled: statusFilter === 'ALL' ? undefined : statusFilter === 'DISABLED',
        });
      }

      if (selectedOrgId === 'ALL' && statusFilter !== 'ALL') {
        compsData = compsData.filter((c) =>
          statusFilter === 'DISABLED' ? c.disabled : !c.disabled
        );
      }

      setCompanies(compsData);
    } catch (err) {
      console.error('Failed to load companies:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, search, statusFilter, addOrgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!isAddModalOpen || !addOrgId) return;
    const org = organizations.find((o) => o.org_id === addOrgId);
    if (!org) return;

    setLoadingMasters(true);
    api.listCompanyMasters({ company_set_id: org.company_set_id })
      .then((masters) => {
        setAvailableMasters(masters);
      })
      .catch((err) => {
        console.error('Failed to load company masters for set:', err);
      })
      .finally(() => {
        setLoadingMasters(false);
      });
  }, [isAddModalOpen, addOrgId, organizations]);

  const openAddModal = () => {
    setAddError(null);
    if (selectedOrgId !== 'ALL') {
      setAddOrgId(selectedOrgId);
    } else if (organizations.length > 0 && !addOrgId) {
      setAddOrgId(organizations[0].org_id);
    }
    setAddCompany('');
    setAddName('');
    setUseManualCode(false);
    setIsAddModalOpen(true);
  };

  const handleToggleDisabled = async (orgId: string, company: string, currentDisabled: boolean) => {
    try {
      await api.updateCompanyOrg(orgId, company, { disabled: !currentDisabled });
      setCompanies((prev) =>
        prev.map((c) =>
          c.org_id === orgId && c.company === company ? { ...c, disabled: !currentDisabled } : c
        )
      );
    } catch (err: any) {
      alert(err?.message || 'Failed to toggle vendor status.');
    }
  };

  const handleRemoveCompany = async (orgId: string, company: string) => {
    if (!confirm(`Are you sure you want to remove vendor '${company}' from organization '${orgId}'?`)) {
      return;
    }
    try {
      await api.removeCompanyFromOrganization(orgId, company);
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Failed to remove company.');
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addOrgId || !addCompany.trim()) return;

    setAdding(true);
    setAddError(null);

    try {
      await api.addCompanyToOrganization(addOrgId, {
        company: addCompany.trim().toUpperCase(),
        name: addName.trim() || undefined,
        payment_terms: addPaymentTerms,
        freight_terms: addFreightTerms,
        fob: addFob,
        customer_account_num: addCustomerAccount.trim() || undefined,
      });
      setIsAddModalOpen(false);
      setAddCompany('');
      setAddName('');
      setAddCustomerAccount('');
      fetchData();
    } catch (err: any) {
      setAddError(err?.message || 'Failed to add company to organization.');
    } finally {
      setAdding(false);
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
              placeholder="Search active vendors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-60 rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Org Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-gray-500">Organization:</span>
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">All Organizations</option>
              {organizations.map((org) => (
                <option key={org.org_id} value={org.org_id}>
                  {org.org_id} ({org.name})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center rounded-lg border border-gray-200/80 bg-gray-100/80 p-0.5 text-xs">
            {(['ALL', 'ACTIVE', 'DISABLED'] as const).map((s) => (
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
          onClick={openAddModal}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>Add Company to Org</span>
        </button>
      </div>

      {/* Main Table View */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-xs text-gray-500">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Loading active companies...
          </div>
        ) : companies.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
            <Store className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-xs font-semibold text-gray-800">No Companies Found</p>
            <p className="text-[11px] text-gray-500 mt-1 max-w-sm">
              Companies at the organization level inherit from Company Sets and maintain local payment terms, currency, and local disabled status.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200/80 bg-white shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3">Organization</th>
                  <th className="px-4 py-3">Company Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Payment Terms</th>
                  <th className="px-4 py-3">Freight & FOB</th>
                  <th className="px-4 py-3">Currency</th>
                  <th className="px-4 py-3">Account #</th>
                  <th className="px-4 py-3">Local Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {companies.map((c) => (
                  <tr key={`${c.org_id}-${c.company}`} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] font-bold text-gray-800">
                        <Building2 className="h-3 w-3 text-gray-500" />
                        {c.org_id}
                      </span>
                    </td>

                    <td className="px-4 py-3 font-mono font-bold text-gray-900">
                      {c.company}
                    </td>

                    <td className="px-4 py-3 font-medium text-gray-800">
                      {c.name}
                    </td>

                    <td className="px-4 py-3 font-mono text-[11px]">
                      {c.payment_terms}
                    </td>

                    <td className="px-4 py-3 text-[11px] text-gray-600">
                      {c.freight_terms} · {c.fob}
                    </td>

                    <td className="px-4 py-3 font-mono text-[11px]">
                      {c.currency_code}
                    </td>

                    <td className="px-4 py-3 font-mono text-[11px] text-gray-500">
                      {c.customer_account_num || '—'}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                          c.disabled
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            c.disabled ? 'bg-amber-500' : 'bg-gray-400'
                          }`}
                        />
                        <span>{c.disabled ? 'Disabled in Org' : 'Active'}</span>
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleDisabled(c.org_id, c.company, c.disabled)}
                          title={c.disabled ? 'Enable in this Org' : 'Disable in this Org (Local Disable)'}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            c.disabled
                              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              : 'text-amber-700 hover:bg-amber-50'
                          }`}
                        >
                          <Power className="h-3 w-3" />
                          <span>{c.disabled ? 'Re-enable' : 'Disable'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingCompany({ orgId: c.org_id, comp: c })}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                          title="Edit Local Terms"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveCompany(c.org_id, c.company)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Remove from Org"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      {/* Edit Local Terms Modal */}
      {editingCompany && (
        <CompanyOrgEditor
          isOpen={Boolean(editingCompany)}
          onClose={() => setEditingCompany(null)}
          orgId={editingCompany.orgId}
          companyOrg={editingCompany.comp}
          onSuccess={fetchData}
        />
      )}

      {/* Add Company to Organization Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-sm font-bold text-gray-900">
                Add Company to Organization 
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddCompany} className="p-6 space-y-4">
              {addError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{addError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Target Organization <span className="text-red-500">*</span>
                </label>
                <select
                  value={addOrgId}
                  onChange={(e) => setAddOrgId(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  required
                >
                  {organizations.map((org) => (
                    <option key={org.org_id} value={org.org_id}>
                      {org.org_id} — {org.name} (Set: {org.company_set_id})
                    </option>
                  ))}
                </select>
              </div>

              {!useManualCode ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-700">
                      Company Master <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setUseManualCode(true);
                        setAddCompany('');
                        setAddName('');
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      + Enter custom code
                    </button>
                  </div>

                  <select
                    value={addCompany}
                    onChange={(e) => {
                      const sel = availableMasters.find((m) => m.company === e.target.value);
                      setAddCompany(e.target.value);
                      setAddName(sel?.name || '');
                    }}
                    className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                    required
                  >
                    <option value="">
                      {loadingMasters
                        ? 'Loading company catalog...'
                        : availableMasters.length === 0
                        ? 'No Company Masters found in set'
                        : '— Select a Company Master —'}
                    </option>
                    {availableMasters.map((m) => {
                      const isAlreadyAdded = companies.some(
                        (c) => c.org_id === addOrgId && c.company === m.company
                      );
                      return (
                        <option key={m.company} value={m.company} disabled={isAlreadyAdded}>
                          {m.company} {m.name ? `— ${m.name}` : ''} {isAlreadyAdded ? ' (Already in Org)' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">
                      From Company Set '{organizations.find((o) => o.org_id === addOrgId)?.company_set_id}'
                    </span>
                    {availableMasters.length === 0 && !loadingMasters && (
                      <span className="text-[10px] text-amber-600 font-medium">
                        Create in Company Master first or switch to custom code
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-gray-700">
                      Manual Company Code Entry
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setUseManualCode(false);
                        setAddCompany('');
                        setAddName('');
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    >
                      ← Select from Master Catalog
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Company Code <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. GRAINGER"
                        value={addCompany}
                        onChange={(e) => setAddCompany(e.target.value.toUpperCase())}
                        className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs uppercase text-gray-800 focus:border-blue-500 focus:outline-none"
                        required
                      />
                      <span className="text-[10px] text-gray-400">Must exist in Company Set or auto-add enabled</span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Company Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. W.W. Grainger, Inc."
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 border-t border-gray-100 pt-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Payment Terms
                  </label>
                  <select
                    value={addPaymentTerms}
                    onChange={(e) => setAddPaymentTerms(e.target.value)}
                    className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="NET30">Net 30</option>
                    <option value="NET60">Net 60</option>
                    <option value="NET45">Net 45</option>
                    <option value="2/10 NET 30">2/10 Net 30</option>
                    <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Freight Terms
                  </label>
                  <select
                    value={addFreightTerms}
                    onChange={(e) => setAddFreightTerms(e.target.value)}
                    className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="PREPAID">Prepaid</option>
                    <option value="COLLECT">Collect</option>
                    <option value="THIRD_PARTY">Third Party</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    FOB Point
                  </label>
                  <select
                    value={addFob}
                    onChange={(e) => setAddFob(e.target.value)}
                    className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="DESTINATION">Destination</option>
                    <option value="ORIGIN">Origin</option>
                    <option value="SHIPPING_POINT">Shipping Point</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Customer Account # (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. ACT-GRA-9901"
                  value={addCustomerAccount}
                  onChange={(e) => setAddCustomerAccount(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {adding ? 'Adding...' : 'Add to Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
