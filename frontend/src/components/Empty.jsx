export default function Empty({ title = 'Nothing here', hint, icon: Icon }) {
  return (
    <div className="text-center py-10">
      {Icon && <Icon className="w-10 h-10 mx-auto text-slate-300 mb-2" />}
      <div className="font-medium text-slate-600 dark:text-slate-300">{title}</div>
      {hint && <div className="text-sm text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
