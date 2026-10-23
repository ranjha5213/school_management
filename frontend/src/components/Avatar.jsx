/**
 * Avatar — displays a profile picture or initials fallback.
 *
 * Props:
 *   src      {string}  URL (relative or absolute)
 *   name     {string}  used for initials fallback
 *   size     {number}  px, default 40
 *   className {string} additional classes
 */
export default function Avatar({ src, name = '?', size = 40, className = '' }) {
  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join('') || '?';

  const fontSize = Math.max(10, Math.round(size * 0.4));

  const base = `rounded-full overflow-hidden flex items-center justify-center shrink-0 ${className}`;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`${base} object-cover bg-slate-100 dark:bg-slate-800`}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, fontSize }}
      className={`${base} bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 font-bold`}
      title={name}
    >
      {initials}
    </div>
  );
}
