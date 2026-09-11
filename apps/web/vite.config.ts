import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localApi } from './vite-plugin-local-api';

export default defineConfig({
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
