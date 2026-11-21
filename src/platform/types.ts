/**
 * What differs between the web app and the desktop app: where the server is and how
 * a request proves who sent it. Everything else is shared.
 *
 * The API token is never kept by page scripts: not in localStorage, sessionStorage,
 * URLs or logs. The web app trades it once for an HttpOnly cookie; the desktop app
 * keeps it in the OS keychain.
 */
export interface Platform {
  readonly kind: 'web' | 'desktop'
  /** Origin of the Andesite server, without a trailing slash; '' means this page's origin. */
  readonly baseUrl: string
  /** Adds what the server needs to accept a request (the session cookie or the bearer token). */
  authorize(init: RequestInit): Promise<RequestInit>
  /** Signs in with the API token. Rejects with `Unauthorized` for a wrong token. */
  login(token: string): Promise<void>
  /** Ends the session on the server and forgets it here. */
  logout(): Promise<void>
}
