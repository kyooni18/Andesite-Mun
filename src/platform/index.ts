import { createDesktopPlatform } from './desktop'
import type { Platform } from './types'
import { createWebPlatform } from './web'

export type { Platform } from './types'
export { createWebPlatform, createDesktopPlatform }

/** True inside the Tauri WebView. */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

let current: Platform | undefined

/** The platform of this build target: Tauri's WebView is desktop, any browser is web. */
export function platform(): Platform {
  current ??= isDesktop() ? createDesktopPlatform() : createWebPlatform()
  return current
}
