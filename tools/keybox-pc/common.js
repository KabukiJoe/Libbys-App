'use strict';
// Shared helpers for the keybox PC tool. Uses kind3r/ttlock-sdk-js (npm: ttlock-sdk-js), which talks to
// the box directly over local BLE (noble). No TTLock cloud, no account.
const fs = require('fs');
const path = require('path');
const { TTLockClient } = require('ttlock-sdk-js');

const LOCK_DATA_PATH = path.join(__dirname, 'lockData.json');

function loadLockData() {
  if (!fs.existsSync(LOCK_DATA_PATH)) {
    console.error('lockData.json not found. Run "node pair.js" first (box must be factory-reset).');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(LOCK_DATA_PATH, 'utf8'));
}

function saveLockData(client) {
  const data = client.getLockData();
  if (!data || data.length === 0) return false;
  fs.writeFileSync(LOCK_DATA_PATH, JSON.stringify(data, null, 2));
  return true;
}

/**
 * Scan for the paired box, connect, run `action(lock)`, disconnect, exit.
 * Wake the box by touching its keypad right before / just after starting.
 */
async function withPairedLock(action, { timeoutMs = 60000 } = {}) {
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

module.exports = { TTLockClient, LOCK_DATA_PATH, loadLockData, saveLockData, withPairedLock };
