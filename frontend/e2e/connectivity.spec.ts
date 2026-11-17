import { expect, test } from '@playwright/test'

const HEALTH_URL = 'http://127.0.0.1:8000/api/v1/health'

test('frontend shows the real backend health result', async ({ page }) => {
  const healthResponse = page.waitForResponse(HEALTH_URL)
  await page.goto('/')

  const response = await healthResponse
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.status).toBe('healthy')
  expect(body.service).toBe('enterprise-document-retrieval-api')

  const status = page.getByTestId('backend-status')
  await expect(status).toHaveText('Backend connected: healthy')
  await expect(status).toHaveAttribute('data-phase', 'connected')
})

test('frontend shows an error and recovers on retry', async ({ page }) => {
  // Simulate the backend being down for the first request only.
  await page.route(HEALTH_URL, (route) => route.abort('connectionrefused'))
  await page.goto('/')

  const status = page.getByTestId('backend-status')
  await expect(status).toContainText('Backend unavailable')
  await expect(status).toHaveAttribute('data-phase', 'error')

  await page.unroute(HEALTH_URL)
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(status).toHaveText('Backend connected: healthy')
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
})
