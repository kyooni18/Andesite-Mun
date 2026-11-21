#!/usr/bin/env node
// Checks the desktop target without building it: that src-tauri's configuration is valid and
// as locked down as the remote-only design says. With --cargo (and Rust installed) it also runs
// `cargo check` on the shell, which needs the system WebView libraries (WebKitGTK on Linux).
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const problems = []
const expect = (condition, message) => { if (!condition) problems.push(message) }

const conf = read('src-tauri/tauri.conf.json')
expect(conf.build?.frontendDist === '../dist', 'frontendDist must be ../dist (the web build)')
expect(conf.build?.beforeBuildCommand && conf.build?.beforeDevCommand, 'build commands must start the web build')
expect(conf.app?.windows?.some(window => window.label === 'main'), 'a window labelled main is required (the capability is scoped to it)')
const csp = conf.app?.security?.csp ?? ''
expect(/script-src 'self'(;|$)/.test(csp), "CSP must allow scripts from 'self' only")
expect(!/unsafe-eval|script-src[^;]*(https?:|\*)/.test(csp), 'CSP must not allow eval or remote scripts')
expect(!/connect-src[^;]*(https?:|\*)/.test(csp.replaceAll('http://ipc.localhost', '')), 'CSP must not let the WebView open network connections itself (Phase 4 makes requests from Rust)')
expect(csp.includes("object-src 'none'") && csp.includes("frame-src 'none'"), 'CSP must forbid plugins and frames')

const capability = read('src-tauri/capabilities/main.json')
expect(capability.windows?.length === 1 && capability.windows[0] === 'main', 'the capability must be scoped to the main window')
const allowed = new Set(['mun-desktop:allow-window-info', 'core:event:allow-listen', 'core:event:allow-unlisten', 'core:window:allow-close', 'core:window:allow-destroy'])
for (const permission of capability.permissions ?? []) expect(allowed.has(permission), `unexpected permission ${permission}: the remote-only client needs no local file access`)

const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8')
expect(cargo.includes('tauri-plugin-mun-desktop'), 'Cargo.toml must use the Mün desktop host')
for (const icon of conf.bundle?.icon ?? []) expect(existsSync(resolve(root, 'src-tauri', icon)), `missing icon ${icon}`)

if (problems.length) {
  console.error(problems.map(problem => `desktop config: ${problem}`).join('\n'))
  process.exit(1)
}
console.log('desktop config OK')

if (process.argv.includes('--cargo')) {
  const host = resolve(root, 'node_modules/@mun-ui/desktop/host')
  if (!existsSync(host)) { console.error('Run `pnpm run link:mun <path to a built Mün checkout>` first: it provides @mun-ui/desktop.'); process.exit(1) }
  const run = spawnSync('cargo', ['check', '--manifest-path', resolve(root, 'src-tauri/Cargo.toml')], { stdio: 'inherit' })
  process.exit(run.status ?? 1)
}
