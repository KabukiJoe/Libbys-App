export class KeyboxError extends Error {
  /**
   * @param {'not-found'|'bluetooth-off'|'permission'|'lock-error'|'uncertain'|'failed'} reason
   * @param {string} [message]
   * @param {{ cause?: unknown, detail?: string }} [options] detail: short technical text for the screen (never lock data)
   */
  constructor(reason, message, options) {
    super(message ?? reason, options)
    this.name = 'KeyboxError'
    this.reason = reason
    this.detail = options?.detail
  }
}

const MAX_DETAIL = 200

/**
 * Short technical description of an error for display: protocol code, lock response code, native/plugin message.
 * Built only from error fields (code, lockCode, message, cause.message); never touches lock data.
 */
export function describeError(err) {
  if (err instanceof KeyboxError && err.detail) return err.detail
  const parts = []
  const add = (p) => {
    if (p && !parts.includes(p)) parts.push(p)
  }
  add(err?.code ? String(err.code) : undefined)
  if (err?.lockCode !== undefined) add(`Lock-Code ${err.lockCode}`)
  const cause = err?.cause
  add(cause?.code ? String(cause.code) : undefined)
  add(cause?.message ? String(cause.message) : undefined)
  if (err?.message && err.message !== err.code && err.message !== err.reason) add(String(err.message))
  return parts.join(' | ').slice(0, MAX_DETAIL)
}
