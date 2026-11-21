import { Unauthorized, NetworkError, apiErrorFor } from '../api/errors'
import type { Platform } from './types'

/**
 * The site served at `/` by the Andesite deployment. Same origin as the API, so the
 * browser sends the session cookie itself (`Path=/v1`, HttpOnly, SameSite=Strict). Changes
 * also carry `X-Andesite-Client: web`, which the server requires with a cookie.
 */
export function createWebPlatform(fetchImpl: typeof fetch = (...args) => fetch(...args), baseUrl = ''): Platform {
  return {
    kind: 'web',
    baseUrl,
    async authorize(init) {
      const headers = new Headers(init.headers)
      headers.set('X-Andesite-Client', 'web')
      return { ...init, headers, credentials: 'same-origin' }
    },
    async login(token) {
      let response: Response
      try {
        response = await fetchImpl(`${baseUrl}/auth/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ token }),
        })
      } catch (error) {
        throw new NetworkError(error)
      }
      if (response.ok) return
      const body = await response.json().catch(() => null)
      throw response.status === 401 ? new Unauthorized() : apiErrorFor(response.status, body)
    },
    async logout() {
      // The cookie is scoped to /v1, so only a /v1 request can end the session on the
      // server; /auth/session then expires the cookie in the browser.
      await fetchImpl(`${baseUrl}/v1/session`, { method: 'DELETE', credentials: 'same-origin', headers: { 'X-Andesite-Client': 'web' } }).catch(() => undefined)
      await fetchImpl(`${baseUrl}/auth/session`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined)
    },
  }
}
