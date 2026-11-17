import { expect, test } from '@playwright/test'

// The health check is real in every API mode; these run on the mock-mode server,
// whose origin is the one the backend's CORS setting allows.
const HEALTH_URL = 'http://127.0.0.1:8000/api/v1/health'

test('shell and overview show the real backend health result', async ({ page, request }) => {
  // Backend on its own.
  const direct = await request.get(HEALTH_URL)
  expect(direct.status()).toBe(200)
  const body = await direct.json()
  expect(body.status).toBe('healthy')
  expect(body.service).toBe('enterprise-document-retrieval-api')

  // The browser itself reaches it. (React StrictMode in dev cancels a first duplicate
  // request, so wait for a completed 200 rather than reading the first response body.)
  const browserCall = page.waitForResponse((r) => r.url() === HEALTH_URL && r.status() === 200)
  await page.goto('/dashboard')
  await browserCall

  await expect(page.getByTestId('backend-indicator')).toHaveAttribute('data-phase', 'connected')
  await expect(page.getByTestId('backend-indicator')).toContainText('Backend healthy')
  await expect(page.getByTestId('status-backend')).toContainText('Healthy')
  await expect(page.getByTestId('status-processing')).toContainText('Idle')
})

test('backend outage is shown honestly and recovers on re-check', async ({ page }) => {
  await page.route(HEALTH_URL, (route) => route.abort('connectionrefused'))
  await page.goto('/dashboard')

  const indicator = page.getByTestId('backend-indicator')
  await expect(indicator).toHaveAttribute('data-phase', 'error')
  await expect(indicator).toContainText('Backend unreachable')
  await expect(page.getByTestId('status-backend')).toContainText('Unreachable')
  await expect(page.getByTestId('status-processing')).toContainText('Unknown')

  await page.unroute(HEALTH_URL)
  await page.getByRole('button', { name: 'Check now' }).click()
  await expect(indicator).toHaveAttribute('data-phase', 'connected')
  await expect(page.getByTestId('status-backend')).toContainText('Healthy')
})
