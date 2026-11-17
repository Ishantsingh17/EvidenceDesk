import { expect, test } from '@playwright/test'

// Runs against the live-mode dev server. The dashboard/documents/queries/settings
// endpoints do not exist yet, so live mode must show unavailable states and must
// never fall back to mock data (CLAUDE.md §4).

test('live mode never shows mock data', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('EvidenceDesk AI')

  // Every data panel settles into an error / not-available state.
  await expect(page.locator('[data-state="error"], [data-state="not-available"]')).toHaveCount(3)

  await expect(page.getByTestId('mock-mode-banner')).toHaveCount(0)
  await expect(page.getByTestId('demo-data-tag')).toHaveCount(0)
  await expect(page.getByText('06-payment-approval-policy-v2.pdf')).toHaveCount(0)
  await expect(page.getByTestId('kpi-documents')).toHaveCount(0)
  await expect(page.getByText('Live API mode')).toBeVisible()
})
