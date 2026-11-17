import { expect, test, type Page } from '@playwright/test'

// Runs against the mock-mode dev server (see playwright.config.ts).

const pages = [
  { label: 'Documents', path: '/documents' },
  { label: 'AI Assistant', path: '/assistant' },
  { label: 'Evaluation', path: '/evaluations' },
  { label: 'Settings', path: '/settings' },
  { label: 'Overview', path: '/dashboard' },
]

async function expectNoHorizontalScroll(page: Page) {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }))
  expect(scrollW).toBeLessThanOrEqual(clientW)
}

test('overview loads with design system, mock indicator and demo data', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page).toHaveTitle('EvidenceDesk AI')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /^(Good (morning|afternoon|evening), welcome|Welcome) to EvidenceDesk AI$/,
  )
  await expect(page.getByTestId('mock-mode-banner')).toBeVisible()
  await expect(page.getByTestId('kpi-documents')).toContainText('7')
  await expect(page.getByTestId('demo-data-tag').first()).toBeVisible()
  await expect(page.getByRole('cell', { name: /06-payment-approval-policy-v2\.pdf/ })).toBeVisible()
  // Tailwind tokens compiled: IBM Plex Sans applied to the body.
  await expect(page.locator('body')).toHaveCSS('font-family', /IBM Plex Sans/)
})

test('sidebar navigates to every page and marks the active item', async ({ page }) => {
  await page.goto('/dashboard')
  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const { label, path } of pages) {
    await nav.getByRole('link', { name: label }).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(label)
  }
  await expect(page.getByRole('heading', { level: 1 })).toContainText('welcome to EvidenceDesk AI')
})

test('planned screens say they are not built yet', async ({ page }) => {
  await page.goto('/assistant')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI Assistant')
  await expect(page.getByText('The AI Assistant screen is not built yet')).toBeVisible()
  await page.getByRole('link', { name: 'Back to overview' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('keyboard users can skip to content and reach navigation', async ({ page }) => {
  await page.goto('/dashboard')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Overview' }),
  ).toBeFocused()
})

test('unknown routes show a not-found page', async ({ page }) => {
  await page.goto('/does-not-exist')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
})

test('quick actions open their destinations', async ({ page }) => {
  await page.goto('/dashboard')
  const actions = page.getByRole('region', { name: 'Quick actions' })
  await actions.getByRole('link', { name: /Open AI Assistant/ }).click()
  await expect(page).toHaveURL(/\/assistant$/)
  await page.goBack()
  await actions.getByRole('link', { name: /Upload documents/ }).click()
  await expect(page).toHaveURL(/\/documents$/)
  await page.goBack()
  await actions.getByRole('link', { name: /View evaluation/ }).click()
  await expect(page).toHaveURL(/\/evaluations$/)
})

test('sidebar collapses to an icon rail with accessible names', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  const expand = page.getByRole('button', { name: 'Expand sidebar' })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  const docs = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Documents' })
  await expect(docs).toBeVisible()
  await docs.hover()
  await expect(page.getByRole('tooltip', { name: 'Documents' })).toBeVisible()
  await expand.click()
  await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible()
})

test('workspace menu opens and links to settings', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Workspace menu' }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toContainText('No sign-in in this proof of concept')
  await expect(menu.getByRole('menuitem', { name: /API reference/ })).toHaveAttribute(
    'href',
    'http://127.0.0.1:8000/docs',
  )
  await menu.getByRole('menuitem', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
})

for (const width of [1440, 1280, 768, 390]) {
  test(`layout has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/dashboard')
    await expect(page.getByTestId('kpi-documents')).toBeVisible()
    await expectNoHorizontalScroll(page)
    const sidebarVisible = await page.getByRole('navigation', { name: 'Main' }).isVisible()
    expect(sidebarVisible).toBe(width >= 1024)
  })
}

test('mobile drawer opens, navigates and closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const drawer = page.getByRole('dialog', { name: 'Navigation' })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(drawer).toBeHidden()
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('KPI values appear immediately without counting', async ({ page }) => {
    await page.goto('/dashboard')
    const queries = page.getByTestId('kpi-queries')
    await expect(queries).toBeVisible()
    // Read once, as soon as the cell exists: with reduced motion there is no count-up,
    // so the final value is already rendered (a count-up would start at 0).
    expect(await queries.locator('dd > span').first().textContent()).toBe('12')
  })
})
