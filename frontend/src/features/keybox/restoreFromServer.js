import { fetchKeyboxLockData } from '../../api.js'
import { parseLockData, saveLockData } from './lockDataStore.js'

/**
 * Fetches the lock data backed up on the server, validates it exactly like a manual import, stores it on
 * the phone and returns it. Nothing is stored if the server copy is invalid or the request fails.
 */
export async function restoreFromServer({ fetchRemote = fetchKeyboxLockData, save = saveLockData } = {}) {
  const { lockData } = await fetchRemote()
  const lock = parseLockData(JSON.stringify(lockData))
  await save(lock)
  return lock
}
