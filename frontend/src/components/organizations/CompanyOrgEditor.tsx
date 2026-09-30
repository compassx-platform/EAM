import React, { useState, useEffect } from 'react';
import { X, Store, AlertCircle, Building2, Check } from 'lucide-react';
import { api } from '../../api/client';
import type { CompanyOrg } from '../../types';
import { InfoTooltip } from '../people/InfoTooltip';

interface CompanyOrgEditorProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  companyOrg: CompanyOrg;
  onSuccess: () => void;
}

export const CompanyOrgEditor: React.FC<CompanyOrgEditorProps> = ({
  isOpen,
  onClose,
  orgId,
  companyOrg,
  onSuccess,
}) => {
  const [name, setName] = useState(companyOrg.name);
  const [currencyCode, setCurrencyCode] = useState(companyOrg.currency_code);
  const [paymentTerms, setPaymentTerms] = useState(companyOrg.payment_terms);
  const [freightTerms, setFreightTerms] = useState(companyOrg.freight_terms);
  const [fob, setFob] = useState(companyOrg.fob);
  const [customerAccountNum, setCustomerAccountNum] = useState(companyOrg.customer_account_num || '');
  const [taxExempt, setTaxExempt] = useState(companyOrg.tax_exempt);
  const [taxCode, setTaxCode] = useState(companyOrg.tax_code || '');
  const [glAccount, setGlAccount] = useState(companyOrg.gl_account || '');
  const [disabled, setDisabled] = useState(companyOrg.disabled);
  const [remitToAddress, setRemitToAddress] = useState(companyOrg.remit_to_address || '');
  const [notes, setNotes] = useState(companyOrg.notes || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(companyOrg.name);
    setCurrencyCode(companyOrg.currency_code);
    setPaymentTerms(companyOrg.payment_terms);
    setFreightTerms(companyOrg.freight_terms);
    setFob(companyOrg.fob);
    setCustomerAccountNum(companyOrg.customer_account_num || '');
    setTaxExempt(companyOrg.tax_exempt);
    setTaxCode(companyOrg.tax_code || '');
    setGlAccount(companyOrg.gl_account || '');
    setDisabled(companyOrg.disabled);
    setRemitToAddress(companyOrg.remit_to_address || '');
    setNotes(companyOrg.notes || '');
    setError(null);
  }, [companyOrg, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await api.updateCompanyOrg(orgId, companyOrg.company, {
        name: name.trim(),
        currency_code: currencyCode.toUpperCase(),
        payment_terms: paymentTerms,
        freight_terms: freightTerms,
        fob,
        customer_account_num: customerAccountNum.trim() || undefined,
        tax_exempt: taxExempt,
        tax_code: taxCode.trim() || undefined,
        gl_account: glAccount.trim() || undefined,
        disabled,
        remit_to_address: remitToAddress.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update company local terms.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 border border-gray-200/80">
              <Store className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                Local Terms · {companyOrg.company} in {orgId}
              </h2>
              <p className="text-xs text-gray-500">
                Organization-specific commercial agreement (Commercial Agreement)
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

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto min-h-0">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Master Inheritance Banner */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 flex items-center justify-between text-xs">
            <div>
              <span className="font-semibold text-gray-800">Master Code: </span>
              <span className="font-mono font-bold text-gray-900">{companyOrg.company}</span>
              <span className="text-gray-500 ml-2">({companyOrg.name})</span>
            </div>
            <span className="text-[11px] font-mono text-gray-500">
              ORG: {orgId}
            </span>
          </div>

          {/* Local Disablement Flag */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={disabled}
                onChange={(e) => setDisabled(e.target.checked)}
                className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-0"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-amber-900">
                    Disabled in this Organization (DISABLED = 1)
                  </span>
                  <InfoTooltip text="Local disablement: Prevents creating new POs or Contracts for this vendor in this organization without deactivating them globally in Company Master." />
                </div>
                <p className="text-[11px] text-amber-800/80 mt-0.5 leading-normal">
                  When checked, purchasing agents in {orgId} cannot select this vendor. Other organizations in the set remain unaffected.
                </p>
              </div>
            </label>
          </div>

          {/* Commercial Terms */}
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Vendor Customer Account #
              </label>
              <input
                type="text"
                placeholder="e.g. ACT-GRA-9901"
                value={customerAccountNum}
                onChange={(e) => setCustomerAccountNum(e.target.value)}
                className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
              />
              <span className="text-[10px] text-gray-400">Account # assigned by vendor to {orgId}</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Transaction Currency
              </label>
              <input
                type="text"
                maxLength={4}
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs uppercase text-gray-800 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Tax and General Ledger */}
          <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Default GL Expense Account
              </label>
              <input
                type="text"
                placeholder="e.g. 6100-200-10"
                value={glAccount}
                onChange={(e) => setGlAccount(e.target.value)}
                className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Tax Registration / Code
              </label>
              <input
                type="text"
                placeholder="e.g. VAT_DE_19 or EXEMPT"
                value={taxCode}
                onChange={(e) => setTaxCode(e.target.value)}
                className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Remit-To Payment Address
            </label>
            <input
              type="text"
              placeholder="e.g. PO Box 88022, Chicago, IL 60680"
              value={remitToAddress}
              onChange={(e) => setRemitToAddress(e.target.value)}
              className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Organization Notes
            </label>
            <textarea
              rows={2}
              placeholder="Internal vendor notes for buyers in this organization..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
            />
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
              disabled={saving}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Update Local Terms'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
