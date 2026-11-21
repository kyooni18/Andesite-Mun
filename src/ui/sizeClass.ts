/**
 * SwiftUI's `horizontalSizeClass`, for the web: compact below 720 CSS pixels (a phone, or a
 * narrow window), regular otherwise. The Observable `SizeClass` in SizeClass.mun mirrors this.
 */
export const compactMaxWidth = 720

export type HorizontalSizeClass = 'compact' | 'regular'

export function currentSizeClass(): HorizontalSizeClass {
  return window.matchMedia(`(max-width: ${compactMaxWidth}px)`).matches ? 'compact' : 'regular'
}

export function onSizeClassChange(listener: (value: HorizontalSizeClass) => void): () => void {
  const query = window.matchMedia(`(max-width: ${compactMaxWidth}px)`)
  const handler = () => listener(query.matches ? 'compact' : 'regular')
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}
