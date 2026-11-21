/**
 * What the sidebar remembers across visits (the counterpart of `SidebarMemory` in the Swift app): which
 * folders are open, per vault. These are not secrets, so localStorage is fine; the API token never
 * goes here.
 */
const key = (vault: string) => `andesite.expanded.${vault}`

export function readExpanded(vault: string, storage: Pick<Storage, 'getItem'> = window.localStorage): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key(vault)) ?? '[]')
    return Array.isArray(parsed) ? Object.fromEntries(parsed.filter(item => typeof item === 'string').map(item => [item, true])) : {}
  } catch {
    return {}
  }
}

export function writeExpanded(vault: string, expanded: Record<string, boolean>, storage: Pick<Storage, 'setItem'> = window.localStorage): void {
  try {
    storage.setItem(key(vault), JSON.stringify(Object.keys(expanded)))
  } catch {
    // Storage may be full or blocked; the tree just starts collapsed next time.
  }
}
