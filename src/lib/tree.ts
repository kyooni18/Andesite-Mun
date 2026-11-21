import type { Document } from '../api/schemas/types'
import { noteTitle } from './path'

/**
 * A folder or note of the vault's tree (the counterpart of `DocumentNode` in the Swift app).
 * Folders have `children` (possibly empty); notes have `children: null`, so the tree can be handed
 * to `OutlineGroup(_:children: \.children)`.
 */
export interface DocumentNode {
  /** The vault-relative path; unique, so it is the node's identity. */
  id: string
  /** The last path component, with `.md` removed for notes. */
  name: string
  kind: 'folder' | 'note'
  children: DocumentNode[] | null
  /** The note's revision, from the index (undefined for folders). */
  revision?: string
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Builds the tree of the notes in `documents`. Attachments are left out; folders come first. */
export function buildTree(documents: readonly Pick<Document, 'path' | 'kind' | 'revision'>[]): DocumentNode[] {
  const root: DocumentNode = { id: '', name: '', kind: 'folder', children: [] }
  const folders = new Map<string, DocumentNode>([['', root]])
  const folder = (path: string): DocumentNode => {
    let node = folders.get(path)
    if (!node) {
      const slash = path.lastIndexOf('/')
      node = { id: path, name: path.slice(slash + 1), kind: 'folder', children: [] }
      folders.set(path, node)
      folder(slash < 0 ? '' : path.slice(0, slash)).children!.push(node)
    }
    return node
  }
  for (const document of documents) {
    if (document.kind !== 'markdown') continue
    const slash = document.path.lastIndexOf('/')
    const parent = folder(slash < 0 ? '' : document.path.slice(0, slash))
    parent.children!.push({
      id: document.path,
      name: noteTitle(document.path),
      kind: 'note',
      children: null,
      revision: document.revision,
    })
  }
  const sort = (nodes: DocumentNode[]): DocumentNode[] => {
    nodes.sort((a, b) => (a.kind === b.kind ? collator.compare(a.name, b.name) : a.kind === 'folder' ? -1 : 1))
    for (const node of nodes) if (node.children) sort(node.children)
    return nodes
  }
  return sort(root.children!)
}

/** The folders that contain `path`, outermost first (`a/b/c.md` -> `a`, `a/b`). */
export function ancestors(path: string): string[] {
  const parts = path.split('/')
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'))
}

/** Every folder id in `nodes`. */
export function folderIds(nodes: readonly DocumentNode[]): string[] {
  return nodes.flatMap(node => (node.children ? [node.id, ...folderIds(node.children)] : []))
}

/** The number of notes under `node` (1 for a note). */
export function noteCount(node: DocumentNode): number {
  return node.children ? node.children.reduce((total, child) => total + noteCount(child), 0) : 1
}
