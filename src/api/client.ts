import { NetworkError, apiErrorFor } from './errors'
import type { Platform } from '../platform/types'
import type {
  Bookmarks, DocumentsPage, History, LinksPage, Mentions, Metadata, PropertiesPage, SearchResults, Snapshots,
  Status, TagsPage, Vaults,
} from './types'

export * from './errors'
export type * from './types'

export interface QueryFilter {
  tag?: string
  property?: string
  value?: string
}

export interface FileContent {
  text: string
  /** The revision the text belongs to (the `ETag`). Send it back with every change. */
  revision: string
}

type Query = object

/**
 * A typed client for the `/v1` routes of one vault of an Andesite server.
 *
 * Routes are `/v1/vaults/<vault>/…` (the server in `serve-all` mode). Responses are the
 * types generated from the server's JSON Schemas (`./schemas/types`). Every non-2xx
 * answer becomes a typed error (`./errors`). Nothing is cached: content is read again
 * whenever it is needed, because it is only meaningful together with its revision.
 */
export class AndesiteClient {
  constructor(
    private readonly platform: Platform,
    readonly vault: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  /** The same server and credentials, another vault. */
  withVault(vault: string): AndesiteClient {
    return new AndesiteClient(this.platform, vault, this.fetchImpl)
  }

  // MARK: Vaults and status

  vaults(): Promise<Vaults> {
    return this.json('/v1/vaults')
  }

  status(): Promise<Status> {
    return this.json(this.route('/status'))
  }

  // MARK: Documents

  /** One page of the index (at most 100 documents). */
  documents(options: { limit?: number; offset?: number } & QueryFilter = {}): Promise<DocumentsPage> {
    return this.json(this.route('/documents'), options)
  }

  /** Every document, page by page. */
  async allDocuments(filter: QueryFilter = {}, signal?: AbortSignal): Promise<DocumentsPage['documents']> {
    const all: DocumentsPage['documents'] = []
    let offset: number | null = 0
    while (offset !== null) {
      const page: DocumentsPage = await this.json(this.route('/documents'), { limit: 100, offset, ...filter }, signal)
      all.push(...page.documents)
      offset = page.nextOffset
    }
    return all
  }

  /** A note's text and revision. */
  async file(path: string, signal?: AbortSignal): Promise<FileContent> {
    const response = await this.request(this.route('/file'), { path }, { signal })
    const revision = (response.headers.get('ETag') ?? '').replace(/^"|"$/g, '')
    return { text: await response.text(), revision }
  }

  /** The URL of a file for use in `<img src>`; the session cookie authorizes it. */
  fileURL(path: string): string {
    return `${this.platform.baseUrl}${this.route('/file')}?path=${encodeURIComponent(path)}`
  }

  history(path: string): Promise<History> {
    return this.json(this.route('/history'), { path })
  }

  // MARK: Index

  /** Full-text search; `q` may use `tag:` and `[property:value]` filters. */
  search(q: string, options: { limit?: number } & QueryFilter = {}, signal?: AbortSignal): Promise<SearchResults> {
    return this.json(this.route('/search'), { q, ...options }, signal)
  }

  tags(options: { limit?: number; offset?: number } = {}): Promise<TagsPage> {
    return this.json(this.route('/tags'), options)
  }

  properties(options: { limit?: number; offset?: number } = {}): Promise<PropertiesPage> {
    return this.json(this.route('/properties'), options)
  }

  metadata(path: string, signal?: AbortSignal): Promise<Metadata> {
    return this.json(this.route('/metadata'), { path }, signal)
  }

  /** One page of a note's outgoing links, or of the links to it (`incoming`). */
  links(path: string, direction: 'outgoing' | 'incoming' = 'outgoing', options: { limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<LinksPage> {
    return this.json(this.route('/links'), { path, direction, ...options }, signal)
  }

  /** Every link in one direction, page by page. */
  async allLinks(path: string, direction: 'outgoing' | 'incoming', signal?: AbortSignal): Promise<LinksPage['links']> {
    const all: LinksPage['links'] = []
    let offset: number | null = 0
    while (offset !== null) {
      const page: LinksPage = await this.links(path, direction, { limit: 100, offset }, signal)
      all.push(...page.links)
      offset = page.nextOffset
    }
    return all
  }

  mentions(path: string, signal?: AbortSignal): Promise<Mentions> {
    return this.json(this.route('/mentions'), { path }, signal)
  }

  bookmarks(): Promise<Bookmarks> {
    return this.json(this.route('/bookmarks'))
  }

  snapshots(path?: string): Promise<Snapshots> {
    return this.json(this.route('/snapshots'), { path })
  }

  // MARK: Plumbing

  private route(path: string): string {
    return `/v1/vaults/${encodeURIComponent(this.vault)}${path}`
  }

  private async json<T>(path: string, query: Query = {}, signal?: AbortSignal): Promise<T> {
    const response = await this.request(path, query, { signal })
    return (await response.json()) as T
  }

  /** Sends one request and throws the typed error for a failed one. */
  async request(path: string, query: Query = {}, init: RequestInit = {}): Promise<Response> {
    // encodeURIComponent, not URLSearchParams: the server reads a '+' literally, so a space must be %20.
    const pairs = Object.entries(query as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
    const url = `${this.platform.baseUrl}${path}${pairs.length ? `?${pairs.join('&')}` : ''}`
    let response: Response
    try {
      response = await this.fetchImpl(url, await this.platform.authorize(init))
    } catch (error) {
      if (init.signal?.aborted) throw error
      throw new NetworkError(error)
    }
    if (response.ok) return response
    throw apiErrorFor(response.status, await response.json().catch(() => null))
  }
}
