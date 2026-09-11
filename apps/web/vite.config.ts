import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localApi } from './vite-plugin-local-api';

export default defineConfig({
  /**
   * GitHub Pages serves a project site from `/<repo>/`, not from the domain
   * root, so every asset URL needs that prefix or the page loads a blank
   * screen with 404s. It comes from the environment because the correct value
   * depends on where the build is going: `/` for local dev and for any host
   * serving from a root.
   */
  base: process.env.VITE_BASE_PATH ?? '/',

  // `localApi` runs the serverless handlers in-process, so `npm run dev` gives
  // working lookups without a second server or the Vercel CLI.
  plugins: [react(), localApi()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@opencite/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          // citeproc is ~700kb; keep it out of the initial paint.
          citeproc: ['citeproc'],
          vendor: ['react', 'react-dom', 'dexie', 'dexie-react-hooks'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
