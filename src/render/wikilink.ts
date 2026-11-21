/** A parsed `[[target#fragment|display]]`. */
export interface WikiLink {
  target: string
  fragment: string | null
  display: string | null
  embed: boolean
}

/** Splits the inside of a wiki link: `Note#Heading|shown text`. */
export function parseWikiLink(inner: string, embed = false): WikiLink {
  const bar = inner.indexOf('|')
  const reference = bar < 0 ? inner : inner.slice(0, bar)
  const display = bar < 0 ? null : inner.slice(bar + 1).trim() || null
  const hash = reference.indexOf('#')
  const target = (hash < 0 ? reference : reference.slice(0, hash)).trim()
  const fragment = hash < 0 ? null : reference.slice(hash + 1).trim() || null
  return { target, fragment, display, embed }
}

/** The key a link has in the server's answer and in the rendered page. */
export function linkKey(link: Pick<WikiLink, 'target' | 'fragment' | 'embed'>): string {
  return `${link.embed ? '!' : ''}${link.target}#${link.fragment ?? ''}`
}
