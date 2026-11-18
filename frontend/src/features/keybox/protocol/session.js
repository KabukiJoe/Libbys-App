// Lock/unlock sequence over an abstract BLE transport (ported from ttlock-sdk-js TTLock.unlock()/lock()).
//
// Transport contract (implemented by the real BLE transport and by fakeTransport.js):
/**
 * @typedef {Object} Transport
 * @property {(bytes: Uint8Array) => Promise<void>} write
 *   Write one chunk (<= 20 bytes) to the write characteristic, WITHOUT response (as the SDK does).
 * @property {(cb: (bytes: Uint8Array) => void) => (() => void)} onNotify
 *   Subscribe to notification chunks; returns the unsubscribe function.
 */
//
// lockData: ONE lock object, i.e. element 0 of the PC tool's lockData.json array (callers pass `lockData[0]`):
//   { address, privateData: { aesKey (hex), admin: { adminPs, unlockKey }, ... }, header? }
// `header` is optional (same shape as the codec's `header` option); default is the codec's V3 header.
import { encodeCommand, decodeResponse, KeyboxProtocolError } from './codec.js'

export const CMD_CHECK_USER_TIME = 0x55
export const CMD_UNLOCK = 0x47
export const CMD_LOCK = 0x58
export const RESPONSE_SUCCESS = 1
export const COMMAND_TIMEOUT_MS = 5000
export const WRITE_CHUNK_SIZE = 20

const CRLF = Uint8Array.from([0x0d, 0x0a])
// SDK: setPayload(0, '0001311400', '9911301400', 0): 5-byte start, 5-byte end, lockFlagPos/uid u32 = 0
const CHECK_USER_TIME_BODY = Uint8Array.from([
  0x00, 0x01, 0x1f, 0x0e, 0x00, 0x63, 0x0b, 0x1e, 0x0e, 0x00, 0, 0, 0, 0, 0, 0, 0,
])

const unhex = (s) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16))

function endsWithCrlf(buf) {
  return buf.length >= 2 && buf[buf.length - 2] === CRLF[0] && buf[buf.length - 1] === CRLF[1]
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}

/** Send one command and resolve with the decoded response of the same command type. */
async function exchange(transport, { command, data, aesKey, header, actuating = false }) {
  const envelope = await encodeCommand({ command, data, aesKey, header })
  const wire = concat(envelope, CRLF)

  let unsubscribe = () => {}
  let timer
  try {
    return await new Promise((resolve, reject) => {
      let buf = new Uint8Array(0)
      let done = false
      let written = false
      const finish = (fn, v) => {
        if (done) return
        done = true
        // Once the actuating command is fully written, any failure leaves the box state unknown.
        if (fn === reject && actuating && written && v && typeof v === 'object') v.afterCommand = true
        fn(v)
      }
      timer = setTimeout(
        () => finish(reject, new KeyboxProtocolError('timeout', 'No response from lock')),
        COMMAND_TIMEOUT_MS,
      )
      // Subscribe per command, before writing, so no answer can be missed.
      unsubscribe = transport.onNotify((chunk) => {
        if (done) return
        buf = concat(buf, chunk)
        if (!endsWithCrlf(buf)) return
        const frame = buf.slice(0, buf.length - 2)
        buf = new Uint8Array(0)
        // Stray message for another command (e.g. SearchBicycleStatus): ignore.
        if (frame.length > 9 && frame[9] !== command) return
        decodeResponse(frame, aesKey).then(
          (r) => finish(resolve, r),
          (e) => {
            // A reply that fails to decode proves the box received the complete command.
            if (actuating && e && typeof e === 'object') e.afterCommand = true
            finish(reject, e)
          },
        )
      })
      ;(async () => {
        for (let i = 0; i < wire.length; i += WRITE_CHUNK_SIZE) {
          await transport.write(wire.slice(i, i + WRITE_CHUNK_SIZE))
        }
        written = true
      })().catch((e) => finish(reject, e))
    })
  } finally {
    clearTimeout(timer)
    unsubscribe()
  }
}

function requireSuccess(r, name) {
  if (r.response !== RESPONSE_SUCCESS) {
    const err = new KeyboxProtocolError('lock-error', `${name} failed (response code ${r.response})`)
    err.lockCode = r.response
    throw err
  }
}

function u32be(...values) {
  const out = new Uint8Array(values.length * 4)
  const dv = new DataView(out.buffer)
  values.forEach((v, i) => dv.setUint32(i * 4, v >>> 0, false))
  return out
}

async function operate(transport, lockData, command, name) {
  const aesKey = unhex(lockData.privateData.aesKey)
  const header = lockData.header
  const check = await exchange(transport, { command: CMD_CHECK_USER_TIME, data: CHECK_USER_TIME_BODY, aesKey, header })
  requireSuccess(check, 'CheckUserTime')
  if (check.data.length < 4) throw new KeyboxProtocolError('truncated', 'CheckUserTime response too short')
  const psFromLock = new DataView(check.data.buffer, check.data.byteOffset, 4).getUint32(0, false)
  const sum = (psFromLock + lockData.privateData.admin.unlockKey) >>> 0
  const now = Math.floor(Date.now() / 1000)
  const r = await exchange(transport, { command, data: u32be(sum, now), aesKey, header, actuating: true })
  requireSuccess(r, name)
  return r.data.length > 0 ? { battery: r.data[0] } : {}
}

/** @param {Transport} transport @param {object} lockData one lock object (lockData[0]) */
export const unlockBox = (transport, lockData) => operate(transport, lockData, CMD_UNLOCK, 'Unlock')
/** @param {Transport} transport @param {object} lockData one lock object (lockData[0]) */
export const lockBox = (transport, lockData) => operate(transport, lockData, CMD_LOCK, 'Lock')
