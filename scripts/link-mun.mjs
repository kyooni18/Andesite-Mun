#!/usr/bin/env node
// Points @mun-ui/* at a local checkout of kyooni18/Mun with `mun link`.
//
// Why: @mun-ui/ui 0.2.0 on npm predates the desktop target (`mun create
// --target desktop`, @mun-ui/desktop). package.json keeps the exact 0.2.0 pins;
// `mun link` writes `link:` paths into pnpm-workspace.yaml (git-ignored), which
// override them. The same checkout builds the web and the desktop target.
//
//   git clone --depth 1 https://github.com/kyooni18/mun ../mun && (cd ../mun && git checkout $(cat ../andesite-mun/MUN_REF))
//   (cd ../mun && pnpm install && pnpm add -Dw @types/node@22 && pnpm build)
//   pnpm run link:mun ../mun
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const mun = resolve(process.argv[2] ?? process.env.MUN_ROOT ?? resolve(root, '../mun'))
if (!existsSync(resolve(mun, 'bin/mun.mjs')) || !existsSync(resolve(mun, 'packages/core/dist'))) {
  console.error(`No built Mün checkout at ${mun}. Clone kyooni18/mun, run \`pnpm install && pnpm build\` there, then pass its path.`)
  process.exit(1)
}
const manifest = resolve(root, 'package.json')
const original = readFileSync(manifest, 'utf8')
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) { writeFileSync(manifest, original); process.exit(r.status ?? 1) }
}
run('node', [resolve(mun, 'bin/mun.mjs'), 'link', '.', '--renderer', 'web', '--local-root', mun, '--no-install'])
// `mun link` also rewrites package.json; the overrides in pnpm-workspace.yaml do the
// work, so keep the committed exact pins.
writeFileSync(manifest, original)
run('pnpm', ['install', '--no-frozen-lockfile'])
console.log(`Linked Mün from ${mun}`)
