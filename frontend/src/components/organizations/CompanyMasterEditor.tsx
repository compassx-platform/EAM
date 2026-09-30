import React, { useState, useEffect } from 'react';
import { X, Building, AlertCircle, Globe, Phone, Mail, MapPin } from 'lucide-react';
import { api } from '../../api/client';
import type { CompanyMaster } from '../../types';

interface CompanyMasterEditorProps {
  isOpen: boolean;
  onClose: () => void;
  companySetId: string;
  companyMaster?: CompanyMaster | null; // null if creating new
  onSuccess: () => void;
}

export const CompanyMasterEditor: React.FC<CompanyMasterEditorProps> = ({
  isOpen,
  onClose,
  companySetId,
  companyMaster,
  onSuccess,
}) => {
  const isEditing = Boolean(companyMaster);

  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('V');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [taxId, setTaxId] = useState('');
  const [homepage, setHomepage] = useState('');
  const [phone, setPhone] = useState('');
  const [fax, setFax] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('USA');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (companyMaster) {
      setCompany(companyMaster.company);
      setName(companyMaster.name);
      setType(companyMaster.type);
      setCurrencyCode(companyMaster.currency_code);
      setTaxId(companyMaster.tax_id || '');
      setHomepage(companyMaster.homepage || '');
      setPhone(companyMaster.phone || '');
      setFax(companyMaster.fax || '');
      setAddress1(companyMaster.address_line1 || '');
      setAddress2(companyMaster.address_line2 || '');
      setCity(companyMaster.city || '');
      setStateProvince(companyMaster.state_province || '');
      setPostalCode(companyMaster.postal_code || '');
      setCountry(companyMaster.country || 'USA');
      setStatus(companyMaster.status);
    } else {
      setCompany('');
      setName('');
      setType('V');
      setCurrencyCode('USD');
      setTaxId('');
      setHomepage('');
      setPhone('');
      setFax('');
      setAddress1('');
      setAddress2('');
      setCity('');
      setStateProvince('');
      setPostalCode('');
      setCountry('USA');
      setStatus('ACTIVE');
    }
    setError(null);
  }, [companyMaster, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim()) {
      setError('Company code is required.');
      return;
    }
    if (!name.trim()) {
      setError('Company legal name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (isEditing) {
        await api.updateCompanyMaster(companySetId, company.trim().toUpperCase(), {
          name: name.trim(),
          type,
          currency_code: currencyCode.toUpperCase(),
          tax_id: taxId.trim() || undefined,
          homepage: homepage.trim() || undefined,
          phone: phone.trim() || undefined,
          fax: fax.trim() || undefined,
          address_line1: address1.trim() || undefined,
          address_line2: address2.trim() || undefined,
          city: city.trim() || undefined,
          state_province: stateProvince.trim() || undefined,
          postal_code: postalCode.trim() || undefined,
          country: country.trim() || undefined,
          status,
        });
      } else {
        await api.createCompanyMaster({
          company: company.trim().toUpperCase(),
          company_set_id: companySetId,
          name: name.trim(),
          type,
          currency_code: currencyCode.toUpperCase(),
          tax_id: taxId.trim() || undefined,
          homepage: homepage.trim() || undefined,
          phone: phone.trim() || undefined,
          fax: fax.trim() || undefined,
          address_line1: address1.trim() || undefined,
          address_line2: address2.trim() || undefined,
          city: city.trim() || undefined,
          state_province: stateProvince.trim() || undefined,
          postal_code: postalCode.trim() || undefined,
          country: country.trim() || undefined,
          status,
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save company master record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 border border-gray-200/80">
              <Building className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                {isEditing ? `Edit Company Master · ${company}` : 'New Company Master'}
              </h2>
              <p className="text-xs text-gray-500">
                Scope: Company Set <span className="font-mono font-semibold text-gray-800">{companySetId}</span> (Master Catalog)
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

          {/* Primary Identifier & Legal Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Company Code (COMPANY) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                disabled={isEditing}
                placeholder="e.g. GRAINGER"
                value={company}
                onChange={(e) => setCompany(e.target.value.toUpperCase())}
                className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 font-mono text-xs text-gray-800 uppercase focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
                required
              />
              <span className="text-[10px] text-gray-400">Unique identifier within this set</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Legal Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. W.W. Grainger, Inc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Type, Currency, Status, Tax ID */}
          <div className="grid grid-cols-4 gap-3 border-t border-gray-100 pt-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Company Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
              >
                <option value="V">V - Vendor</option>
                <option value="M">M - Manufacturer</option>
                <option value="C">C - Courier</option>
                <option value="D">D - Disadvantaged</option>
                <option value="I">I - Internal</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Base Currency
              </label>
              <input
                type="text"
                maxLength={4}
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 font-mono text-xs text-gray-800 uppercase focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Tax / VAT ID
              </label>
              <input
                type="text"
                placeholder="e.g. EIN-36-1150280"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>

          {/* Contact and Website */}
          <div className="grid grid-cols-3 gap-3 border-t border-gray-100 pt-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Website URL
              </label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={homepage}
                  onChange={(e) => setHomepage(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Primary Phone
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="+1 (800) 555-0199"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Fax Number
              </label>
              <input
                type="text"
                placeholder="+1 (800) 555-0198"
                value={fax}
                onChange={(e) => setFax(e.target.value)}
                className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Corporate Headquarters Address */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
              Corporate Headquarters Address
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  placeholder="Address Line 1"
                  value={address1}
                  onChange={(e) => setAddress1(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Address Line 2 (Suite, Floor)"
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <input
                  type="text"
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="State / Province"
                  value={stateProvince}
                  onChange={(e) => setStateProvince(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Postal Code"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <input
                  type="text"
                  placeholder="Country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
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
              disabled={saving}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Company Master'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
