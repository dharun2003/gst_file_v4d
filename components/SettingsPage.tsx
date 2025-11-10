import React, { useState } from 'react';
import type { CompanyDetails, VoucherNumberingSettings } from '../types';

interface SettingsPageProps {
  companyDetails: CompanyDetails;
  onSave: (details: CompanyDetails) => void;
}

const indianStates = [ "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttarakhand", "Uttar Pradesh", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli", "Daman and Diu", "Delhi", "Lakshadweep", "Puducherry" ];

const SettingsPage: React.FC<SettingsPageProps> = ({ companyDetails, onSave }) => {
  const [details, setDetails] = useState<CompanyDetails>(companyDetails);
  const [isSaved, setIsSaved] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setDetails({
      ...details,
      [e.target.name]: e.target.value
    });
  };

  const handleNumberingChange = (
    type: 'sales' | 'purchase',
    field: keyof VoucherNumberingSettings,
    value: string | number | boolean
  ) => {
    setDetails(prev => {
      // Ensure voucherNumbering exists
      const voucherNumbering = prev.voucherNumbering || {
        sales: { enabled: true, prefix: 'INV-', suffix: '', nextNumber: 1, padding: 4 },
        purchase: { enabled: true, prefix: 'PO-', suffix: '', nextNumber: 1, padding: 4 },
      };

      const newConfig = { ...voucherNumbering[type] };

      if (field === 'nextNumber' || field === 'padding') {
          (newConfig as any)[field] = parseInt(value as string, 10) || 0;
      } else if (field === 'enabled') {
          (newConfig as any)[field] = value as boolean;
      } else {
          (newConfig as any)[field] = value as string;
      }

      return {
          ...prev,
          voucherNumbering: {
              ...voucherNumbering,
              [type]: newConfig,
          }
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(details);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000); // Hide message after 3 seconds
  };
  
  const inputClass = "mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm";
  const labelClass = "block text-sm font-medium text-gray-700";
  const sectionTitleClass = "text-xl font-semibold text-gray-800";
  
  const generatePreview = (config: VoucherNumberingSettings) => {
    if (!config.enabled) return "Automatic numbering disabled";
    const numberPart = String(config.nextNumber).padStart(config.padding || 0, '0');
    return `${config.prefix}${numberPart}${config.suffix}`;
  };

  const renderNumberingConfig = (type: 'sales' | 'purchase', title: string) => {
    const config = details.voucherNumbering[type];
    
    return (
        <div className="p-6 border border-slate-200 rounded-lg bg-white">
            <h4 className="text-lg font-semibold text-gray-800">{title}</h4>
            <div className="mt-4 space-y-4">
                <div className="flex items-center">
                    <input 
                        type="checkbox" 
                        id={`${type}Enabled`}
                        checked={config.enabled}
                        onChange={e => handleNumberingChange(type, 'enabled', e.target.checked)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor={`${type}Enabled`} className="ml-2 block text-sm text-gray-900">
                        Enable Automatic Numbering
                    </label>
                </div>
                {config.enabled && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label htmlFor={`${type}Prefix`} className={labelClass}>Prefix</label>
                                <input type="text" id={`${type}Prefix`} value={config.prefix} onChange={e => handleNumberingChange(type, 'prefix', e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label htmlFor={`${type}Suffix`} className={labelClass}>Suffix</label>
                                <input type="text" id={`${type}Suffix`} value={config.suffix} onChange={e => handleNumberingChange(type, 'suffix', e.target.value)} className={inputClass} />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label htmlFor={`${type}NextNumber`} className={labelClass}>Next Number</label>
                                <input type="number" id={`${type}NextNumber`} value={config.nextNumber} onChange={e => handleNumberingChange(type, 'nextNumber', e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label htmlFor={`${type}Padding`} className={labelClass}>Number Padding (Width)</label>
                                <input type="number" id={`${type}Padding`} value={config.padding} onChange={e => handleNumberingChange(type, 'padding', e.target.value)} className={inputClass} />
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Preview</label>
                            <div className="mt-1 block w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-md text-slate-600 font-mono">
                                {generatePreview(config)}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Settings</h2>

      <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200 max-w-4xl">
        <form onSubmit={handleSubmit} className="space-y-10">
          
          {/* Company Details */}
          <section>
            <h3 className={sectionTitleClass}>Company Information</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="name" className={labelClass}>Company Name</label>
                <input type="text" name="name" id="name" value={details.name} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label htmlFor="address" className={labelClass}>Address</label>
                <textarea name="address" id="address" value={details.address} onChange={handleChange} rows={3} className={inputClass}></textarea>
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section>
            <h3 className={sectionTitleClass}>Contact Information</h3>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="email" className={labelClass}>Email Address</label>
                  <input type="email" name="email" id="email" value={details.email || ''} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="phone" className={labelClass}>Phone Number</label>
                  <input type="tel" name="phone" id="phone" value={details.phone || ''} onChange={handleChange} className={inputClass} />
                </div>
              </div>
              <div>
                <label htmlFor="website" className={labelClass}>Website</label>
                <input type="url" name="website" id="website" value={details.website || ''} onChange={handleChange} className={inputClass} placeholder="https://www.yourcompany.com" />
              </div>
            </div>
          </section>
          
          {/* Tax & Legal Information */}
          <section>
            <h3 className={sectionTitleClass}>Tax & Legal Information</h3>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="gstin" className={labelClass}>GSTIN</label>
                  <input type="text" name="gstin" id="gstin" value={details.gstin} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="state" className={labelClass}>State</label>
                  <select name="state" id="state" value={details.state} onChange={handleChange} className={inputClass}>
                    {indianStates.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="pan" className={labelClass}>PAN</label>
                  <input type="text" name="pan" id="pan" value={details.pan || ''} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="cin" className={labelClass}>CIN</label>
                  <input type="text" name="cin" id="cin" value={details.cin || ''} onChange={handleChange} className={inputClass} />
                </div>
              </div>
            </div>
          </section>

          {/* Voucher & Invoice Numbering */}
          <section>
            <h3 className={sectionTitleClass}>Voucher & Invoice Numbering</h3>
            <div className="mt-4 space-y-6 bg-slate-50 p-6 rounded-lg border border-slate-200">
                {renderNumberingConfig('sales', 'Sales Invoices')}
                {renderNumberingConfig('purchase', 'Purchase Vouchers')}
            </div>
          </section>

          <div className="pt-5">
            <div className="flex justify-end items-center space-x-4">
              {isSaved && <p className="text-sm text-green-600">Settings saved successfully!</p>}
              <button type="submit" className="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                Save Changes
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};

export default SettingsPage;