import { describe, expect, it, vi } from 'vitest'
import frames from './protocol/__fixtures__/frames.json'
import { restoreFromServer } from './restoreFromServer.js'

// Synthetic lock from the committed fixtures; never a real key.
const lock = frames.find((x) => x.name === 'unlock').lockData

describe('restoreFromServer', () => {
  it('validates the server copy, stores it locally and returns it', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const fetchRemote = vi.fn().mockResolvedValue({ lockData: lock })
    await expect(restoreFromServer({ fetchRemote, save })).resolves.toEqual(lock)
    expect(save).toHaveBeenCalledWith(lock)
  })

  it('rejects an invalid server copy and stores nothing', async () => {
    const save = vi.fn()
    const fetchRemote = vi.fn().mockResolvedValue({ lockData: { address: 'x' } })
    await expect(restoreFromServer({ fetchRemote, save })).rejects.toThrow('Invalid lock data')
    expect(save).not.toHaveBeenCalled()
  })

  it('passes a server error through and stores nothing', async () => {
    const save = vi.fn()
    const fetchRemote = vi.fn().mockRejectedValue(new Error('No lock data backed up on the server'))
    await expect(restoreFromServer({ fetchRemote, save })).rejects.toThrow('No lock data backed up on the server')
    expect(save).not.toHaveBeenCalled()
  })

  it('does not report success when the local save fails', async () => {
    const fetchRemote = vi.fn().mockResolvedValue({ lockData: lock })
    const save = vi.fn().mockRejectedValue(new Error('disk full'))
    await expect(restoreFromServer({ fetchRemote, save })).rejects.toThrow('disk full')
  })
})
