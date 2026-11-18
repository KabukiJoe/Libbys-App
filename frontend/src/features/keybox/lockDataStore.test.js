import { describe, it, expect, vi, beforeEach } from 'vitest'
import fixtures from './protocol/__fixtures__/frames.json'

const store = new Map()
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }) => ({ value: store.has(key) ? store.get(key) : null })),
    set: vi.fn(async ({ key, value }) => { store.set(key, value) }),
    remove: vi.fn(async ({ key }) => { store.delete(key) }),
  },
}))

import { parseLockData, loadLockData, clearLockData } from './lockDataStore.js'

const KEY = 'keybox.lockData'
const BAD = 'Invalid lock data'
const entry = Array.isArray(fixtures) ? fixtures[0] : Object.values(fixtures)[0]
const clone = () => structuredClone(entry.lockData)
const without = (fn) => { const l = clone(); fn(l); return l }

beforeEach(() => store.clear())

describe('parseLockData', () => {
  it('accepts the PC tool array (first element)', () => {
    expect(parseLockData(JSON.stringify([clone(), { address: 'x' }]))).toEqual(clone())
  })
  it('accepts a single object and passes header through', () => {
    const l = { ...clone(), header: { a: 1 } }
    expect(parseLockData(JSON.stringify(l))).toEqual(l)
  })
  const bad = {
    'invalid JSON': '{nope',
    'empty array': '[]',
    'non-object': '42',
    null: 'null',
    'missing aesKey': JSON.stringify(without((l) => delete l.privateData.aesKey)),
    'missing address': JSON.stringify(without((l) => delete l.address)),
    'empty address': JSON.stringify(without((l) => { l.address = '' })),
    'missing unlockKey': JSON.stringify(without((l) => delete l.privateData.admin.unlockKey)),
    'negative unlockKey': JSON.stringify(without((l) => { l.privateData.admin.unlockKey = -1 })),
    'wrong aesKey length': JSON.stringify(without((l) => { l.privateData.aesKey = 'aabb' })),
    'non-hex aesKey': JSON.stringify(without((l) => { l.privateData.aesKey = 'zz'.repeat(16) })),
  }
  for (const [name, text] of Object.entries(bad)) {
    it(`rejects ${name}`, () => expect(() => parseLockData(text)).toThrow(BAD))
  }
})

describe('load/clear', () => {
  it('loads a stored valid lock', async () => {
    store.set(KEY, JSON.stringify(clone()))
    expect(await loadLockData()).toEqual(clone())
  })
  it('load returns null when empty or corrupt/invalid', async () => {
    expect(await loadLockData()).toBeNull()
    store.set(KEY, '{corrupt')
    expect(await loadLockData()).toBeNull()
    store.set(KEY, JSON.stringify({ address: 'x' }))
    expect(await loadLockData()).toBeNull()
  })
  it('clearLockData removes the stored lock', async () => {
    store.set(KEY, JSON.stringify(clone()))
    await clearLockData()
    expect(store.has(KEY)).toBe(false)
    expect(await loadLockData()).toBeNull()
  })
})
