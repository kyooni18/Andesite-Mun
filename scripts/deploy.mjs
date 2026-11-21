#!/usr/bin/env node
// Builds the site and copies dist/ into the folder the Andesite container serves at /.
//
//   pnpm run deploy [target] [--no-build]
//
// target defaults to ../Andesite/deploy/www (a checkout of kyooni18/Andesite next to this one) or
// $ANDESITE_WWW. The old contents of the target are replaced, so a removed asset does not linger;
// the script refuses a target that is neither empty nor an earlier deployment of this app (it has
// no index.html) so it cannot wipe an unrelated folder.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const target = resolve(args.find(arg => !arg.startsWith('--')) ?? process.env.ANDESITE_WWW ?? resolve(root, '../Andesite/deploy/www'))
const dist = resolve(root, 'dist')

if (!args.includes('--no-build')) {
  const build = spawnSync('pnpm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}
if (!existsSync(resolve(dist, 'index.html'))) {
  console.error('dist/index.html is missing; run the build first.')
  process.exit(1)
}

if (existsSync(target)) {
  const entries = readdirSync(target)
  const index = entries.includes('index.html') ? readFileSync(resolve(target, 'index.html'), 'utf8') : ''
  const ours = index.includes('/assets/') || index.includes('./assets/') || index.includes('The web app will live here')
  if (entries.length > 0 && !ours) {
    console.error(`${target} is not empty and does not look like a web deployment; refusing to replace it.`)
    process.exit(1)
  }
  for (const entry of entries) rmSync(resolve(target, entry), { recursive: true, force: true })
} else {
  mkdirSync(target, { recursive: true })
}
cpSync(dist, target, { recursive: true })
console.log(`Deployed ${readdirSync(dist).join(', ')} to ${target}`)
