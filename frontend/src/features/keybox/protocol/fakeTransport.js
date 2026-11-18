// Test helper: a scripted in-memory transport implementing the session transport contract.
// `script` is a list, one entry per request (a request completes when the written chunks end with 0d0a).
// Each entry is null (no answer) or an array of notification chunks (Uint8Array) delivered after the request.
export function createFakeTransport(script = []) {
  const listeners = new Set()
  const writes = [] // every write() call, as received (chunks)
  const requests = [] // reassembled request frames, 0d0a included
  let pending = []
  let n = 0

  const emit = (chunk) => {
    for (const cb of [...listeners]) cb(chunk)
  }

  return {
    writes,
    requests,
    get listenerCount() {
      return listeners.size
    },
    emit,
    async write(bytes) {
      writes.push(Uint8Array.from(bytes))
      pending.push(...bytes)
      const len = pending.length
      if (len >= 2 && pending[len - 2] === 0x0d && pending[len - 1] === 0x0a) {
        requests.push(Uint8Array.from(pending))
        pending = []
        const reply = script[n++]
        if (reply) Promise.resolve().then(() => reply.forEach(emit))
      }
    },
    onNotify(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}
