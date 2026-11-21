import { expect, test } from '@playwright/test'
import { signIn, token, waitForTree } from './helpers'

test('the site asks for the token, rejects a wrong one, and then lists the notes of main', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Andesite' })).toBeVisible()

  await page.getByLabel('API token').fill('00'.repeat(32))
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('That token was not accepted.')

  await page.getByLabel('API token').fill(token)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await waitForTree(page)

  // The vault picker lists the vaults of the server (GET /v1/vaults); `main` is open.
  const picker = page.getByLabel('Vault')
  await expect(picker.locator('option')).toHaveText(['Work', 'main'])
  await expect(picker).toHaveValue('main')
  await expect(page).toHaveURL(/#\/main$/)

  // Every note of the seeded vault is in the tree.
  const tree = page.getByRole('navigation', { name: 'Notes' })
  await expect(tree.getByRole('button', { name: 'Projects', exact: true })).toBeVisible()
  await expect(tree.getByRole('link', { name: 'Welcome', exact: true })).toBeVisible()
  await expect(tree.getByRole('link', { name: '한글 노트' })).toBeVisible()
  await expect(page.getByText('8 notes. Choose one in the sidebar')).toBeVisible()

  await page.screenshot({ path: 'docs/screenshots/phase0-login-lists-notes.png' })
})

test('the API token is never kept where page scripts can read it', async ({ page, context }) => {
  await signIn(page)
  const leaks = await page.evaluate(token => {
    const holders = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage }), location.href, document.cookie, document.documentElement.outerHTML]
    return holders.filter(text => text.includes(token)).length
  }, token)
  expect(leaks).toBe(0)

  // The session is an HttpOnly cookie scoped to /v1, invisible to document.cookie.
  const cookies = await context.cookies()
  const session = cookies.find(cookie => cookie.name === 'andesite_session')!
  expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/v1' })
  expect(session.value).not.toContain(token)
  expect(await page.evaluate(() => document.cookie)).toBe('')

  // The cookie alone authenticates reads; a page reload stays signed in.
  await page.reload()
  await waitForTree(page)
})

test('signing out ends the session on the server', async ({ page, context }) => {
  await signIn(page)
  const cookie = (await context.cookies()).find(item => item.name === 'andesite_session')!
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByLabel('API token')).toBeVisible()
  // Even the old cookie value no longer works.
  const status = await page.request.get('/v1/vaults', { headers: { Cookie: `andesite_session=${cookie.value}` } })
  expect(status.status()).toBe(401)
  await page.reload()
  await expect(page.getByLabel('API token')).toBeVisible()
})

test('the deployment sends a strict CSP and long-lived caching for hashed assets', async ({ page, request }) => {
  const response = await request.get('/')
  const csp = response.headers()['content-security-policy']
  expect(csp).toContain("script-src 'self'")
  expect(csp).not.toContain("'unsafe-eval'")
  expect(csp).toContain("default-src 'none'")
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
  expect(response.headers()['referrer-policy']).toBe('no-referrer')
  expect(response.headers()['cache-control']).toBe('no-cache')

  const html = await response.text()
  const asset = /assets\/[^"']+\.js/.exec(html)![0]
  const hashed = await request.get('/' + asset)
  expect(hashed.headers()['cache-control']).toContain('immutable')
  expect(hashed.headers()['cache-control']).toContain('max-age=31536000')
  expect(hashed.headers()['content-type']).toContain('javascript')
  // The CSP is enforced: no console violations while the app runs.
  const violations: string[] = []
  page.on('console', message => { if (/Content Security Policy/i.test(message.text())) violations.push(message.text()) })
  await signIn(page)
  expect(violations).toEqual([])
})
