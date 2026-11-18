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

Windows 10 1703+ uses noble's WinRT binding (built during install), so the PC's own adapter should work.
If it does not, stop and report back: the fallback (USB dongle, or pairing from the phone) is the owner's call.

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
**Never commit it.** The app imports it unchanged in Task 5.

## On-arrival checklist (run with the real box)

1. **Check the adapter.** `node pair.js --scan-only`, touching the keypad. Expected: the box appears in the list.
   If noble cannot use the Intel adapter (error, or "Bluetooth adapter not ready"), stop and report back.
2. **Box test, with the box open and empty.** Find the reset button (on the back of the outside part, under the
   metal cover; short press reboots with one beep, a 2-3 s hold resets to factory with two beeps). Note whether it can
   be reached with the lid closed, and write the answer here:

   - Reset button reachable with lid closed: _TODO (yes / no)_

3. **Reset and pair.** Factory-reset the box, then `node pair.js`. Expected: `lockData.json` is written.
   Pairing sometimes fails; just repeat (reset again if the box no longer shows as uninitialised).
4. **Cycle test.** Run `node unlock.js`, then `node lock.js`, five times each. Expected: the box opens and closes
   every time.
5. **Official-app check (manual).** Try to add the box in the TTLock app with a throwaway account. Expected: it
   refuses (the box is already initialised by us). Then delete the app and the account.
6. **Neutralise the keypad.** `node neutralise-keypad.js`. Expected: it reports passcodes cleared and "Passcodes after: 0".
7. **Fixtures.** `node make-fixtures.js`. Expected: `frames.json` exists, and `rg aesKey` over it shows only the
   synthetic key `00112233445566778899aabbccddeeff`.
8. **Commit** the tool, README and fixtures. **Do not commit `lockData.json`.**

## Fixtures (`frames.json`)

Array of `{ name, kind, description, lockData, input, bytesHex, wireHex, ... }` built by the SDK's own encoders from
synthetic lock data (fake AES key `00112233...eeff`, fake admin keys, fixed time). Covers a plain command, AES
commands (check-user-time, check-admin, check-random, unlock, lock), decoded responses (`expected: { command, dataHex, ... }`)
and non-success responses. `bytesHex` is the envelope; `wireHex` is what goes on the wire (envelope + `0d0a`).
