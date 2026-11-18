// Orchestrates one keybox command: connect (with retries), send, always close.
// Must import cleanly in Node: the native plugin is only loaded lazily inside ble.js.
import { unlockBox, lockBox } from './protocol/session.js'
import { openBleTransport } from './ble.js'
import { KeyboxError } from './errors.js'

export const MAX_ATTEMPTS = 3

export { KeyboxError }

const MESSAGES = {
  'not-found': 'Box nicht gefunden. Tastenfeld berühren und erneut versuchen.',
  'bluetooth-off': 'Bluetooth ist ausgeschaltet. Bitte Bluetooth aktivieren und erneut versuchen.',
  permission: 'Bluetooth-Berechtigung fehlt. Bitte in den Systemeinstellungen die Bluetooth-Berechtigung für die App erlauben.',
  'lock-error': 'Die Box hat den Befehl abgelehnt.',
  failed: 'Die Box konnte nach 3 Versuchen nicht erreicht werden. Tastenfeld berühren und erneut versuchen.',
}

export function messageFor(reason) {
  return MESSAGES[reason] ?? MESSAGES.failed
}

const NOT_RETRIED = new Set(['not-found', 'bluetooth-off', 'permission', 'lock-error'])

/** Map any error to a KeyboxError and decide whether another attempt makes sense. */
function classify(err) {
  if (err instanceof KeyboxError) return { error: err, retry: !NOT_RETRIED.has(err.reason) }
  // A lock-sent refusal must never be retried silently.
  if (err?.name === 'KeyboxProtocolError' && err.code === 'lock-error') {
    return { error: new KeyboxError('lock-error', err.message, { cause: err }), retry: false }
  }
  return { error: new KeyboxError('failed', err?.message, { cause: err }), retry: true }
}

async function safeClose(conn) {
  try {
    await conn?.close()
  } catch {
    // a failing close must not mask the real outcome
  }
}

/**
 * @param {'open'|'close'} kind
 * @param {object} lockData one lock object (lockData[0])
 * @param {{ onState?: (s: 'searching'|'connecting'|'sending'|'done') => void, connect?: Function }} [opts]
 */
export async function runCommand(kind, lockData, { onState, connect = openBleTransport } = {}) {
  const send = kind === 'open' ? unlockBox : kind === 'close' ? lockBox : null
  if (!send) throw new KeyboxError('failed', `Unknown command: ${kind}`)
  const emit = (s) => {
    try {
      onState?.(s)
    } catch {
      // UI callback errors must not affect the command
    }
  }

  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let conn
    let connectingEmitted = false
    const emitConnecting = () => {
      if (connectingEmitted) return
      connectingEmitted = true
      emit('connecting')
    }
    try {
      emit('searching')
      conn = await connect(lockData, { onConnecting: emitConnecting })
      emitConnecting()
      emit('sending')
      await send(conn.transport, lockData)
      await safeClose(conn)
      emit('done')
      return
    } catch (err) {
      await safeClose(conn)
      const { error, retry } = classify(err)
      lastError = error
      if (!retry) throw error
    }
  }
  throw new KeyboxError('failed', lastError?.message, { cause: lastError })
}
