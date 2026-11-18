'use strict';
// Pair (initialise) a factory-reset TTLock keybox locally and write lockData.json.
//   node pair.js --scan-only   list nearby TTLock devices for 30s, change nothing
//   node pair.js               pair the first uninitialised box found
// Wake the box by touching its keypad ~5s BEFORE the scan starts (it stays awake 10-15s).
const { TTLockClient, saveLockData } = require('./common');

const scanOnly = process.argv.includes('--scan-only');
const client = new TTLockClient({});
const seen = new Set();
let pairing = false;
let scanTimer = null;

client.on('foundLock', async (lock) => {
  const addr = lock.getAddress();
  if (!seen.has(addr)) {
    seen.add(addr);
    console.log(`Found ${lock.getName()} ${addr} rssi=${lock.getRssi()} battery=${lock.getBattery()} ` +
      `initialized=${lock.isInitialized()} paired=${lock.isPaired()}`);
  }
  if (scanOnly || pairing || lock.isInitialized()) return;
  pairing = true;
  clearTimeout(scanTimer); // never kill a pairing in progress
  try {
    await client.stopScanLock();
    console.log('Box is in pairing mode, connecting...');
    if (!(await lock.connect())) throw new Error('connect failed');
    const ok = await lock.initLock();
    if (!ok) throw new Error('initLock failed (retry; reset box again if needed)');
    if (!saveLockData(client)) throw new Error('paired but no lock data available');
    console.log('Paired. lockData.json written. Do NOT commit it.');
    await lock.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('Pairing failed:', e);
    process.exit(3);
  }
});

client.on('ready', async () => {
  console.log('Bluetooth adapter ready, scanning for 30s... touch the keypad now.');
  await client.startScanLock();
  scanTimer = setTimeout(() => {
    if (pairing) return;
    if (scanOnly) {
      console.log(seen.size ? 'Scan done.' : 'Nothing found. Is the box awake? Is the adapter usable by noble?');
      process.exit(seen.size ? 0 : 2);
    }
    console.error('Scan timed out: no box in pairing mode found, nothing paired. Reset the box, touch the keypad and retry.');
    process.exit(2);
  }, 30000);
});

client.prepareBTService().then((ok) => {
  if (!ok) {
    console.error('Bluetooth adapter not ready (noble cannot use it). Report back: fallback is a USB dongle or pairing from the phone.');
    process.exit(4);
  }
});
