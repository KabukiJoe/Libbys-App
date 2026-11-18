// Pure reducer for the Kindroid gate. `now` is always passed in with the action; the
// client deadline is now + grant.expiresInMs. Server timestamps are never used.
export const DENIED_TEXT = "Libby didn't approve opening the box."
export const EXPIRED_TEXT = 'The window has closed. Ask Libby again.'

export const initialGate = { phase: 'idle', reply: '', error: '', deadline: 0 }

export function gateReducer(state, action) {
  switch (action.type) {
    case 'ask':
      return { ...state, phase: 'asking', reply: '', error: '' }
    case 'answered': {
      const { approved, reply, grant } = action.payload
      if (approved) {
        return { ...state, phase: 'approved', reply, error: '', deadline: action.now + grant.expiresInMs }
      }
      return { ...state, phase: 'denied', reply, error: '', deadline: 0 }
    }
    case 'status': {
      const { grant } = action.payload
      if (grant.active) {
        return { ...state, phase: 'approved', error: '', deadline: action.now + grant.expiresInMs }
      }
      if (state.phase === 'approved') return { ...state, phase: 'expired', deadline: 0 }
      return state
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

export function formatRemaining(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
