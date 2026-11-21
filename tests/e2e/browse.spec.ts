import { expect, test } from '@playwright/test'
import { note, openFolders, signIn } from './helpers'

test('browsing the tree opens a note, rendered as Markdown', async ({ page }) => {
  await signIn(page)
  await openFolders(page, 'Projects')
  const tree = page.getByRole('navigation', { name: 'Notes' })
  await tree.getByRole('link', { name: 'Alpha', exact: true }).click()

  await expect(page).toHaveURL(/#\/main\/Projects\/Alpha\.md$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha' }).first()).toBeVisible()
  await expect(tree.getByRole('link', { name: 'Alpha' })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.path-bar')).toHaveText('Projects')

  // Markdown: task list, callout, table, highlighted code, KaTeX, and the image embed.
  await expect(note(page).locator('input[type=checkbox]')).toHaveCount(2)
  await expect(note(page).locator('.callout-title')).toHaveText('Remember')
  await expect(note(page).locator('table th')).toHaveText(['Name', 'Value'])
  await expect(note(page).locator('pre code.hljs .hljs-keyword').first()).toBeVisible()
  await expect(note(page).locator('.math .katex').first()).toBeVisible()
  await expect(note(page).locator('.math-display .katex-display')).toBeVisible()
  const image = note(page).locator('img.embed')
  await expect(image).toHaveAttribute('src', '/v1/vaults/main/file?path=Projects%2Fdiagram.png')
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0)

  // Tree state survives a reload: the open folder stays open and the note is reloaded from the URL.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha' }).first()).toBeVisible()
  await expect(tree.getByRole('button', { name: 'Projects', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await page.screenshot({ path: 'docs/screenshots/phase1-note-desktop.png' })
})

test('non-ASCII names work in the tree, the URL and the page', async ({ page }) => {
  await signIn(page)
  await page.getByRole('navigation', { name: 'Notes' }).getByRole('link', { name: '한글 노트' }).click()
  await expect(page).toHaveURL(new RegExp('#/main/' + encodeURIComponent('한글 노트.md') + '$'))
  await expect(note(page)).toContainText('유니코드 제목')
})

test('hostile HTML in a note is sanitized and nothing runs', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await signIn(page)
  await page.getByRole('navigation', { name: 'Notes' }).getByRole('link', { name: 'Unsafe', exact: true }).click()
  await expect(note(page)).toContainText('After the payload.')
  await page.waitForTimeout(300)

  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__pwned)).toBeUndefined()
  const html = await note(page).innerHTML()
  expect(html).not.toMatch(/<script|<iframe|onerror|onclick|javascript:|style=/i)
  // The visible text survives, and the page keeps its layout: the overlay div did not cover it.
  await expect(note(page)).toContainText('overlay')
  await note(page).getByText('click me').click({ trial: true })
  expect(errors).toEqual([])
})

test('a note that does not exist says so and the app keeps working', async ({ page }) => {
  await signIn(page, '/#/main/Nope/Missing.md')
  await expect(page.getByRole('alert')).toContainText('There is no note at Nope/Missing.md')
  await page.getByRole('navigation', { name: 'Notes' }).getByRole('link', { name: 'Welcome', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome' }).first()).toBeVisible()
})

test('switching vaults shows that vault and its URL', async ({ page }) => {
  await signIn(page)
  await page.getByLabel('Vault').selectOption('Work')
  await expect(page).toHaveURL(/#\/Work$/)
  const tree = page.getByRole('navigation', { name: 'Notes' })
  await expect(tree.getByRole('link', { name: 'Todo' })).toBeVisible()
  await expect(tree.getByRole('link', { name: 'Welcome' })).toHaveCount(0)
  await tree.getByRole('link', { name: 'Plan' }).click()
  await expect(note(page)).toContainText('Planned work.')
})
