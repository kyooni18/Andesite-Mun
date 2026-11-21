import type { Platform } from './types'

/**
 * The Tauri shell, remote-only: it connects to an Andesite server and keeps the API token
 * in the OS keychain, never in the WebView.
 *
 * PHASE 0 STUB. Storing the token needs a keychain plugin and Rust-side HTTP (a WebView
 * `fetch` to another origin is blocked by CORS, which the server does not send); both
 * arrive in Phase 4. Until then this adapter reports that plainly instead of pretending.
 */
export class DesktopNotImplemented extends Error {
  constructor(what: string) {
    super(`${what} is not implemented in the desktop shell yet (planned for Phase 4).`)
    this.name = 'DesktopNotImplemented'
  }
}

export function createDesktopPlatform(serverUrl = ''): Platform {
  return {
    kind: 'desktop',
    baseUrl: serverUrl.replace(/\/+$/, ''),
    async authorize() {
      throw new DesktopNotImplemented('Reading the token from the keychain')
    },
    async login() {
      throw new DesktopNotImplemented('Storing the token in the keychain')
    },
    async logout() {
      throw new DesktopNotImplemented('Removing the token from the keychain')
    },
  }
}
