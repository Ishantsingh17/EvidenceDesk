import { expect, test } from '@playwright/test'

test('frontend loads with Tailwind styles applied', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('EvidenceDesk AI')
  const heading = page.getByRole('heading', { name: 'EvidenceDesk AI' })
  await expect(heading).toBeVisible()
  // font-semibold → 600 proves Tailwind utilities are compiled and applied.
  await expect(heading).toHaveCSS('font-weight', '600')
})
