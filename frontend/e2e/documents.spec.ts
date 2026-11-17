import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

// Mock mode. Each page load starts from the same in-memory demo workspace.
// A real committed corpus file: its SHA-256 matches a demo document, so it is a duplicate.
const corpusPath = path.resolve(import.meta.dirname, '../../sample-corpus/06-payment-approval-policy-v2.pdf')
const corpusFile = {
  name: '06-payment-approval-policy-v2.pdf',
  mimeType: 'application/pdf',
  buffer: readFileSync(corpusPath),
}
const newPdf = {
  name: 'fictional-memo.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% Fictional test memo for upload simulation\n%%EOF\n'),
}
const notPdf = { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('plain text') }

test.beforeEach(async ({ page }) => {
  await page.goto('/documents')
  await expect(page.getByTestId('document-row')).toHaveCount(7)
})

test('rejects duplicates by real SHA-256 and non-PDF files', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles([corpusFile, notPdf])
  const queue = page.getByTestId('upload-queue')
  await expect(queue.getByTestId('upload-item').filter({ hasText: '06-payment-approval-policy-v2.pdf' })).toContainText(
    'Already uploaded',
  )
  await expect(queue.getByTestId('upload-item').filter({ hasText: 'notes.txt' })).toContainText('Not a PDF')
})

test('simulated upload is clearly marked and never added to the library', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles(newPdf)
  const item = page.getByTestId('upload-item').filter({ hasText: 'fictional-memo.pdf' })
  await expect(item.getByTestId('simulated-notice')).toBeVisible()
  await expect(item.getByTestId('simulation-result')).toBeVisible({ timeout: 10_000 })
  await expect(item.locator('[data-state=completed]')).toHaveCount(5)
  await expect(page.getByTestId('document-row')).toHaveCount(7)
  await expect(page.getByText('fictional-memo.pdf')).toHaveCount(1) // only in the queue
})

test('search and status filter narrow the library', async ({ page }) => {
  await page.getByRole('searchbox', { name: 'Search documents by filename' }).fill('payment')
  await expect(page.getByTestId('document-row')).toHaveCount(2)
  await page.getByRole('combobox', { name: 'Filter by status' }).click()
  await page.getByRole('option', { name: 'Failed' }).click()
  await expect(page.getByText('No documents match')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByTestId('document-row')).toHaveCount(7)
})

test('detail panel shows real page diagnostics and the stored timeline', async ({ page }) => {
  await page.getByRole('button', { name: '04-invoice-processing-guidelines.pdf' }).click()
  const panel = page.getByRole('dialog')
  await expect(panel.getByRole('heading', { name: 'Page diagnostics' })).toBeVisible()
  // Character counts measured from the committed PDF.
  await expect(panel.getByRole('cell', { name: '1,504' })).toBeVisible()
  await expect(panel.getByRole('cell', { name: '1,372' })).toBeVisible()
  await expect(panel.getByTitle('4b7cb62264e76c6f234bde3a08dc49c5a2e7857698152b1e844f74ff6b721432')).toBeVisible()
  await expect(panel.locator('[data-stage][data-state=completed]')).toHaveCount(5)
})

test('reprocess runs a simulated job that completes stage by stage', async ({ page }) => {
  await page.getByRole('button', { name: '02-accounts-payable-sop.pdf' }).click()
  const panel = page.getByRole('dialog')
  await panel.getByRole('button', { name: 'Reprocess' }).click()
  await expect(panel.getByTestId('simulated-notice')).toBeVisible()
  await expect(panel.getByText('Attempt 2, reprocess')).toBeVisible()
  await expect(panel.locator('[data-stage][data-state=completed]')).toHaveCount(5, { timeout: 10_000 })
  await expect(panel.getByRole('button', { name: 'Reprocess' })).toBeEnabled()
})

test('delete asks for confirmation and reports the result honestly', async ({ page }) => {
  await page.getByRole('button', { name: '03-vendor-onboarding-policy.pdf' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toContainText('keep their saved snapshots')
  await confirm.getByRole('button', { name: 'Keep document' }).click()
  await expect(page.getByTestId('document-row')).toHaveCount(7)

  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete document' }).click()
  await expect(page.getByText('03-vendor-onboarding-policy.pdf deleted')).toBeVisible()
  await expect(page.getByText('removed from this browser session only')).toBeVisible()
  await expect(page.getByTestId('document-row')).toHaveCount(6)
})
