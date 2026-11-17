import { expect, test } from '@playwright/test'

test('evaluation shows the real dataset and no invented results', async ({ page }) => {
  await page.goto('/evaluations')
  await expect(page.getByTestId('dataset-summary')).toContainText('20')
  await expect(page.getByTestId('dataset-summary')).toContainText('ap-policies version 1.1.0')

  // Category counts read from evaluation/datasets/ap-policies-v1.1.0.json.
  const table = page.getByTestId('category-table')
  for (const [label, count] of [
    ['Direct', '5'],
    ['Multi-document', '3'],
    ['Ambiguous', '2'],
    ['Conflicting documents', '3'],
    ['Unanswerable', '3'],
    ['Out of scope', '2'],
    ['Prompt injection', '2'],
  ]) {
    await expect(table.getByRole('row', { name: `${label} ${count}` })).toBeVisible()
  }

  await expect(page.getByTestId('corpus-readiness').getByRole('listitem')).toHaveCount(7)
  await expect(page.getByRole('button', { name: 'Run evaluation' })).toBeDisabled()
  await expect(page.getByTestId('run-blocked-reason')).toContainText('No results are simulated')

  // Every metric says "Not run yet"; no percentage appears anywhere on the page.
  await expect(page.getByText('Not run yet', { exact: true })).toHaveCount(12)
  await expect(page.locator('main')).not.toContainText('%')
})

test('settings are read-only and never show secrets', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByText('Read-only', { exact: true })).toBeVisible()
  await expect(page.getByText('Not yet calibrated')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Backend health' })).toContainText('Healthy')
  await expect(page.locator('main').getByRole('textbox')).toHaveCount(0)
  await expect(page.locator('main').getByRole('combobox')).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText(/gsk_|replace_me/)
})

test('overview shows recent queries, latest evaluation and the empty workspace', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page.getByTestId('recent-queries').getByRole('listitem')).toHaveCount(5)
  await expect(page.getByTestId('latest-evaluation')).toContainText('Not run yet')

  await page.goto('/dashboard?mock=empty')
  await expect(page.getByTestId('empty-workspace')).toBeVisible()
  await expect(page.getByTestId('kpi-documents')).toContainText('0')
  await page.getByTestId('empty-workspace').getByRole('link', { name: 'Upload documents' }).click()
  await expect(page).toHaveURL(/\/documents$/)
})
