// Pure reducer for the Kindroid gate. `now` is always passed in with the action; the
// client deadline is now + grant.expiresInMs. Server timestamps are never used.
export const DENIED_TEXT = "Libby didn't approve opening the box."
export const EXPIRED_TEXT = 'The window has closed. Ask Libby again.'

export const initialGate = { phase: 'idle', reply: '', error: '', deadline: 0, cooldownDeadline: 0 }

function cooldownFrom(cooldown, now, current) {
  return cooldown && cooldown.active ? now + cooldown.retryInMs : current
}

export function gateReducer(state, action) {
  switch (action.type) {
    case 'ask':
      return { ...state, phase: 'asking', reply: '', error: '' }
    case 'answered': {
      const { approved, reply, grant } = action.payload
      if (approved) {
        return { ...state, phase: 'approved', reply, error: '', deadline: action.now + grant.expiresInMs, cooldownDeadline: 0 }
      }
      return { ...state, phase: 'denied', reply, error: '', deadline: 0, cooldownDeadline: cooldownFrom(action.payload.cooldown, action.now, state.cooldownDeadline) }
    }
    case 'status': {
      const { grant, cooldown } = action.payload
      if (grant.active) {
        return { ...state, phase: 'approved', error: '', deadline: action.now + grant.expiresInMs, cooldownDeadline: 0 }
      }
      const cooldownDeadline = cooldownFrom(cooldown, action.now, state.cooldownDeadline)
      if (state.phase === 'approved') return { ...state, phase: 'expired', deadline: 0, cooldownDeadline }
      if (cooldownDeadline !== state.cooldownDeadline) return { ...state, cooldownDeadline }
      return state
    }
    case 'cooldown':
      // A 429: the server says to wait; back out of 'asking' without showing an error.
      return {
        ...state,
        phase: state.phase === 'asking' ? 'idle' : state.phase,
        cooldownDeadline: action.now + action.retryInMs,
      }
    case 'tick':
      if (state.phase === 'approved' && action.now >= state.deadline) {
        return { ...state, phase: 'expired', deadline: 0 }
      }
      return state
    case 'failed':
      return { ...state, phase: 'error', error: action.payload }
    case 'ended':
      return initialGate
    default:
      return state
  }
}

export function remainingMs(state, now) {
  return Math.max(0, state.deadline - now)
}

export function cooldownRemainingMs(state, now) {
  return Math.max(0, state.cooldownDeadline - now)
}

export function formatRemaining(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
