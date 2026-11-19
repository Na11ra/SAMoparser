import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// В production (nginx) фронтенд обращается по относительным путям /api и /ingest —
// nginx.conf проксирует их на api:8000 и ingest:8001 без обрезки префикса.
// Для локальной разработки Vite проксирует те же пути на backend.
const apiTarget = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000';
const ingestTarget = process.env.VITE_INGEST_PROXY_TARGET || 'http://127.0.0.1:8001';

const proxy = {
  '/api': { target: apiTarget, changeOrigin: true },
  '/ingest': { target: ingestTarget, changeOrigin: true },
  '/health': { target: apiTarget, changeOrigin: true },
  '/ready': { target: apiTarget, changeOrigin: true },
  '/metrics': { target: apiTarget, changeOrigin: true },
};

const previewHost = { host: '0.0.0.0', allowedHosts: true };

export default defineConfig({
  plugins: [react()],
  server: {
    ...previewHost,
    port: 5173,
    strictPort: true,
    proxy,
  },
  preview: {
    ...previewHost,
    port: 4173,
    proxy,
  },
});
