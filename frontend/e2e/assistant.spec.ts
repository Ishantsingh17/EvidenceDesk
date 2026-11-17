import { expect, test } from '@playwright/test'

// Mock mode: prepared answers exist only for example questions from the dataset.

test.beforeEach(async ({ page }) => {
  await page.goto('/assistant')
  await expect(page.getByTestId('example-questions')).toBeVisible()
})

test('answers with a timeline, validated citations and retrieval details', async ({ page }) => {
  await page.getByRole('button', { name: /What three records are compared/ }).click()
  const timeline = page.locator('aside').getByRole('list', { name: 'Query stages' })
  await expect(page.locator('aside').getByTestId('simulated-notice')).toBeVisible()
  await expect(timeline.locator('[data-state=completed]')).toHaveCount(6, { timeout: 10_000 })

  const answer = page.getByTestId('answer')
  await expect(answer).toHaveAttribute('data-status', 'completed')
  await expect(page.getByTestId('answer-text')).toContainText('the goods receipt or service-entry confirmation')
  await expect(page.getByTestId('citation-card')).toHaveCount(2)
  await expect(page.getByTestId('citation-card').first()).toContainText('02-accounts-payable-sop.pdf')
  await expect(page.getByTestId('citation-card').first()).toContainText('Page 1')

  await page.getByRole('button', { name: 'Go to source S2' }).click()
  await expect(page.locator('#citation-S2')).toBeFocused()

  await page.getByRole('button', { name: /Retrieval details/ }).click()
  await expect(page.getByText('Distance is cosine distance: lower is closer. It is not a percentage.')).toBeVisible()
  await expect(page.locator('#retrieval-panel').getByRole('row')).toHaveCount(5) // header + 4 passages
})

test('conflicting sources are flagged for review', async ({ page }) => {
  await page.getByRole('button', { name: /Do Version 1.0 and Version 2.0 agree/ }).click()
  await expect(page.getByText('Flagged for review')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('The model reported uncertainty, ambiguity or conflicting sources.')).toBeVisible()
})

test('unanswerable questions abstain without citations', async ({ page }) => {
  await page.getByRole('button', { name: /bank account number of Northstar/ }).click()
  await expect(page.getByTestId('answer')).toHaveAttribute('data-status', 'insufficient_evidence', { timeout: 10_000 })
  await expect(page.getByText('The assistant does not guess')).toBeVisible()
  await expect(page.getByTestId('citation-card')).toHaveCount(0)
  await expect(page.getByText('Evidence threshold not calibrated yet')).toBeVisible()
})

test('mock mode refuses questions it has no prepared answer for', async ({ page }) => {
  await page.getByLabel('Your question').fill('What is the travel per-diem for Mumbai?')
  await page.keyboard.press('Control+Enter')
  await expect(page.getByText('No prepared answer in mock mode')).toBeVisible()
  await expect(page.getByTestId('answer')).toHaveCount(0)
})

test('history reopens a stored answer and Overview links deep-link to it', async ({ page }) => {
  await page.getByTestId('query-history').getByRole('button', { name: /How must a vendor bank-detail change/ }).click()
  await expect(page.getByTestId('answer-text')).toContainText('separate checker')
  await expect(page.locator('aside').locator('[data-stage][data-state=completed]')).toHaveCount(6)

  await page.goto('/dashboard')
  await page.getByTestId('recent-queries').getByRole('link', { name: /What three records/ }).click()
  await expect(page).toHaveURL(/\/assistant$/)
  await expect(page.getByTestId('answer-text')).toContainText('purchase order')
})
