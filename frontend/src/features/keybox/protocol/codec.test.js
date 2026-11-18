import { describe, expect, it } from 'vitest'
import frames from './__fixtures__/frames.json'
import { encodeCommand, decodeResponse, KeyboxProtocolError } from './codec.js'
import { aesEncrypt, aesDecrypt } from './aes.js'

const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const unhex = (s) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16))

const requests = frames.filter((f) => f.kind === 'request')
const responses = frames.filter((f) => f.kind === 'response')

describe('encodeCommand', () => {
  it.each(requests.map((f) => [f.name, f]))('matches SDK bytes: %s', async (_n, f) => {
    const aesKey = unhex(f.lockData.privateData.aesKey)
    const out = await encodeCommand({
      command: f.input.commandType,
      data: unhex(f.plaintextHex),
      aesKey,
    })
    expect(hex(out)).toBe(f.bytesHex)
  })

  it('throws when data is present but no key given', async () => {
    await expect(encodeCommand({ command: 1, data: new Uint8Array([1]) })).rejects.toBeInstanceOf(
      KeyboxProtocolError,
    )
  })
})

describe('decodeResponse', () => {
  it.each(responses.map((f) => [f.name, f]))('decodes %s', async (_n, f) => {
    const aesKey = unhex(f.lockData.privateData.aesKey)
    const r = await decodeResponse(unhex(f.bytesHex), aesKey)
    expect(r.command).toBe(f.expected.commandType)
    expect(r.response).toBe(f.expected.response)
    expect(hex(r.data)).toBe(f.expected.dataHex)
    expect(hex(r.plaintext)).toBe(f.expected.plaintextHex)
  })

  const ok = responses.find((f) => f.name === 'response-unlock-ok')
  const key = unhex(ok.lockData.privateData.aesKey)

  it('throws crc error when a byte is flipped', async () => {
    const b = unhex(ok.bytesHex)
    b[15] ^= 0x01
    await expect(decodeResponse(b, key)).rejects.toMatchObject({ name: 'KeyboxProtocolError', code: 'crc' })
  })

  it('throws truncated error for half a frame', async () => {
    const b = unhex(ok.bytesHex)
    await expect(decodeResponse(b.slice(0, b.length >> 1), key)).rejects.toMatchObject({
      name: 'KeyboxProtocolError',
      code: 'truncated',
    })
  })
})

describe('aes', () => {
  it('round-trips', async () => {
    const key = unhex('00112233445566778899aabbccddeeff')
    const enc = await aesEncrypt(key, new Uint8Array([1, 2, 3]))
    expect(enc.length).toBe(16)
    expect(Array.from(await aesDecrypt(key, enc))).toEqual([1, 2, 3])
  })
})
