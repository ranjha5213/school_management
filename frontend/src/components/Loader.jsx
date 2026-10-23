export default function Loader({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-slate-800 border-t-brand-500 animate-spin" />
      {label && <div className="text-xs text-slate-500">{label}</div>}
    </div>
  );
}
