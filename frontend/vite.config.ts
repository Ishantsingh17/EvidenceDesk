import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const evaluationDatasets = path.resolve(import.meta.dirname, '../evaluation/datasets')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Separate dependency cache per API mode, so the mock and live dev servers used by
  // the Playwright tests never re-optimise the same cache at the same time.
  cacheDir: `node_modules/.vite/${process.env.VITE_API_MODE || 'live'}`,
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // The committed seed dataset, read (lazily) by the mock adapter only.
      '@evaluation': evaluationDatasets,
    },
  },
  server: {
    fs: { allow: [import.meta.dirname, evaluationDatasets] },
  },
  build: {
    rolldownOptions: {
      output: {
        // Stable vendor chunks: cached across app releases and each under 500 kB.
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            { name: 'vendor-ui', test: /node_modules[\\/](radix-ui|@radix-ui|motion|motion-dom|motion-utils)[\\/]/ },
          ],
        },
      },
    },
  },
})
