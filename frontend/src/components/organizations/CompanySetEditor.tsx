import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Layers,
  Building2,
  Store,
  Plus,
  Trash2,
  Edit2,
  Send,
  Globe,
  Phone,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../api/client';
import type { CompanySet, CompanyMaster, Organization } from '../../types';
import { InfoTooltip } from '../people/InfoTooltip';
import { CompanyMasterEditor } from './CompanyMasterEditor';
import { AddCompanyToOrgModal } from './AddCompanyToOrgModal';

interface CompanySetEditorProps {
  setId: string;
  onBack: () => void;
}

export const CompanySetEditor: React.FC<CompanySetEditorProps> = ({ setId, onBack }) => {
  const [set, setSet] = useState<CompanySet | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [masters, setMasters] = useState<CompanyMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'masters' | 'orgs' | 'settings'>('masters');

  // Master editor modal
  const [selectedMaster, setSelectedMaster] = useState<CompanyMaster | null>(null);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);

  // Add to orgs modal
  const [rolloutCompany, setRolloutCompany] = useState<CompanyMaster | null>(null);
  const [isRolloutOpen, setIsRolloutOpen] = useState(false);

  // Form fields for Settings tab
  const [description, setDescription] = useState('');
  const [autoAddCompanies, setAutoAddCompanies] = useState(false);
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [setData, mastersData, orgsData] = await Promise.all([
        api.getCompanySet(setId),
        api.listCompanyMasters({ company_set_id: setId }),
        api.listOrganizations({ company_set_id: setId }),
      ]);
      setSet(setData);
      setDescription(setData.description || '');
      setAutoAddCompanies(setData.auto_add_companies);
      setStatus(setData.status);
      setMasters(mastersData);
      setOrganizations(orgsData);
    } catch (err: any) {
      setError(err?.message || 'Failed to load company set details.');
    } finally {
      setLoading(false);
    }
  }, [setId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const updated = await api.updateCompanySet(setId, {
        description: description.trim() || undefined,
        auto_add_companies: autoAddCompanies,
        status,
      });
      setSet(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update company set.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMaster = async (company: string) => {
    if (!confirm(`Are you sure you want to delete Company Master '${company}'?`)) return;
    try {
      await api.deleteCompanyMaster(setId, company);
      loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete company master.');
    }
  };

  const handleDeleteSet = async () => {
    if (!confirm(`Are you sure you want to delete Company Set '${setId}'?`)) return;
    try {
      await api.deleteCompanySet(setId);
      onBack();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete company set.');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Loading Company Set {setId}...
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col min-h-0 overflow-hidden bg-slate-50/50">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/80 bg-white px-6 py-3.5 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-gray-700 border border-gray-200/80">
              <Layers className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-mono text-sm font-bold text-gray-900">{setId}</h1>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                    set?.status === 'ACTIVE'
                      ? 'bg-slate-50 text-gray-700 border-gray-200'
                      : 'bg-gray-100 text-gray-500 border-gray-200'
                  }`}
                >
                  {set?.status}
                </span>
              </div>
              <p className="text-[11px] text-gray-500">{set?.description || 'Company Set'}</p>
            </div>
          </div>
        </div>

        {/* Tab Switcher & Actions */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center rounded-lg border border-gray-200/80 bg-gray-100/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('masters')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTab === 'masters'
                  ? 'bg-white font-semibold text-gray-900 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Store className="h-3.5 w-3.5" />
              <span>Company Master ({masters.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('orgs')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTab === 'orgs'
                  ? 'bg-white font-semibold text-gray-900 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Assigned Orgs ({organizations.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTab === 'settings'
                  ? 'bg-white font-semibold text-gray-900 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Governance Settings</span>
            </button>
          </div>

          {activeTab === 'masters' && (
            <button
              type="button"
              onClick={() => {
                setSelectedMaster(null);
                setIsMasterModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>New Company Master</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {activeTab === 'masters' && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Set-Level Company Master Catalog (COMPMASTER)
                </h2>
                <p className="text-[11px] text-gray-500">
                  Vendors, manufacturers, and couriers shared by organizations linked to this set.
                </p>
              </div>
            </div>

            {masters.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
                <Store className="h-7 w-7 text-gray-400 mb-2" />
                <p className="text-xs font-semibold text-gray-800">No Company Master Records</p>
                <p className="text-[11px] text-gray-500 mt-1 max-w-sm">
                  Add master companies to this set so they can be authorized and shared across member organizations.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMaster(null);
                    setIsMasterModalOpen(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-gray-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create First Master</span>
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200/80 bg-white shadow-xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Currency</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700">
                    {masters.map((m) => (
                      <tr key={m.company} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-gray-900">
                          {m.company}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">
                          <div>{m.name}</div>
                          {m.homepage && (
                            <a
                              href={m.homepage}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline"
                            >
                              <span>{m.homepage.replace(/^https?:\/\//, '')}</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                            {m.type === 'V'
                              ? 'Vendor'
                              : m.type === 'M'
                              ? 'Manufacturer'
                              : m.type === 'C'
                              ? 'Courier'
                              : m.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          {m.currency_code}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-gray-500">
                          {[m.city, m.country].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              m.status === 'ACTIVE'
                                ? 'bg-slate-50 text-gray-700 border border-gray-200'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Enterprise Action: Add Companies to Organization */}
                            <button
                              type="button"
                              onClick={() => {
                                setRolloutCompany(m);
                                setIsRolloutOpen(true);
                              }}
                              title="Roll out to Organizations (Action)"
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-blue-700 shadow-2xs hover:bg-blue-50 transition-colors"
                            >
                              <Send className="h-3 w-3" />
                              <span>Roll Out</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMaster(m);
                                setIsMasterModalOpen(true);
                              }}
                              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                              title="Edit Master"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteMaster(m.company)}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Delete Master"
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
        )}

        {activeTab === 'orgs' && (
          <div>
            <div className="mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Organizations Bound to Company Set ({organizations.length})
              </h2>
              <p className="text-[11px] text-gray-500">
                These organizations share this vendor catalog. Each organization maintains its own local commercial terms and disabled status.
              </p>
            </div>

            {organizations.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
                <Building2 className="h-7 w-7 text-gray-400 mb-2" />
                <p className="text-xs font-semibold text-gray-800">No Organizations Assigned</p>
                <p className="text-[11px] text-gray-500 mt-1 max-w-sm">
                  Assign this Company Set when creating or configuring an Organization.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {organizations.map((org) => (
                  <div
                    key={org.org_id}
                    className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 border border-gray-200/80">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-gray-900">{org.org_id}</span>
                          <span className="text-xs font-medium text-gray-700">· {org.name}</span>
                        </div>
                        <p className="text-[11px] text-gray-500">
                          Base Currency: <span className="font-mono font-semibold">{org.base_currency_1}</span> · {org.sites_count || 0} Sites · {org.companies_count || 0} Active Vendors
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                        org.status === 'ACTIVE'
                          ? 'bg-slate-50 text-gray-700 border-gray-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}
                    >
                      {org.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-xl rounded-xl border border-gray-200/80 bg-white p-6 shadow-xs">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
              Company Set Governance Settings
            </h2>
            <p className="text-[11px] text-gray-500 mb-5">
              Configure Enterprise catalog behavior and automatic vendor registration rules.
            </p>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              {saveSuccess && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
                  <span>Settings updated successfully.</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Company Set ID
                </label>
                <input
                  type="text"
                  disabled
                  value={setId}
                  className="w-full rounded border border-gray-200 bg-gray-100 px-3 py-1.5 font-mono text-xs text-gray-700 cursor-not-allowed"
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
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Enterprise Auto Add Companies Flag */}
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-3.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoAddCompanies}
                    onChange={(e) => setAutoAddCompanies(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-0"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-gray-900">
                        Automatically Add Companies to Company Master
                      </span>
                      <InfoTooltip text="Rule: When checked, creating a vendor in any organization automatically creates the master record at Set level. When unchecked, vendors must exist in Company Master first." />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 leading-normal">
                      When unchecked, organizations in this set operate in strict governance mode, rejecting any vendor not already present in the master list.
                    </p>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Lifecycle Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={handleDeleteSet}
                  className="text-xs font-medium text-red-600 hover:text-red-700"
                >
                  Delete Company Set
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Company Master Editor Modal */}
      {isMasterModalOpen && (
        <CompanyMasterEditor
          isOpen={isMasterModalOpen}
          onClose={() => setIsMasterModalOpen(false)}
          companySetId={setId}
          companyMaster={selectedMaster}
          onSuccess={loadData}
        />
      )}

      {/* Roll Out to Organizations Modal */}
      {isRolloutOpen && rolloutCompany && (
        <AddCompanyToOrgModal
          isOpen={isRolloutOpen}
          onClose={() => setIsRolloutOpen(false)}
          company={rolloutCompany}
          organizations={organizations}
          onSuccess={loadData}
        />
      )}
    </div>
  );
};
