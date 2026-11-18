export class KeyboxError extends Error {
  /** @param {'not-found'|'bluetooth-off'|'permission'|'lock-error'|'failed'} reason */
  constructor(reason, message, options) {
    super(message ?? reason, options)
    this.name = 'KeyboxError'
    this.reason = reason
  }
}

