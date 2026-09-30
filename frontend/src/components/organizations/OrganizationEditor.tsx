import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Building2,
  MapPin,
  Store,
  Sliders,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  RefreshCw,
  Power,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../../api/client';
import type { Organization, Site, CompanyOrg, CompanySet } from '../../types';
import { InfoTooltip } from '../people/InfoTooltip';

interface OrganizationEditorProps {
  orgId: string;
  onBack: () => void;
  onNavigateToCompany?: (company: string) => void;
}

export const OrganizationEditor: React.FC<OrganizationEditorProps> = ({
  orgId,
  onBack,
  onNavigateToCompany,
}) => {
  const [org, setOrg] = useState<Organization | null>(null);
  const [sets, setSets] = useState<CompanySet[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [companies, setCompanies] = useState<CompanyOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'sites' | 'options' | 'companies'>('general');

  // General Form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [companySetId, setCompanySetId] = useState('');
  const [itemSetId, setItemSetId] = useState('ITEMSET1');
  const [baseCurrency1, setBaseCurrency1] = useState('USD');
  const [baseCurrency2, setBaseCurrency2] = useState('');
  const [clearingAccount, setClearingAccount] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Options
  const [poPrefix, setPoPrefix] = useState('PO-');
  const [poTolerance, setPoTolerance] = useState(10.0);
  const [poAutoClose, setPoAutoClose] = useState(true);
  const [taxOnFreight, setTaxOnFreight] = useState(false);

  const [invCostingMethod, setInvCostingMethod] = useState<'AVERAGE' | 'STANDARD' | 'FIFO' | 'LIFO'>('AVERAGE');
  const [allowNegativeBalance, setAllowNegativeBalance] = useState(false);
  const [abcBreakA, setAbcBreakA] = useState(80);
  const [abcBreakB, setAbcBreakB] = useState(15);

  const [woPrefix, setWoPrefix] = useState('WO-');
  const [woHistoryEditing, setWoHistoryEditing] = useState(true);
  const [woRequireDates, setWoRequireDates] = useState(true);
  const [woTrackDowntime, setWoTrackDowntime] = useState(true);

  // New Site Modal
  const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
  const [newSiteId, setNewSiteId] = useState('');
  const [newSiteName, setNewSiteName] = useState('');
  const [siteCreating, setSiteCreating] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [orgData, setsData, sitesData, compsData] = await Promise.all([
        api.getOrganization(orgId),
        api.listCompanySets(),
        api.listSites(orgId),
        api.listOrgCompanies(orgId),
      ]);
      setOrg(orgData);
      setSets(setsData);
      setSites(sitesData);
      setCompanies(compsData);

      setName(orgData.name);
      setDescription(orgData.description || '');
      setCompanySetId(orgData.company_set_id);
      setItemSetId(orgData.item_set_id);
      setBaseCurrency1(orgData.base_currency_1);
      setBaseCurrency2(orgData.base_currency_2 || '');
      setClearingAccount(orgData.clearing_account || '');
      setStatus(orgData.status);

      // Options
      const po = orgData.purchasing_options || {};
      setPoPrefix(po.po_autonumber_prefix || 'PO-');
      setPoTolerance(po.receiving_tolerance_percent ?? 10.0);
      setPoAutoClose(po.auto_close_po ?? true);
      setTaxOnFreight(po.tax_on_freight ?? false);

      const inv = orgData.inventory_options || {};
      setInvCostingMethod(inv.costing_method || 'AVERAGE');
      setAllowNegativeBalance(inv.allow_negative_balance ?? false);
      setAbcBreakA(inv.abc_break_a ?? 80);
      setAbcBreakB(inv.abc_break_b ?? 15);

      const wo = orgData.work_order_options || {};
      setWoPrefix(wo.wo_autonumber_prefix || 'WO-');
      setWoHistoryEditing(wo.allow_history_editing ?? true);
      setWoRequireDates(wo.require_actual_dates_on_completion ?? true);
      setWoTrackDowntime(wo.track_asset_downtime ?? true);
    } catch (err: any) {
      setError(err?.message || 'Failed to load organization.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const updated = await api.updateOrganization(orgId, {
        name: name.trim(),
        description: description.trim() || undefined,
        company_set_id: companySetId,
        item_set_id: itemSetId,
        base_currency_1: baseCurrency1.toUpperCase(),
        base_currency_2: baseCurrency2.trim().toUpperCase() || undefined,
        clearing_account: clearingAccount.trim() || undefined,
        status,
        purchasing_options: {
          po_autonumber_prefix: poPrefix,
          receiving_tolerance_percent: Number(poTolerance),
          auto_close_po: poAutoClose,
          tax_on_freight: taxOnFreight,
        },
        inventory_options: {
          costing_method: invCostingMethod,
          allow_negative_balance: allowNegativeBalance,
          abc_break_a: Number(abcBreakA),
          abc_break_b: Number(abcBreakB),
        },
        work_order_options: {
          wo_autonumber_prefix: woPrefix,
          allow_history_editing: woHistoryEditing,
          require_actual_dates_on_completion: woRequireDates,
          track_asset_downtime: woTrackDowntime,
        },
      });
      setOrg(updated);
      setSuccessMsg('Organization and business rules saved successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save organization.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteId.trim() || !newSiteName.trim()) return;

    setSiteCreating(true);
    setSiteError(null);
    try {
      await api.createSite(orgId, {
        site_id: newSiteId.trim().toUpperCase(),
        name: newSiteName.trim(),
      });
      setIsSiteModalOpen(false);
      setNewSiteId('');
      setNewSiteName('');
      loadData();
    } catch (err: any) {
      setSiteError(err?.message || 'Failed to create site.');
    } finally {
      setSiteCreating(false);
    }
  };

  const handleDeleteSite = async (siteId: string) => {
    if (!confirm(`Are you sure you want to delete Site '${siteId}'?`)) return;
    try {
      await api.deleteSite(siteId);
      loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete site.');
    }
  };

  const handleToggleCompanyDisabled = async (company: string, currentDisabled: boolean) => {
    try {
      await api.updateCompanyOrg(orgId, company, { disabled: !currentDisabled });
      setCompanies((prev) =>
        prev.map((c) => (c.company === company ? { ...c, disabled: !currentDisabled } : c))
      );
    } catch (err: any) {
      alert(err?.message || 'Failed to toggle vendor status.');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Loading Organization {orgId}...
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
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-mono text-sm font-bold text-gray-900">{orgId}</h1>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                    org?.status === 'ACTIVE'
                      ? 'bg-slate-50 text-gray-700 border-gray-200'
                      : 'bg-gray-100 text-gray-500 border-gray-200'
                  }`}
                >
                  {org?.status}
                </span>
              </div>
              <p className="text-[11px] text-gray-500">{name || 'Organization'}</p>
            </div>
          </div>
        </div>

        {/* Tab Switcher & Save Button */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center rounded-lg border border-gray-200/80 bg-gray-100/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTab === 'general'
                  ? 'bg-white font-semibold text-gray-900 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>General & Financial</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sites')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTab === 'sites'
                  ? 'bg-white font-semibold text-gray-900 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>Sites ({sites.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('options')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTab === 'options'
                  ? 'bg-white font-semibold text-gray-900 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Organization Business Rules</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('companies')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTab === 'companies'
                  ? 'bg-white font-semibold text-gray-900 shadow-2xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Store className="h-3.5 w-3.5" />
              <span>Active Vendors ({companies.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Organization'}
          </button>
        </div>
      </div>

      {/* Main Tab Viewport */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
            <Check className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab 1: General & Financial */}
        {activeTab === 'general' && (
          <div className="max-w-2xl rounded-xl border border-gray-200/80 bg-white p-6 shadow-xs space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
              Organization Legal & Financial Configuration
            </h2>
            <p className="text-[11px] text-gray-500 mb-4">
              Defines General Ledger base currencies, clearing accounts, and Set bindings.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Organization ID (ORGID)
                </label>
                <input
                  type="text"
                  disabled
                  value={orgId}
                  className="w-full rounded border border-gray-200 bg-gray-100 px-3 py-1.5 font-mono text-xs text-gray-700 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Organization Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Set Bindings */}
            <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-xs font-semibold text-gray-700">
                    Company Set Binding
                  </label>
                  <InfoTooltip text="Rule: An Organization is bound to 1 Company Set. If vendors are configured, Enterprise prohibits changing the set to protect transactional integrity." />
                </div>
                <select
                  value={companySetId}
                  onChange={(e) => setCompanySetId(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                >
                  {sets.map((s) => (
                    <option key={s.set_id} value={s.set_id}>
                      {s.set_id} ({s.description || 'Set'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-xs font-semibold text-gray-700">
                    Item Set Binding
                  </label>
                  <InfoTooltip text="Item Set: Defines the catalog of spare parts and inventory materials available to this organization." />
                </div>
                <input
                  type="text"
                  value={itemSetId}
                  onChange={(e) => setItemSetId(e.target.value.toUpperCase())}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs uppercase text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Financial Parameters */}
            <div className="grid grid-cols-3 gap-4 border-t border-gray-100 pt-3">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-xs font-semibold text-gray-700">
                    Base Currency 1 <span className="text-red-500">*</span>
                  </label>
                  <InfoTooltip text="Base Currency 1: All General Ledger transactions, asset valuations, and inventory pricing post in this currency." />
                </div>
                <input
                  type="text"
                  maxLength={4}
                  value={baseCurrency1}
                  onChange={(e) => setBaseCurrency1(e.target.value.toUpperCase())}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs uppercase text-gray-800 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Base Currency 2 (Optional)
                </label>
                <input
                  type="text"
                  maxLength={4}
                  placeholder="e.g. EUR"
                  value={baseCurrency2}
                  onChange={(e) => setBaseCurrency2(e.target.value.toUpperCase())}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs uppercase text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center gap-1 mb-1">
                  <label className="text-xs font-semibold text-gray-700">
                    Clearing Account
                  </label>
                  <InfoTooltip text="GL Clearing Account: Suspense account used for inter-site material transfers and receipt balancing." />
                </div>
                <input
                  type="text"
                  placeholder="1990-000-00"
                  value={clearingAccount}
                  onChange={(e) => setClearingAccount(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Status
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
          </div>
        )}

        {/* Tab 2: Sites */}
        {activeTab === 'sites' && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Operational Sites ({sites.length})
                </h2>
                <p className="text-[11px] text-gray-500">
                  Physical plants, facilities, and storerooms operating under {orgId}.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSiteError(null);
                  setIsSiteModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 transition-colors"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Add Site</span>
              </button>
            </div>

            {sites.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
                <MapPin className="h-7 w-7 text-gray-400 mb-2" />
                <p className="text-xs font-semibold text-gray-800">No Sites Configured</p>
                <p className="text-[11px] text-gray-500 mt-1 max-w-sm">
                  An Organization must contain at least one Site to host Work Orders, Storerooms, and Assets.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sites.map((site) => (
                  <div
                    key={site.site_id}
                    className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 border border-gray-200/80">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-gray-900">{site.site_id}</span>
                          <span
                            className={`inline-flex items-center rounded-full px-1.5 py-0.2 text-[9px] font-medium border ${
                              site.status === 'ACTIVE'
                                ? 'bg-slate-50 text-gray-700 border-gray-200'
                                : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}
                          >
                            {site.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 font-medium">{site.name}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteSite(site.site_id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Delete Site"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Organization Options (Enterprise Select Action Rules) */}
        {activeTab === 'options' && (
          <div className="max-w-3xl space-y-6">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Organization Options & Defaults (Select Action Rules)
              </h2>
              <p className="text-[11px] text-gray-500">
                These rules govern operational logic across all sites in this organization.
              </p>
            </div>

            {/* Work Order Options */}
            <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5">
                <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Work Order Options
                </span>
                <InfoTooltip text="Work Order Options: Autonumber prefixes, completion rules, and history editing privileges." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    WO Autonumber Prefix
                  </label>
                  <input
                    type="text"
                    value={woPrefix}
                    onChange={(e) => setWoPrefix(e.target.value)}
                    className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-2 pt-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={woHistoryEditing}
                      onChange={(e) => setWoHistoryEditing(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-0"
                    />
                    <span>Allow Edit History Work Orders</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={woRequireDates}
                      onChange={(e) => setWoRequireDates(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-0"
                    />
                    <span>Require Actual Dates on Completion</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={woTrackDowntime}
                      onChange={(e) => setWoTrackDowntime(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-0"
                    />
                    <span>Track Asset Downtime Automatically</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Purchasing Options */}
            <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5">
                <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Purchasing & Receiving Options
                </span>
                <InfoTooltip text="Purchasing Options: Receiving over-run tolerances, invoice closures, and freight tax rules." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    PO Autonumber Prefix
                  </label>
                  <input
                    type="text"
                    value={poPrefix}
                    onChange={(e) => setPoPrefix(e.target.value)}
                    className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Receiving Tolerance (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={poTolerance}
                    onChange={(e) => setPoTolerance(Number(e.target.value))}
                    className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-400">Permissible quantity over-receipt threshold</span>
                </div>
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={poAutoClose}
                    onChange={(e) => setPoAutoClose(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-0"
                  />
                  <span>Auto-Close PO on Complete Invoicing</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={taxOnFreight}
                    onChange={(e) => setTaxOnFreight(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-0"
                  />
                  <span>Apply Tax on Shipping & Freight</span>
                </label>
              </div>
            </div>

            {/* Inventory Options */}
            <div className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5">
                <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                  Inventory & Valuation Options
                </span>
                <InfoTooltip text="Inventory Options: Financial costing method (Average, Standard, FIFO, LIFO) and negative balance controls." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Inventory Costing Method
                  </label>
                  <select
                    value={invCostingMethod}
                    onChange={(e) => setInvCostingMethod(e.target.value as any)}
                    className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="AVERAGE">AVERAGE - Moving Average Cost</option>
                    <option value="STANDARD">STANDARD - Pre-set Standard Cost</option>
                    <option value="FIFO">FIFO - First-In, First-Out</option>
                    <option value="LIFO">LIFO - Last-In, First-Out</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={allowNegativeBalance}
                      onChange={(e) => setAllowNegativeBalance(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-0"
                    />
                    <div>
                      <span className="font-semibold text-gray-800">Allow Negative Balances</span>
                      <p className="text-[10px] text-gray-500">Allows physical stock balances to drop below 0</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Active Vendors in Org (Enterprise COMPANIES table) */}
        {activeTab === 'companies' && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Active Vendors in {orgId} ({companies.length})
                </h2>
                <p className="text-[11px] text-gray-500">
                  Local vendor terms, payment conditions, and local disablement status.
                </p>
              </div>
            </div>

            {companies.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
                <Store className="h-7 w-7 text-gray-400 mb-2" />
                <p className="text-xs font-semibold text-gray-800">No Vendors Configured</p>
                <p className="text-[11px] text-gray-500 mt-1 max-w-sm">
                  Roll out vendors from Company Set '{companySetId}' or create one in the Companies tab.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200/80 bg-white shadow-xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Company Code</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Payment Terms</th>
                      <th className="px-4 py-3">Freight & FOB</th>
                      <th className="px-4 py-3">Currency</th>
                      <th className="px-4 py-3">Local Status</th>
                      <th className="px-4 py-3 text-right">Quick Toggle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700">
                    {companies.map((c) => (
                      <tr key={c.company} className="hover:bg-slate-50/60 transition-colors">
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
                          <button
                            type="button"
                            onClick={() => handleToggleCompanyDisabled(c.company, c.disabled)}
                            title={c.disabled ? 'Enable Vendor in this Org' : 'Disable Vendor in this Org (Local Disable)'}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                              c.disabled
                                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                : 'text-amber-700 hover:bg-amber-50'
                            }`}
                          >
                            <Power className="h-3 w-3" />
                            <span>{c.disabled ? 'Re-enable' : 'Disable'}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Site Modal */}
      {isSiteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-sm font-bold text-gray-900">Add Site to {orgId}</h3>
              <button
                type="button"
                onClick={() => setIsSiteModalOpen(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSite} className="p-6 space-y-4">
              {siteError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{siteError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Site ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. BEDFORD"
                  value={newSiteId}
                  onChange={(e) => setNewSiteId(e.target.value.toUpperCase())}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs uppercase text-gray-800 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Site Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bedford Manufacturing Plant"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsSiteModalOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={siteCreating}
                  className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {siteCreating ? 'Adding...' : 'Add Site'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
