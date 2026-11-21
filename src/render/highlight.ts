import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const languages = { bash, c, cpp, css, diff, go, java, javascript, json, markdown, python, rust, sql, swift, typescript, xml, yaml }
for (const [name, definition] of Object.entries(languages)) hljs.registerLanguage(name, definition)
const aliases: Record<string, string> = { sh: 'bash', shell: 'bash', zsh: 'bash', js: 'javascript', ts: 'typescript', py: 'python', rs: 'rust', html: 'xml', yml: 'yaml', md: 'markdown', 'c++': 'cpp' }

/** Highlighted HTML for `code` in `language`, or null for a language that is not bundled (the code stays plain). */
export function highlight(code: string, language: string | undefined): string | null {
  const name = language ? (aliases[language.toLowerCase()] ?? language.toLowerCase()) : undefined
  if (!name || !hljs.getLanguage(name)) return null
  return hljs.highlight(code, { language: name, ignoreIllegals: true }).value
}
