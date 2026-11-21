import { expect, type Page } from '@playwright/test'

/** The API token of the stack under test (scripts/e2e-stack.mjs uses this one by default). */
export const token = process.env.E2E_TOKEN ?? 'ab'.repeat(32)

/** Signs in through the login form and waits for the notes of `main` to be listed. */
export async function signIn(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await page.getByLabel('API token').fill(token)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // The wide layout shows the tree at once; on a phone it is in a sheet, so wait for the window itself.
  await expect(page.locator('.content-view')).toBeVisible()
}

export async function waitForTree(page: Page): Promise<void> {
  await expect(page.getByRole('navigation', { name: 'Notes' }).getByRole('link').first()).toBeVisible()
}

/** Opens `Folder/Sub` in the sidebar tree, one folder after the other. */
export async function openFolders(page: Page, ...folders: string[]): Promise<void> {
  const tree = page.getByRole('navigation', { name: 'Notes' })
  for (const folder of folders) {
    const button = tree.getByRole('button', { name: folder, exact: true })
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
  }
}

export const note = (page: Page) => page.locator('.markdown-body')
