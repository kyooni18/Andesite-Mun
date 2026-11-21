import DOMPurify from 'dompurify'
import { Marked, type Tokens, type TokenizerAndRendererExtension } from 'marked'
import type { Link } from '../api/types'
import { inlineText, slug, splitFrontmatter } from '../lib/outline'
import { formatRoute } from '../ui/router'
import { linkKey, parseWikiLink } from './wikilink'

/** What the renderer needs to know about the note being shown. */
export interface RenderContext {
  /** The vault the note is in, for the links to other notes. */
  vault: string
  /** The note's vault-relative path. */
  path: string
  /** The note's outgoing links as the server resolved them (`/v1/links`); undefined while unknown. */
  links?: readonly Link[]
  /** URL for an attachment (an image embed), or null when there is none by that name. */
  attachmentURL?: (target: string) => string | null
}

export type LinkStatus = 'resolved' | 'missing' | 'ambiguous' | 'external' | 'unsupported' | 'unknown'

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// --- Markdown -> HTML -------------------------------------------------------------------

const wikiLink: TokenizerAndRendererExtension = {
  name: 'wikilink',
  level: 'inline',
  start: src => src.search(/!?\[\[/),
  tokenizer(src) {
    const match = /^(!?)\[\[([^\[\]\n]+?)\]\]/.exec(src)
    if (!match) return undefined
    return { type: 'wikilink', raw: match[0], embed: match[1] === '!', inner: match[2] } as Tokens.Generic
  },
  renderer(token) {
    const link = parseWikiLink(String(token.inner), Boolean(token.embed))
    const shown = link.display ?? (link.fragment ? `${link.target} > ${link.fragment}` : link.target)
    // A placeholder: the post-processing step, which knows the server's answer, turns it into a link.
    return `<a class="wikilink" data-wikilink data-target="${escapeHtml(link.target)}" data-fragment="${escapeHtml(link.fragment ?? '')}" data-embed="${link.embed}">${escapeHtml(shown)}</a>`
  },
}

const inlineMath: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start: src => src.indexOf('$'),
  tokenizer(src) {
    const display = /^\$\$(?!\s*\$)([^\n]+?)\$\$/.exec(src)
    if (display) return { type: 'mathInline', raw: display[0], text: display[1], display: true } as Tokens.Generic
    const inline = /^\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<![\s\\])\$(?!\d)/.exec(src)
    if (inline) return { type: 'mathInline', raw: inline[0], text: inline[1], display: false } as Tokens.Generic
    return undefined
  },
  renderer: token => `<span class="math-source" data-math="${token.display ? 'display' : 'inline'}">${escapeHtml(String(token.text))}</span>`,
}

const blockMath: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start: src => src.indexOf('$$'),
  tokenizer(src) {
    const match = /^\$\$[ \t]*\n?([\s\S]+?)\n?[ \t]*\$\$[ \t]*(?:\n|$)/.exec(src)
    return match ? ({ type: 'mathBlock', raw: match[0], text: match[1].trim() } as Tokens.Generic) : undefined
  },
  renderer: token => `<div class="math-source" data-math="display">${escapeHtml(String(token.text))}</div>\n`,
}

const highlight: TokenizerAndRendererExtension = {
  name: 'highlight',
  level: 'inline',
  start: src => src.indexOf('=='),
  tokenizer(src) {
    const match = /^==(?!\s)([^=\n]+?)(?<!\s)==/.exec(src)
    return match ? ({ type: 'highlight', raw: match[0], text: match[1] } as Tokens.Generic) : undefined
  },
  renderer: token => `<mark>${escapeHtml(String(token.text))}</mark>`,
}

const tag: TokenizerAndRendererExtension = {
  name: 'tag',
  level: 'inline',
  start: src => src.search(/(^|\s)#[\p{L}\p{N}_/-]*\p{L}/u) < 0 ? -1 : src.search(/#[\p{L}\p{N}_/-]*\p{L}/u),
  tokenizer(src) {
    const match = /^#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/u.exec(src)
    return match ? ({ type: 'tag', raw: match[0], name: match[1] } as Tokens.Generic) : undefined
  },
  renderer: token => `<a class="tag" data-tag="${escapeHtml(String(token.name))}" href="#/">#${escapeHtml(String(token.name))}</a>`,
}

function createMarked(): Marked {
  const marked = new Marked({ gfm: true, breaks: false, async: false })
  marked.use({ extensions: [wikiLink, blockMath, inlineMath, highlight, tag] })
  return marked
}

/** Markdown (no frontmatter) to HTML, before sanitizing. Headings get the ids the outline uses. */
export function markdownToHTML(markdown: string): string {
  const marked = createMarked()
  const used = new Map<string, number>()
  marked.use({
    renderer: {
      heading(this: { parser: { parseInline(tokens: Tokens.Generic[]): string } }, token: Tokens.Heading) {
        const title = inlineText(token.text)
        const base = slug(title)
        const count = used.get(base) ?? 0
        used.set(base, count + 1)
        const id = count === 0 ? base : `${base}-${count}`
        return `<h${token.depth} id="${escapeHtml(id)}">${this.parser.parseInline(token.tokens as Tokens.Generic[])}</h${token.depth}>\n`
      },
    },
  })
  const withoutComments = markdown.replace(/%%[\s\S]*?%%/g, '')
  return marked.parse(withoutComments) as string
}

// --- Sanitizing -----------------------------------------------------------------------------

let purifier: ReturnType<typeof DOMPurify> | undefined

function sanitizer() {
  if (purifier) return purifier
  const instance = DOMPurify(window)
  // Anchors keep `target` only to open external links in a new tab; rel is forced.
  instance.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A' && node.getAttribute('target')) node.setAttribute('rel', 'noopener noreferrer')
  })
  purifier = instance
  return instance
}

/**
 * Removes everything that could run script or leave the page from `html` that came from a note.
 * Styles are forbidden (our own classes style the page), `data-*` is kept for the placeholders the
 * renderer itself emits.
 */
export function sanitizeHTML(html: string): string {
  return sanitizer().sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'button', 'select', 'textarea'],
    FORBID_ATTR: ['style'],
    ADD_ATTR: ['target'],
    ALLOW_DATA_ATTR: true,
  })
}

// --- After sanitizing: links, math, code ------------------------------------------------------

/** Turns the wiki-link placeholders into links styled by what the server says they point at. */
export function resolveLinks(root: ParentNode, context: RenderContext): void {
  const byKey = new Map<string, Link>()
  for (const link of context.links ?? []) {
    byKey.set(linkKey(link), link)
    // The server lists a link's target as written; a note and its fragment-less twin share a key otherwise.
  }
  for (const anchor of Array.from(root.querySelectorAll<HTMLElement>('a[data-wikilink]'))) {
    const link = {
      target: anchor.dataset.target ?? '',
      fragment: anchor.dataset.fragment || null,
      embed: anchor.dataset.embed === 'true',
    }
    const answer = byKey.get(linkKey(link)) ?? byKey.get(linkKey({ ...link, fragment: null }))
    const status: LinkStatus = answer ? (answer.status as LinkStatus) : context.links ? 'missing' : 'unknown'
    if (link.embed) {
      const url = context.attachmentURL?.(link.target)
      if (url && /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(link.target)) {
        const image = document.createElement('img')
        image.src = url
        image.alt = link.target
        image.loading = 'lazy'
        image.className = 'embed'
        anchor.replaceWith(image)
        continue
      }
    }
    anchor.removeAttribute('data-wikilink')
    anchor.classList.add(status)
    if (status === 'resolved' && answer?.path) {
      anchor.setAttribute('href', formatRoute({ vault: context.vault, path: answer.path, ...(link.fragment ? { heading: link.fragment } : {}) }))
      anchor.dataset.path = answer.path
    } else {
      // Not a link: there is nowhere to go (a missing note) or several places (an ambiguous name).
      const span = document.createElement('span')
      span.className = anchor.className
      span.dataset.target = link.target
      span.title = status === 'ambiguous' ? 'Several notes have this name' : status === 'missing' ? 'No note has this name' : 'Not resolved yet'
      span.textContent = anchor.textContent
      anchor.replaceWith(span)
    }
  }
  for (const anchor of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]:not([data-wikilink]):not(.wikilink):not(.tag)'))) {
    const href = anchor.getAttribute('href') ?? ''
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.classList.add('external')
    } else if (!href.startsWith('#') && !href.startsWith('/')) {
      // A relative link to another note: [text](Folder/Note.md).
      const [path, heading] = decodeURI(href).split('#')
      const folder = context.path.includes('/') ? context.path.slice(0, context.path.lastIndexOf('/') + 1) : ''
      const resolved = normalizePath(path.startsWith('/') ? path.slice(1) : folder + path)
      anchor.setAttribute('href', formatRoute({ vault: context.vault, path: resolved, ...(heading ? { heading } : {}) }))
    }
  }
}

function normalizePath(path: string): string {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '..') out.pop()
    else if (part !== '.' && part !== '') out.push(part)
  }
  return out.join('/')
}

async function renderMath(root: ParentNode): Promise<void> {
  const sources = Array.from(root.querySelectorAll<HTMLElement>('.math-source'))
  if (sources.length === 0) return
  const [{ default: katex }] = await Promise.all([import('katex'), import('katex/dist/katex.min.css')])
  for (const element of sources) {
    const display = element.dataset.math === 'display'
    // KaTeX escapes what it is given; `trust: false` also refuses \href, \includegraphics and friends.
    const html = katex.renderToString(element.textContent ?? '', { displayMode: display, throwOnError: false, trust: false, output: 'htmlAndMathml' })
    const holder = document.createElement(display ? 'div' : 'span')
    holder.className = display ? 'math math-display' : 'math'
    holder.innerHTML = html
    element.replaceWith(holder)
  }
}

async function highlightCode(root: ParentNode): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('pre > code'))
  if (blocks.length === 0) return
  const { highlight } = await import('./highlight')
  for (const block of blocks) {
    const language = /(?:^|\s)language-([\w+-]+)/.exec(block.className)?.[1]
    const result = highlight(block.textContent ?? '', language)
    if (result) {
      block.innerHTML = result
      block.classList.add('hljs')
    }
  }
}

/** Callouts: a blockquote that starts with `[!note] Title`. */
function enhanceCallouts(root: ParentNode): void {
  for (const quote of Array.from(root.querySelectorAll('blockquote'))) {
    const first = quote.firstElementChild
    const match = first && /^\[!([\w-]+)\][+-]?[ \t]*/.exec(first.textContent ?? '')
    if (!first || !match) continue
    const type = match[1].toLowerCase()
    const title = (first.textContent ?? '').slice(match[0].length).split('\n')[0] || type[0].toUpperCase() + type.slice(1)
    const rest = (first.innerHTML.split('\n').slice(1).join('\n')).trim()
    quote.className = `callout callout-${type.replace(/[^a-z-]/g, '')}`
    const heading = document.createElement('div')
    heading.className = 'callout-title'
    heading.textContent = title
    first.remove()
    quote.prepend(heading)
    if (rest) {
      const paragraph = document.createElement('p')
      paragraph.innerHTML = rest
      heading.after(paragraph)
    }
  }
}

function wrapTables(root: ParentNode): void {
  for (const table of Array.from(root.querySelectorAll('table'))) {
    const wrapper = document.createElement('div')
    wrapper.className = 'table-wrap'
    table.replaceWith(wrapper)
    wrapper.append(table)
  }
}

/**
 * The note as safe HTML: Markdown rendered, then sanitized with DOMPurify, and only then given
 * its wiki links, maths (KaTeX) and highlighted code, which come from trusted libraries and
 * from data the server vouched for.
 */
export async function renderNote(text: string, context: RenderContext): Promise<string> {
  const { body } = splitFrontmatter(text)
  const clean = sanitizeHTML(markdownToHTML(body))
  const template = document.createElement('template')
  template.innerHTML = clean
  resolveLinks(template.content, context)
  enhanceCallouts(template.content)
  wrapTables(template.content)
  await Promise.all([renderMath(template.content), highlightCode(template.content)])
  return template.innerHTML
}
