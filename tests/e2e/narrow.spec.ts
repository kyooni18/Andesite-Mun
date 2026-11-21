import { expect, test } from '@playwright/test'
import { note, signIn } from './helpers'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

test('on a phone the note fills the screen and the sidebar and inspector open as sheets', async ({ page }) => {
  await signIn(page, '/#/main/Projects/Alpha.md')
  await expect(note(page)).toContainText('Alpha builds on')

  // No sidebar, inspector or horizontal scrolling next to the note.
  await expect(page.locator('.nsv-sidebar')).toHaveCount(0)
  await expect(page.locator('.inspector-column')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const box = await note(page).boundingBox()
  expect(box!.width).toBeGreaterThan(340)
  await page.screenshot({ path: 'docs/screenshots/phase1-note-phone.png' })

  // The sidebar sheet: browse to another note, which also dismisses it.
  await page.getByRole('button', { name: 'Show or hide the sidebar' }).click()
  const sheet = page.getByRole('dialog', { name: 'Sidebar' })
  await expect(sheet).toBeVisible()
  expect(await sheet.boundingBox().then(b => b!.width)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'docs/screenshots/phase1-sidebar-sheet-phone.png' })
  await sheet.getByRole('link', { name: 'Welcome', exact: true }).tap()
  await expect(page).toHaveURL(/#\/main\/Welcome\.md$/)
  await expect(sheet).toHaveCount(0)
  await expect(note(page)).toContainText('seeded vault')

  // The inspector sheet.
  await page.getByRole('button', { name: 'Show or hide the inspector' }).click()
  const inspector = page.getByRole('dialog', { name: 'Inspector' })
  await expect(inspector).toBeVisible()
  await inspector.getByRole('tab', { name: 'Outgoing' }).tap()
  await expect(inspector.getByRole('list', { name: 'Outgoing links' })).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/phase1-inspector-sheet-phone.png' })
  await inspector.getByRole('button', { name: 'Close inspector' }).tap()
  await expect(inspector).toHaveCount(0)

  // Tapping the backdrop dismisses the sidebar too.
  await page.getByRole('button', { name: 'Show or hide the sidebar' }).click()
  await expect(sheet).toBeVisible()
  await page.mouse.click(195, 20)
  await expect(sheet).toHaveCount(0)
})

test('search works inside the phone sidebar sheet', async ({ page }) => {
  await signIn(page, '/#/main/Welcome.md')
  await page.getByRole('button', { name: 'Show or hide the sidebar' }).click()
  const sheet = page.getByRole('dialog', { name: 'Sidebar' })
  await sheet.getByRole('tab', { name: 'Search' }).click()
  await sheet.getByLabel('Search notes').fill('design section')
  await sheet.getByRole('list', { name: 'Search results' }).getByRole('link').first().tap()
  await expect(page).toHaveURL(/#\/main\/Projects\/Beta\.md$/)
  await expect(sheet).toHaveCount(0)
})

test('the layout follows the width: widening the window brings the columns back', async ({ page }) => {
  await signIn(page, '/#/main/Welcome.md')
  await expect(page.locator('.nsv')).toHaveAttribute('data-size-class', 'compact')
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.locator('.nsv')).toHaveAttribute('data-size-class', 'regular')
  await expect(page.locator('.nsv-sidebar')).toBeVisible()
  await expect(page.locator('.inspector-column')).toBeVisible()
})
