'use strict';
// Shared helpers for the keybox PC tool. Uses kind3r/ttlock-sdk-js (npm: ttlock-sdk-js), which talks to
// the box directly over local BLE (noble). No TTLock cloud, no account.
const fs = require('fs');
const path = require('path');
const { TTLockClient } = require('ttlock-sdk-js');
const { LockType, LockVersion } = require('ttlock-sdk-js/dist/constant/Lock');

const LOCK_DATA_PATH = path.join(__dirname, 'lockData.json');

function loadLockData() {
  if (!fs.existsSync(LOCK_DATA_PATH)) {
    console.error('lockData.json not found. Run "node pair.js" first (box must be factory-reset).');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(LOCK_DATA_PATH, 'utf8'));
}

/** Lock type the SDK derives from the advertised protocol fields (TTBluetoothDevice / LockVersion.getLockType). */
function lockTypeOf(device) {
  return LockVersion.getLockType(device);
}

/** Human readable lock type for logging, e.g. "LOCK_TYPE_V3 (protocol 5.3, scene 1, org 1/1)". */
function describeLockType(lock) {
  const d = lock.device;
  const name = LockType[lockTypeOf(d)] ?? `unknown(${d.lockType})`;
  return `${name} (protocol ${d.protocolType}.${d.protocolVersion}, scene ${d.scene}, org ${d.groupId}/${d.orgId})`;
}

/**
 * Header for the app's encodeCommand `header` option ({ protocolType, subVersion, scene, organization,
 * subOrganization }), or undefined when the lock is LOCK_TYPE_V3 (the app's default header).
 */
function headerFor(device) {
  const type = lockTypeOf(device);
  if (type === LockType.LOCK_TYPE_V3) return undefined;
  const v = LockVersion.getLockVersion(type);
  const src = v
    ? { protocolType: v.getProtocolType(), protocolVersion: v.getProtocolVersion(), scene: v.getScene(), groupId: v.getGroupId(), orgId: v.getOrgId() }
    : device; // unknown type: use the advertised fields as they are
  return {
    protocolType: src.protocolType,
    subVersion: src.protocolVersion,
    scene: src.scene,
    organization: src.groupId,
    subOrganization: src.orgId,
  };
}

/** `locks`: the TTLock objects seen in this run; a `header` is added to an entry only for a non-V3 lock. */
function saveLockData(client, locks = []) {
  const data = client.getLockData();
  if (!data || data.length === 0) return false;
  const out = data.map((entry) => {
    const lock = locks.find((l) => l.getAddress() === entry.address);
    const header = lock && headerFor(lock.device);
    return header ? { ...entry, header } : entry;
  });
  fs.writeFileSync(LOCK_DATA_PATH, JSON.stringify(out, null, 2));
  return true;
}

/**
 * Scan for the paired box, connect, run `action(lock)`, disconnect, exit.
 * Wake the box by touching its keypad right before / just after starting.
 */
async function withPairedLock(action, { timeoutMs = 60000 } = {}) {
  // This box sometimes sends a reply with a wrong checksum. By default the SDK then re-sends the command,
  // and the box rejects the repeat ("Failed unlock response") although the first one already worked.
  // Accept such replies instead (only for lock/unlock/keypad runs; pairing is unaffected). Override with
  // TTLOCK_IGNORE_CRC=0 to get the SDK default back.
  if (process.env.TTLOCK_IGNORE_CRC === undefined) process.env.TTLOCK_IGNORE_CRC = '1';
  const lockData = loadLockData();
  const client = new TTLockClient({ lockData });
  let handled = false;
  const timer = setTimeout(() => {
    console.error('Timed out: box not found. Touch the keypad to wake it and retry.');
    process.exit(2);
  }, timeoutMs);

  client.on('foundLock', async (lock) => {
    if (handled || !lock.isPaired()) return;
    handled = true;
    try {
      await client.stopScanLock();
      console.log('Found', lock.getAddress(), 'connecting...');
      if (!(await lock.connect())) throw new Error('connect failed');
      const ok = await action(lock);
      await lock.disconnect();
      clearTimeout(timer);
      console.log(ok ? 'OK' : 'FAILED');
      process.exit(ok ? 0 : 3);
    } catch (e) {
      console.error('Error:', e);
      process.exit(3);
    }
  });

  client.on('ready', async () => {
    console.log('Bluetooth ready. Touch the keypad to wake the box.');
    await client.startScanLock();
  });
  if (!(await client.prepareBTService())) {
    clearTimeout(timer);
    console.error('Bluetooth adapter not ready (noble cannot use it). Report back: fallback is a USB dongle or pairing from the phone.');
    process.exit(4);
  }
  return client;
}

module.exports = { TTLockClient, LOCK_DATA_PATH, loadLockData, saveLockData, withPairedLock, describeLockType, headerFor };
