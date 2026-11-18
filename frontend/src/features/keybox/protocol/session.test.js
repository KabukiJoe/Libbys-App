import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import frames from './__fixtures__/frames.json'
import { unlockBox, lockBox } from './session.js'
import { createFakeTransport } from './fakeTransport.js'
import { KeyboxProtocolError } from './codec.js'

const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const unhex = (s) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16))
const f = (name) => frames.find((x) => x.name === name)
const wire = (name) => unhex(f(name).wireHex)
const lockData = f('unlock').lockData

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1767225600 * 1000)
})
afterEach(() => vi.useRealTimers())

describe.each([
  ['unlockBox', unlockBox, 'unlock', 'response-unlock-ok', 'response-unlock-failed'],
  ['lockBox', lockBox, 'lock', 'response-lock-ok', 'response-lock-failed'],
])('%s', (_n, fn, req, ok, failed) => {
  it('writes check-user-time then the command, equal to fixtures, and resolves with battery', async () => {
    const t = createFakeTransport([[wire('response-check-user-time-ok')], [wire(ok)]])
    await expect(fn(t, lockData)).resolves.toEqual({ battery: 88 })
    expect(t.requests.map(hex)).toEqual([f('aes-check-user-time').wireHex, f(req).wireHex])
    expect(t.listenerCount).toBe(0)
  })

  it('writes in chunks of at most 20 bytes', async () => {
    const t = createFakeTransport([[wire('response-check-user-time-ok')], [wire(ok)]])
    await fn(t, lockData)
    expect(t.writes.length).toBeGreaterThan(2)
    expect(Math.max(...t.writes.map((w) => w.length))).toBeLessThanOrEqual(20)
  })

  it('reassembles a response split over 3 notifications', async () => {
    const w = wire(ok)
    const chunks = [w.slice(0, 15), w.slice(15, 30), w.slice(30)]
    const t = createFakeTransport([[wire('response-check-user-time-ok')], chunks])
    await expect(fn(t, lockData)).resolves.toEqual({ battery: 88 })
  })

  it('rejects with lock-error and lockCode on a failure response', async () => {
    const t = createFakeTransport([[wire('response-check-user-time-ok')], [wire(failed)]])
    await expect(fn(t, lockData)).rejects.toMatchObject({ code: 'lock-error', lockCode: 0 })
    expect(t.listenerCount).toBe(0)
  })

  it('rejects with lock-error when check-user-time fails, without sending the command', async () => {
    const t = createFakeTransport([[wire('response-check-user-time-failed')]])
    await expect(fn(t, lockData)).rejects.toMatchObject({ code: 'lock-error' })
    expect(t.requests).toHaveLength(1)
  })

  it('rejects with timeout when there is no answer', async () => {
    const t = createFakeTransport([null])
    const assertion = expect(fn(t, lockData)).rejects.toMatchObject({ code: 'timeout' })
    await vi.waitFor(() => expect(t.requests).toHaveLength(1)) // encoding uses real async WebCrypto
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    expect(t.listenerCount).toBe(0)
  })

  it('times out per command (second step silent)', async () => {
    const t = createFakeTransport([[wire('response-check-user-time-ok')], null])
    const assertion = expect(fn(t, lockData)).rejects.toBeInstanceOf(KeyboxProtocolError)
    await vi.waitFor(() => expect(t.requests).toHaveLength(2))
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    expect(t.requests).toHaveLength(2)
  })

  it('ignores a stray message of another command type', async () => {
    const stray = req === 'unlock' ? wire('response-lock-ok') : wire('response-unlock-ok')
    const t = createFakeTransport([[wire('response-check-user-time-ok')], [stray, wire(ok)]])
    await expect(fn(t, lockData)).resolves.toEqual({ battery: 88 })
  })

  it('treats a bad CRC on the awaited response as a crc error', async () => {
    const bad = wire(ok)
    bad[bad.length - 3] ^= 0xff // CRC byte precedes 0d0a
    const t = createFakeTransport([[wire('response-check-user-time-ok')], [bad]])
    await expect(fn(t, lockData)).rejects.toMatchObject({ code: 'crc' })
    expect(t.listenerCount).toBe(0)
  })

  it('unsubscribes when write fails', async () => {
    const t = createFakeTransport([])
    t.write = async () => {
      throw new Error('ble down')
    }
    await expect(fn(t, lockData)).rejects.toThrow('ble down')
    expect(t.listenerCount).toBe(0)
  })
})
