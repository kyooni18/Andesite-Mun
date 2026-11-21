/** A heading of a note, from the Markdown text (the counterpart of `NoteAnalysis.Heading`). */
export interface Heading {
  /** Unique within the note; also the anchor of the heading in the rendered page. */
  id: string
  title: string
  /** 1 for `#`, up to 6. */
  level: number
  /** 1-based line of the heading in the note's text. */
  line: number
}

export interface OutlineNode extends Heading {
  children: OutlineNode[] | null
}

/** Strips a leading YAML frontmatter block, and says how many lines it had. */
export function splitFrontmatter(text: string): { body: string; lines: number } {
  const match = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text)
  if (!match) return { body: text, lines: 0 }
  return { body: text.slice(match[0].length), lines: match[0].split('\n').length - 1 }
}

/** The anchor id for a heading's text: lower case, words joined by dashes. */
export function slug(title: string): string {
  const base = title.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-')
  return base || 'section'
}

/** The note's headings in order, ignoring `#` lines inside fenced code and the frontmatter. */
export function extractHeadings(text: string): Heading[] {
  const { body, lines: offset } = splitFrontmatter(text)
  const headings: Heading[] = []
  const used = new Map<string, number>()
  let fence: string | null = null
  body.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '')
    const fenceMatch = /^ {0,3}(```+|~~~+)/.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (fence === null) fence = marker
      else if (fence === marker) fence = null
      return
    }
    if (fence !== null) return
    const heading = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line)
    if (!heading) return
    const title = inlineText(heading[2])
    const count = used.get(slug(title)) ?? 0
    used.set(slug(title), count + 1)
    headings.push({ id: count === 0 ? slug(title) : `${slug(title)}-${count}`, title, level: heading[1].length, line: index + 1 + offset })
  })
  return headings
}

/** Nests the headings by level (a `##` goes under the `#` before it). */
export function outlineTree(headings: readonly Heading[]): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []
  for (const heading of headings) {
    const node: OutlineNode = { ...heading, children: null }
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) (parent.children ??= []).push(node)
    else roots.push(node)
    stack.push(node)
  }
  return roots
}

/** The text of a heading without its Markdown decoration (links, emphasis, code ticks). */
export function inlineText(markdown: string): string {
  return markdown
    .replace(/!?\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~=]+/g, '')
    .trim()
}
