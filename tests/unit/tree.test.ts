import { describe, expect, it } from 'vitest'
import { ancestors, buildTree, noteCount } from '../../src/lib/tree'

const doc = (path: string, kind = 'markdown') => ({ path, kind, revision: 'r' })

describe('buildTree', () => {
  const tree = buildTree([doc('Welcome.md'), doc('Projects/Beta.md'), doc('Projects/Alpha.md'), doc('Projects/diagram.png', 'attachment'), doc('Ideas/Notes.md'), doc('a/b/c.md'), doc('Note 10.md'), doc('Note 2.md')])

  it('puts folders first and sorts naturally', () => {
    expect(tree.map(node => node.name)).toEqual(['a', 'Ideas', 'Projects', 'Note 2', 'Note 10', 'Welcome'])
  })
  it('names notes without .md and keeps the path as identity', () => {
    const projects = tree.find(node => node.name === 'Projects')!
    expect(projects.children!.map(node => [node.name, node.id])).toEqual([['Alpha', 'Projects/Alpha.md'], ['Beta', 'Projects/Beta.md']])
    expect(tree.find(node => node.name === 'Welcome')!.id).toBe('Welcome.md')
  })
  it('leaves attachments out and nests folders', () => {
    expect(noteCount({ id: '', name: '', kind: 'folder', children: tree })).toBe(7)
    expect(tree[0].children![0].children![0].id).toBe('a/b/c.md')
  })
  it('lists the folders above a path', () => {
    expect(ancestors('a/b/c.md')).toEqual(['a', 'a/b'])
    expect(ancestors('c.md')).toEqual([])
  })
})
