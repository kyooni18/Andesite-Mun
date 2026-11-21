/**
 * What the view models ask of the server, as plain async functions with typed results. The `.mun`
 * models only decide *when* to call these and keep the latest answer; the I/O, the retries and the
 * shaping of data happen here, where they can be unit-tested against a fake `fetch`.
 */
import { AndesiteClient, IndexNotReady, Unauthorized } from './client'
import type { Document, Link, MetadataProperty, MetadataTag, SearchHit } from './types'
import { extractHeadings, outlineTree, type Heading, type OutlineNode } from '../lib/outline'
import { noteTitle } from '../lib/path'
import { buildTree, type DocumentNode } from '../lib/tree'
import { renderNote } from '../render/markdown'

export type SessionState = { state: 'signedOut' } | { state: 'signedIn'; vaults: string[] }

/** Asks the server who we are: the vault list answers only for a valid session. */
export async function checkSession(client: AndesiteClient, signal?: AbortSignal): Promise<SessionState> {
  try {
    const { vaults } = await client.vaults()
    return { state: 'signedIn', vaults: vaults.map(vault => vault.name) }
  } catch (error) {
    if (error instanceof Unauthorized) return { state: 'signedOut' }
    throw error
  }
}

export interface VaultIndex {
  documents: Document[]
  tree: DocumentNode[]
}

/**
 * The vault's notes. A vault that is still scanning answers 503 `index_not_ready`; this waits for it
 * (`onWaiting` says so) instead of failing, for up to `patience` attempts one second apart.
 */
export async function loadIndex(client: AndesiteClient, options: { signal?: AbortSignal; onWaiting?: () => void; patience?: number; delay?: (ms: number) => Promise<void> } = {}): Promise<VaultIndex> {
  const { signal, onWaiting, patience = 60, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = options
  for (let attempt = 0; ; attempt += 1) {
    try {
      const documents = await client.allDocuments({}, signal)
      return { documents, tree: buildTree(documents) }
    } catch (error) {
      if (!(error instanceof IndexNotReady) || attempt >= patience) throw error
      onWaiting?.()
      await delay(1000)
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    }
  }
}

export interface NoteView {
  path: string
  /** The file name without `.md`. */
  title: string
  /** The revision `text` and `html` belong to. */
  revision: string
  text: string
  /** Sanitized HTML of the rendered note. */
  html: string
  headings: Heading[]
  outline: OutlineNode[]
}

export { noteTitle }

/**
 * Reads a note and renders it. Wiki links are shown as the server resolved them (`/v1/links`): one
 * request for the text, one for the links, in parallel. The result is only valid for the revision it
 * carries; nothing is kept once the note is closed.
 */
export async function loadNote(client: AndesiteClient, path: string, signal?: AbortSignal): Promise<NoteView> {
  const [file, links] = await Promise.all([
    client.file(path, signal),
    client.allLinks(path, 'outgoing', signal).catch((error): Link[] | undefined => {
      // Links are decoration: a vault that cannot answer yet still shows its text.
      if (error instanceof IndexNotReady) return undefined
      throw error
    }),
  ])
  const html = await renderNote(file.text, { vault: client.vault, path, links, fileURL: file => client.fileURL(file) })
  const headings = extractHeadings(file.text)
  return { path, title: noteTitle(path), revision: file.revision, text: file.text, html, headings, outline: outlineTree(headings) }
}

export interface BacklinkGroup {
  /** Path of the note that links here. */
  source: string
  title: string
  links: Link[]
}

export interface InspectorData {
  path: string
  backlinks: BacklinkGroup[]
  outgoing: Link[]
  mentions: { source: string; term: string }[]
  tags: MetadataTag[]
  properties: MetadataProperty[]
  /** 'valid', or 'invalid' with `diagnostic` when the frontmatter cannot be parsed. */
  metadataState: string
  diagnostic: string | null
}

/** What the inspector shows for a note, except the outline (which comes from the text). */
export async function loadInspector(client: AndesiteClient, path: string, signal?: AbortSignal): Promise<InspectorData> {
  const [incoming, outgoing, mentions, metadata] = await Promise.all([
    client.allLinks(path, 'incoming', signal),
    client.allLinks(path, 'outgoing', signal),
    client.mentions(path, signal),
    client.metadata(path, signal),
  ])
  const groups = new Map<string, BacklinkGroup>()
  for (const link of incoming) {
    const group = groups.get(link.source) ?? { source: link.source, title: noteTitle(link.source), links: [] }
    group.links.push(link)
    groups.set(link.source, group)
  }
  return {
    path,
    backlinks: [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })),
    outgoing,
    mentions: mentions.mentions,
    tags: uniqueTags(metadata.tags),
    properties: metadata.properties,
    metadataState: metadata.state,
    diagnostic: metadata.diagnostic,
  }
}

export interface SearchFilters {
  tag?: string
  property?: string
  value?: string
}

export interface SearchOutcome {
  hits: SearchHit[]
}

/** Full-text search; `q` may itself contain `tag:` and `[property:value]` terms. */
export async function searchNotes(client: AndesiteClient, query: string, filters: SearchFilters, signal?: AbortSignal): Promise<SearchOutcome> {
  const { hits } = await client.search(query, { limit: 100, ...filters }, signal)
  return { hits: hits.map(hit => ({ ...hit })) }
}

/** A tag that is both in the frontmatter and in the text is listed once. */
export function uniqueTags(tags: readonly MetadataTag[]): MetadataTag[] {
  const seen = new Set<string>()
  return tags.filter(tag => !seen.has(tag.canonical) && seen.add(tag.canonical))
}
