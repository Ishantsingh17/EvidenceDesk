import { expect, test } from '@playwright/test'

// Runs against the live-mode dev server. The workspace endpoints do not exist yet
// (and this origin is not CORS-allowed), so every data panel must show an error or
// not-available state and must never fall back to mock data (CLAUDE.md §4).

const errorStates = '[data-state="error"], [data-state="not-available"]'

test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard')
})

test('overview never shows mock data', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('EvidenceDesk AI')
  await expect(page.locator(errorStates).first()).toBeVisible()
  await expect(page.getByTestId('mock-mode-banner')).toHaveCount(0)
  await expect(page.getByTestId('demo-data-tag')).toHaveCount(0)
  await expect(page.getByText('06-payment-approval-policy-v2.pdf')).toHaveCount(0)
  await expect(page.getByTestId('kpi-documents')).toHaveCount(0)
  await expect(page.getByText('Live API mode')).toBeVisible()
})

test('documents, assistant, evaluation and settings show unavailable states', async ({ page }) => {
  await page.goto('/documents')
  await expect(page.locator(errorStates).first()).toBeVisible()
  await expect(page.getByTestId('document-row')).toHaveCount(0)

  await page.goto('/assistant')
  await page.getByRole('button', { name: /What three records are compared/ }).click()
  await expect(page.getByText('The question could not be sent')).toBeVisible()
  await expect(page.getByTestId('answer')).toHaveCount(0)

  await page.goto('/evaluations')
  await expect(page.locator(errorStates).first()).toBeVisible()
  await expect(page.getByTestId('category-table')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Run evaluation' })).toBeDisabled()

  await page.goto('/settings')
  await expect(page.getByRole('region', { name: 'Models and retrieval' }).locator(errorStates)).toBeVisible()
  await expect(page.getByTestId('demo-data-tag')).toHaveCount(0)
})
