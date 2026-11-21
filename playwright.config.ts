import { defineConfig, devices } from '@playwright/test'

// The end-to-end tests run against a real Andesite deployment: either one you point them at
// (E2E_BASE_URL, with its API token in E2E_TOKEN; for example `docker compose up` of the Andesite
// repo with this build in deploy/www and tests/e2e/seed as the vaults), or the stack that
// scripts/e2e-stack.mjs starts: andesite-server serve-all + nginx with the deployment's nginx.conf.
const external = process.env.E2E_BASE_URL
const port = Number(process.env.E2E_PORT ?? 18790)

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    trace: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: external ? undefined : {
    command: 'node scripts/e2e-stack.mjs',
    url: `http://localhost:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
