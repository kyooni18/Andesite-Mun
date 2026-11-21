# Decisions and deviations from PLAN.md

Phase 0 and Phase 1. Each entry says what PLAN.md (or the task) asked for, what was done instead,
and why.

## Defaults for PLAN §9

- One owner with one token; no user accounts.
- The desktop app is remote-only: it connects to a server; no bundled server.
- Phones get the responsive web layout.
- The SwiftUI APIs Mün lacks live in this repository under `src/ui/`, not in `kyooni18/Mun`
  (PLAN §3 rule 2 said to build them upstream; the task for this session said to keep them here,
  with SwiftUI's names, so they can move later). `kyooni18/Mun` is untouched.

## Deviations from PLAN.md

### Mün is linked from a pinned checkout, not installed from npm
`package.json` pins `@mun-ui/ui`, `core`, `web` and `vite` to the exact version `0.2.0`, which is on
npm. But `0.2.0` on npm cannot create or run a desktop project (`mun create --target desktop` is
rejected, and `@mun-ui/desktop`, the Rust host crate, is not published). So `pnpm run link:mun`
points every `@mun-ui/*` package at a checkout of `kyooni18/Mun` at the commit in `MUN_REF`, using
`mun link` (it writes `pnpm-workspace.yaml`, which is git-ignored because it holds absolute paths).
The checkout needs one local change to build: `pnpm add -Dw @types/node@22` (its core package
imports `node:fs` without Node types). There is no lockfile for the same reason (absolute `link:`
paths); every direct dependency is pinned to an exact version instead.
Because `mun create` for the desktop target is unavailable from npm, the web project was created with
`npx @mun-ui/ui@0.2.0 create` (the Vite web template) and `src-tauri/` was copied from the desktop
template of the pinned checkout (`templates/desktop`).

### `src/model` holds the search and inspector models inside `VaultStore`
PLAN §3 lists `SearchModel`, `InspectorModel` as separate models. They are separate `.mun` classes,
but `VaultStore` owns the instances (`store.search`, `store.inspector`) instead of `ContentView`
providing them with `.environment(...)`. In Mün 0.2 `.environment(model)` is only applied to View
scopes it can reach from the modified node; views created inside builder closures that are passed to
another View (the `sidebar:`/`detail:` closures of `NavigationSplitView`) are not reached, and read
"No environment value". `VaultStore` itself works with `@Environment` because it is provided at the
root, so everything else reads it from there.

### `NavigationSplitView` pushes nothing on compact width
SwiftUI collapses a split view on a compact horizontal size class by navigating through the columns.
`src/ui/NavigationSplitView.mun` shows only the detail column below 720 CSS pixels and opens the
sidebar in a sheet (the inspector is a sheet too). Its visibility binding is a string
(`"automatic"`, `"all"`, `"doubleColumn"`, `"detailOnly"`) because Mün has no enums. It
has no `navigationSplitViewStyle`, `navigationSplitViewColumnWidth` or toolbar integration.

### `OutlineGroup` quirks
`OutlineGroup(data, children: \.children, content: { item in ... })`: the closure needs its
`content:` label, because Mün 0.2 does not match a trailing closure to a custom initializer whose
closure is not a `@ViewBuilder`, and declaring it `@ViewBuilder` makes the call fail to resolve
at all. `expanded: true` is an extension (SwiftUI's starts collapsed) used by the outline pane.
Rows are built with `Element(...)`, not with `List`/`Section`, so the page has real `nav`, `ul`,
`dl` and `button` elements (the e2e tests query them by role).
The file tree itself uses `DisclosureGroup` directly: its expansion is stored in `VaultStore` so it
is remembered per vault and a deep link can open the folders above the note, which `OutlineGroup`'s
own state could not do.

### URL routing is TypeScript
`src/ui/router.ts` (`#/<vault>/<path>?heading=<h>`) is plain TS, not a Mün view API: SwiftUI has no URL
routing to mirror. The URL is the source of truth: selecting a note navigates, and the app reacts to
`hashchange`, so links, Back/Forward and deep links share one code path. The hash is used so the static
site needs no server rewrite rules (nginx still falls back to `index.html`).

### Reading uses the index, not a tree endpoint (S4 not built)
The sidebar tree is built from `GET /v1/documents` (paged, 100 at a time). That is enough for Phase 1;
folders without notes are not shown. `GET /v1/tree` (S4) was not needed yet.

### Search results are notes, not matching lines
`GET /v1/search` returns ranked notes (title, path), not matching lines with highlights as the Swift
`SearchSidebar` shows. The web `SearchResultGroup` shows the note and its folder.

### Server: two additions beyond S1/S2
- `GET /v1/vaults`, the same list as `GET /sync/vaults`, because the session cookie is valid on `/v1`
  only and the vault picker must work with it. (The task named `GET /sync/vaults` for the picker; the
  client uses the `/v1` one, and `/sync/vaults` still works with the bearer token.)
- `DELETE /v1/session`. The cookie's `Path=/v1` means a browser never sends it to
  `DELETE /auth/session`, which therefore can only expire the cookie client-side. The web client calls
  `DELETE /v1/session` (ends the session on the server) and then `DELETE /auth/session`.

### Mün 0.2 compiler pitfalls found, and how the code avoids them
These cost time; they are recorded for the next person.
- The Vite plugin transforms **`.ts` files too** and rewrites Swift key paths: a regex literal containing
  a backslash, a dot and a letter (a `.md` suffix pattern) becomes `/"md$"/i`. Code uses
  `src/lib/path.ts` (`endsWith`) instead.
- Any comment inside an `@Observable class` body (between members) fails to parse ("',' expected");
  the models keep their documentation above the class.
- A field called `value` on an `@Observable` class is read as the State's own `.value`; the size class
  uses `horizontal`.
- A model instance in `@State` must be made with `new`: `@State var store = new VaultStore()`.
- `Foo { ... } detail: { ... }` (multiple trailing closures) does not parse; labelled closures are used.
- `$model.field` bindings do not work on observable models: `Binding(() => m.x, v => { m.x = v })`.
- Production builds drop class names, so Mün's `@Environment` error messages say "anonymous type".

### Tests use nginx and the server natively, not `docker compose`
`docker compose up` could not be run here (no Docker daemon; Podman's machine and Apple's `container`
failed to start). `scripts/e2e-stack.mjs` starts `andesite-server serve-all` and nginx with **the
deployment's own `deploy/nginx.conf`** (container paths rewritten to temp paths, ports moved to 18790/18788
because 8790 was taken by another service on the development machine), serving `dist/`. What it does not
cover: the Dockerfile, `entrypoint.sh`, the `andesite` user, `chown` of mounted volumes. Point
`E2E_BASE_URL` and `E2E_TOKEN` at a real compose stack to run the same suites against it.

### Playwright is pinned to 1.64.0
The preinstalled Chromium matches that release (build 1248); newer releases want a browser that is not
installed and `playwright install` was off limits.

### Desktop: configuration only in Phase 0/1
`src-tauri/` compiles (`cargo check` passes on macOS, and CI builds it on Linux), but the desktop
platform adapter (`src/platform/desktop.ts`) is a stub that throws `DesktopNotImplemented`. The
capability file grants window lifecycle only (the Mün template also grants file pickers; a remote-only
client needs none), and the CSP gives the WebView no network access (`connect-src` is IPC only), so
Phase 4 will make requests from Rust, which also avoids CORS (the server sends no CORS headers) and
keeps the token in the keychain. `scripts/desktop-check.mjs` asserts these properties.
