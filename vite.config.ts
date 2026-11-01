import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Set by storelyapi's docker-compose.dev.yml: the front proxy reaches this dev server
// over TLS and the browser loads it through app.storely.localhost.
const cert = process.env.STORELY_DEV_TLS_CERT
const key = process.env.STORELY_DEV_TLS_KEY
const publicHost = process.env.STORELY_DEV_PUBLIC_HOST

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    https: cert && key ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined,
    allowedHosts: publicHost ? [publicHost] : undefined,
    hmr: publicHost ? { host: publicHost, protocol: 'wss', clientPort: 443 } : undefined,
    // Plain `npm run dev` on the Mac: send API calls to the local Docker API so the page
    // and the API share one origin, as they do in production. Its certificate comes from
    // the development CA, which Node does not know, hence `secure: false` (local only).
    proxy: publicHost ? undefined : Object.fromEntries(['/v1', '/health'].map(path => [path, {
      target: process.env.STORELY_API_PROXY ?? 'https://api.storely.localhost',
      changeOrigin: true,
      secure: false,
    }])),
  },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: false,
  },
})
