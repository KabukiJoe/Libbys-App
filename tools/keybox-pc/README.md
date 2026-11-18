# keybox-pc

PC tool for the TTLock keybox. Pairs, locks and unlocks the box over **local Bluetooth only** using
[`ttlock-sdk-js`](https://github.com/kind3r/ttlock-sdk-js) (npm `ttlock-sdk-js@0.3.14`, same code as the GitHub repo).
No TTLock cloud, no account. Also generates the protocol test fixtures used by the React app port.

> The npm release is used instead of `github:kind3r/ttlock-sdk-js` because the GitHub install runs `tsc` in a
> `prepare` script and currently fails to compile on a fresh install (`src/device/TTDevice.ts(68,21)`).
> The npm tarball ships the same code prebuilt (`dist/`).

## Setup

```
cd tools/keybox-pc
npm install
```

On Windows the SDK's noble BLE layer should be able to use the PC's own adapter (unverified; it depends on the adapter
and driver). If it cannot, stop and report back: the fallback (USB dongle, or pairing from the phone) is the owner's call.

## Commands

| Command | What it does |
| --- | --- |
| `node pair.js --scan-only` | List nearby TTLock devices for 30 s. Changes nothing. |
| `node pair.js` | Pair the first box that is in pairing mode. Writes `lockData.json`. |
| `node unlock.js` | Unlock the paired box (it auto-locks again after about 5 s). |
| `node lock.js` | Lock the paired box. |
| `node neutralise-keypad.js` | Clear all keypad passcodes and replace the admin passcode with an unrecorded random one. |
| `node make-fixtures.js` | Regenerate `frontend/src/features/keybox/protocol/__fixtures__/frames.json` from synthetic data. No Bluetooth needed. |

Wake the box by touching its keypad **right before** running a command (it stays awake 10-15 s). For `pair.js`,
touch it about 5 s before the scan starts.

`lockData.json` holds the real AES key and admin keys. It is git-ignored (`tools/keybox-pc/lockData*.json`).
**Never commit it.** You paste its contents into the app's keybox screen ("Lock-Daten" import).

Exit codes of the tools: `1` lockData.json missing, `2` timeout / nothing found (box not awake, or no box in pairing
mode), `3` command or pairing failed, `4` Bluetooth adapter unusable by noble.

### Security notes

- `lockData.json` plus this PC tool is a **self-unlock path**: anyone holding the file can open the box from a PC
  in Bluetooth range. That stays so until the Libby gate (step 2 of the keybox plan) moves the credentials server side.
- Pairing prints the **admin PIN** to the console (the SDK logs `set adminPasscode:`) and stores it in `lockData.json`
  (`privateData.adminPasscode`), so it also ends up in the app after the import. Recommended once the app is
  verified: neutralise the keypad (checklist step 6) and delete the PC copy of `lockData.json`. Your call.
- If the first lock/unlock from the PC fails sporadically, it may be the SDK's UInt32 overflow
  (`UnlockCommand.build()` does `writeUInt32BE(psFromLock + unlockKey)`, dist `api/Commands/UnlockCommand.js` line 32) and
  not a protocol problem. The app wraps that sum to 32 bits instead.

### Lock type

`pair.js` (scan output and after pairing) prints the lock type, e.g. `LOCK_TYPE_V3 (protocol 5.3, scene 1, org 1/1)`.
The app assumes `LOCK_TYPE_V3`. **If the tool prints a lock type other than LOCK_TYPE_V3, report back before continuing.**
For such a lock `lockData.json` gets a `header` entry (`protocolType`, `subVersion`, `scene`, `organization`,
`subOrganization`) that the app uses instead of the V3 default; for V3 there is no `header` entry.

## On-arrival checklist (run with the real box)

1. **Check the adapter.** `node pair.js --scan-only`, touching the keypad. Expected: the box appears in the list.
   If noble cannot use the Intel adapter (error, or "Bluetooth adapter not ready"), stop and report back.
2. **Box test, with the box open and empty.** Find the reset button (reported to be on the back of the outside part,
   under the metal cover; the reset behaviour, a short press rebooting and a 2-3 s hold resetting to factory with beeps,
   is unverified, check the box's own manual). Note whether it can be reached with the lid closed, and write the answer here:

   - Reset button reachable with lid closed: _TODO (yes / no)_

3. **Reset and pair.** Factory-reset the box, then `node pair.js`. Expected: `lockData.json` is written.
   Pairing sometimes fails; just repeat (reset again if the box no longer shows as uninitialised).
4. **Cycle test.** Run `node unlock.js`, then `node lock.js`, five times each. Expected: the box opens and closes
   every time.
5. **Official-app check (manual).** Try to add the box in the TTLock app with a throwaway account. Expected: it
   refuses (the box is already initialised by us). Then delete the app and the account.
6. **Neutralise the keypad.** `node neutralise-keypad.js`. Expected: it reports passcodes cleared and "Passcodes after: 0".
7. **Developer-only:** `node make-fixtures.js` regenerates the test fixtures used by the app's tests (no Bluetooth, no
   real keys). You do not need it for using the box.

## Fixtures (`frames.json`)

Array of `{ name, kind, description, lockData, input, bytesHex, wireHex, ... }` built by the SDK's own encoders from
synthetic lock data (fake AES key `00112233...eeff`, fake admin keys, fixed time). Covers a plain command, AES
commands (check-user-time, check-admin, check-random, unlock, lock), decoded responses (`expected: { command, dataHex, ... }`)
and non-success responses. `bytesHex` is the envelope; `wireHex` is what goes on the wire (envelope + `0d0a`).
