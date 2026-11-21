import { useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import client from '../api/client';

const URDU_REGEX = /[\u0600-\u06FF]/;

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

export default function PrintHeader({ title, subtitle, date }) {
  const {
    school_name,
    school_address,
    school_phone,
    school_email,
    school_logo_url,
  } = useSettings();

  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    setImgBroken(false);
  }, [school_logo_url]);

  const resolvedName = school_name || 'Jamia Hussania Anwar-ul-Quran';
  const logoSrc = resolveLogoUrl(school_logo_url);
  const showLogo = Boolean(logoSrc && !imgBroken);

  const nameIsUrdu = URDU_REGEX.test(resolvedName);
  const addressIsUrdu = Boolean(school_address && URDU_REGEX.test(school_address));
  const titleIsUrdu = Boolean(title && URDU_REGEX.test(title));
  const subtitleIsUrdu = Boolean(subtitle && URDU_REGEX.test(subtitle));

  const printDate =
    date ||
    new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <div className="hidden print:block w-full mb-6 pb-4 border-b-2 border-black print-header">
      <div className="flex items-center justify-between gap-4">
        {/* Logo & School Info */}
        <div className="flex items-center gap-4 min-w-0">
          {showLogo ? (
            <img
              src={logoSrc}
              alt={resolvedName}
              className="w-16 h-16 object-contain shrink-0 print-header-logo"
              onError={() => setImgBroken(true)}
            />
          ) : (
            <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center font-bold text-xl shrink-0 print:hidden">
              {resolvedName.charAt(0) || 'J'}
            </div>
          )}

          <div className="min-w-0">
            <h1
              dir={nameIsUrdu ? 'rtl' : 'ltr'}
              lang={nameIsUrdu ? 'ur' : undefined}
              className={
                nameIsUrdu
                  ? 'text-2xl font-bold text-black font-urdu'
                  : 'text-2xl font-bold uppercase tracking-wide text-black'
              }
            >
              {resolvedName}
            </h1>

            {school_address && (
              <p
                dir={addressIsUrdu ? 'rtl' : 'ltr'}
                lang={addressIsUrdu ? 'ur' : undefined}
                className={
                  addressIsUrdu
                    ? 'text-base text-black font-urdu'
                    : 'text-sm text-black'
                }
              >
                {school_address}
              </p>
            )}

            <div className="text-sm text-black flex flex-wrap gap-3 mt-0.5" dir="ltr">
              {school_phone && <span>Tel: {school_phone}</span>}
              {school_email && <span>Email: {school_email}</span>}
            </div>
          </div>
        </div>

        {/* Right: Print Date */}
        <div className="text-right text-sm text-black shrink-0" dir="ltr">
          <p>
            <strong>Date:</strong> {printDate}
          </p>
        </div>
      </div>

      {/* Document Title */}
      <div className="mt-4 text-center">
        <h2
          dir={titleIsUrdu ? 'rtl' : 'ltr'}
          lang={titleIsUrdu ? 'ur' : undefined}
          className={
            titleIsUrdu
              ? 'text-xl font-bold text-black font-urdu'
              : 'text-xl font-bold uppercase text-black underline decoration-2 underline-offset-4'
          }
        >
          {title}
        </h2>

        {subtitle && (
          <p
            dir={subtitleIsUrdu ? 'rtl' : 'ltr'}
            lang={subtitleIsUrdu ? 'ur' : undefined}
            className={
              subtitleIsUrdu
                ? 'text-base text-black mt-1 font-urdu'
                : 'text-md text-black mt-1'
            }
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

