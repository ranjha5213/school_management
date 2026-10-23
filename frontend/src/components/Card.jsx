export default function Card({ children, className = '' }) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 dark:bg-slate-900
                  rounded-2xl border border-slate-200 dark:border-slate-800 dark:border-slate-800
                  shadow-sm dark:shadow-none
                  ${className}`}
    >
      {children}
    </div>
  );
}
