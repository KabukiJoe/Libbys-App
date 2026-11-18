// TTLock new-protocol envelope codec (ported from ttlock-sdk-js CommandEnvelope).
// Envelope: 7f5a | protocolType | subVersion | scene | org(i16) | subOrg(i16) | command | encrypt | len | body | crc
// The 0d0a wire suffix and 20-byte chunking are NOT handled here.
import { aesDecrypt, aesEncrypt } from './aes.js'
import { crc8 } from './crc.js'

export const APP_COMMAND = 0xaa
// LockVersion.lockVersion_V3
export const DEFAULT_HEADER = { protocolType: 5, subVersion: 3, scene: 1, organization: 1, subOrganization: 1 }

export class KeyboxProtocolError extends Error {
  constructor(code, message) {
    super(message ?? code)
    this.name = 'KeyboxProtocolError'
    this.code = code
  }
}

export async function encodeCommand({ command, data = new Uint8Array(0), aesKey, header = {} }) {
  const h = { ...DEFAULT_HEADER, ...header }
  let body = data
  if (data.length > 0) {
    if (!aesKey) throw new KeyboxProtocolError('no-key', 'AES key has not been set')
    body = await aesEncrypt(aesKey, data)
  }
  if (body.length > 255) throw new KeyboxProtocolError('too-long', 'Body too long')
  const out = new Uint8Array(12 + body.length + 1)
  const dv = new DataView(out.buffer)
  out[0] = 0x7f
  out[1] = 0x5a
  out[2] = h.protocolType
  out[3] = h.subVersion
  out[4] = h.scene
  dv.setInt16(5, h.organization, false)
  dv.setInt16(7, h.subOrganization, false)
  out[9] = command
  out[10] = h.encrypt ?? APP_COMMAND
  out[11] = body.length
  out.set(body, 12)
  out[out.length - 1] = crc8(out.subarray(0, out.length - 1))
  return out
}

/**
 * Decode a response envelope (without 0d0a suffix).
 * Returns { command, response, data, plaintext }: plaintext = decrypted body
 * [commandType, responseCode, ...payload]; response = responseCode; data = payload.
 */
export async function decodeResponse(bytes, aesKey) {
  if (bytes.length < 13) throw new KeyboxProtocolError('truncated', 'Frame too short')
  const protocolType = bytes[2]
  if (!(protocolType >= 5 || protocolType === 0)) {
    throw new KeyboxProtocolError('unsupported', 'Old protocol frames are not supported')
  }
  const len = bytes[11]
  if (bytes.length < 12 + len + 1) throw new KeyboxProtocolError('truncated', 'Frame truncated')
  if (crc8(bytes.subarray(0, bytes.length - 1)) !== bytes[bytes.length - 1]) {
    throw new KeyboxProtocolError('crc', 'Bad CRC')
  }
  const command = bytes[9]
  const body = bytes.subarray(12, 12 + len)
  if (len === 0) return { command, response: undefined, data: new Uint8Array(0), plaintext: new Uint8Array(0) }
  if (!aesKey) throw new KeyboxProtocolError('no-key', 'AES key has not been set')
  let plaintext
  try {
    plaintext = await aesDecrypt(aesKey, body)
  } catch {
    throw new KeyboxProtocolError('decrypt', 'AES decryption failed')
  }
  return { command, response: plaintext[1], data: plaintext.slice(2), plaintext }
}
