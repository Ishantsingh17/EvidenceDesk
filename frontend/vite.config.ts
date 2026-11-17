import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Separate dependency cache per API mode, so the mock and live dev servers used by
  // the Playwright tests never re-optimise the same cache at the same time.
  cacheDir: `node_modules/.vite/${process.env.VITE_API_MODE || 'live'}`,
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
