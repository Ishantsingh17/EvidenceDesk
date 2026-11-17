import path from 'node:path'

import { defineConfig, devices } from '@playwright/test'

const backendDir = path.resolve(import.meta.dirname, '../backend')
const backendPython =
  process.platform === 'win32'
    ? path.join(backendDir, '.venv', 'Scripts', 'python.exe')
    : path.join(backendDir, '.venv', 'bin', 'python')

// Mock mode runs on the CORS-allowed origin (5173) so its live health check works.
// Live mode runs on 5174 only to prove it never shows mock data.
const MOCK_URL = 'http://localhost:5173'
const LIVE_URL = 'http://localhost:5174'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { trace: 'on-first-retry' },
  projects: [
    {
      name: 'mock',
      testIgnore: /live-mode\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: MOCK_URL },
    },
    {
      name: 'live',
      testMatch: /live-mode\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: LIVE_URL },
    },
  ],
  webServer: [
    {
      // Real FastAPI backend, single worker (TRD §6.3).
      command: `"${backendPython}" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1`,
      cwd: backendDir,
      url: 'http://127.0.0.1:8000/api/v1/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: MOCK_URL,
      env: { VITE_API_MODE: 'mock' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      url: LIVE_URL,
      env: { VITE_API_MODE: 'live' },
      reuseExistingServer: !process.env.CI,
    },
  ],
})
