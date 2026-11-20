import axios from 'axios';

// Use a relative path. Vite will proxy this to the backend.
const dynamicBaseURL = `/api`; 

const client = axios.create({
  // Keep your env variable if you have one, otherwise default to /api
  baseURL: import.meta.env.VITE_API_URL || dynamicBaseURL,
  timeout: 40000,
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    const msg = err.response?.data?.message || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
  }
);

export default client;
