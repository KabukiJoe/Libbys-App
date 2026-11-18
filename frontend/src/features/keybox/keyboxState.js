// Pure reducer for the keybox screen. lastAction lives in memory only: the real box state is unknown at app start.
export const initialState = { phase: 'loading' }

export function keyboxReducer(state, action) {
  switch (action.type) {
    case 'loaded':
      return { phase: action.payload ? 'idle' : 'no-data' }
    case 'start':
      if (state.phase === 'busy') return state
      return { phase: 'busy', pending: action.payload, step: undefined, lastAction: undefined }
    case 'step':
      return state.phase === 'busy' ? { ...state, step: action.payload } : state
    case 'succeeded':
      if (state.phase !== 'busy') return state
      return { phase: 'done', lastAction: state.pending }
    case 'failed':
      return { phase: 'failed', message: action.payload, lastAction: undefined }
    default:
      return state
  }
}
