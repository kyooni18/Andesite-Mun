#!/usr/bin/env node
// A real Andesite deployment without Docker, for the end-to-end tests: `andesite-server serve-all`
// over a copy of tests/e2e/seed, behind nginx running the deployment's own deploy/nginx.conf
// (so the CSP, the cache headers and the /auth, /v1 and /sync proxying under test are the shipped
// ones), serving the built site from dist/.
//
//   pnpm build && node scripts/e2e-stack.mjs
//
// Environment: ANDESITE_REPO (default ../Andesite), ANDESITE_SERVER_BIN, NGINX_BIN, NGINX_MIME_TYPES,
// E2E_PORT (18790), E2E_API_PORT (18788), E2E_TOKEN (64 hex digits), E2E_SITE (dist).
// Prints "READY <url>" once both answer; SIGTERM stops and cleans up.
import { spawn, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const repo = resolve(process.env.ANDESITE_REPO ?? join(root, '../Andesite'))
const port = Number(process.env.E2E_PORT ?? 18790)
const apiPort = Number(process.env.E2E_API_PORT ?? 18788)
const token = process.env.E2E_TOKEN ?? 'ab'.repeat(32)
const site = resolve(process.env.E2E_SITE ?? join(root, 'dist'))

function firstExisting(candidates, what) {
  const found = candidates.filter(Boolean).find(path => existsSync(path))
  if (!found) throw new Error(`${what} not found; looked in:\n  ${candidates.filter(Boolean).join('\n  ')}`)
  return found
}

// Whichever build is newest: a stale release binary may predate serve-all's /v1 routes.
const builds = [join(repo, '.build/release/andesite-server'), join(repo, '.build/debug/andesite-server')].filter(path => existsSync(path))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
const serverBin = process.env.ANDESITE_SERVER_BIN ?? builds[0]
if (!serverBin) throw new Error('andesite-server not found; build it with `swift build` in the Andesite repo, or set ANDESITE_SERVER_BIN')

function nginxBinary() {
  if (process.env.NGINX_BIN) return process.env.NGINX_BIN
  try { return execFileSync('which', ['nginx'], { encoding: 'utf8' }).trim() } catch { /* fall through */ }
  const cellar = '/opt/homebrew/Cellar/nginx'
  if (existsSync(cellar)) {
    const version = readdirSync(cellar).sort().at(-1)
    if (version) return join(cellar, version, 'bin/nginx')
  }
  throw new Error('nginx not found; install it or set NGINX_BIN')
}
const nginx = nginxBinary()
const mimeTypes = firstExisting([
  process.env.NGINX_MIME_TYPES,
  '/etc/nginx/mime.types',
  '/opt/homebrew/etc/nginx/mime.types',
  '/usr/local/etc/nginx/mime.types',
  join(dirname(dirname(realpathSync(nginx))), '.bottle/etc/nginx/mime.types'),
], 'nginx mime.types')

if (!existsSync(join(site, 'index.html'))) throw new Error(`${site} has no index.html; run \`pnpm build\` first`)

// The server only serves a vault whose path it can canonicalize, so resolve /var -> /private/var on macOS.
const work = realpathSync(mkdtempSync(join(tmpdir(), 'andesite-e2e-')))
const vaults = join(work, 'vaults')
const state = join(work, 'state')
mkdirSync(state, { recursive: true, mode: 0o700 })
cpSync(join(root, 'tests/e2e/seed'), vaults, { recursive: true })

// The deployment's nginx.conf with its container paths pointed at this machine.
const conf = readFileSync(join(repo, 'deploy/nginx.conf'), 'utf8')
  .replace('pid /tmp/nginx.pid;', `pid ${work}/nginx.pid;`)
  .replaceAll('/tmp/nginx-', `${work}/nginx-`)
  .replace('include /etc/nginx/mime.types;', `include ${mimeTypes};`)
  .replace('listen 8790;', `listen 127.0.0.1:${port};`)
  .replace('root /srv/www;', `root ${site};`)
  .replaceAll('http://127.0.0.1:8788', `http://127.0.0.1:${apiPort}`)
  .replace('error_log stderr warn;', `error_log ${work}/nginx-error.log warn;`)
if (conf.includes('root /srv/www') || conf.includes('include /etc/nginx/mime.types') || conf.includes('listen 8790')) throw new Error('deploy/nginx.conf changed shape; update scripts/e2e-stack.mjs')
writeFileSync(join(work, 'nginx.conf'), conf)

const children = []
function run(name, command, args, env = {}) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', data => process.stderr.write(`[${name}] ${data}`))
  child.stderr.on('data', data => process.stderr.write(`[${name}] ${data}`))
  child.on('exit', code => { if (!stopping) { console.error(`${name} exited with ${code}`); stop(1) } })
  children.push(child)
}
let stopping = false
function stop(code = 0) {
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => { rmSync(work, { recursive: true, force: true }); process.exit(code) }, 500)
}
process.on('SIGTERM', () => stop())
process.on('SIGINT', () => stop())

run('server', serverBin, ['serve-all', vaults, '--state', state, '--port', String(apiPort)], { ANDESITE_API_TOKEN: token })
run('nginx', nginx, ['-c', join(work, 'nginx.conf'), '-p', work + '/', '-e', work + '/nginx-startup.log', '-g', 'daemon off;'])

async function waitFor(url, headers = {}) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const response = await fetch(url, { headers })
      if (response.ok) return
    } catch { /* not up yet */ }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`${url} never answered`)
}
await waitFor(`http://127.0.0.1:${port}/`)
// The vault answers 503 until its first scan is done; the tests wait for the index themselves,
// but a ready stack is friendlier.
await waitFor(`http://127.0.0.1:${port}/v1/vaults/main/status`, { Authorization: `Bearer ${token}` })
console.log(`READY http://localhost:${port}`)
