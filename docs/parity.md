# Feature parity

The matrix of PLAN.md §6, marked with what works today. Phase 0 and Phase 1 are done; "P*n*" is the
phase that brings the feature, ✓ means it works and is covered by a test, "–" means not applicable.
The macOS and iOS columns are the existing SwiftUI apps and are not touched by this repository.

| Feature | macOS | iOS | Web | Desktop (Win/Linux) |
|---|---|---|---|---|
| Local vault on disk | ✓ | ✓ | – | Phase 6 |
| Remote vault | via sync | via sync | **✓** direct `/v1` (cookie session) | stub: shell builds, no client (P4) |
| File tree | ✓ | ✓ | **✓ read-only** (P1) | P4 |
| CRUD, move with link rewrite | ✓ | ✓ | P2 | P4 |
| Search (full text) | ✓ | ✓ | **✓** (P1) | P4 |
| Tag and property filters | ✓ | ✓ | **✓** (P1) | P4 |
| Backlinks, unlinked mentions | ✓ | ✓ | **✓** (P1) | P4 |
| Outline | ✓ | ✓ | **✓** (P1) | P4 |
| Outgoing links, tags, properties | ✓ | ✓ | **✓ read-only** (P1) | P4 |
| Live-styled Markdown editor | ✓ | ✓ | P3 | P4 |
| Rendered Markdown reading | ✓ | ✓ | **✓** (P1, sanitized) | P4 |
| LaTeX, code highlighting, wide tables | ✓ | ✓ | **✓ in the reader** (P1); editor P3 | P4 |
| Conflict handling | ✓ | ✓ | P2 | P4 |
| History / restore | ✓ | ✓ | P2 | P4 |
| Graph | ✓ | ✓ | P5 | P5 |
| Bookmarks | ✓ | ✓ | P5 | P5 |

## Detail for what works

| Area | Swift view | Mün counterpart | Test |
|---|---|---|---|
| Sign in / session | `ServerAccountSettings` | `views/Login/LoginView.mun`, `platform/web.ts` | `phase0.spec.ts` |
| Vault picker | `VaultBar`, `VaultMenu` | `views/Sidebar/VaultBar.mun` (`GET /v1/vaults`) | `phase0`, `browse` |
| Window layout | `ContentView` | `views/ContentView.mun`, `ui/NavigationSplitView.mun` | `narrow.spec.ts` |
| Tree | `DocumentTreeView`, `DocumentTreeItem`, `DocumentTreeRow` | `views/Sidebar/*.mun`, `ui/DisclosureGroup.mun` | `browse.spec.ts`, `tree.test.ts` |
| Search | `SearchSidebar`, `SearchField`, `SearchSummary`, `SearchResultGroup` | `views/Search/*.mun` | `search.spec.ts` |
| Reading | `DocumentEditorView` (read-only part), `PathBar`, `EditorBanner` | `views/Editor/*.mun`, `render/*.ts` | `browse`, `links`, `render.test.ts` |
| Wiki links with status | `WikiLinkResolver` | `render/markdown.ts` using `GET /v1/links` | `links.spec.ts` |
| Inspector | `InspectorView`, `OutlineSection`, `LinksSections`, `TagsSection`, `PropertiesSection` | `views/Inspector/*.mun`, `ui/OutlineGroup.mun` | `links.spec.ts` |
| Routing | – | `ui/router.ts` (`#/<vault>/<path>`) | `links.spec.ts`, `render.test.ts` |
| API contract | – | `api/client.ts`, generated `api/schemas/types.ts` | `contract.spec.ts`, `client.test.ts` |

## Known gaps in what "works"

- Search shows matching notes, not matching lines (the server returns notes).
- The tree lists notes only: empty folders are not shown, attachments are not in the tree.
- Embeds other than images (`![[note]]`, PDFs) render as unresolved text.
- No keyboard shortcuts, context menus or toolbar commands yet (Phase 2).
- Light/dark follows the system; there is no accent setting (Phase 5).
- Desktop: nothing runs end to end. The shell compiles; sign-in and the keychain are Phase 4.
- Not verified: Safari, Firefox, screen readers, IME; the Dockerfile/compose path (see decisions.md).
