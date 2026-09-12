/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves this repo from /moneymap/. Locally it is served from /.
const isActions = Boolean(process.env.GITHUB_ACTIONS);

export default defineConfig({
  base: isActions ? '/moneymap/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'Money Map',
        short_name: 'Money Map',
        description: 'Understand where the money actually goes.',
        // Both are brand colours now. v1 shipped a light-grey background_color
        // (#f1f5f9) against a midnight app, which produced a white flash on
        // every cold start.
        theme_color: '#090b1d',
        background_color: '#090b1d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // App shell is precached, so a cold start works with no network at all.
        // woff2 only — @fontsource ships a .woff fallback for browsers that
        // predate 2016, and precaching both doubles the font payload for
        // nothing. iOS Safari has supported woff2 since version 10.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // FX rates: use the network when available, fall back to the last
            // known rate when offline. Capture must never block on the network.
            urlPattern: ({ url }) => url.hostname === 'api.frankfurter.app',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'fx-rates',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: true
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
