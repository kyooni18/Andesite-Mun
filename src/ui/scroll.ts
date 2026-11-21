import { slug } from '../lib/outline'

/** Brings the heading named by the URL into view, or the top of the note when there is none. */
export function scrollNoteTo(heading: string | null): void {
  const container = document.querySelector<HTMLElement>('[data-note-scroll]')
  if (!container) return
  const target = heading ? (document.getElementById(heading) ?? document.getElementById(slug(heading))) : null
  if (target && container.contains(target)) target.scrollIntoView({ block: 'start' })
  else container.scrollTo({ top: 0 })
}

/** The note a click inside the rendered page asked for as a tag, or null. */
export function clickedTag(event: Event): string | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  const anchor = target.closest<HTMLElement>('a.tag')
  return anchor?.dataset.tag ?? null
}
