import { describe, it, expect } from 'vitest'
import { initialGate, gateReducer, remainingMs, cooldownRemainingMs, formatRemaining, DENIED_TEXT, EXPIRED_TEXT } from './gateState.js'

const activeGrant = { active: true, expiresInMs: 120000 }
const inactiveGrant = { active: false, expiresInMs: 0 }

describe('gateReducer answered', () => {
  it('answered with approval sets a deadline from expiresInMs', () => {
    const s = gateReducer(initialGate, { type: 'answered', payload: { approved: true, reply: 'yes', grant: activeGrant }, now: 1000 })
    expect(s.phase).toBe('approved')
    expect(s.deadline).toBe(121000)
    expect(s.reply).toBe('yes')
  })

  it('answered without approval is denied and keeps the reply', () => {
    const s = gateReducer(initialGate, { type: 'answered', payload: { approved: false, reply: 'no', grant: inactiveGrant }, now: 1000 })
    expect(s.phase).toBe('denied')
    expect(s.reply).toBe('no')
  })

  it('deadline depends only on now and expiresInMs, never on a server timestamp', () => {
    const grant = { active: true, expiresInMs: 5000, expiresAt: 99999999999999 }
    const s = gateReducer(initialGate, { type: 'answered', payload: { approved: true, reply: '', grant }, now: 1000 })
    expect(s.deadline).toBe(6000)
  })
})

describe('gateReducer tick', () => {
  const approved = { phase: 'approved', reply: '', error: '', deadline: 121000 }

  it('tick before the deadline returns the same object', () => {
    expect(gateReducer(approved, { type: 'tick', now: 120999 })).toBe(approved)
  })

  it('tick past the deadline expires the window', () => {
    const s = gateReducer(approved, { type: 'tick', now: 121000 })
    expect(s.phase).toBe('expired')
  })

  it('tick outside approved returns the same object', () => {
    const asking = { phase: 'asking', reply: '', error: '', deadline: 0 }
    expect(gateReducer(asking, { type: 'tick', now: 999999 })).toBe(asking)
  })
})

describe('gateReducer status', () => {
  it('status with an active grant restores the window', () => {
    const s = gateReducer({ phase: 'expired', reply: '', error: '', deadline: 0 }, { type: 'status', payload: { grant: activeGrant }, now: 2000 })
    expect(s.phase).toBe('approved')
    expect(s.deadline).toBe(122000)
  })

  it('status with an inactive grant while approved expires', () => {
    const s = gateReducer({ phase: 'approved', reply: '', error: '', deadline: 121000 }, { type: 'status', payload: { grant: inactiveGrant }, now: 2000 })
    expect(s.phase).toBe('expired')
  })

  it('status with an inactive grant while idle stays idle (same object)', () => {
    expect(gateReducer(initialGate, { type: 'status', payload: { grant: inactiveGrant }, now: 2000 })).toBe(initialGate)
  })
})

describe('gateReducer failed, ask, ended', () => {
  it('failed keeps the error message and sets phase error', () => {
    const s = gateReducer(initialGate, { type: 'failed', payload: 'Kindroid is unreachable' })
    expect(s.phase).toBe('error')
    expect(s.error).toBe('Kindroid is unreachable')
  })

  it('ask moves to asking and clears error and reply', () => {
    const errored = { phase: 'error', reply: 'old', error: 'boom', deadline: 0 }
    const s = gateReducer(errored, { type: 'ask' })
    expect(s.phase).toBe('asking')
    expect(s.error).toBe('')
    expect(s.reply).toBe('')
  })

  it('ended returns to initialGate', () => {
    const s = gateReducer({ phase: 'approved', reply: 'yes', error: '', deadline: 121000 }, { type: 'ended' })
    expect(s).toEqual(initialGate)
  })
})

describe('remainingMs and formatRemaining', () => {
  it('remainingMs is never negative', () => {
    const s = { phase: 'approved', reply: '', error: '', deadline: 1000 }
    expect(remainingMs(s, 400)).toBe(600)
    expect(remainingMs(s, 5000)).toBe(0)
  })

  it('formatRemaining rounds up to whole seconds as m:ss', () => {
    expect(formatRemaining(119001)).toBe('2:00')
    expect(formatRemaining(59000)).toBe('0:59')
    expect(formatRemaining(0)).toBe('0:00')
  })

  it('exports the user-facing texts', () => {
    expect(DENIED_TEXT).toBe("Libby didn't approve opening the box.")
    expect(EXPIRED_TEXT).toBe('The window has closed. Ask Libby again.')
  })
})

describe('cooldown', () => {
  const cd = { active: true, retryInMs: 300000 }
  const noCd = { active: false, retryInMs: 0 }

  it('starts at 0', () => {
    expect(initialGate.cooldownDeadline).toBe(0)
  })

  it('answered denial sets the cooldown deadline', () => {
    const s = gateReducer(initialGate, { type: 'answered', payload: { approved: false, reply: 'no', grant: inactiveGrant, cooldown: cd }, now: 1000 })
    expect(s.phase).toBe('denied')
    expect(s.cooldownDeadline).toBe(301000)
    expect(cooldownRemainingMs(s, 2000)).toBe(299000)
  })

  it('status with an active cooldown sets the deadline, keeping the phase', () => {
    const s = gateReducer(initialGate, { type: 'status', payload: { grant: inactiveGrant, cooldown: cd }, now: 5000 })
    expect(s.phase).toBe('idle')
    expect(s.cooldownDeadline).toBe(305000)
  })

  it('status without a cooldown field or inactive leaves the deadline alone', () => {
    const base = { ...initialGate, cooldownDeadline: 9000 }
    expect(gateReducer(base, { type: 'status', payload: { grant: inactiveGrant }, now: 1 })).toBe(base)
    expect(gateReducer(base, { type: 'status', payload: { grant: inactiveGrant, cooldown: noCd }, now: 1 })).toBe(base)
  })

  it('a cooldown action (429) sets the deadline and leaves the error phase out of it', () => {
    const asking = { ...initialGate, phase: 'asking' }
    const s = gateReducer(asking, { type: 'cooldown', retryInMs: 120000, now: 1000 })
    expect(s.cooldownDeadline).toBe(121000)
    expect(s.phase).toBe('idle')
  })

  it('remaining is never negative', () => {
    const s = { ...initialGate, cooldownDeadline: 1000 }
    expect(cooldownRemainingMs(s, 400)).toBe(600)
    expect(cooldownRemainingMs(s, 5000)).toBe(0)
  })

  it('approval clears the cooldown', () => {
    const s = gateReducer({ ...initialGate, cooldownDeadline: 9000 }, { type: 'answered', payload: { approved: true, reply: '', grant: activeGrant, cooldown: noCd }, now: 1000 })
    expect(s.cooldownDeadline).toBe(0)
  })

  it('a status with an active grant clears the cooldown', () => {
    const s = gateReducer({ ...initialGate, cooldownDeadline: 9000 }, { type: 'status', payload: { grant: activeGrant, cooldown: noCd }, now: 1000 })
    expect(s.cooldownDeadline).toBe(0)
  })

  it('ended clears the cooldown', () => {
    expect(gateReducer({ ...initialGate, cooldownDeadline: 9000 }, { type: 'ended' }).cooldownDeadline).toBe(0)
  })
})
