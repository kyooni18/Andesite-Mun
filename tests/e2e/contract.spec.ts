import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { expect, test } from '@playwright/test'
import { AndesiteClient, NotFound, RevisionConflict, Unauthorized } from '../../src/api/client'
import type { Platform } from '../../src/platform/types'
import { token } from './helpers'

// Contract tests: the typed client against the real server (nginx -> andesite-server), with every
// answer validated against the JSON Schemas the types were generated from (src/api/schemas/json).
// Uses the bearer token, as the desktop app does; the cookie path is covered by the UI suites.

const schemaDir = resolve(import.meta.dirname, '../../src/api/schemas/json')
const ajv = new Ajv2020({ strict: false, allErrors: true })
for (const file of readdirSync(schemaDir)) ajv.addSchema(JSON.parse(readFileSync(resolve(schemaDir, file), 'utf8')), file)

const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 18790}`

function bearer(secret: string): Platform {
  return {
    kind: 'desktop', baseUrl: baseURL,
    async authorize(init) { return { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${secret}` } } },
    async login() {}, async logout() {},
  }
}
const client = new AndesiteClient(bearer(token), 'main')

function conforms(schema: string, value: unknown) {
  const validate = ajv.getSchema(schema)!
  expect(validate(value), JSON.stringify(validate.errors)).toBe(true)
}

test('every route the app uses answers as its schema says', async () => {
  conforms('vaults.json', await client.vaults())
  await expect.poll(async () => (await client.status()).state).toBe('ready')
  conforms('status.json', await client.status())
  const page = await client.documents({ limit: 3 })
  conforms('documents.json', page)
  expect(page.documents).toHaveLength(3)
  conforms('documents.json', await client.documents({ tag: 'project' }))
  conforms('search.json', await client.search('design section'))
  conforms('search.json', await client.search('tag:project'))
  conforms('tags.json', await client.tags())
  conforms('properties.json', await client.properties())
  conforms('metadata.json', await client.metadata('Projects/Alpha.md'))
  conforms('links.json', await client.links('Projects/Alpha.md'))
  conforms('links.json', await client.links('Projects/Alpha.md', 'incoming'))
  conforms('mentions.json', await client.mentions('Projects/Alpha.md'))
  conforms('history.json', await client.history('Projects/Alpha.md'))
  conforms('snapshots.json', await client.snapshots())
  conforms('bookmarks.json', await client.bookmarks())
  expect((await client.allDocuments()).length).toBeGreaterThanOrEqual(8)
  const file = await client.file('Projects/Alpha.md')
  expect(file.revision).toMatch(/^[0-9a-f]{32}$/)
  expect(file.text).toContain('# Alpha')
})

test('the revision of a read is the revision the index reports', async () => {
  const file = await client.file('Projects/Beta.md')
  const hit = (await client.allDocuments()).find(document => document.path === 'Projects/Beta.md')!
  expect(hit.revision).toBe(file.revision)
})

test('errors arrive as typed errors', async () => {
  await expect(client.file('Nope.md')).rejects.toBeInstanceOf(NotFound)
  await expect(client.withVault('Nope').status()).rejects.toMatchObject({ code: 'vault_not_found' })
  await expect(new AndesiteClient(bearer('00'.repeat(32)), 'main').status()).rejects.toBeInstanceOf(Unauthorized)
  // A write with a stale revision is refused with the current revision (the write path comes in Phase 2;
  // this checks the error mapping on the real response).
  const current = (await client.file('Projects/Beta.md')).revision
  const conflict = await client.request('/v1/vaults/main/file', { path: 'Projects/Beta.md' }, { method: 'PUT', body: 'x', headers: { 'If-Match': `"${'0'.repeat(32)}"` } }).catch((error: unknown) => error)
  expect(conflict).toBeInstanceOf(RevisionConflict)
  expect((conflict as RevisionConflict).current).toBe(current)
})
