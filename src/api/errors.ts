/** Errors the Andesite server and the network can produce, as typed classes. */

export class ApiError extends Error {
  readonly status: number
  /** The server's `error` code, such as `invalid_path`. */
  readonly code: string
  constructor(status: number, code: string, message = `${code} (HTTP ${status})`) {
    super(message)
    this.name = new.target.name
    this.status = status
    this.code = code
  }
}

/** 412: the document changed since the revision the request was based on. */
export class RevisionConflict extends ApiError {
  /** The document's current revision, or null when it no longer exists. */
  readonly current: string | null
  constructor(current: string | null) {
    super(412, 'revision_conflict', 'The note changed on the server.')
    this.current = current
  }
}

/** 503: the first scan has not finished, the last one failed, or the vault is closing. */
export class IndexNotReady extends ApiError {
  constructor(code = 'index_not_ready') {
    super(503, code, 'The vault is still being indexed.')
  }
}

/** 404: no such note, file, snapshot or vault. */
export class NotFound extends ApiError {
  constructor(code = 'not_found') {
    super(404, code, code === 'vault_not_found' ? 'There is no such vault.' : 'Not found.')
  }
}

/** 507: the server's disk or quota is full. */
export class StorageFull extends ApiError {
  constructor(code = 'storage_full') {
    super(507, code, 'The server has no space left.')
  }
}

/** 401: no or a wrong token, or an unknown or expired session. */
export class Unauthorized extends ApiError {
  constructor(code = 'authentication_required') {
    super(401, code, 'Sign in to continue.')
  }
}

/** The server could not be reached at all. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Network error')
    this.name = 'NetworkError'
    this.cause = cause
  }
}

/** Maps an error response (`{"error": code, "current"?}`) to its typed error. */
export function apiErrorFor(status: number, body: unknown): ApiError {
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const code = typeof fields.error === 'string' ? fields.error : `http_${status}`
  if (status === 412 || code === 'revision_conflict') {
    return new RevisionConflict(typeof fields.current === 'string' ? fields.current : null)
  }
  if (status === 401) return new Unauthorized(code)
  if (status === 404) return new NotFound(code)
  if (status === 503 || code === 'index_not_ready') return new IndexNotReady(code)
  if (status === 507 || code === 'storage_full') return new StorageFull(code)
  return new ApiError(status, code)
}
