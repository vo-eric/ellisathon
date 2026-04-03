import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // loadEnv only reads .env files; CI (e.g. Cloudflare Pages) injects vars into process.env.
  const backendApiUrl =
    process.env.BACKEND_API_URL ??
    process.env.VITE_BACKEND_API_URL ??
    env.BACKEND_API_URL ??
    env.VITE_BACKEND_API_URL ??
    '';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.BACKEND_API_URL': JSON.stringify(backendApiUrl),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: 'http://localhost:8787', changeOrigin: true },
        '/wiki': { target: 'http://localhost:8787', changeOrigin: true },
        '/ws': {
          target: 'ws://localhost:8787',
          ws: true,
        },
      },
    },
  };
});
