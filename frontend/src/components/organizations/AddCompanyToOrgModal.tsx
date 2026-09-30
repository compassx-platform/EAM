import React, { useState } from 'react';
import { X, Building2, Check, AlertCircle } from 'lucide-react';
import { api } from '../../api/client';
import type { Organization, CompanyMaster } from '../../types';

interface AddCompanyToOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: CompanyMaster;
  organizations: Organization[];
  onSuccess: () => void;
}

export const AddCompanyToOrgModal: React.FC<AddCompanyToOrgModalProps> = ({
  isOpen,
  onClose,
  company,
  organizations,
  onSuccess,
}) => {
  const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
  const [paymentTerms, setPaymentTerms] = useState('NET30');
  const [freightTerms, setFreightTerms] = useState('PREPAID');
  const [fob, setFob] = useState('DESTINATION');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter organizations that belong to this company's set
  const eligibleOrgs = organizations.filter(
    (o) => o.company_set_id === company.company_set_id
  );

  const toggleOrg = (orgId: string) => {
    setSelectedOrgs((prev) =>
      prev.includes(orgId) ? prev.filter((id) => id !== orgId) : [...prev, orgId]
    );
  };

  const handleSelectAll = () => {
    if (selectedOrgs.length === eligibleOrgs.length) {
      setSelectedOrgs([]);
    } else {
      setSelectedOrgs(eligibleOrgs.map((o) => o.org_id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrgs.length === 0) {
      setError('Please select at least one organization.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.addCompanyToOrgs(company.company_set_id, company.company, {
        org_ids: selectedOrgs,
        payment_terms: paymentTerms,
        freight_terms: freightTerms,
        fob,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to add company to organizations.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 border border-gray-200/80">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Roll Out to Organizations (Action)
              </h2>
              <p className="text-xs text-gray-500">
                Company: <span className="font-mono font-semibold text-gray-800">{company.company}</span> ({company.name})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-700">
                Select Organizations in Set ({company.company_set_id})
              </label>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[11px] font-medium text-blue-600 hover:underline"
              >
                {selectedOrgs.length === eligibleOrgs.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {eligibleOrgs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
                No organizations belong to Company Set '{company.company_set_id}'.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-lg border border-gray-200 p-2">
                {eligibleOrgs.map((org) => {
                  const isChecked = selectedOrgs.includes(org.org_id);
                  return (
                    <div
                      key={org.org_id}
                      onClick={() => toggleOrg(org.org_id)}
                      className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-xs transition-colors ${
                        isChecked
                          ? 'bg-blue-50/80 border border-blue-200 text-blue-900'
                          : 'hover:bg-gray-50 border border-transparent text-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            isChecked
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-gray-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                        <span className="font-mono font-bold">{org.org_id}</span>
                        <span className="text-gray-500">· {org.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-gray-500">
                        {org.base_currency_1}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Default Commercial Terms */}
          <div className="grid grid-cols-3 gap-3 border-t border-gray-100 pt-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Payment Terms
              </label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
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
                value={freightTerms}
                onChange={(e) => setFreightTerms(e.target.value)}
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
                value={fob}
                onChange={(e) => setFob(e.target.value)}
                className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
              >
                <option value="DESTINATION">Destination</option>
                <option value="ORIGIN">Origin</option>
                <option value="SHIPPING_POINT">Shipping Point</option>
              </select>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || selectedOrgs.length === 0}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Adding...' : `Add to ${selectedOrgs.length} Org(s)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
