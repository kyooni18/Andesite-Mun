import { expect, test } from '@playwright/test'
import { note, signIn } from './helpers'

test('wiki links are resolved by the server: found, missing and ambiguous look different', async ({ page }) => {
  await signIn(page, '/#/main/Welcome.md')
  await expect(note(page)).toContainText('Start with the Alpha project')
  const resolved = note(page).locator('a.wikilink.resolved', { hasText: 'the Alpha project' })
  await expect(resolved).toHaveAttribute('href', '#/main/Projects/Alpha.md')
  const missing = note(page).locator('.wikilink.missing')
  await expect(missing).toHaveText('Missing Note')
  expect(await missing.evaluate(element => element.tagName)).toBe('SPAN') // nowhere to go
  const ambiguous = note(page).locator('.wikilink.ambiguous')
  await expect(ambiguous).toHaveText('Notes')
  expect(await ambiguous.evaluate(element => element.tagName)).toBe('SPAN')
  // All three are styled apart.
  const colors = await Promise.all([resolved, missing, ambiguous].map(locator => locator.evaluate(element => getComputedStyle(element).borderBottomStyle + '|' + getComputedStyle(element).color)))
  expect(new Set(colors).size).toBe(3)
  // External links open elsewhere, safely.
  const external = note(page).getByRole('link', { name: 'Andesite' })
  await expect(external).toHaveAttribute('target', '_blank')
  await expect(external).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(note(page).locator('a.tag', { hasText: '#seed' })).toBeVisible()
})

test('following a wiki link opens the note, and Back and Forward walk the history', async ({ page }) => {
  await signIn(page, '/#/main/Welcome.md')
  await note(page).getByRole('link', { name: 'the Alpha project' }).click()
  await expect(page).toHaveURL(/#\/main\/Projects\/Alpha\.md$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha' }).first()).toBeVisible()

  await note(page).getByRole('link', { name: 'Beta', exact: true }).first().click()
  await expect(page).toHaveURL(/#\/main\/Projects\/Beta\.md$/)
  await expect(note(page)).toContainText('Beta is linked from')

  await page.goBack()
  await expect(page).toHaveURL(/#\/main\/Projects\/Alpha\.md$/)
  await expect(note(page)).toContainText('Alpha builds on')
  await page.goBack()
  await expect(page).toHaveURL(/#\/main\/Welcome\.md$/)
  await expect(note(page)).toContainText('seeded vault')
  await page.goForward()
  await expect(note(page)).toContainText('Alpha builds on')
})

test('a link with a heading scrolls to it, and one to a missing heading is marked', async ({ page }) => {
  await signIn(page, '/#/main/Projects/Alpha.md')
  await expect(note(page)).toContainText('Alpha builds on')
  const design = note(page).locator('a.wikilink', { hasText: 'Beta > Design' })
  await expect(design).toHaveAttribute('href', '#/main/Projects/Beta.md?heading=Design')
  await expect(design).not.toHaveClass(/fragment-missing/)
  await expect(note(page).locator('a.wikilink', { hasText: 'No Such Heading' })).toHaveClass(/fragment-missing/)
  await design.click()
  await expect(page).toHaveURL(/#\/main\/Projects\/Beta\.md\?heading=Design$/)
  await expect(note(page)).toContainText('The design section of Beta')
})

test('the inspector shows outline, backlinks, outgoing links, mentions, tags and properties', async ({ page }) => {
  await signIn(page, '/#/main/Projects/Alpha.md')
  const inspector = page.getByRole('complementary', { name: 'Inspector' })

  // Outline: nested headings; choosing one scrolls the note there.
  await expect(inspector.getByRole('button', { name: 'Math and code' })).toBeVisible()
  await expect(inspector.getByRole('heading', { name: /^Outline/ })).toBeVisible()
  await inspector.getByRole('button', { name: 'Closing' }).click()
  await expect(page).toHaveURL(/heading=closing$/)
  await expect(page.getByRole('heading', { name: 'Closing' })).toBeInViewport()

  await inspector.getByRole('tab', { name: 'Backlinks' }).click()
  const backlinks = inspector.getByRole('list', { name: 'Backlinks' })
  await expect(backlinks.getByRole('link')).toHaveText(['Beta', 'Welcome'])
  const mentions = inspector.getByRole('list', { name: 'Unlinked mentions' })
  await expect(mentions.getByRole('link', { name: 'Journal' })).toBeVisible()
  await expect(mentions).toContainText('mentions "Alpha"')

  await inspector.getByRole('tab', { name: 'Outgoing' }).click()
  const outgoing = inspector.getByRole('list', { name: 'Outgoing links' })
  await expect(outgoing.getByRole('link', { name: 'Welcome' })).toBeVisible()
  await expect(outgoing.getByRole('link', { name: 'diagram.png' })).toBeVisible()

  await inspector.getByRole('tab', { name: 'Tags' }).click()
  await expect(inspector.getByRole('button', { name: /^#/ })).toHaveText(['#active', '#project'])

  await inspector.getByRole('tab', { name: 'Properties' }).click()
  const properties = inspector.getByRole('definition')
  await expect(inspector.getByRole('term')).toHaveText(['title', 'tags', 'status', 'priority', 'reviewed', 'aliases'])
  await expect(properties.nth(2)).toHaveText('draft')
  await expect(properties.nth(3)).toHaveText('2')
  await expect(properties.nth(4)).toHaveText('Yes')
  await expect(properties.nth(5)).toHaveText('Project AAlpha')
})

test('backlinks lead to the linking note', async ({ page }) => {
  await signIn(page, '/#/main/Projects/Beta.md')
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await inspector.getByRole('tab', { name: 'Backlinks' }).click()
  await inspector.getByRole('list', { name: 'Backlinks' }).getByRole('link', { name: 'Alpha' }).click()
  await expect(page).toHaveURL(/#\/main\/Projects\/Alpha\.md$/)
  await expect(note(page)).toContainText('Alpha builds on')
})

test('a deep link opens the note, its folder and its heading in a fresh browser tab', async ({ page, context }) => {
  await signIn(page)
  const deep = await context.newPage() // shares the session cookie, like opening a link in a new tab
  await deep.goto('/#/main/Projects/Alpha.md?heading=closing')
  await expect(deep.getByRole('heading', { level: 1, name: 'Alpha' }).first()).toBeVisible()
  await expect(deep.getByRole('navigation', { name: 'Notes' }).getByRole('button', { name: 'Projects', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await expect(deep.getByRole('heading', { name: 'Closing' })).toBeInViewport()

  // Without a session, the deep link asks for the token first and then lands on the same note.
  const anonymous = await (await context.browser()!.newContext()).newPage()
  await anonymous.goto('/#/main/Projects/Beta.md')
  await anonymous.getByLabel('API token').fill(process.env.E2E_TOKEN ?? 'ab'.repeat(32))
  await anonymous.getByRole('button', { name: 'Sign in' }).click()
  await expect(anonymous.getByRole('heading', { name: 'Design' })).toBeVisible()
  await expect(anonymous).toHaveURL(/#\/main\/Projects\/Beta\.md$/)
})
