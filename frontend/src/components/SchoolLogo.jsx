import { useEffect, useState } from 'react';
import { School } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import client from '../api/client';

function resolveLogoUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;

  const base =
    import.meta.env.VITE_API_URL ||
    client?.defaults?.baseURL ||
    '';
  const origin = base.replace(/\/api\/?$/, '').replace(/\/$/, '');
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;

  return origin ? `${origin}${normalizedPath}` : normalizedPath;
}

export default function SchoolLogo({
  className = 'w-10 h-10 object-contain shrink-0',
  fallbackClassName = 'w-10 h-10 text-brand-600 shrink-0',
}) {
  const { school_name, school_logo_url } = useSettings();
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    setImgBroken(false);
  }, [school_logo_url]);

  const resolvedName = school_name || 'Jamia Hussania Anwar-ul-Quran';
  const logoSrc = resolveLogoUrl(school_logo_url);

  if (!logoSrc || imgBroken) {
    return <School className={fallbackClassName} aria-hidden="true" />;
  }

  return (
    <img
      src={logoSrc}
      alt={resolvedName}
      className={className}
      onError={() => setImgBroken(true)}
    />
  );
}

