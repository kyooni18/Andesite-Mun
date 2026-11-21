# Agent prompt: build Phase 0 and Phase 1 of the Andesite Mün UI

Paste everything below the line into a new Claude Code session that has
`kyooni18/Andesite`, `kyooni18/Andesite-Mun` and `kyooni18/Andesite-iOS-macOS`
attached.

---

You're building the second Andesite UI, written in Mün. It is one codebase with
two targets: the **web** app (served by the Andesite Docker deployment at `/`)
and the **native desktop** app (Mün's Tauri 2 `desktop` target). Both targets
live in **`kyooni18/Andesite-Mun`**. The iOS and macOS apps in
`kyooni18/Andesite-iOS-macOS` stay native SwiftUI. Use them as the reference
for features and view names, and don't change them.

## Read first

1. `PLAN.md` in `kyooni18/Andesite-Mun`, on branch
   `claude/multi-platform-ui-plan-6q4n0e`. Fetch that branch by name; the default
   branch is empty. It is the spec. Follow it, and if you have to deviate, record
   why in `docs/decisions.md`.
2. `Andesite/docs/http-api.md` and `Andesite/docs/architecture.md`, then
   `Andesite/Sources/AndesiteHTTP/` (`AndesiteHTTPServer.swift`, `VaultLibrary.swift`)
   and `Andesite/deploy/` (Dockerfile, `entrypoint.sh`, `nginx.conf`).
3. The Mün framework, `kyooni18/Mun` (public; clone it read-only with
   `GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/kyooni18/mun`).
   Read: `README.md`, `docs/LANGUAGE_REFERENCE.md`, `docs/CAPABILITIES.md`,
   `docs/DESKTOP.md`, `docs/WKWEBVIEW_PARITY_RESULTS.md`, `docs/SWIFTUI_PARITY.md`,
   and `examples/language-web/`. Trust only what CAPABILITIES and the parity
   results mark as verified or PASS.
4. Skim `Andesite-iOS-macOS/AndesiteApp/Views/` and `Model/` for the view
   structure you'll mirror: `ContentView`, `Sidebar/`, `Search/`, `Inspector/`,
   `Editor/ConflictBanner.swift`, `Model/VaultModel.swift`.

## Scope for this session: Phase 0, then Phase 1

### Phase 0: Foundations

**Server (`kyooni18/Andesite`):**
- **S1.** In `serve-all` (`VaultLibrary.router`), mount every `/v1` route at
  `/v1/vaults/{vault}/…`, with `/v1/…` meaning the vault `main`. Reuse the route
  definitions in `AndesiteHTTPServer.swift` instead of copying them. Add tests
  next to the existing HTTP tests, and update `docs/http-api.md`.
- **S2.** Browser sessions.
  - `POST /auth/session {"token": …}` sets a cookie: `HttpOnly; Secure;
    SameSite=Strict; Path=/v1`, with a random session ID held in memory and an
    expiry.
  - `DELETE /auth/session` logs out.
  - `/v1` accepts either the bearer token or the cookie. With the cookie,
    mutating methods also require the header `X-Andesite-Client: web`.
  - Compare tokens in constant time. Add tests and documentation.
- **S5.** JSON Schemas for each `/v1` response in `docs/schemas/`, and a server
  test that validates real responses against them.
- Update `deploy/nginx.conf`: proxy `/auth/`, and add a strict CSP plus
  `X-Content-Type-Options`, `Referrer-Policy`, and long caching for hashed assets.

**App (`kyooni18/Andesite-Mun`):**
- Scaffold the project with `mun create` (Vite web template), then add the
  desktop target as described in Mün's `docs/DESKTOP.md`. Use the layout in
  PLAN.md §3:
  - `src/api` (TypeScript)
  - `src/model` and `src/views` (`.mun`)
  - `src/editor`, `src/platform`
  - `src-tauri`
- Pin `@mun-ui/ui` to an exact version. If it isn't published on npm, use the
  local Mun checkout with `mun link` and say so in the README.
- `src/api/client.ts`: a typed client for every `/v1` route that Phase 1 needs.
  - Map server errors to typed errors (`RevisionConflict(current)`,
    `IndexNotReady`, `NotFound`, `StorageFull`, `Unauthorized`).
  - Generate TS types from the server's `docs/schemas`; don't hand-write them.
  - Auth comes from `src/platform`: the cookie session on web, and a
    keychain-stored token on desktop (a stub is fine in Phase 0).
- Login screen, a vault picker (`GET /sync/vaults`), and a `deploy` script that
  builds and copies `dist/` into a path you pass it, `Andesite/deploy/www` by
  default.
- CI (GitHub Actions): build, unit tests (vitest), and Playwright end-to-end
  tests against a real `andesite-server`.

Phase 0 is done when a fresh compose stack with the built site in
`deploy/www` lets you log in at `/` and lists the notes in `main`. Prove it with
a Playwright test and a screenshot.

### Phase 1: Read-only site

- Use the SwiftUI APIs Mün lacks (`NavigationSplitView`,
  `DisclosureGroup`/`OutlineGroup`, URL routing).
  - **Default:** implement them in `Andesite-Mun` under `src/ui/`, with SwiftUI's
    exact names and argument labels, so they can move upstream into Mün later.
  - Only change `kyooni18/Mun` itself if I tell you to.
- Mirror the Swift views one file each:
  - `DocumentTreeView`: tree, collapse state, selection.
  - `SearchSidebar`: full-text search plus `tag:` and property filters.
  - A read view: Markdown rendered and then sanitized with DOMPurify. Wiki links
    are resolved through `/v1/links`, with missing or ambiguous links styled
    differently. KaTeX for maths, and code highlighting.
  - `InspectorView`: outline, backlinks, outgoing links, unlinked mentions, tags,
    properties.
- Routes: `#/<vault>/<path>`. Back/forward and deep links must work.
- Layout must work at 1280px and at 390px phone width. The sidebar and inspector
  collapse into sheets on narrow screens.

Phase 1 is done when Playwright tests cover browse, search, following a wiki
link, backlinks, deep links and a narrow viewport, against a seeded vault in the
compose stack. Create `docs/parity.md` with the PLAN §6 matrix and mark what
now works.

**Stop after Phase 1.** Don't start editing (Phase 2).

## Defaults for the plan's open decisions (PLAN.md §9)

- Single owner with one token, so no user accounts.
- Desktop is remote-only: it connects to a server. No bundled server.
- Phones get the responsive web layout.
- The missing SwiftUI APIs live in this repo for now (see Phase 1).

## Environment facts

- No Swift toolchain is installed. The Docker CLI is present, but no daemon is
  running.
- You need Swift 6.x on Linux to build and test the server. Install it, or start
  `dockerd`; `Andesite/scripts/test-linux.sh` uses `swift:6.2-noble`.
  - If neither works, say so plainly.
  - Don't claim server changes are tested unless `swift test` actually passed.
- Node 22, npm and pnpm are installed. Chromium and Playwright are preinstalled:
  don't run `playwright install`, and pass `--trace off`.
- Tauri builds need Rust and system WebKitGTK packages. If you can't install
  them, don't let that block Phase 0 or 1. Check that the desktop target's config
  is valid and report what you couldn't build.

## Working rules

- Push only to the branch your session assigns, in each repo. Commit in small,
  reviewable steps. Don't open pull requests unless I ask.
- Every write goes through the server's revision checks. Never cache note
  content past a revision.
- Keep network and I/O code in typed TypeScript. `.mun` is for views and view
  models.
- Never put the API token in `localStorage`, `sessionStorage`, URLs or logs.
- When you finish, report:
  - what was built in each repo, with commit links;
  - which tests you ran and their real results;
  - what you couldn't verify and why;
  - every place you deviated from PLAN.md.
