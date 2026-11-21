# Andesite-Mun: plan for a second Andesite UI

Status: proposal · 2026-11-21

## 1. What we are building

Andesite has one backend (`AndesiteCore` / `andesite-server`) and one native UI
(`Andesite-iOS-macOS`, SwiftUI). The Docker deployment already reserves `/` for a
web app (`deploy/www/index.html` says "The web app will live here") and proxies
`/v1/` and `/sync/` to the server.

This repository adds a **second UI written in Mün** (`.mun`, SwiftUI-like syntax,
compiled to JavaScript). It holds both targets, web and native (desktop). One Mün codebase ships to:

| Target | How | Replaces |
|---|---|---|
| **Web** (the site) | `mun build` → static assets copied into `deploy/www`, served by the existing nginx | the placeholder page |
| **Desktop** (Windows, Linux) | `mun create --target desktop`: the same runtime in a Tauri 2 WebView | nothing; these platforms have no Andesite app today |

The iOS and macOS apps **stay native SwiftUI**. Mün does not compile to SwiftUI.
Its main web path is `.mun → JS → @mun-ui/web DOM`, and its native target is
experimental. Shipping Mün on Apple platforms would give a worse app than the
existing one.

### What "multi-platform" shares, and what it doesn't

Mün follows SwiftUI's names, argument labels and modifier order (see Mün's
`docs/SWIFTUI_PARITY.md`), so a SwiftUI view can be ported almost line by line.
We use that, but we **don't try to compile one source file for both toolchains**.
The models, async, persistence and platform services differ too much: URLSession
vs `fetch`, an embedded `Vault` vs HTTP, TextKit vs DOM.

| Layer | Shared between Swift and Mün? | Mechanism |
|---|---|---|
| Data contract | **Yes, enforced** | JSON Schemas for every `/v1` response, checked by the Swift server tests and by the TS client tests |
| View structure and naming | **Yes, by convention** | Each SwiftUI view file has a `.mun` counterpart with the same name and responsibility (`DocumentTreeRow.swift` ↔ `DocumentTreeRow.mun`) |
| Design tokens | **Yes, generated** | One `tokens.json` (accent, spacing, radii, type scale) → Swift extension + Mün constants |
| Behaviour rules | **Yes, by spec** | Conflict handling, autosave, link rewriting and the like are written once as specs in `docs/behaviour/` and tested on both sides |
| View source code | No (see §8 for a later experiment) | |

## 2. Where things stand today (from reading the code)

**Andesite server**
- `/v1` covers documents, history, search, tags, properties, links, mentions,
  bookmarks and snapshots. It uses revision-checked writes (`If-Match`, 412
  `revision_conflict`).
- **Blocker:** the Docker image runs `serve-all`, and `VaultLibrary.router` only
  mounts `/sync/vaults/{vault}/…`. **The deployed container serves no `/v1`
  routes**, so nginx's `/v1/` proxy currently goes nowhere.
- Auth is a single 64-hex bearer token. That works for apps and sync peers, but a
  browser must not keep it in `localStorage`.
- There is no push channel for document changes. `/sync/changes?wait=` long-polls,
  but it is a sync-level feed.

**Mün (v0.2, `kyooni18/Mun`)**
- Verified in Chromium and in WKWebView (138/138 contracts):
  - views: `List`, `Section`, `LazyVStack`, `TextEditor`, `Sheet`, `Canvas`/SVG
  - state: `@State`/`@Binding`/`@Observable`, `.task(id:)` cancellation
  - rendering: SSR and hydration
  - interop: `elementRef` for raw DOM, ES module imports of TS
- Limited or missing parts that Andesite needs:

  | Need | Mün status |
  |---|---|
  | `NavigationSplitView` (sidebar / editor / inspector) | not in inventory |
  | `NavigationStack` path, routing / URL sync | LIMITED / missing |
  | `OutlineGroup` / `DisclosureGroup` (file tree) | not in inventory |
  | `contextMenu`, `keyboardShortcut`, `commands`, `toolbar`, `searchable` | not in inventory |
  | `Menu` | LIMITED (`<details>`) |
  | `Image`, `Label`, symbols | NOT RUN / symbol variants unsupported |
  | `listStyle`, `buttonStyle`, `textFieldStyle` | CSS metadata only |
  | Typed HTTP / data API | missing (app-level `fetch`) |
  | Desktop on Windows/Linux | not validated (macOS WKWebView only) |

**Native app (`Andesite-iOS-macOS`)**
- About 38k lines of Swift. Most of it is `MarkdownEngine`, a TextKit live-styling
  editor that can't be ported.
- The app's view layout is the porting map: Sidebar (tree, bookmarks, search),
  Editor (title, path bar, conflict banner, find bar, history), Inspector
  (outline, links, properties, tags), Graph, Settings.

## 3. Architecture

```
Andesite-Mun/
  package.json            @mun-ui/ui pinned to an exact version
  src/
    App.mun               root: NavigationSplitView(sidebar, editor, inspector)
    api/                  TypeScript, not .mun:
      client.ts             typed fetch wrapper: auth, ETag/If-Match, error codes → typed errors
      schemas/              generated from Andesite/docs/schemas/*.json
      changes.ts            change-feed subscription (long-poll → SSE later)
    model/                .mun @Observable classes (ports of the Swift models)
      VaultStore.mun        ≈ VaultModel: tree, open documents, selection
      OpenDocument.mun      text, base revision, dirty, autosave, conflict state
      InspectorModel.mun, BookmarksModel.mun, SearchModel.mun, SettingsModel.mun
    views/                one .mun per SwiftUI counterpart
      Sidebar/ Editor/ Inspector/ Search/ Bookmarks/ Graph/ Settings/
    editor/               TypeScript CodeMirror 6 bridge, mounted through elementRef
    platform/             web.ts | desktop.ts (Tauri), behind one interface
  src-tauri/              desktop shell (phase 4)
  tests/                  unit (vitest), e2e (Playwright against the compose stack)
```

Rules:
1. **`.mun` for views and view models; TypeScript for I/O and heavy widgets.** Mün
   has no typed HTTP boundary yet, so the network layer stays in typed TS that
   `.mun` imports.
2. **Mün gaps that are SwiftUI APIs get built upstream in `kyooni18/Mun`**, with
   parity contracts. Examples: `NavigationSplitView`, `DisclosureGroup`,
   `contextMenu`, `keyboardShortcut`, `searchable`. Andesite-only needs (the
   Markdown editor) stay in this repo.
3. **The server is the source of truth.** The web client never caches content past
   a revision. Every write carries the revision it was based on, as the Swift app
   does.

## 4. Server work (in `kyooni18/Andesite`)

| # | Change | Why |
|---|---|---|
| S1 | Mount `/v1/vaults/{vault}/…` in `serve-all` (plus `/v1/…` = `main`), reusing `AndesiteHTTPServer`'s routes | The deployed container has no `/v1` today |
| S2 | Browser sessions: `POST /auth/session {token}` → `HttpOnly; Secure; SameSite=Strict` cookie, valid only on `/v1`; `DELETE` logs out; mutating requests also need `X-Andesite-Client` | Keeps the long-lived token out of JS |
| S3 | `GET /v1/vaults/{v}/changes?after=&wait=`: a document-level feed (path, revision, kind), built on the existing revision feed | Live tree and editor updates; detecting external edits |
| S4 | `GET /v1/tree` (directories, including empty ones) if `/v1/documents` paging isn't enough | Sidebar tree (verify first) |
| S5 | JSON Schemas in `docs/schemas/`, with a server test asserting responses validate | Shared contract (§1) |
| S6 | nginx: strict CSP, `X-Content-Type-Options`, `Referrer-Policy`, long cache for hashed assets | XSS defence for rendered Markdown |
| S7 (later) | `GET /v1/graph`: nodes and resolved edges in one call | Graph view without N link requests |

S1 and S2 block everything else. S3 blocks live editing.

## 5. Phases

Each phase ends with a deployable build of the site and a Playwright suite run
against `docker compose up`.

### Phase 0: Foundations
- S1, S2 and S5 in the server.
- Scaffold this repo with `mun create` and the Vite template. Add CI: build, unit
  tests, and e2e against the compose stack.
- `api/client.ts` with typed errors (`RevisionConflict(current)`, `IndexNotReady`,
  `StorageFull`, …) and contract tests against a real server.
- Login screen, vault picker (`GET /sync/vaults`), and the deploy step that copies
  `dist/` into `deploy/www`.
- **Done when** the container at `/` lets you log in and lists the notes in `main`.

### Phase 1: Read-only site
- Upstream in Mün: `NavigationSplitView` (two and three columns; collapses on
  narrow widths), `DisclosureGroup`/`OutlineGroup`, and URL routing (`#/vault/path.md`).
- Views: `DocumentTreeView`, `SearchSidebar` (with `tag:` / property filters),
  read view (Markdown → sanitized HTML; wiki links resolved with `/v1/links`
  status), Inspector (outline, backlinks, outgoing links, unlinked mentions, tags,
  properties).
- **Done when** you can browse, search and follow links in a real vault on desktop
  and phone-width browsers.

### Phase 2: Editing (plain editor)
- S3 change feed.
- `OpenDocument` model: Mün `TextEditor`, debounced autosave with `If-Match`, and
  `ConflictBanner` (reload / keep mine / show diff). Behaviour follows
  `docs/behaviour/conflicts.md`.
- Create, rename and move (links rewritten by the server), delete, restore from
  history; `MoveSheet`; tag and property editing.
- Upstream in Mün: `contextMenu`, `keyboardShortcut`, `searchable`, `toolbar`.
- **Done when** two browser tabs and the macOS app edit the same vault, conflicts
  surface correctly, and no edit is lost (scripted Playwright test plus a
  manual macOS check).

### Phase 3: Rich editor
- CodeMirror 6 in `editor/`: Markdown language, live-preview decorations (headings,
  emphasis, lists, tables), wiki-link completion from `/v1/documents`, KaTeX (the
  Swift app also uses KaTeX), code highlighting, find bar (⌘/Ctrl-F), paste of
  HTML → Markdown.
- The editor is a Mün View wrapping an `elementRef` host. Text flows through a
  `Binding`, plus an imperative channel for selection and commands.
- **Done when** the editing feature checklist from `MarkdownEngine` (tracked in
  `docs/parity.md`) is at least 80% covered.

### Phase 4: Desktop (Windows, Linux)
- Tauri 2 shell, **remote mode**: connects to an Andesite server. The token is kept
  in the OS keychain through a Tauri plugin, not in the WebView.
- Native menus mapped from Mün `commands`, window state, deep links.
- Validate the Mün runtime on WebView2 (Windows) and WebKitGTK (Linux). Mün has
  only validated WKWebView, so add those engines to Mün's parity suite.
- **Done when** signed installers come out of CI and the Phase 2 e2e suite passes
  in both shells.

### Phase 5: Breadth
- Graph view: Mün `Canvas` plus a force simulation. Port
  `ForceSimulation.swift`'s algorithm; S7.
- Bookmarks, recovery snapshots, synced vault settings, accent and theme settings
  (needs Mün light-theme support; its native palette is fixed dark).
- Offline read cache (Service Worker) for the site.

### Phase 6 (optional): Local-first desktop
- Bundle `andesite-server` as a Tauri sidecar on Linux (it already builds on glibc)
  and sync to the remote server, the same way the Apple apps embed `Vault`.
- Windows needs a `ReadDirectoryChangesW` watcher in `CAndesiteFS` and Windows
  path handling in `AndesiteCore`. This is a separate project; scope it only if
  there's demand.

## 6. Feature parity matrix (target end state)

| Feature | macOS | iOS | Web | Desktop (Win/Linux) |
|---|---|---|---|---|
| Local vault on disk | ✓ | ✓ | – | Phase 6 |
| Remote vault | via sync | via sync | ✓ (direct `/v1`) | ✓ (direct `/v1`) |
| File tree, CRUD, move with link rewrite | ✓ | ✓ | P1–P2 | P4 |
| Search, tags, properties | ✓ | ✓ | P1 | P4 |
| Backlinks, mentions, outline | ✓ | ✓ | P1 | P4 |
| Live-styled Markdown editor | ✓ | ✓ | P3 | P4 |
| LaTeX, code highlighting, wide tables | ✓ | ✓ | P3 | P4 |
| Conflict handling | ✓ | ✓ | P2 | P4 |
| History / restore | ✓ | ✓ | P2 | P4 |
| Graph | ✓ | ✓ | P5 | P5 |
| Bookmarks | ✓ | ✓ | P5 | P5 |

## 7. Risks

| Risk | Mitigation |
|---|---|
| Mün is young (v0.2, "first vertical slice"); routing, a11y and IME aren't validated | Pin an exact version. Upstream each gap with a parity contract. Keep I/O and the editor in TS so a Mün gap never blocks data correctness |
| Upstream Mün work slows the app | Budget it per phase. Each upstream feature is a SwiftUI API, so it helps every Mün user |
| XSS through Markdown or HTML in notes | Sanitize (DOMPurify), apply Mün's URL policy to links, add a strict CSP (S6), use cookie sessions so a script can't steal the token |
| Data loss from concurrent edits | Revision-checked writes are already enforced server-side. Add a multi-client e2e test in Phase 2 |
| Web and Swift UIs drift | Shared schemas, a view-name mapping and behaviour specs (§1). `docs/parity.md` is updated in the same PR as each feature |
| Desktop WebView differences (WebView2, WebKitGTK) | Extend Mün's 138-contract parity suite to those engines before Phase 4 ships |

## 8. Later experiment: shared leaf views

Mün claims SwiftUI source compatibility for a manifest-checked subset. Small
presentational views that only take value inputs (`TagPills`,
`SyncStatusRow`, `SearchSummary`) could live once in a `Shared/` folder, be
compiled by both `swiftc` and the Mün compiler, and be checked in CI by both.
Try it only after Phase 2, with a strict rule: **no model types, no async, no
platform APIs in shared files**. If keeping files in the common subset costs more
than porting them by hand, drop the experiment.

## 9. Decisions needed

1. **Who uses the site?** One owner with one token (assumed here), or several
   users? Several users need real accounts in the server, which is a much bigger
   S2.
2. **Desktop: remote-only (Phase 4), or local-first (Phase 6)?** Local-first on
   Windows means porting the file watcher and path layer.
3. **Mobile web:** a responsive site is assumed. Should iOS users be pointed to
   the native app instead?
4. **Upstream ownership:** is it fine to land the new SwiftUI-API views
   (`NavigationSplitView`, `DisclosureGroup`, `contextMenu`, …) in `kyooni18/Mun`
   itself?
