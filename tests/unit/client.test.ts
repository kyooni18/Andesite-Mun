import { describe, expect, it } from 'vitest'
import { AndesiteClient, IndexNotReady, NetworkError, NotFound, RevisionConflict, StorageFull, Unauthorized } from '../../src/api/client'
import { loadIndex } from '../../src/api/service'
import { createWebPlatform } from '../../src/platform/web'

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

function clientWith(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return respond(url, init) }) as unknown as typeof fetch
  return { client: new AndesiteClient(createWebPlatform(fetchImpl), 'My Vault', fetchImpl), calls }
}

describe('AndesiteClient', () => {
  it('addresses the vault, encodes spaces as %20 (the server reads + literally) and marks web requests', async () => {
    const { client, calls } = clientWith(() => new Response('# Hi', { headers: { ETag: '"0123456789abcdef0123456789abcdef"' } }))
    const file = await client.file('Folder/한글 노트.md')
    expect(file).toEqual({ text: '# Hi', revision: '0123456789abcdef0123456789abcdef' })
    expect(calls[0].url).toBe('/v1/vaults/My%20Vault/file?path=Folder%2F%ED%95%9C%EA%B8%80%20%EB%85%B8%ED%8A%B8.md')
    expect(new Headers(calls[0].init.headers).get('X-Andesite-Client')).toBe('web')
    expect(calls[0].init.credentials).toBe('same-origin')
  })

  it('maps each server error to its typed error', async () => {
    const cases: [number, unknown, new (...args: never[]) => Error][] = [
      [412, { error: 'revision_conflict', current: 'abc' }, RevisionConflict],
      [503, { error: 'index_not_ready' }, IndexNotReady],
      [404, { error: 'not_found' }, NotFound],
      [404, { error: 'vault_not_found' }, NotFound],
      [507, { error: 'storage_full' }, StorageFull],
      [401, { error: 'authentication_required' }, Unauthorized],
    ]
    for (const [status, body, type] of cases) {
      const { client } = clientWith(() => json(status, body))
      await expect(client.status()).rejects.toBeInstanceOf(type)
    }
    const { client } = clientWith(() => json(412, { error: 'revision_conflict', current: 'abc' }))
    await expect(client.status()).rejects.toMatchObject({ current: 'abc', status: 412, code: 'revision_conflict' })
    const gone = clientWith(() => json(412, { error: 'revision_conflict', current: null }))
    await expect(gone.client.status()).rejects.toMatchObject({ current: null })
  })

  it('reports an unreachable server as a NetworkError, but lets an abort through', async () => {
    const { client } = clientWith(() => { throw new TypeError('Failed to fetch') })
    await expect(client.status()).rejects.toBeInstanceOf(NetworkError)
    const controller = new AbortController()
    controller.abort()
    const aborting = clientWith(() => { throw new DOMException('Aborted', 'AbortError') })
    await expect(aborting.client.search('x', {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('pages through every document', async () => {
    const { client, calls } = clientWith(url => {
      const offset = Number(/offset=(\d+)/.exec(url)![1])
      return json(200, { documents: [{ path: `n${offset}.md` }], total: 2, nextOffset: offset === 0 ? 1 : null })
    })
    expect((await client.allDocuments()).map(document => document.path)).toEqual(['n0.md', 'n1.md'])
    expect(calls).toHaveLength(2)
  })
})

describe('loadIndex', () => {
  it('waits for a vault that is still scanning instead of failing', async () => {
    let attempts = 0
    const { client } = clientWith(() => (++attempts < 3 ? json(503, { error: 'index_not_ready' }) : json(200, { documents: [{ path: 'a.md', kind: 'markdown', revision: 'r' }], total: 1, nextOffset: null })))
    let waiting = 0
    const index = await loadIndex(client, { onWaiting: () => { waiting += 1 }, delay: async () => undefined })
    expect(waiting).toBe(2)
    expect(index.tree.map(node => node.name)).toEqual(['a'])
  })

  it('gives up after its patience and passes other errors through at once', async () => {
    const stuck = clientWith(() => json(503, { error: 'index_not_ready' }))
    await expect(loadIndex(stuck.client, { patience: 2, delay: async () => undefined })).rejects.toBeInstanceOf(IndexNotReady)
    const denied = clientWith(() => json(401, { error: 'authentication_required' }))
    await expect(loadIndex(denied.client, { delay: async () => undefined })).rejects.toBeInstanceOf(Unauthorized)
  })
})

describe('web platform', () => {
  it('trades the token for a session once, and ends it on the server before the browser', async () => {
    const seen: string[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push(`${init.method} ${url}`)
      if (url === '/auth/session' && init.method === 'POST') return JSON.parse(String(init.body)).token === 'good' ? json(201, { expiresIn: 1 }) : json(401, { error: 'authentication_required' })
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    const platform = createWebPlatform(fetchImpl)
    await expect(platform.login('bad')).rejects.toBeInstanceOf(Unauthorized)
    await platform.login('good')
    await platform.logout()
    expect(seen.slice(-2)).toEqual(['DELETE /v1/session', 'DELETE /auth/session'])
  })
})
