// NOTE: no regex literal with a backslash-dot-letter sequence (as in .md at the end of a pattern)
// may appear in files the Mün Vite plugin transforms: it reads the sequence as a Swift key
// path and rewrites it to a string, silently breaking the pattern (see docs/decisions.md).

/** `Folder/Note.md` -> `Folder/Note`. */
export function withoutMarkdownExtension(path: string): string {
  return path.toLowerCase().endsWith('.md') ? path.slice(0, -3) : path
}

/** The last path component. */
export function lastComponent(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** The note's title as shown in lists: its file name without `.md`. */
export function noteTitle(path: string): string {
  return withoutMarkdownExtension(lastComponent(path))
}
