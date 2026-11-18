import { Preferences } from '@capacitor/preferences'

const KEY = 'keybox.lockData'
const INVALID = 'Invalid lock data'

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// Fields mirror what protocol/session.js reads, plus the BLE address.
function validate(lock) {
  const ok =
    isObject(lock) &&
    typeof lock.address === 'string' && lock.address.length > 0 &&
    isObject(lock.privateData) &&
    typeof lock.privateData.aesKey === 'string' && /^[0-9a-fA-F]{32}$/.test(lock.privateData.aesKey) &&
    isObject(lock.privateData.admin) &&
    Number.isInteger(lock.privateData.admin.unlockKey) && lock.privateData.admin.unlockKey >= 0
  if (!ok) throw new Error(INVALID)
  return lock
}

/** Parses the PC tool's lockData.json (array -> first element, or a single object). */
export function parseLockData(text) {
  let data
  try { data = JSON.parse(text) } catch { throw new Error(INVALID) }
  return validate(Array.isArray(data) ? data[0] : data)
}

export async function loadLockData() {
  try {
    const { value } = await Preferences.get({ key: KEY })
    return value == null ? null : validate(JSON.parse(value))
  } catch {
    return null
  }
}

/** Removes the phone-held lock (after it was uploaded to the server). */
export async function clearLockData() {
  await Preferences.remove({ key: KEY })
}
