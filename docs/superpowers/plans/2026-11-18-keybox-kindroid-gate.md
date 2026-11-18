# Keybox Kindroid Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the cheapest model that fits each task (see "Model per task").

**Goal:** The keybox opens only after Libby (Kindroid, 1:1 chat) approves with a secret keyword; approval opens a short window in which an "Open box" button can be pressed (and retried) without asking Libby again.

**Architecture:** Two separate processes. (1) *Request*: the app calls `POST /api/keybox/request`; the server sends a fixed message to Libby's 1:1 chat, searches her reply for the keyword (kept only in a server env var) and, if found, stores a grant `{ expiresAt }` in `data.json`. (2) *Open*: while the grant is active the app shows "Open box"; pressing it fetches the lock credentials from the server (`POST /api/keybox/credentials`, refused without an active grant), runs the existing BLE unlock, keeps the credentials only in memory, and ends the grant on success. The lock credentials move off the phone to the server (spec, step 2), so the gate is enforced server-side, not just hidden in the UI.

**Tech Stack:** Node 22 + Express, `node --test` (backend); React 19 + Vite + Vitest 3, Capacitor Android (frontend); Kindroid API `/send-message`.

**Spec:** `docs/superpowers/specs/2026-11-18-keybox-buttons-design.md` ("Later steps → Step 2") plus the decisions in this plan's "Design decisions" section (agreed in chat 2026-11-18).

## Design decisions

- **Keyword:** env `KEYBOX_UNLOCK_KEYWORD`, must match `/^[A-Za-z0-9_-]{6,}$/`. Missing/invalid → all gate routes answer `503 { error: 'Keybox gate is not configured' }` (fail closed). Never sent to the client, never in our outgoing message to Libby.
- **Match rule:** case-insensitive, whole token (not part of a longer word: neighbours must not be `[A-Za-z0-9_-]`), anywhere in the reply. The keyword is removed from the reply text shown in the app (collapse leftover double spaces, trim).
- **Window:** env `KEYBOX_GRANT_SECONDS`, default `120`, clamped to `[60, 180]`; non-numeric → default.
- **Message to Libby (exact copy):** `[Keybox request] I'm asking you to open my keybox now.` — with a note: append `\n\nMy reason: <note>`. Note: optional string, trimmed, max 500 chars (longer → 400). A note containing the keyword (case-insensitive) → `400 { error: 'Note not allowed' }` (otherwise Libby could echo it and grant by accident).
- **Active grant + new request:** server returns the existing grant without contacting Libby.
- **Retry:** "Open box" can be pressed any number of times while the grant is active. Successful unlock → `POST /api/keybox/grant/end`. Expiry → button disappears.
- **Credentials:** only on the server (`data.keybox.lockData`). The phone keeps them in memory for a single unlock attempt. Existing phone copy is uploaded once and deleted (Task 6).
- **UI copy (English, like the rest of the app):** button `Ask Libby`, note placeholder `Reason (optional)`, waiting `Asking Libby…`, denied `Libby didn't approve opening the box.`, open button `Open box (m:ss)`, expired `The window has closed. Ask Libby again.`

## Global Constraints

- No new dependencies (backend or frontend).
- All `/api/keybox/*` routes stay behind `requirePassword`.
- Never log or return the keyword or lock key material (error messages are fixed strings).
- No route returns `lockData` without an active, unexpired grant.
- Time on the server is `Date.now()` injected as `now`; the client uses `expiresInMs` from the server (not `expiresAt`) to avoid clock skew between phone and Railway.
- Backend tests: `cd backend && npm test`. Frontend tests: `cd frontend && npm test`. Both must stay green after every task.

## Review Focus

1. **Libby refuses but mentions the keyword** ("I won't say BLUEBIRD") → would count as approval. Mitigation is the backstory instruction in Task 7; test pins that the word inside a longer token (`BLUEBIRDS`, `xBLUEBIRD`) does *not* match (Task 1).
2. **Server restarts during the window** → grant must survive (stored in `data.json`) — test in Task 3.
3. **Phone clock wrong** → countdown must still be right; client derives deadline from `expiresInMs` — test in Task 5.
4. **Kindroid slow/down (up to 120 s timeout)** → `502` with Kindroid's error message, no grant, UI shows the error and re-enables `Ask Libby` — tests in Tasks 3 and 5.
5. **App backgrounded/reopened during the window** → screen refetches `GET /api/keybox/status` on mount and on `visibilitychange`, so the button reappears with the correct remaining time — Task 6 manual check.

## File Structure

- Create `backend/keyboxGate.js` — pure gate logic (keyword check, window, message).
- Modify `backend/kindroid.js` — add `askKinDirect` (1:1 chat returning reply text).
- Modify `backend/keybox.js` — becomes `createKeyboxRouter(deps)` with the new routes.
- Modify `backend/app.js:6,46` — mount `createKeyboxRouter()`.
- Create `frontend/src/features/keybox/gateState.js` — pure reducer + countdown helpers for the request/window.
- Modify `frontend/src/api.js` — four new calls.
- Modify `frontend/src/features/keybox/KeyboxScreen.jsx` — request UI, window button, server-side credentials.
- Modify `frontend/src/features/keybox/lockDataStore.js` — reduce to one-time migration helpers.
- Modify `docs/superpowers/specs/2026-11-18-keybox-buttons-design.md` — mark step 2 done, link this plan.

## Model per task

Tasks 1, 2, 4, 5: `haiku` (pure functions, exact tests given). Tasks 3, 6: `sonnet` (routes + UI integration). Task 7: manual, done by the user with the main session. Reviews: `sonnet`; final whole-branch review: most capable model.

---

### Task 1: Gate logic (backend, pure)

**Files:**
- Create: `backend/keyboxGate.js`
- Test: `backend/test/keyboxGate.test.js`

**Interfaces:**
- Produces:
  - `getKeyword(env = process.env) -> string | null` (null if missing/invalid)
  - `findApproval(reply: string, keyword: string) -> { approved: boolean, text: string }`
  - `grantWindowMs(env = process.env) -> number`
  - `buildRequestMessage(note?: string) -> string`
  - `NOTE_MAX = 500`

- [ ] **Step 1: Write the failing tests**

```js
test('approves on whole-token keyword, case-insensitive, and strips it', () => {
  assert.deepStrictEqual(findApproval('Fine, go ahead. bluebird', 'BLUEBIRD'), { approved: true, text: 'Fine, go ahead.' });
  assert.deepStrictEqual(findApproval('Yes BLUEBIRD, have fun', 'BLUEBIRD'), { approved: true, text: 'Yes, have fun' });
});
test('no keyword, or keyword inside a longer token, is not approval', () => {
  assert.strictEqual(findApproval('Not today.', 'BLUEBIRD').approved, false);
  assert.strictEqual(findApproval('BLUEBIRDS fly', 'BLUEBIRD').approved, false);
  assert.strictEqual(findApproval('xBLUEBIRD', 'BLUEBIRD').approved, false);
  assert.strictEqual(findApproval('BLUEBIRD-2', 'BLUEBIRD').approved, false);
  assert.strictEqual(findApproval('Not today.', 'BLUEBIRD').text, 'Not today.');
});
test('getKeyword rejects missing, short or odd keywords', () => {
  assert.strictEqual(getKeyword({}), null);
  assert.strictEqual(getKeyword({ KEYBOX_UNLOCK_KEYWORD: 'abc' }), null);
  assert.strictEqual(getKeyword({ KEYBOX_UNLOCK_KEYWORD: 'two words' }), null);
  assert.strictEqual(getKeyword({ KEYBOX_UNLOCK_KEYWORD: 'Blue_bird-7' }), 'Blue_bird-7');
});
test('grantWindowMs defaults to 120 s and clamps to 60..180 s', () => {
  assert.strictEqual(grantWindowMs({}), 120_000);
  assert.strictEqual(grantWindowMs({ KEYBOX_GRANT_SECONDS: '10' }), 60_000);
  assert.strictEqual(grantWindowMs({ KEYBOX_GRANT_SECONDS: '999' }), 180_000);
  assert.strictEqual(grantWindowMs({ KEYBOX_GRANT_SECONDS: 'abc' }), 120_000);
});
test('buildRequestMessage uses the fixed text and appends a note', () => {
  assert.strictEqual(buildRequestMessage(), "[Keybox request] I'm asking you to open my keybox now.");
  assert.strictEqual(buildRequestMessage('  bored  '), "[Keybox request] I'm asking you to open my keybox now.\n\nMy reason: bored");
});
```

- [ ] **Step 2: Run** `cd backend && node --test test/keyboxGate.test.js` → FAIL (module not found).
- [ ] **Step 3: Implement** the four functions. Token boundary via regex with escaped keyword: `(?<![A-Za-z0-9_-])KEYWORD(?![A-Za-z0-9_-])`, flag `gi`. Text cleanup: remove matches, then `replace(/\s+([,.!?])/g, '$1')`, `replace(/\s{2,}/g, ' ')`, `trim()`.
- [ ] **Step 4: Run** the test → PASS; `npm test` → all green.
- [ ] **Step 5: Commit** `feat(keybox): gate keyword logic`.

### Task 2: Kindroid 1:1 reply

**Files:**
- Modify: `backend/kindroid.js:69-72,140`
- Test: `backend/test/kindroid.test.js`

**Interfaces:**
- Consumes: existing `request`, `getConfig`, `extractReply` in `kindroid.js`.
- Produces: `askKinDirect({ message: string }) -> Promise<string>` (reply text, may be `''`), exported.

- [ ] **Step 1: Write the failing test** (same fetch-stub pattern as the existing `sendKinMessage` test): stub returns `new Response('Sure. BLUEBIRD', { status: 200, headers: { 'content-type': 'text/plain' } })`; assert `await askKinDirect({ message: 'hi' }) === 'Sure. BLUEBIRD'` and the call went to `.../send-message` with body `{ ai_id: 'test-ai', message: 'hi' }`. Second test: stub returns status 500 → `assert.rejects(..., /HTTP 500/)`.
- [ ] **Step 2: Run** `node --test test/kindroid.test.js` → FAIL.
- [ ] **Step 3: Implement** `askKinDirect`: call `sendKinMessage`, return `extractReply(body)`.
- [ ] **Step 4: Run** → PASS; `npm test` green.
- [ ] **Step 5: Commit** `feat(kindroid): 1:1 message returning the reply`.

### Task 3: Gate routes

**Files:**
- Modify: `backend/keybox.js` (whole file becomes a factory), `backend/app.js:6,46`
- Test: `backend/test/keybox.test.js` (keep existing lock-data tests; replace "there is no way to read the lock back over the API" with the credential tests below)

**Interfaces:**
- Consumes: Task 1 functions, Task 2 `askKinDirect`, `store.load()`, `store.update(fn)`.
- Produces: `createKeyboxRouter({ askKin = askKinDirect, now = Date.now, env = process.env } = {}) -> express.Router`, exported as `module.exports = { createKeyboxRouter }`. Routes (all JSON):
  - `GET /keybox/status` → `{ hasLock: boolean, grant: { active: boolean, expiresInMs: number } }` (`expiresInMs` 0 when inactive).
  - `POST /keybox/request` body `{ note?: string }` → `{ approved: boolean, reply: string, grant: {active, expiresInMs} }`; active grant → `{ approved: true, reply: '', grant }` without calling `askKin`; Kindroid error → `502 { error: err.message }`; note > 500 chars or containing keyword → `400`.
  - `POST /keybox/credentials` → active grant and stored lock: `{ lockData }`; no active grant → `403 { error: 'Not approved' }`; no lock → `404 { error: 'No lock data' }`.
  - `POST /keybox/grant/end` → clears grant, `{ ok: true }`.
  - `POST /keybox/lock-data` unchanged, but must not wipe a stored grant (`data.keybox = { ...data.keybox, lockData }`).
  - Grant stored as `data.keybox.grant = { expiresAt: number }`. Without a valid keyword every route except `lock-data` → `503 { error: 'Keybox gate is not configured' }`.

- [ ] **Step 1: Write the failing tests.** Mount the router on a bare app in the test: `express().use(express.json()).use('/api', createKeyboxRouter({ askKin: fakeAsk, now: () => clock, env: { KEYBOX_UNLOCK_KEYWORD: 'BLUEBIRD', KEYBOX_GRANT_SECONDS: '120' } }))`. Tests:
  - `credentials are refused without a grant` → 403.
  - `a reply without the keyword grants nothing` (fakeAsk → `'No.'`) → `{ approved: false, reply: 'No.', grant: { active: false, expiresInMs: 0 } }`, then credentials 403.
  - `a reply with the keyword opens a 120 s window` → `approved: true`, `reply` has no `BLUEBIRD`, `expiresInMs === 120000`; credentials → 200 with the stored lock.
  - `the grant expires` → advance `clock` by 120_001 → status `active: false`, credentials 403.
  - `a second request during the window does not ask Libby` → fakeAsk call count stays 1.
  - `grant/end closes the window` → credentials 403 afterwards.
  - `the grant survives a restart` → create a second router instance on the same DATA_DIR → status still active.
  - `Kindroid failure is a 502 and grants nothing` (fakeAsk throws `new Error('Kindroid took too long to reply')`) → 502, body error equals that message.
  - `a note with the keyword or over 500 chars is rejected` → 400, fakeAsk not called.
  - `fails closed without a keyword` (env `{}`) → status/request/credentials 503.
  - `the message sent to Libby is the fixed text plus note` → fakeAsk received `buildRequestMessage('bored')`.
- [ ] **Step 2: Run** `node --test test/keybox.test.js` → FAIL.
- [ ] **Step 3: Implement** `createKeyboxRouter`; in `app.js` require `{ createKeyboxRouter }` and `app.use('/api', createKeyboxRouter())`. Update the header comment in `keybox.js`: lock is readable only during an approved window.
- [ ] **Step 4: Run** `npm test` → all green (incl. `app.test.js`).
- [ ] **Step 5: Commit** `feat(keybox): Libby-approved open window on the server`.

### Task 4: Frontend API calls

**Files:**
- Modify: `frontend/src/api.js` (after `backupKeyboxLockData`, line ~64)

**Interfaces:**
- Consumes: private `request(path, options)` in `api.js`.
- Produces: `getKeyboxStatus() -> Promise<{hasLock, grant}>`, `requestKeyboxOpen(note?: string) -> Promise<{approved, reply, grant}>`, `fetchKeyboxCredentials() -> Promise<{lockData}>`, `endKeyboxGrant() -> Promise<{ok}>`.

- [ ] **Step 1: Implement** the four wrappers (POST bodies as JSON; `requestKeyboxOpen` sends `{ note }` only when non-empty). No separate test — they are one-line wrappers covered by the Task 6 manual run; `npm test` must stay green.
- [ ] **Step 2: Commit** `feat(keybox): API calls for the gate`.

### Task 5: Gate state (frontend, pure)

**Files:**
- Create: `frontend/src/features/keybox/gateState.js`
- Test: `frontend/src/features/keybox/gateState.test.js`

**Interfaces:**
- Produces:
  - `initialGate = { phase: 'idle', reply: '', error: '', deadline: 0 }` — phases `'idle' | 'asking' | 'approved' | 'denied' | 'expired' | 'error'`.
  - `gateReducer(state, action)` with actions `{type:'ask'}`, `{type:'answered', payload:{approved, reply, grant}, now}`, `{type:'status', payload:{grant}, now}`, `{type:'failed', payload: message}`, `{type:'tick', now}`, `{type:'ended'}`.
  - `remainingMs(state, now) -> number` (≥ 0), `formatRemaining(ms) -> 'm:ss'` (rounds up to whole seconds).
  - `DENIED_TEXT = "Libby didn't approve opening the box."`, `EXPIRED_TEXT = 'The window has closed. Ask Libby again.'`

- [ ] **Step 1: Write the failing tests:**
  - `answered with approval sets a deadline from expiresInMs` → `now=1000`, `expiresInMs=120000` → `phase 'approved'`, `deadline 121000`.
  - `answered without approval is denied` → `phase 'denied'`, `reply` kept.
  - `tick past the deadline expires the window` → `phase 'expired'`; tick before → unchanged object.
  - `status with an active grant restores the window` / `status inactive while approved → 'expired'`, while idle → stays idle.
  - `failed keeps the error and returns to a state where asking is allowed` → `phase 'error'`, `error` set.
  - `ended returns to idle`.
  - `formatRemaining(119001) === '2:00'`, `formatRemaining(59000) === '0:59'`, `formatRemaining(0) === '0:00'`.
  - Clock skew: deadline only depends on the `now` passed with the action, never on `grant.expiresAt`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/keybox/gateState.test.js` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm test` green.
- [ ] **Step 5: Commit** `feat(keybox): request/window state`.

### Task 6: Keybox screen

**Files:**
- Modify: `frontend/src/features/keybox/KeyboxScreen.jsx`, `frontend/src/features/keybox/lockDataStore.js`, `frontend/src/features/keybox/lockDataStore.test.js`

**Interfaces:**
- Consumes: Task 4 API calls, Task 5 `gateReducer`/helpers, existing `runCommand('open', lockData, { onState })`, `keyboxReducer`, `parseLockData`.
- Produces (lockDataStore): keep `parseLockData`; replace `saveLockData` with nothing; keep `loadLockData()`; add `clearLockData() -> Promise<void>` (removes the Preferences key `keybox.lockData`).

- [ ] **Step 1: Write the failing test** in `lockDataStore.test.js`: `clearLockData removes the stored lock` (save via Preferences mock as existing tests do, call `clearLockData`, `loadLockData()` → `null`). Remove tests for `saveLockData`.
- [ ] **Step 2: Run** → FAIL; **implement** `clearLockData`, delete `saveLockData`; run → PASS.
- [ ] **Step 3: Rewrite the screen behaviour:**
  - On mount: `getKeyboxStatus()`; dispatch `status` with `now: Date.now()`. Migration: if `loadLockData()` returns a lock, `backupKeyboxLockData(lock)` then `clearLockData()` (only clear after the upload succeeded), then refetch status.
  - Import form shown when `!hasLock` (or "Replace lock data"): `parseLockData` → `backupKeyboxLockData` → refetch status. Nothing saved on the phone. Remove the separate "Back up to server" button/state.
  - Request block (shown unless phase `approved`): optional note `<textarea>` (placeholder `Reason (optional)`, `maxLength={500}`), button `Ask Libby` disabled while `asking`; `asking` shows `Asking Libby…`. Result: denied → `DENIED_TEXT` plus Libby's reply text; error → error box; expired → `EXPIRED_TEXT`.
  - Approved block: Libby's reply text (if any) and button `Open box (m:ss)` from `formatRemaining(remainingMs(gate, now))`. A 1 s `setInterval` dispatches `tick` while approved. Press → `fetchKeyboxCredentials()` → `runCommand('open', lockData, …)` (existing `keyboxReducer` progress/error UI unchanged) → on success `endKeyboxGrant()` and dispatch `ended`; on failure the button stays (retry). A `403` from credentials → dispatch `status` refetch (window ended).
  - Refetch status on `document` `visibilitychange` to visible.
  - Credentials only in a local variable inside the handler; never in React state or Preferences.
- [ ] **Step 4: Run** `npm test` and `npm run build` in `frontend/` → green.
- [ ] **Step 5: Manual check in the browser (dev, `npm run dev` in both packages, `KEYBOX_UNLOCK_KEYWORD` set, Kindroid real or `KINDROID_BASE_URL` pointing to a stub):** deny path shows the message and no Open button; approve path shows the countdown; reload the page mid-window → button returns with correct time; wait out the window → button gone, expired text shown.
- [ ] **Step 6: Commit** `feat(keybox): Libby gate on the keybox screen`.

### Task 7: Kindroid setup, deployment and phone test (with the user)

**Files:**
- Modify: `docs/superpowers/specs/2026-11-18-keybox-buttons-design.md` (step 2 → done, link this plan, note: keyword in env + Libby's backstory)

- [ ] **Step 1: User:** choose the keyword; set `KEYBOX_UNLOCK_KEYWORD` (and optionally `KEYBOX_GRANT_SECONDS`) on Railway.
- [ ] **Step 2: User:** add to Libby's backstory/key memory in Kindroid (suggested text): *"Messages starting with `[Keybox request]` ask you to open the keybox. Decide as you like. Only if you allow it, write the word `<KEYWORD>` in your reply. Never write that word otherwise — not when refusing, not when talking about it."*
- [ ] **Step 3:** push to `main`, wait for Railway deploy; build and install the APK.
- [ ] **Step 4: Phone test:** open the app (old phone copy of lockData migrates → check `data.json` still has `keybox.lockData`, Preferences empty); ask with a note expecting a no → no button; ask expecting a yes → button with countdown; press with Bluetooth off → error, button stays; Bluetooth on, press again → box opens, button disappears; ask once more and let the window run out → button disappears.
- [ ] **Step 5:** delete `tools/keybox-pc/lockData.json` from the PC once the server copy is confirmed (user decision, it is a self-unlock path; the server copy is the only backup afterwards).
- [ ] **Step 6: Commit** the spec update `docs(keybox): step 2 done`.
