# Keybox: open/close buttons over local Bluetooth (step 1)

Date: 2026-11-18
Status: approved 2026-11-18

## Goal

Two buttons in Libby's App, "Open" and "Close", that control the PAIRIER/TTLock keybox directly over
Bluetooth LE. No TTLock cloud, no TTLock account, no internet needed. The user is always physically
next to the box.

This is step 1 of the keybox feature. It exists to prove the hard part (talking to the box from the
phone) before anything else depends on it.

## Later steps (not in this spec)

- Step 2: Kindroid gate. Open only after Libby says yes in the 1:1 chat. Only when the user asks, no
  schedules, no Libby-initiated actions. Closing stays a plain button. Step 2 also moves the lock
  credentials behind the gate (server side).
- Open design question for step 2: the Kindroid client today only talks to the group chat; the 1:1
  chat needs new API calls.
- Step 3 (optional, only if the app's 20-cycle test shows Bluetooth failures often enough to matter):
  fallback keypad PIN. A PIN is set on the box and kept in the app (or server); it is shown only after
  Libby says yes, and rotated afterwards. Caveats found in discussion (2026-11-18):
  - Storing it "only in the app" is a speed bump, not protection: the user owns the phone, the source,
    and a debug APK; Android cloud backup may also copy app data unless disabled in the manifest.
  - Rotation needs Bluetooth, the very thing that may fail. Until a rotation succeeds, a PIN the user has
    seen stays valid, and the user could deliberately block rotation (Bluetooth off).
  - It needs admin login and PIN-setting commands ported into the app. The box sends replies with a
    wrong checksum at `check random`, which that login uses.
  - One-time or time-limited TTLock passcodes might be cleaner but are unverified on this box and also
    need Bluetooth to create.
  Nothing in steps 1-2 blocks this: the admin can set a new PIN at any time with the lock keys.

## Non-goals

- Kindroid integration, server-side credentials, scheduling.
- Pairing inside the app (pairing is a one-time PC task).
- Multiple locks, iOS, Play Store.

## Anti-goals

- The official TTLock app or cloud must never own the lock. A box the user can re-pair with the
  official app defeats the whole point (no easy self-unlock; emergency exit is destroying the box).
- The direct Open button is temporary scaffolding. It must not be treated as the final design.

## Constraints

- Physical lock: reliability over elegance. Retries on flaky BLE, clear error states, and testing
  only with the box open and empty on the desk until it works every time.
- Android only, Capacitor app (`app.libbys`), sideloaded APK.
- The TTLock protocol is reverse engineered (`kind3r/ttlock-sdk-js`, plus Python/Rust ports). All
  existing code targets Node + `noble`, so the app needs a port onto a native BLE plugin.

## Approaches considered

- **A: everything in the app**, including pairing. Rejected for step 1: pairing is the fiddliest part
  (reset, short discovery window) and is hard to debug on a phone.
- **B: pair once on the PC with the existing Node tool, control from the app.** Chosen. The risky
  one-time step runs on proven code; the app only needs lock and unlock.
- **C: official TTLock SDK in a native plugin.** Rejected: needs a TTLock cloud account, which
  contradicts the anti-goal above.

## Design

### Phase 0: box test and local pairing (PC, throwaway tooling)

1. Open the box (empty). Find the reset button and note whether it is reachable only with the box open.
2. Reset the box and pair it locally with `ttlock-sdk-js`. Save the resulting lock data.
3. Lock and unlock from the PC to confirm the protocol works with this exact model.
4. Try adding the box in the official TTLock app with a throwaway account. It must refuse. Then delete
   the app and the account.
5. Neutralise the keypad: the user must not know any working PIN.

Risk: `noble` on Windows often needs a dedicated USB dongle with a replaced driver. The PC has an
Intel built-in adapter. If the SDK cannot use it, fall back to approach A (pairing from the phone) or
a dongle. Decide after trying.

Phase 0 exit: box paired locally, lock data saved, lock/unlock from PC works, official app refuses.

### Phase 1: app (`frontend/`)

- New feature `src/features/keybox/` with a `KeyboxScreen` (status, Open, Close) reachable from Home.
- Add `@capacitor-community/bluetooth-le` as the BLE transport.
- Protocol module: the lock/unlock commands, framing and crypto ported from `ttlock-sdk-js`, written
  against a small transport interface (scan/connect/write/notify) so the logic can be tested without
  a phone. Node `Buffer` use is replaced with `Uint8Array`.
- Lock data import: the user pastes or picks the lock data JSON from Phase 0 once. Stored in the app's
  private storage (Capacitor Preferences). Temporary; moves server side in step 2.
- Android permissions: `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` (Android 12+), location below that.
- Reliability: bounded retries around scan/connect/command, a timeout, and a visible state
  (searching, connecting, done, failed with reason). A failed command must never leave the UI
  claiming the box is open or closed.
- Tests: protocol module unit-tested with recorded/PC-generated frames against the fake transport.
  Real box test is manual.

Phase 1 exit: with the PC off, the APK opens and closes the box from the buttons, repeatedly, in
a manual run of at least 20 cycles with no unexplained failure.

## Left to the builder

- Exact screen layout (follow existing screens), file naming, retry counts and timeouts.
- How the lock data JSON is shaped on import, as long as Phase 0 output loads unchanged.

## Risks

- This box model may not be supported by the community protocol code (lock type/version).
- Windows BLE for the Node tool (above).
- Reset button may be reachable with the box closed, which would weaken the anti-self-unlock goal.
  Phase 0 answers this; the design for step 2 depends on it.
