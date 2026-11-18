import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./protocol/session.js', () => ({
  unlockBox: vi.fn(),
  lockBox: vi.fn(),
}))

import { unlockBox, lockBox } from './protocol/session.js'
import { KeyboxProtocolError } from './protocol/codec.js'
import { runCommand, KeyboxError, messageFor } from './runCommand.js'

const LOCK = { address: 'AA:BB:CC:DD:EE:FF', privateData: { aesKey: '00', admin: { unlockKey: 1 } } }

function makeConnect(plan) {
  // plan: array of 'ok' | Error, one per attempt
  const closes = []
  const connect = vi.fn(async (lock, hooks) => {
    const step = plan.shift() ?? 'ok'
    if (step instanceof Error) throw step
    hooks?.onConnecting?.()
    const close = vi.fn(async () => {})
    closes.push(close)
    return { transport: { write: async () => {}, onNotify: () => () => {} }, close }
  })
  return { connect, closes }
}

beforeEach(() => {
  vi.clearAllMocks()
  unlockBox.mockResolvedValue({})
  lockBox.mockResolvedValue({})
})
afterEach(() => vi.useRealTimers())

const reasonOf = async (p) => {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(KeyboxError)
    return e.reason
  }
  throw new Error('did not throw')
}

describe('runCommand', () => {
  it('happy path emits states in order and ends done, using unlockBox for open', async () => {
    const { connect, closes } = makeConnect(['ok'])
    const states = []
    await runCommand('open', LOCK, { onState: (s) => states.push(s), connect })
    expect(states).toEqual(['searching', 'connecting', 'sending', 'done'])
    expect(unlockBox).toHaveBeenCalledTimes(1)
    expect(unlockBox.mock.calls[0][1]).toBe(LOCK)
    expect(lockBox).not.toHaveBeenCalled()
    expect(closes[0]).toHaveBeenCalledTimes(1)
  })

  it('close uses lockBox', async () => {
    const { connect } = makeConnect(['ok'])
    await runCommand('close', LOCK, { connect })
    expect(lockBox).toHaveBeenCalledTimes(1)
    expect(unlockBox).not.toHaveBeenCalled()
  })

  it('two connect failures then success resolves', async () => {
    const { connect, closes } = makeConnect([new Error('x'), new Error('y'), 'ok'])
    const states = []
    await runCommand('open', LOCK, { onState: (s) => states.push(s), connect })
    expect(connect).toHaveBeenCalledTimes(3)
    expect(states.at(-1)).toBe('done')
    expect(states.filter((s) => s === 'done')).toHaveLength(1)
    expect(closes).toHaveLength(1)
    expect(closes[0]).toHaveBeenCalledTimes(1)
  })

  it('three failures throw failed and never emit done', async () => {
    const { connect } = makeConnect([new Error('a'), new Error('b'), new Error('c'), 'ok'])
    const states = []
    const reason = await reasonOf(runCommand('open', LOCK, { onState: (s) => states.push(s), connect }))
    expect(reason).toBe('failed')
    expect(connect).toHaveBeenCalledTimes(3)
    expect(states).not.toContain('done')
  })

  it('send failures (timeout/crc/write) are retried, close called between attempts', async () => {
    const { connect, closes } = makeConnect(['ok', 'ok', 'ok'])
    unlockBox
      .mockRejectedValueOnce(new KeyboxProtocolError('timeout'))
      .mockRejectedValueOnce(new KeyboxProtocolError('crc'))
      .mockResolvedValueOnce({})
    await runCommand('open', LOCK, { connect })
    expect(unlockBox).toHaveBeenCalledTimes(3)
    expect(closes).toHaveLength(3)
    closes.forEach((c) => expect(c).toHaveBeenCalledTimes(1))
  })

  it('three send failures throw failed and close every transport', async () => {
    const { connect, closes } = makeConnect(['ok', 'ok', 'ok'])
    unlockBox.mockRejectedValue(new KeyboxProtocolError('timeout'))
    expect(await reasonOf(runCommand('open', LOCK, { connect }))).toBe('failed')
    expect(closes).toHaveLength(3)
    closes.forEach((c) => expect(c).toHaveBeenCalledTimes(1))
  })

  it.each([
    ['not-found', 'not-found'],
    ['bluetooth-off', 'bluetooth-off'],
    ['permission', 'permission'],
  ])('connect KeyboxError %s is not retried', async (reason) => {
    const { connect } = makeConnect([new KeyboxError(reason), 'ok'])
    expect(await reasonOf(runCommand('open', LOCK, { connect }))).toBe(reason)
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('lock-error is surfaced and not retried, transport closed', async () => {
    const { connect, closes } = makeConnect(['ok', 'ok'])
    unlockBox.mockRejectedValue(new KeyboxProtocolError('lock-error'))
    expect(await reasonOf(runCommand('open', LOCK, { connect }))).toBe('lock-error')
    expect(unlockBox).toHaveBeenCalledTimes(1)
    expect(closes[0]).toHaveBeenCalledTimes(1)
  })

  it('a failing close() does not mask the real error or success', async () => {
    const failingClose = vi.fn(async () => {
      throw new Error('close boom')
    })
    const connect = vi.fn(async () => ({ transport: {}, close: failingClose }))
    unlockBox.mockRejectedValue(new KeyboxProtocolError('lock-error'))
    expect(await reasonOf(runCommand('open', LOCK, { connect }))).toBe('lock-error')
    unlockBox.mockResolvedValue({})
    await expect(runCommand('open', LOCK, { connect })).resolves.toBeUndefined()
  })

  it('emits searching again on retry and retries do not skip done ordering', async () => {
    const { connect } = makeConnect([new Error('a'), 'ok'])
    const states = []
    await runCommand('open', LOCK, { onState: (s) => states.push(s), connect })
    expect(states.filter((s) => s === 'searching')).toHaveLength(2)
    expect(states.at(-1)).toBe('done')
  })

  it('onState exceptions do not break the command', async () => {
    const { connect } = makeConnect(['ok'])
    await expect(runCommand('open', LOCK, { onState: () => { throw new Error('ui') }, connect })).resolves.toBeUndefined()
  })

  it('unknown kind throws failed without connecting', async () => {
    const { connect } = makeConnect(['ok'])
    await expect(runCommand('bogus', LOCK, { connect })).rejects.toThrow()
    expect(connect).not.toHaveBeenCalled()
  })
})

describe('uncertain state after the actuating command', () => {
  const afterCmd = (code) => Object.assign(new KeyboxProtocolError(code), { afterCommand: true })

  it('crc on the actuating exchange ends uncertain after ONE attempt (no blind re-send)', async () => {
    const { connect, closes } = makeConnect(['ok', 'ok', 'ok'])
    unlockBox.mockRejectedValue(afterCmd('crc'))
    expect(await reasonOf(runCommand('open', LOCK, { connect }))).toBe('uncertain')
    expect(unlockBox).toHaveBeenCalledTimes(1)
    expect(connect).toHaveBeenCalledTimes(1)
    expect(closes[0]).toHaveBeenCalledTimes(1)
  })

  it('timeout after the actuating command is also uncertain (lockBox too)', async () => {
    const { connect } = makeConnect(['ok', 'ok'])
    lockBox.mockRejectedValue(afterCmd('timeout'))
    expect(await reasonOf(runCommand('close', LOCK, { connect }))).toBe('uncertain')
    expect(lockBox).toHaveBeenCalledTimes(1)
  })

  it('timeout on the first exchange (no afterCommand) is still retried and ends failed after 3', async () => {
    const { connect } = makeConnect(['ok', 'ok', 'ok'])
    unlockBox.mockRejectedValue(new KeyboxProtocolError('timeout'))
    expect(await reasonOf(runCommand('open', LOCK, { connect }))).toBe('failed')
    expect(unlockBox).toHaveBeenCalledTimes(3)
  })

  it('a failure before the command on attempt 1 and after it on attempt 2 ends uncertain', async () => {
    const { connect } = makeConnect(['ok', 'ok', 'ok'])
    unlockBox.mockRejectedValueOnce(new KeyboxProtocolError('timeout')).mockRejectedValueOnce(afterCmd('crc'))
    expect(await reasonOf(runCommand('open', LOCK, { connect }))).toBe('uncertain')
    expect(unlockBox).toHaveBeenCalledTimes(2)
  })

  it('lock-error stays lock-error (not uncertain)', async () => {
    const { connect } = makeConnect(['ok'])
    unlockBox.mockRejectedValue(new KeyboxProtocolError('lock-error'))
    expect(await reasonOf(runCommand('open', LOCK, { connect }))).toBe('lock-error')
  })

  it('has German copy', () => {
    expect(messageFor('uncertain')).toBe('Status unklar – die Box hat den Befehl evtl. ausgeführt. Bitte Box prüfen.')
  })
})

describe('error detail', () => {
  const run = async (p) => {
    try {
      await p
    } catch (e) {
      return e
    }
    throw new Error('did not throw')
  }

  it('lock-error carries the lock code and protocol code in detail', async () => {
    const { connect } = makeConnect(['ok'])
    unlockBox.mockRejectedValue(
      Object.assign(new KeyboxProtocolError('lock-error', 'Unlock failed (response code 7)'), { lockCode: 7 }),
    )
    const e = await run(runCommand('open', LOCK, { connect }))
    expect(e.detail).toContain('lock-error')
    expect(e.detail).toContain('Lock-Code 7')
  })

  it('failed carries the underlying plugin message', async () => {
    const { connect } = makeConnect([new Error('GATT error 133'), new Error('GATT error 133'), new Error('GATT error 133')])
    const e = await run(runCommand('open', LOCK, { connect }))
    expect(e.reason).toBe('failed')
    expect(e.detail).toContain('GATT error 133')
  })

  it('uses the cause message of a KeyboxError from the transport', async () => {
    const { connect } = makeConnect([
      new KeyboxError('failed', 'x', { cause: new Error('native boom') }),
      new Error('native boom'),
      new Error('native boom'),
    ])
    const e = await run(runCommand('open', LOCK, { connect }))
    expect(e.detail).toContain('native boom')
  })

  it('never contains lock keys', async () => {
    const lock = {
      address: 'AA:BB:CC:DD:EE:FF',
      privateData: { aesKey: '0123456789abcdef0123456789abcdef', admin: { unlockKey: 987654321, adminPs: 555 } },
    }
    const { connect } = makeConnect(['ok', 'ok', 'ok'])
    unlockBox.mockRejectedValue(new KeyboxProtocolError('timeout', 'No response from lock'))
    const e = await run(runCommand('open', lock, { connect }))
    expect(e.detail).toBeTruthy()
    expect(e.detail).not.toContain(lock.privateData.aesKey)
    expect(e.detail).not.toContain(String(lock.privateData.admin.unlockKey))
    expect(e.detail.toLowerCase()).not.toContain('aeskey')
  })
})

describe('messageFor', () => {
  it('returns German copy', () => {
    expect(messageFor('not-found')).toBe('Box nicht gefunden. Tastenfeld berühren und erneut versuchen.')
    for (const r of ['bluetooth-off', 'permission', 'lock-error', 'failed', 'whatever']) {
      expect(messageFor(r).length).toBeGreaterThan(5)
    }
  })
})
