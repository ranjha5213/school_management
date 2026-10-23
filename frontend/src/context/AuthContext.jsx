import { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/endpoints';
import { connectSocket, disconnectSocket } from '../api/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    authApi.me()
      .then(setUser)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) connectSocket();
    else disconnectSocket();
  }, [user]);

  const login = async (creds) => {
    const res = await authApi.login(creds);
    const token = res.token;
    const u = res.user;
    if (token) localStorage.setItem('token', token);
    if (res.refresh) localStorage.setItem('refresh', res.refresh);
    setUser(u);
    return u;
  };

  const refreshUser = async () => {
    try {
      const u = await authApi.me();
      setUser(u);
      return u;
    } catch {
      return null;
    }
  };

  const logout = async () => {
    const refresh = localStorage.getItem('refresh');
    try { await authApi.logout(refresh); } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('refresh');
    setUser(null);
    disconnectSocket();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
