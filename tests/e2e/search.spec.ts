import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

const results = (page: import('@playwright/test').Page) => page.getByRole('list', { name: 'Search results' }).getByRole('link')

test('full-text search finds notes and opens one', async ({ page }) => {
  await signIn(page)
  await page.getByRole('tab', { name: 'Search' }).click()
  await page.getByLabel('Search notes').fill('design section')
  await expect(page.getByRole('status').filter({ hasText: /notes?$/ })).toHaveText('1 note')
  await expect(results(page)).toHaveCount(1)
  await expect(results(page).first()).toContainText('Beta')
  await expect(results(page).first()).toContainText('Projects/Beta.md')
  await results(page).first().click()
  await expect(page).toHaveURL(/#\/main\/Projects\/Beta\.md$/)
  await expect(page.getByRole('heading', { name: 'Design' })).toBeVisible()

  await page.getByLabel('Search notes').fill('zzzz-no-such-text')
  await expect(page.getByRole('status').filter({ hasText: /notes?$/ })).toHaveText('0 notes')
})

test('tag: in the query and the tag filter narrow the results', async ({ page }) => {
  await signIn(page)
  await page.getByRole('tab', { name: 'Search' }).click()
  await page.getByLabel('Search notes').fill('tag:project')
  await expect(results(page)).toHaveCount(1)
  await expect(results(page).first()).toContainText('Alpha')

  await page.getByLabel('Search notes').fill('')
  await page.getByLabel('Filter by tag').selectOption('welcome')
  await expect(results(page)).toHaveCount(1)
  await expect(results(page).first()).toContainText('Welcome')
})

test('a property filter finds notes by frontmatter value', async ({ page }) => {
  await signIn(page)
  await page.getByRole('tab', { name: 'Search' }).click()
  await page.getByLabel('Filter by property').selectOption('status')
  await page.getByLabel('Property value').fill('draft')
  await expect(results(page)).toHaveCount(1)
  await expect(results(page).first()).toContainText('Alpha')
  await page.getByLabel('Property value').fill('published')
  await expect(results(page)).toHaveCount(0)
})

test('choosing a tag in the inspector searches for it', async ({ page }) => {
  await signIn(page, '/#/main/Projects/Alpha.md')
  await page.getByRole('tab', { name: 'Tags' }).click()
  await page.getByRole('button', { name: '#project' }).click()
  await expect(page.getByRole('tab', { name: 'Search' })).toHaveAttribute('aria-selected', 'true')
  await expect(results(page)).toHaveCount(1)
})
