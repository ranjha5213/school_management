import { Printer } from 'lucide-react';

export default function PrintShare({ 
  title = 'School Document', 
  text = 'Please find the details here.' 
}) {
  
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex items-center gap-2 no-print">
      <button 
        onClick={handlePrint} 
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
        title="Print or Save as PDF"
      >
        <Printer className="w-4 h-4" /> 
        <span className="hidden sm:inline">Print</span>
      </button>
    </div>
  );
}
