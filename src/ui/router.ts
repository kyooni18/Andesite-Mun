/**
 * URL routing for the app: `#/<vault>/<path>[?heading=<text>]`.
 *
 * SwiftUI has no URL routing API of its own (`onOpenURL` and `NavigationPath` are the
 * nearest), so this is a plain TypeScript module with the one rule that matters: the URL is
 * the source of truth. Selecting a note navigates; the app reacts to the URL changing, so back,
 * forward and deep links all go through the same code path.
 *
 * The hash is used (not the History API) so the static site needs no server-side fallback rules
 * and a deep link survives a reload behind any proxy. Each path segment is percent-encoded.
 */
export interface Route {
  /** The vault's name, or null for the bare site (`#/`). */
  vault: string | null
  /** Vault-relative path of a note or folder ('' for the vault root). */
  path: string
  /** A heading inside the note to scroll to. */
  heading?: string
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '')
  const [location, query = ''] = splitOnce(raw, '?')
  const segments = location.split('/').filter(segment => segment.length > 0).map(decode)
  const vault = segments.shift() ?? null
  const heading = new URLSearchParams(query).get('heading') ?? undefined
  return { vault, path: segments.join('/'), ...(heading ? { heading } : {}) }
}

export function formatRoute(route: Route): string {
  if (route.vault === null) return '#/'
  const segments = [route.vault, ...route.path.split('/').filter(segment => segment.length > 0)]
  const heading = route.heading ? `?heading=${encodeURIComponent(route.heading)}` : ''
  return `#/${segments.map(encodeURIComponent).join('/')}${heading}`
}

export function currentRoute(): Route {
  return parseRoute(window.location.hash)
}

/** Goes to `route`, adding a history entry (so Back returns here). */
export function navigate(route: Route): void {
  const hash = formatRoute(route)
  if (window.location.hash !== hash) window.location.hash = hash
  else window.dispatchEvent(new HashChangeEvent('hashchange'))
}

/** Goes to `route` without adding a history entry. */
export function replaceRoute(route: Route): void {
  const hash = formatRoute(route)
  if (window.location.hash === hash) return
  window.history.replaceState(null, '', hash)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

/** Calls `listener` whenever the URL changes (links, Back, Forward, typing). Returns the unsubscribe function. */
export function onRouteChange(listener: (route: Route) => void): () => void {
  const handler = () => listener(currentRoute())
  window.addEventListener('hashchange', handler)
  return () => window.removeEventListener('hashchange', handler)
}

function splitOnce(text: string, separator: string): [string, string?] {
  const index = text.indexOf(separator)
  return index < 0 ? [text] : [text.slice(0, index), text.slice(index + 1)]
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
