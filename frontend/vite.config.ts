/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type PluginOption, type UserConfig, type ConfigEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { VitePWA } from 'vite-plugin-pwa'

// Plugin to validate required env vars at build/dev time
function validateEnv(): PluginOption {
  return {
    name: 'validate-env',
    config(_: UserConfig, { mode }: ConfigEnv) {
      // Skip validation during tests
      if (mode === 'test') return;

      // Load env files (including .env.local)
      const env = loadEnv(mode, process.cwd(), '');

      // Read required vars from .env.example
      const envExample = readFileSync('.env.example', 'utf-8');
      const required = envExample
        .split('\n')
        .map(line => line.split('=')[0].trim())
        .filter(key => key && !key.startsWith('#'));

      const missing = required.filter(key => !env[key]);

      if (missing.length > 0) {
        console.error('\n\x1b[31mError: Firebase configuration missing\x1b[0m\n');
        console.error('Set these in frontend/.env.local:\n');
        missing.forEach(key => console.error(`  ${key}=`));
        console.error('\nGet these values from:');
        console.error('  https://console.firebase.google.com > Project Settings > Your apps\n');
        process.exit(1);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    validateEnv(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Raffles Go',
        short_name: 'RafflesGo',
        description: 'Offline support for Raffles Go report saving',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: ({ request }) => {
              return request.url.includes('/api/') && request.method === 'GET';
            },
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ] as PluginOption[],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
