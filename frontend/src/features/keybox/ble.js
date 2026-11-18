// Capacitor BLE transport for the TTLock keybox (Android: deviceId == MAC address).
// The plugin is imported lazily so this module (and runCommand.js) loads in Node/Vitest.
import { KeyboxError } from './errors.js'

export const SERVICE_UUID = '00001910-0000-1000-8000-00805f9b34fb'
export const WRITE_UUID = '0000fff2-0000-1000-8000-00805f9b34fb'
export const NOTIFY_UUID = '0000fff4-0000-1000-8000-00805f9b34fb'
export const SCAN_TIMEOUT_MS = 10_000

const sameMac = (a, b) => String(a).toUpperCase() === String(b).toUpperCase()

function toBytes(dataView) {
  return new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength).slice()
}

// The plugin rejects with call.reject("Permission denied.") when any runtime permission is refused
// (BluetoothLe.kt checkPermission). It has no dedicated "adapter off" error on initialize,
// so adapter state is checked explicitly via isEnabled().
function mapError(err) {
  if (err instanceof KeyboxError) return err
  const msg = String(err?.message ?? err)
  if (/permission/i.test(msg)) return new KeyboxError('permission', msg, { cause: err })
  if (/not enabled|disabled|bluetooth.*off|turned off/i.test(msg)) return new KeyboxError('bluetooth-off', msg, { cause: err })
  return new KeyboxError('failed', msg, { cause: err })
}

/**
 * @param {{ address: string }} lockData one lock object
 * @param {{ onConnecting?: () => void }} [hooks]
 * @returns {Promise<{ transport: { write(bytes: Uint8Array): Promise<void>, onNotify(cb): () => void }, close(): Promise<void> }>}
 */
export async function openBleTransport(lockData, { onConnecting } = {}) {
  const { BleClient } = await import('@capacitor-community/bluetooth-le')
  const address = lockData.address
  let deviceId = null
  let connected = false
  let notifying = false
  const listeners = new Set()

  const close = async () => {
    listeners.clear()
    if (!deviceId) return
    if (notifying) {
      notifying = false
      try {
        await BleClient.stopNotifications(deviceId, SERVICE_UUID, NOTIFY_UUID)
      } catch {}
    }
    if (connected) {
      connected = false
      try {
        await BleClient.disconnect(deviceId)
      } catch {}
    }
  }

  try {
    await BleClient.initialize({ androidNeverForLocation: true })
    if (!(await BleClient.isEnabled())) throw new KeyboxError('bluetooth-off')

    // Scan for the box's MAC; it only advertises while awake (keypad touched).
    let found = null
    try {
      await BleClient.requestLEScan({}, (r) => {
        if (!found && sameMac(r.device.deviceId, address)) found = r.device.deviceId
      })
      const deadline = Date.now() + SCAN_TIMEOUT_MS
      while (!found && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
    } finally {
      try {
        await BleClient.stopLEScan()
      } catch {}
    }
    if (!found) throw new KeyboxError('not-found')

    onConnecting?.()
    deviceId = found
    await BleClient.connect(deviceId, () => {
      connected = false
    })
    connected = true
    await BleClient.startNotifications(deviceId, SERVICE_UUID, NOTIFY_UUID, (value) => {
      const bytes = toBytes(value)
      for (const cb of [...listeners]) cb(bytes)
    })
    notifying = true

    const transport = {
      // Write WITHOUT response, like the SDK (TTBluetoothDevice.writeCharacteristic -> characteristic.write(chunk, true);
      // noble's 2nd argument is withoutResponse). session.js already chunks to <= 20 bytes.
      write: async (bytes) => {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        await BleClient.writeWithoutResponse(deviceId, SERVICE_UUID, WRITE_UUID, view)
      },
      onNotify: (cb) => {
        listeners.add(cb)
        return () => listeners.delete(cb)
      },
    }
    return { transport, close }
  } catch (err) {
    await close()
    throw mapError(err)
  }
}
