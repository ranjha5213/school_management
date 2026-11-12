import { useSettings } from '../context/SettingsContext';

export default function PrintHeader({ title, subtitle, date }) {
  const { school_name, school_address, school_phone, school_email, school_logo_url } = useSettings();
  
  const printDate = date || new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  return (
    <div className="hidden print:block w-full mb-6 pb-4 border-b-2 border-black print-header">
      <div className="flex items-center justify-between gap-4">
        
        {/* Left: Logo & School Info */}
        <div className="flex items-center gap-4">
          {school_logo_url ? (
            <img src={school_logo_url} alt="Logo" className="w-16 h-16 object-contain" />
          ) : (
            // 👇 FIXED: Added print:hidden to hide the fallback letter on paper
            <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center font-bold text-xl print:hidden">
              {school_name?.charAt(0) || 'S'}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wide text-black">{school_name || 'School Name'}</h1>
            {school_address && <p className="text-sm text-black">{school_address}</p>}
            <div className="text-sm text-black flex gap-3">
              {school_phone && <span>Tel: {school_phone}</span>}
              {school_email && <span>Email: {school_email}</span>}
            </div>
          </div>
        </div>

        {/* Right: Print Date */}
        <div className="text-right text-sm text-black">
          <p><strong>Date:</strong> {printDate}</p>
        </div>
      </div>

      {/* Document Title */}
      <div className="mt-4 text-center">
        <h2 className="text-xl font-bold uppercase text-black underline decoration-2 underline-offset-4">
          {title}
        </h2>
        {subtitle && <p className="text-md text-black mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
