import { platform } from '../platform'
import { AndesiteClient } from './client'

export * from './client'
export * from './service'

/** A client for `vault` on this build target's server, with its credentials. */
export function newClient(vault = 'main'): AndesiteClient {
  return new AndesiteClient(platform(), vault)
}
