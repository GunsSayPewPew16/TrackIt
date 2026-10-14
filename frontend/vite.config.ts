import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
//
// The app lives in frontend/, but the build is started from the repository root
// so that `dist/` lands where the Worker's assets binding expects it.
//
// It is served from two places: the domain root by the Worker, and
// /TrackIt/ by GitHub Pages. Every URL the browser resolves on its own — the
// hashed asset paths, the service worker's scope, the manifest's short cuts —
// hangs off `base`, so the Pages build is this same build with
// `PAGES_BASE=/TrackIt/` in the environment rather than a second config.
const base = process.env.PAGES_BASE ?? '/'

export default defineConfig({
  root: import.meta.dirname,
  base,
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'TrackIt — Expense Tracker',
        short_name: 'TrackIt',
        description: 'A fast, private, offline-first expense tracker.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b1220',
        theme_color: '#0b1220',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Add an expense', short_name: 'Add', url: `${base}?action=add` },
          { name: 'Scan & pay', short_name: 'Scan', url: `${base}?action=scan` },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: `${base}index.html`,
        // Never let the app shell swallow API calls.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    // In development the Worker API runs on :8787 (`npm run dev:api`).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
