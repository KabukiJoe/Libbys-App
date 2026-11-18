# Keybox Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Open" and "Close" buttons in Libby's App that control the TTLock keybox over local Bluetooth LE, with no TTLock cloud.

**Architecture:** The box is paired once on the PC with `kind3r/ttlock-sdk-js` (Phase 0). The app ports only the lock/unlock part of that protocol into a pure-JS module behind a small transport interface. A Capacitor BLE transport plugs into it on the phone, and a fake transport plugs into it in tests. Lock data is imported once and stored on the phone.

**Tech Stack:** Node 22 (PC tool), React 19 + Vite 6 + Capacitor 8 (app), `@capacitor-community/bluetooth-le`, `@capacitor/preferences`, Vitest, WebCrypto (AES).

**Spec:** `docs/superpowers/specs/2026-11-18-keybox-buttons-design.md`

## Global Constraints

- No TTLock cloud, no TTLock account. The official TTLock app never pairs this box.
- Android only, Capacitor `appId` stays `app.libbys`. Sideloaded debug APK.
- Real lock data (`aesKey`, admin/unlock keys) never goes into Git. Test fixtures use synthetic lock data only.
- A failed or timed-out command never shows the box as opened or closed.
- The direct Open button is temporary (step 2 gates it behind Libby). Do not build anything that makes ungated opening more convenient than the spec asks for.
- Test with the box open and empty until Task 7 passes.

## Review Focus

1. **Box asleep / not advertising.** TTLock boxes advertise only after the keypad is touched. The scan times out with the message "Box nicht gefunden. Tastenfeld berühren und erneut versuchen." It does not show a generic error. Tested in Task 4.
2. **Lock answers with an error code** (wrong key, low battery refusal). This is reported as failed with the lock's reason, not as done. Tested in Task 3.
3. **Double tap or second button while a command runs.** Both buttons are disabled until the command settles, and only one BLE session is open at a time. Tested in Task 6.
4. **Bluetooth off or permission denied.** A specific message is shown, with no endless spinner. Tested in Task 4.
5. **Malformed or wrong lock-data import.** The import is rejected with a message and the previously stored data is kept. Tested in Task 5.

---

### Task 1: PC tool, box test and local pairing (Phase 0)

**Files:**
- Create: `tools/keybox-pc/package.json` (depends on `ttlock-sdk-js` from GitHub `kind3r/ttlock-sdk-js`)
- Create: `tools/keybox-pc/pair.js`, `tools/keybox-pc/lock.js`, `tools/keybox-pc/unlock.js`
- Create: `tools/keybox-pc/make-fixtures.js`
- Create: `tools/keybox-pc/README.md` (the on-arrival checklist below plus the commands)
- Create: `.gitignore` entry `tools/keybox-pc/lockData*.json`
- Output (not committed): `tools/keybox-pc/lockData.json`
- Output (committed): `frontend/src/features/keybox/protocol/__fixtures__/frames.json`

**Interfaces:**
- Produces: `lockData.json`. Its shape is exactly what the SDK's `getLockData()` returns; the app imports it unchanged (Task 5).
- Produces: `frames.json`, an array of `{ name, lockData, input, bytesHex }`. Each entry is a fully encoded command envelope, produced by the SDK's own encoder from **synthetic** lock data (fixed fake `aesKey`, fake keys). It covers at least: one plain command, one AES-encrypted command, one decoded response, a check-admin/check-user command, an unlock command, and a lock command.

- [ ] **Step 1: Set up the tool and check that the SDK can use the PC's Bluetooth.** Run `node pair.js --scan-only`. Expected: the box appears after you touch its keypad. If `noble` cannot use the Intel adapter, stop and report back. The fallback (USB dongle or pairing from the phone) is the user's decision.
- [ ] **Step 2: Box test, with the box open and empty.** Find the reset button and note whether it can be reached with the lid closed. Write the answer into `README.md`.
- [ ] **Step 3: Reset and pair.** Run `node pair.js`. Expected: `lockData.json` is written.
- [ ] **Step 4: Run `node unlock.js`, then `node lock.js`, five times each.** Expected: the box opens and closes every time.
- [ ] **Step 5: Official-app check (user, manually).** Try to add the box in the TTLock app with a throwaway account. Expected: it refuses. Then delete the app and the account.
- [ ] **Step 6: Neutralise the keypad.** Via the SDK, delete or replace all keypad passcodes with random ones that nobody records. Expected: the SDK passcode list is empty or holds only unknown codes.
- [ ] **Step 7: Run `node make-fixtures.js`.** Expected: `frames.json` exists, and `rg aesKey` shows only the synthetic key.
- [ ] **Step 8: Commit the tool, README and fixtures.** Do not commit `lockData.json`.

---

### Task 2: Frontend test setup and protocol codec

Port the SDK's frame codec (header, version fields, command byte, encryption flag, length, data, CRC, CRLF terminator) and its AES helper. AES-128-CBC is applied the way the SDK does it, ported 1:1 from the SDK's AES util, using WebCrypto.

**Files:**
- Modify: `frontend/package.json` (dev dep `vitest`, script `"test": "vitest run"`)
- Create: `frontend/src/features/keybox/protocol/codec.js`
- Create: `frontend/src/features/keybox/protocol/aes.js`
- Test: `frontend/src/features/keybox/protocol/codec.test.js`

**Interfaces:**
- Consumes: `frames.json` (Task 1).
- Produces:
  - `encodeCommand({ command: number, data: Uint8Array, aesKey?: Uint8Array, header?: object }) -> Promise<Uint8Array>`
  - `decodeResponse(bytes: Uint8Array, aesKey?: Uint8Array) -> Promise<{ command: number, data: Uint8Array }>`, which throws `KeyboxProtocolError` on a CRC mismatch or truncated frame
  - `class KeyboxProtocolError extends Error { code: string }`
  - `aesEncrypt(key, data)` and `aesDecrypt(key, data)`, both `-> Promise<Uint8Array>`

- [ ] **Step 1:** Write `codec.test.js`. For every encode fixture, `hex(await encodeCommand(fixture.input))` must equal `fixture.bytesHex`. For the response fixture, `decodeResponse` returns the expected `command`/`data`. Flipping one byte makes it throw `KeyboxProtocolError` with code `'crc'`, and passing half the frame throws with code `'truncated'`.
- [ ] **Step 2:** Run `npm test --prefix frontend`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement `aes.js` and `codec.js`, ported from the SDK sources. Use `Uint8Array` only, with no Node `Buffer`.
- [ ] **Step 4:** Run `npm test --prefix frontend`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(keybox): TTLock frame codec and AES`.

---

### Task 3: Lock/unlock sequence over a transport

Port the SDK's `unlock()` and `lock()` flows step for step. That includes the admin/user check that returns the lock's random number, combining that number with the unlock key as the SDK does, and the final command. Reassemble notify chunks into one frame up to the CRLF terminator. Split writes into chunks of at most 20 bytes.

**Files:**
- Create: `frontend/src/features/keybox/protocol/session.js`
- Create: `frontend/src/features/keybox/protocol/fakeTransport.js` (test helper)
- Test: `frontend/src/features/keybox/protocol/session.test.js`

**Interfaces:**
- Consumes: `encodeCommand`, `decodeResponse`, `KeyboxProtocolError` (Task 2).
- Transport contract, which every transport implements:
  `{ write(bytes: Uint8Array): Promise<void>, onNotify(cb: (bytes: Uint8Array) => void): () => void }`
- Produces:
  - `unlockBox(transport, lockData) -> Promise<{ battery?: number }>`
  - `lockBox(transport, lockData) -> Promise<{ battery?: number }>`
  - Both reject with `KeyboxProtocolError`: code `'lock-error'` (with `lockCode`) when the lock answers with a failure, and code `'timeout'` when there is no complete answer within 5000 ms per command.

- [ ] **Step 1:** Write `session.test.js` using `fakeTransport`, which is scripted with the fixture responses:
  - `unlockBox` writes the check command, then the unlock command, with bytes equal to the fixtures, and resolves.
  - A response arriving in 3 chunks is reassembled.
  - Writes are chunked to 20 bytes or fewer.
  - A failure response rejects with code `'lock-error'` and never resolves.
  - No response rejects with `'timeout'` (use fake timers).
  - `lockBox` behaves the same with its own fixtures.
- [ ] **Step 2:** Run `npm test --prefix frontend`. Expected: FAIL.
- [ ] **Step 3:** Implement `session.js` and `fakeTransport.js`.
- [ ] **Step 4:** Run `npm test --prefix frontend`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(keybox): lock/unlock session over transport`.

---

### Task 4: Capacitor BLE transport with retries

**Files:**
- Modify: `frontend/package.json` (add `@capacitor-community/bluetooth-le`), then run `npx cap sync android`
- Modify: `frontend/android/app/src/main/AndroidManifest.xml`. Add `BLUETOOTH_SCAN` (`usesPermissionFlags="neverForLocation"`) and `BLUETOOTH_CONNECT`; add `BLUETOOTH`, `BLUETOOTH_ADMIN` and `ACCESS_FINE_LOCATION` with `maxSdkVersion="30"`.
- Create: `frontend/src/features/keybox/ble.js`
- Create: `frontend/src/features/keybox/runCommand.js`
- Test: `frontend/src/features/keybox/runCommand.test.js`

**Interfaces:**
- Consumes: `unlockBox`, `lockBox` (Task 3).
- Produces:
  - `openBleTransport(lockData) -> Promise<{ transport, close(): Promise<void> }>`. It scans for the box's MAC address from `lockData` for up to 10 s, connects, and subscribes to notify. It uses the TTLock GATT layout: service `00001910-0000-1000-8000-00805f9b34fb`, write `0000fff2-…`, notify `0000fff4-…`. Check these values against the SDK and use the SDK's if they differ.
  - `runCommand(kind: 'open' | 'close', lockData, { onState, connect = openBleTransport }) -> Promise<void>`. `onState` receives `'searching' | 'connecting' | 'sending' | 'done'`. It retries connect/send up to 3 attempts in total, always calls `close()`, and throws `KeyboxError { reason }`, where `reason` is one of `'not-found' | 'bluetooth-off' | 'permission' | 'lock-error' | 'failed'`.
  - `messageFor(reason) -> string`, which returns German user copy. `'not-found'` → "Box nicht gefunden. Tastenfeld berühren und erneut versuchen."

- [ ] **Step 1:** Write `runCommand.test.js` with an injected `connect` stub. It must cover: the happy path emits states in order and ends `'done'`; two connect failures and then success resolves; three failures throw `'failed'`; a scan timeout throws `'not-found'`; a disabled adapter throws `'bluetooth-off'`; denied permission throws `'permission'`; `'lock-error'` is **not** retried; `close()` is called on every path.
- [ ] **Step 2:** Run `npm test --prefix frontend`. Expected: FAIL.
- [ ] **Step 3:** Implement `runCommand.js`, and `ble.js` on top of the plugin.
- [ ] **Step 4:** Run `npm test --prefix frontend`. Expected: PASS. Then run `npm run android:apk --prefix frontend`. Expected: BUILD SUCCESSFUL.
- [ ] **Step 5:** Commit: `feat(keybox): Capacitor BLE transport with retries`.

---

### Task 5: Lock data import and storage

**Files:**
- Modify: `frontend/package.json` (add `@capacitor/preferences`)
- Create: `frontend/src/features/keybox/lockDataStore.js`
- Test: `frontend/src/features/keybox/lockDataStore.test.js`

**Interfaces:**
- Produces:
  - `parseLockData(text: string) -> object`. It throws `Error('Ungültige Lock-Daten')` unless the input is JSON with a non-empty `address`, `aesKey` and every other field `unlockBox`/`lockBox` read.
  - `loadLockData() -> Promise<object | null>`
  - `saveLockData(obj) -> Promise<void>`, with Preferences key `keybox.lockData`

- [ ] **Step 1:** Write the tests with Preferences mocked:
  - A valid synthetic fixture round-trips.
  - Invalid JSON, a missing `aesKey` or a missing `address` throws `'Ungültige Lock-Daten'`.
  - A failed parse leaves the stored value unchanged.
- [ ] **Step 2:** Run `npm test --prefix frontend`. Expected: FAIL.
- [ ] **Step 3:** Implement `lockDataStore.js`.
- [ ] **Step 4:** Run `npm test --prefix frontend`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(keybox): lock data import and storage`.

---

### Task 6: Keybox screen and Home tile

**Files:**
- Create: `frontend/src/features/keybox/KeyboxScreen.jsx`
- Create: `frontend/src/features/keybox/keyboxState.js` (pure reducer)
- Test: `frontend/src/features/keybox/keyboxState.test.js`
- Modify: `frontend/src/screens/HomeScreen.jsx` (add `{ id: 'keybox', title: 'Keybox', emoji: '🔐', ready: true }` to `FEATURES`)
- Modify: `frontend/src/App.jsx` (route `screen === 'keybox'` → `<KeyboxScreen onHome={goHome} />`)

**Interfaces:**
- Consumes: `runCommand`, `messageFor` (Task 4); `loadLockData`, `saveLockData`, `parseLockData` (Task 5).
- Produces: `keyboxReducer(state, action)`. State is `{ phase: 'no-data' | 'idle' | 'busy' | 'done' | 'failed', step?, lastAction?, message? }`. Actions are `loaded`, `start`, `step`, `succeeded`, `failed`. `start` is ignored while `phase === 'busy'`.

- [ ] **Step 1:** Write the reducer tests:
  - `start` while busy is a no-op.
  - `failed` sets `phase: 'failed'` with the message and never sets `lastAction` to a success.
  - `succeeded` sets `lastAction` to `'open'` or `'close'`.
  - `loaded(null)` → `'no-data'`.
- [ ] **Step 2:** Run `npm test --prefix frontend`. Expected: FAIL.
- [ ] **Step 3:** Implement the reducer and the screen. Without lock data, the screen shows only an import textarea with a "Speichern" button. With lock data, it shows "Öffnen" and "Schließen" as `ActionButton`s, both disabled while busy, plus the current step text and the error message on failure. Follow the layout of `PermissionScreen` and use `Header`.
- [ ] **Step 4:** Run `npm test --prefix frontend` and `npm run build --prefix frontend`. Expected: PASS and a successful build.
- [ ] **Step 5:** Commit: `feat(keybox): keybox screen with open/close buttons`.

---

### Task 7: On-device acceptance

- [ ] **Step 1:** Run `npm run android:apk --prefix frontend` and `npm run android:install --prefix frontend`.
- [ ] **Step 2:** On the phone, import `lockData.json` once via the screen.
- [ ] **Step 3:** With the PC's Bluetooth off and the box open and empty, run 20 open/close cycles. Write down each failure and its message. Expected: 20/20, or only failures that the UI explained and a retry fixed.
- [ ] **Step 4:** Check the Review Focus cases by hand:
  - Box asleep → the not-found message.
  - Phone Bluetooth off → `'bluetooth-off'` message.
  - Double tap → the second tap is ignored.
- [ ] **Step 5:** Record the results in `tools/keybox-pc/README.md` and commit: `docs(keybox): on-device acceptance results`.
- [ ] **Step 6:** Tell the user that `tools/keybox-pc/lockData.json` and the PC tool are a self-unlock path until step 2 moves the credentials behind the Libby gate. Whether to delete them from the PC is the user's call.
