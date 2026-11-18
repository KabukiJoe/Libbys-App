import { describe, it, expect } from 'vitest'
import { keyboxReducer } from './keyboxState.js'

const init = { phase: 'loading' }
const lock = { address: 'AA' }

describe('keyboxReducer', () => {
  it('loaded(null) -> no-data, loaded(lock) -> idle', () => {
    expect(keyboxReducer(init, { type: 'loaded', payload: null }).phase).toBe('no-data')
    expect(keyboxReducer(init, { type: 'loaded', payload: lock }).phase).toBe('idle')
  })

  it('start moves to busy and remembers the action', () => {
    const s = keyboxReducer({ phase: 'idle' }, { type: 'start', payload: 'open' })
    expect(s.phase).toBe('busy')
    expect(s.pending).toBe('open')
  })

  it('start while busy is a no-op (same object)', () => {
    const busy = { phase: 'busy', pending: 'open' }
    expect(keyboxReducer(busy, { type: 'start', payload: 'close' })).toBe(busy)
  })

  it('step sets the step text', () => {
    const s = keyboxReducer({ phase: 'busy', pending: 'open' }, { type: 'step', payload: 'sending' })
    expect(s.step).toBe('sending')
  })

  it('succeeded sets lastAction to the started action', () => {
    for (const a of ['open', 'close']) {
      const busy = keyboxReducer({ phase: 'idle' }, { type: 'start', payload: a })
      const s = keyboxReducer(busy, { type: 'succeeded' })
      expect(s.phase).toBe('done')
      expect(s.lastAction).toBe(a)
    }
  })

  it('failed sets phase failed with message and no lastAction', () => {
    const busy = keyboxReducer({ phase: 'idle' }, { type: 'start', payload: 'open' })
    const s = keyboxReducer(busy, { type: 'failed', payload: 'Box not found' })
    expect(s.phase).toBe('failed')
    expect(s.message).toBe('Box not found')
    expect(s.lastAction).toBeUndefined()
  })

  it('failure after success clears lastAction', () => {
    let s = keyboxReducer({ phase: 'idle' }, { type: 'start', payload: 'open' })
    s = keyboxReducer(s, { type: 'succeeded' })
    expect(s.lastAction).toBe('open')
    s = keyboxReducer(s, { type: 'start', payload: 'close' })
    s = keyboxReducer(s, { type: 'failed', payload: 'x' })
    expect(s.lastAction).toBeUndefined()
  })
})

describe('keyboxReducer detail and replace', () => {
  it('failed carries the optional technical detail', () => {
    const busy = keyboxReducer({ phase: 'idle' }, { type: 'start', payload: 'open' })
    expect(keyboxReducer(busy, { type: 'failed', payload: 'msg', detail: 'timeout' }).detail).toBe('timeout')
    expect(keyboxReducer(busy, { type: 'failed', payload: 'msg' }).detail).toBeUndefined()
  })

  it('loaded with a new lock returns to a clean idle from idle/done/failed', () => {
    for (const phase of ['idle', 'done', 'failed']) {
      const s = keyboxReducer({ phase, message: 'x', detail: 'y', lastAction: 'open' }, { type: 'loaded', payload: lock })
      expect(s).toEqual({ phase: 'idle' })
    }
  })

  it('loaded while busy is ignored (a running command is never reset)', () => {
    const busy = { phase: 'busy', pending: 'open' }
    expect(keyboxReducer(busy, { type: 'loaded', payload: lock })).toBe(busy)
  })
})
