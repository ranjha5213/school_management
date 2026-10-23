import { createContext, useContext, useEffect, useState } from 'react';
import client from '../api/client';

const SettingsContext = createContext({
  school_name: 'School Management',
  school_address: '',
  school_phone: '',
  school_email: '',
  school_logo_url: null,
  loading: true,
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    school_name: 'School Management',
    school_address: '',
    school_phone: '',
    school_email: '',
    school_logo_url: null,
    loading: true,
  });

  useEffect(() => {
    client.get('/settings/public')
      .then((res) => {
        const d = res.data?.data || {};
        setSettings({
          school_name: d.school_name || 'School Management',
          school_address: d.school_address || '',
          school_phone: d.school_phone || '',
          school_email: d.school_email || '',
          school_logo_url: d.school_logo_url || null,
          loading: false,
        });
      })
      .catch(() => setSettings((s) => ({ ...s, loading: false })));
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
