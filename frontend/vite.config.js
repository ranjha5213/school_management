import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // This exposes your Vite server to your local network
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // Your backend IP
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
