import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    host: '0.0.0.0',
    hmr: process.env.DISABLE_HMR !== 'true',
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.js.stripe.com https://connect-js.stripe.com https://challenges.cloudflare.com",
        "worker-src 'self' blob:",
        "frame-src 'self' https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://*.stripe.com https://connect-js.stripe.com https://link.com https://*.link.com https://pay.google.com https://challenges.cloudflare.com",
        "connect-src 'self' ws: wss: http://127.0.0.1:3001 http://localhost:3001 https://api.stripe.com https://errors.stripe.com https://hooks.stripe.com https://*.stripe.com https://link.com https://*.link.com https://challenges.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "object-src 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});
