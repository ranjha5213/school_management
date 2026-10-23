import { Upload } from 'lucide-react';

export default function FileUpload({ label, accept = '*/*', onFile }) {
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-800">
        <Upload className="w-6 h-6 text-slate-400 mb-2" />
        <span className="text-sm text-slate-500">Click to upload</span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onFile?.(e.target.files?.[0])}
        />
      </label>
    </div>
  );
}
