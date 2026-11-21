import { describe, expect, it } from 'vitest'
import { markdownToHTML, renderNote, sanitizeHTML } from '../../src/render/markdown'
import { extractHeadings, outlineTree, splitFrontmatter } from '../../src/lib/outline'
import { formatRoute, parseRoute } from '../../src/ui/router'
import type { Link } from '../../src/api/types'

const link = (over: Partial<Link>): Link => ({ source: 'a.md', target: 'T', fragment: null, display: null, embed: false, status: 'resolved', path: 'T.md', fragmentStatus: 'none', ...over })

describe('sanitizeHTML', () => {
  it('removes script, handlers, javascript: links, frames and styles', () => {
    const dirty = '<p style="x:y" onclick="a()">hi<script>alert(1)</script><img src=x onerror=a()><a href="javascript:a()">l</a><iframe src="//e"></iframe><form><button>b</button></form></p>'
    const clean = sanitizeHTML(dirty)
    expect(clean).not.toMatch(/script|onerror|onclick|javascript|iframe|style|<form|<button/i)
    expect(clean).toContain('<p>hi<img src="x"><a>l</a></p>')
  })
})

describe('renderNote', () => {
  it('marks wiki links by what the server resolved and leaves unresolved ones without an href', async () => {
    const html = await renderNote('[[Beta]] [[Gone]] [[Notes]] [[Beta#Design|see]] #tag', {
      vault: 'My Vault', path: 'Projects/Alpha.md',
      links: [link({ target: 'Beta', path: 'Projects/Beta.md' }), link({ target: 'Gone', status: 'missing', path: null }), link({ target: 'Notes', status: 'ambiguous', path: null }), link({ target: 'Beta', fragment: 'Design', path: 'Projects/Beta.md', fragmentStatus: 'resolved' })],
    })
    const page = new DOMParser().parseFromString(html, 'text/html')
    expect(page.querySelector('a.resolved')!.getAttribute('href')).toBe('#/My%20Vault/Projects/Beta.md')
    expect(page.querySelector('span.missing')!.textContent).toBe('Gone')
    expect(page.querySelector('span.ambiguous')!.textContent).toBe('Notes')
    expect(page.querySelectorAll('a.resolved')[1].getAttribute('href')).toBe('#/My%20Vault/Projects/Beta.md?heading=Design')
    expect(page.querySelector('a.resolved:nth-of-type(2)')!.textContent).toBe('see')
    expect(page.querySelector('a.tag')!.getAttribute('data-tag')).toBe('tag')
    expect(page.querySelectorAll('[data-wikilink]')).toHaveLength(0)
  })

  it('shows links as unresolved (not missing) while the index cannot answer', async () => {
    const html = await renderNote('[[Beta]]', { vault: 'v', path: 'a.md' })
    expect(html).toContain('wikilink unknown')
  })

  it('renders math, highlighted code, callouts and relative links; skips frontmatter and comments', async () => {
    const html = await renderNote('---\ntitle: X\n---\n$x^2$\n\n```js\nconst a = 1\n```\n\n> [!warning] Careful\n> body\n\n[rel](../Other/N.md#h) [web](https://e.com) %%secret%%', { vault: 'v', path: 'A/B/c.md', links: [] })
    const page = new DOMParser().parseFromString(html, 'text/html')
    expect(page.querySelector('.katex')).not.toBeNull()
    expect(page.querySelector('pre code.hljs .hljs-keyword')!.textContent).toBe('const')
    expect(page.querySelector('.callout-warning .callout-title')!.textContent).toBe('Careful')
    expect(page.querySelector('a[href^="#/v/A/Other/N.md"]')!.getAttribute('href')).toBe('#/v/A/Other/N.md?heading=h')
    expect(page.querySelector('a.external')!.getAttribute('rel')).toBe('noopener noreferrer')
    expect(html).not.toContain('title: X')
    expect(html).not.toContain('secret')
  })

  it('gives headings the ids the outline uses, including duplicates', () => {
    const text = '# A b\n\n## Same\n\n### Same\n\n```\n# not a heading\n```\n'
    expect(markdownToHTML(text)).toContain('<h2 id="same">')
    expect(markdownToHTML(text)).toContain('<h3 id="same-1">')
    expect(extractHeadings(text).map(heading => heading.id)).toEqual(['a-b', 'same', 'same-1'])
  })
})

describe('outline', () => {
  it('numbers lines after the frontmatter and nests by level', () => {
    const text = '---\na: 1\n---\n# One\n## Two\n# Three'
    expect(splitFrontmatter(text).lines).toBe(3)
    const headings = extractHeadings(text)
    expect(headings.map(heading => heading.line)).toEqual([4, 5, 6])
    const tree = outlineTree(headings)
    expect(tree.map(node => node.title)).toEqual(['One', 'Three'])
    expect(tree[0].children!.map(node => node.title)).toEqual(['Two'])
    expect(tree[1].children).toBeNull()
  })
})

describe('routes', () => {
  it('round-trips vault, path with spaces and unicode, and heading', () => {
    const route = { vault: 'My Vault', path: 'Folder/한글 노트.md', heading: 'Some Heading' }
    expect(formatRoute(route)).toBe('#/My%20Vault/Folder/%ED%95%9C%EA%B8%80%20%EB%85%B8%ED%8A%B8.md?heading=Some%20Heading')
    expect(parseRoute(formatRoute(route))).toEqual(route)
    expect(parseRoute('#/')).toEqual({ vault: null, path: '' })
    expect(parseRoute('')).toEqual({ vault: null, path: '' })
    expect(parseRoute('#/main')).toEqual({ vault: 'main', path: '' })
    expect(parseRoute('#/main/%E0%A4%A.md').path).toBe('%E0%A4%A.md') // a broken escape does not throw
  })
})
