# Native Android Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship libbys-app as a sideloaded native Android app (Capacitor) whose mantra notifications come through Firebase Cloud Messaging, with Railway kept as an API-only backend.

**Architecture:** The existing React/Vite frontend is wrapped by Capacitor and bundled into the APK; it calls the Railway API via an absolute base URL. The backend's push module swaps `web-push` for `firebase-admin` behind the unchanged `notifyAll()` call, stores FCM tokens instead of web-push subscriptions, allows CORS only for the app origin, and stops serving the frontend.

**Tech Stack:** Node 22 + Express 4 (`node --test`), `firebase-admin`, `cors`; React 19 + Vite 6 + Tailwind 4; Capacitor (`@capacitor/core`, `cli`, `android`, `push-notifications`, `@capacitor/assets`); Android Studio / Gradle / adb.

**Spec:** `docs/superpowers/specs/2026-11-13-native-android-migration-design.md`

## Global Constraints

- App ID `app.libbys`, app name `Libby's App` — must match the Firebase registration exactly.
- Native only: remove service worker, web manifest and web push; no PWA fallback.
- Railway stays; only `mantra/push.js`, `mantra/routes.js`, `store.js`, `server.js` (and a new `app.js`) change on the backend. `mantra/index.js` changes only the `notifyAll` argument.
- Notification content: title `Libby`, body `You have a new Mantra` — never the mantra text.
- FCM options: `android.priority: 'high'`, `android.ttl: 300000` (ms, = 5 min answer window), `android.notification.channelId: 'mantra'`, `data: { open: 'mantra' }`.
- Invalid-token codes to prune: `messaging/registration-token-not-registered`, `messaging/invalid-registration-token`.
- CORS allowed origin: exactly `https://localhost`; methods GET, POST; headers `Content-Type`, `Authorization`; preflight answered before the password check.
- New backend env var `FIREBASE_SERVICE_ACCOUNT` (service-account JSON as one string); `VAPID_*` removed.
- Frontend env var `VITE_API_URL` (Railway https URL in `frontend/.env.production`, empty in dev).
- `google-services.json` lives only in `frontend/android/app/` and is git-ignored; never commit it or the service-account key.
- All `@capacitor/*` packages on the same major version (current stable). Node 22.
- Work on a feature branch, not `main`.

## Review Focus

- **No tokens registered yet** → `notifyAll` must return quietly without calling FCM (`sendEachForMulticast` rejects an empty list). Test in Task 1.
- **Malformed `FIREBASE_SERVICE_ACCOUNT`** (bad JSON / wrong key) → server must still start with push disabled and a warning, not crash. Test in Task 1.
- **FCM call rejects entirely** (network down) → `notifyAll` logs and resolves, so `requestMantra` still stores the mantra. Test in Task 1.
- **`VITE_API_URL` set with a trailing slash** → requests must not become `//api/...`. Handled in Task 3, checked in its verify step.
- **Cold start by tapping the notification** (app was fully closed) → must land on the Mantra screen; the tap listener has to be registered before the first render settles. Manual check in Task 6.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/mantra/push.js` (rewrite) | FCM token storage + sending; `createPush` factory for tests, default instance from env |
| `backend/store.js` (modify) | `pushTokens` default; drop legacy `pushSubscriptions` |
| `backend/mantra/routes.js` (modify) | `POST /push/subscribe {token}`; remove public-key route |
| `backend/mantra/index.js` (modify) | `notifyAll({ title, body })` without `url` |
| `backend/app.js` (create) | `createApp()` — Express app with CORS, password, routes; no static serving |
| `backend/server.js` (modify) | listen + start scheduler only |
| `backend/test/push.test.js`, `backend/test/store.test.js`, `backend/test/app.test.js` (create) | backend tests |
| `frontend/src/api.js` (modify) | absolute base URL |
| `frontend/capacitor.config.json`, `frontend/android/**` (create) | native project |
| `frontend/src/features/mantra/push.js` (rewrite) | Capacitor push: permission, register, token sync, channel |
| `frontend/src/features/mantra/MantraBanner.jsx` (create) | in-app "New mantra" banner |
| `frontend/src/App.jsx`, `MantraScreen.jsx`, `main.jsx`, `index.html` (modify) | navigation on tap/receive, async permission, remove SW/manifest |
| `README.md`, `backend/.env.example`, root `package.json`, `.gitignore` (modify) | docs, config, build |

---

### Task 1: Backend push module on Firebase

**Files:**
- Rewrite: `backend/mantra/push.js`
- Modify: `backend/store.js` (EMPTY + load), `backend/mantra/routes.js`, `backend/mantra/index.js` (the `notifyAll` call), `backend/package.json`, `backend/.env.example`
- Test: `backend/test/push.test.js`, `backend/test/store.test.js`

**Interfaces:**
- Produces: `createPush({ messaging, store }) -> { enabled: boolean, addToken(token: string): void, notifyAll({ title, body }): Promise<void> }` where `messaging` is a firebase-admin `Messaging` (or `null` = disabled) and `store` is `{ load, update }`.
- Produces: `initMessagingFromEnv(env = process.env) -> Messaging | null` (null + `console.warn` if unset or unparsable).
- Produces: module exports `{ createPush, initMessagingFromEnv, enabled, addToken, notifyAll }` (last three from the default instance). `routes.js` uses `push.enabled`/`push.addToken`; `mantra/index.js` uses `push.notifyAll`.
- Produces: `POST /api/push/subscribe` body `{ token: string }` → `{ ok: true }`; 400 `{ error: 'token is required' }` if not a non-empty string. `GET /api/push/public-key` removed.

- [ ] **Step 1: Write failing tests** in `backend/test/push.test.js`, using an in-memory fake store (`{ load: () => data, update: (fn) => fn(data) }` with `data = { pushTokens: [] }`) and a fake messaging whose `sendEachForMulticast(msg)` records `msg` and returns a configurable `{ responses: [...] }`:
  - `addToken stores each token once` — add `'a'`, `'a'`, `'b'` → `data.pushTokens` deep-equals `['a', 'b']`.
  - `notifyAll sends to all tokens with mantra options` — tokens `['a','b']`, `notifyAll({ title: 'Libby', body: 'You have a new Mantra' })` → recorded msg has `tokens: ['a','b']`, `notification: { title: 'Libby', body: 'You have a new Mantra' }`, `data: { open: 'mantra' }`, `android.priority === 'high'`, `android.ttl === 300000`, `android.notification.channelId === 'mantra'`.
  - `notifyAll removes invalid tokens` — tokens `['a','b','c']`, responses `[{success:true}, {success:false, error:{code:'messaging/registration-token-not-registered'}}, {success:false, error:{code:'messaging/internal-error'}}]` → `data.pushTokens` equals `['a','c']`.
  - `notifyAll with no tokens does not call FCM` — send never called, resolves.
  - `notifyAll survives FCM rejecting` — `sendEachForMulticast` throws → `notifyAll` resolves, tokens unchanged.
  - `disabled push does nothing` — `createPush({ messaging: null, store })` → `enabled === false`, `notifyAll` resolves, no throw.
  - `initMessagingFromEnv returns null for missing or malformed config` — `{}` → `null`; `{ FIREBASE_SERVICE_ACCOUNT: 'not json' }` → `null`.
- [ ] **Step 2: Write failing test** in `backend/test/store.test.js`: `store drops legacy pushSubscriptions` — set `process.env.DATA_DIR` to a fresh `fs.mkdtempSync` dir, write `data.json` with `{ pushSubscriptions: [{endpoint:'x'}], stats:{success:1,failed:0} }`, `require('../store')` (clear it from `require.cache` first), call `update(() => {})`, re-read the file → no `pushSubscriptions` key, `pushTokens` deep-equals `[]`, `stats.success === 1`.
- [ ] **Step 3: Run** `cd backend && npm test` — Expected: new tests FAIL (`createPush` not a function / `pushSubscriptions` still present); existing mantra tests PASS.
- [ ] **Step 4: Install deps** — `cd backend && npm install firebase-admin && npm uninstall web-push`.
- [ ] **Step 5: Implement** `push.js` per the Interfaces block. `initMessagingFromEnv`: `JSON.parse` the env var and `initializeApp({ credential: cert(parsed) })` (from `firebase-admin/app`), return `getMessaging(app)` (from `firebase-admin/messaging`); any exception → warn `Push notifications disabled (FIREBASE_SERVICE_ACCOUNT missing or invalid)` and return `null`. Map responses by index to tokens for pruning; log `Push sent to N device(s)`. `store.js`: `EMPTY()` has `pushTokens: []` instead of `pushSubscriptions`; `load()` deletes `data.pushSubscriptions` after merging. Update `routes.js` and the `notifyAll` call in `mantra/index.js` (`{ title: 'Libby', body: 'You have a new Mantra' }`). `.env.example`: replace the `VAPID_*` block with a commented `FIREBASE_SERVICE_ACCOUNT=` (Firebase → Project settings → Service accounts → Generate new private key; paste the whole JSON on one line).
- [ ] **Step 6: Run** `cd backend && npm test` — Expected: all PASS.
- [ ] **Step 7: Commit** — `git add backend && git commit -m "feat(backend): send mantra notifications via Firebase"`

### Task 2: API-only Express app with CORS

**Files:**
- Create: `backend/app.js`
- Modify: `backend/server.js`, `backend/package.json`, root `package.json`
- Test: `backend/test/app.test.js`

**Interfaces:**
- Consumes: existing `requirePassword`, `askKin`, `mantra/routes`.
- Produces: `createApp() -> express.Application` (all current `/api` routes; no `express.static`). `server.js` = `createApp().listen(PORT)` + `startScheduler()`.

- [ ] **Step 1: Write failing tests** in `backend/test/app.test.js`; set `process.env.APP_PASSWORD = 'pw'`, start `createApp().listen(0)`, use global `fetch`:
  - `preflight from the app origin succeeds without password` — `OPTIONS /api/mantra` with `Origin: https://localhost`, `Access-Control-Request-Method: POST`, `Access-Control-Request-Headers: authorization,content-type` → status 204, `access-control-allow-origin === 'https://localhost'`, allow-headers includes `Authorization`.
  - `app origin gets CORS header on real requests` — `GET /api/auth-check` with `Origin: https://localhost` and `Authorization: Bearer pw` → 200, `access-control-allow-origin === 'https://localhost'`.
  - `other origins get no CORS header` — same request with `Origin: https://evil.example` → no `access-control-allow-origin` header.
  - `password still required` — `GET /api/auth-check` without Authorization → 401.
  - `frontend is no longer served` — `GET /` → 404.
  - `subscribe rejects missing token` — `POST /api/push/subscribe` `{}` with password → 400.
- [ ] **Step 2: Run** `cd backend && npm test` — Expected: app tests FAIL (`Cannot find module '../app'`).
- [ ] **Step 3: Install** `cd backend && npm install cors`.
- [ ] **Step 4: Implement** `app.js`: `express.json()`, then `app.use('/api', cors({ origin: ['https://localhost'], methods: ['GET','POST'], allowedHeaders: ['Content-Type','Authorization'] }))` **before** `requirePassword`, then the existing routes moved from `server.js`. The origin must be an **array**: a plain string makes `cors` send that header to every origin, which fails the "other origins" test. Slim `server.js`. Root `package.json`: `build` → `cd backend && npm ci`.
- [ ] **Step 5: Run** `cd backend && npm test` — Expected: all PASS.
- [ ] **Step 6: Commit** — `git add backend package.json && git commit -m "feat(backend): API-only app with CORS for the native app"`

### Task 3: Frontend calls the backend by absolute URL

**Files:**
- Modify: `frontend/src/api.js`, `.gitignore`
- Create: `frontend/.env.production.example`

**Interfaces:**
- Produces: `request(path)` fetches `API_BASE + path`, where `API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')`. (The push API functions change in Task 5, together with the code that uses them.)

- [ ] **Step 1: Implement** the changes above. `.env.production.example`: `VITE_API_URL=https://your-app.up.railway.app`. Add `frontend/.env.production` to `.gitignore`.
- [ ] **Step 2: Verify dev still works** — run backend (`npm run dev:backend`) and frontend (`npm run dev:frontend`), log in at `http://localhost:5174`, send a chat message → reply appears (relative URLs via Vite proxy).
- [ ] **Step 3: Verify base URL** — `cd frontend && VITE_API_URL=https://example.com/ npx vite build` then `grep -o "https://example.com/api" dist/assets/*.js | head -1` → prints a match, and `grep -c "example.com//api" dist/assets/*.js` → `0`.
- [ ] **Step 4: Commit** — `git add .gitignore frontend && git commit -m "feat(frontend): configurable backend URL"`

### Task 4: Capacitor Android project

**Files:**
- Create: `frontend/capacitor.config.json`, `frontend/android/**` (generated), `frontend/assets/icon.png` (source for icons)
- Modify: `frontend/package.json` (deps + scripts), `.gitignore`

**Interfaces:**
- Produces: npm scripts in `frontend/`: `android:sync` = `vite build && cap sync android`; `android:apk` = `npm run android:sync && cd android && gradlew.bat assembleDebug` (output `android/app/build/outputs/apk/debug/app-debug.apk`); `android:install` = `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 1: Install** `cd frontend && npm install @capacitor/core @capacitor/android @capacitor/push-notifications && npm install -D @capacitor/cli @capacitor/assets`.
- [ ] **Step 2: Create** `capacitor.config.json` `{ "appId": "app.libbys", "appName": "Libby's App", "webDir": "dist" }`, then `npx cap add android`.
- [ ] **Step 3: Move** `google-services.json` from the repo root into `frontend/android/app/`; add `frontend/android/app/google-services.json` to `.gitignore`. Verify: `git status --short | grep google-services` → no output.
- [ ] **Step 4: Icons** — render `public/icon.svg` to a 1024×1024 `assets/icon.png` (any tool, e.g. Android Studio or an online converter), run `npx capacitor-assets generate --android`.
- [ ] **Step 5: Add the scripts** from the Interfaces block. Ensure `JAVA_HOME` points to Android Studio's bundled JDK (`C:\Program Files\Android\Android Studio\jbr`) and `adb` is on PATH (`%LOCALAPPDATA%\Android\Sdk\platform-tools`); document both in Task 6's README.
- [ ] **Step 6: Verify build** — `cd frontend && npm run android:apk` → `BUILD SUCCESSFUL`, `app-debug.apk` exists.
- [ ] **Step 7: Commit** — `git add .gitignore frontend && git commit -m "feat(android): add Capacitor Android project"` (check `git status` first: no `google-services.json`, no `build/` outputs).

### Task 5: Native notifications in the app

**Files:**
- Rewrite: `frontend/src/features/mantra/push.js`
- Create: `frontend/src/features/mantra/MantraBanner.jsx`
- Modify: `frontend/src/api.js`, `frontend/src/App.jsx`, `frontend/src/features/mantra/MantraScreen.jsx`, `frontend/src/main.jsx`, `frontend/index.html`
- Delete: `frontend/public/sw.js`, `frontend/public/manifest.webmanifest`

**Interfaces:**
- Consumes: `request()` with base URL (Task 3), `POST /api/push/subscribe {token}` (Task 1), plugin `@capacitor/push-notifications` (Task 4).
- Produces (`api.js`): `getPushPublicKey` removed; `subscribePush(token: string)` posts `{ token }`.
- Produces (`push.js`): `pushSupported(): boolean` (`Capacitor.isNativePlatform()`); `pushPermission(): Promise<'granted'|'denied'|'prompt'|'unsupported'>` (`prompt-with-rationale` → `prompt`); `enablePush(): Promise<void>` (requestPermissions → throw `'Notifications were not allowed'` unless granted → register → token sent via the `registration` listener); `syncPush(): Promise<void>` (register only if already granted); `initPush({ onOpenMantra, onMantraReceived }): void` — creates channel `{ id: 'mantra', name: 'Mantras', importance: 5 }`, adds listeners once: `registration` → `subscribePush(token.value)`, `registrationError` → console.error, `pushNotificationActionPerformed` with `notification.data.open === 'mantra'` → `onOpenMantra()`, `pushNotificationReceived` with same data → `onMantraReceived()`. No-op when not native.
- Produces: `<MantraBanner onOpen={fn} onDismiss={fn} />` — card-styled bar "🧘 New mantra" with an Open button (`ActionButton`) and dismiss ×.

- [ ] **Step 1: Implement** the `api.js` change and `push.js` per the Interfaces block.
- [ ] **Step 2: App.jsx** — remove `initialScreen()`/`?open=mantra`; default screen `'home'`. In a mount effect call `initPush({ onOpenMantra: () => setScreen('mantra'), onMantraReceived: () => setBanner(true) })` and `syncPush()` when unlocked (catch and log errors). Render `<MantraBanner>` above the current screen when `banner && screen !== 'mantra'`; Open → `setScreen('mantra')` + hide; navigating to mantra hides it.
- [ ] **Step 3: MantraScreen.jsx** — permission state loaded async (`useEffect(() => { pushPermission().then(setPermission) }, [])`, initial `null` renders nothing); `handleEnablePush` re-reads it after `enablePush`; remove the `unsupported` "needs the installed app on https" text (render nothing for `unsupported`); remove the `syncPush` effect (App owns it).
- [ ] **Step 4: Remove PWA parts** — delete `public/sw.js`, `public/manifest.webmanifest`; remove the manifest `<link>` from `index.html`; remove the service-worker block from `main.jsx`.
- [ ] **Step 5: Verify** — `cd frontend && npx vite build` → succeeds; `grep -r "serviceWorker\|PushManager\|manifest.webmanifest" src index.html` → no output. Browser dev: Mantra screen loads without errors and shows no notification prompt (not native).
- [ ] **Step 6: Commit** — `git add -A frontend && git commit -m "feat(frontend): native push notifications and mantra banner"`

### Task 6: Docs, deployment config and device test

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README** — rewrite Structure/Development/Production/Configuration for the native setup: prerequisites (Android Studio, `JAVA_HOME`, adb on PATH, USB debugging), Firebase (project, `app.libbys`, `google-services.json` → `frontend/android/app/`, service-account key → `FIREBASE_SERVICE_ACCOUNT` on Railway), `frontend/.env.production`, the `android:*` scripts, updating (backend → Railway deploy; UI → new APK, same PC/debug key keeps data). Config table: remove `VAPID_*`, add `FIREBASE_SERVICE_ACCOUNT`. API section: subscribe takes `{ token }`, public-key route gone.
- [ ] **Step 2: Commit** — `git commit -am "docs: native Android setup"`.
- [ ] **Step 3: User setup (guided)** — user generates the Firebase service-account key, sets `FIREBASE_SERVICE_ACCOUNT` on Railway and removes `VAPID_*`, creates `frontend/.env.production` with the Railway URL, enables Developer options + USB debugging on the phone. Deploy the branch to Railway (only after the user approves pushing). Railway logs show no "Push notifications disabled" warning.
- [ ] **Step 4: Install** — `cd frontend && npm run android:apk && npm run android:install` → `Success`.
- [ ] **Step 5: Manual checklist on the phone** (spec "Testing → Manual", all must pass):
  1. Log in with the password.
  2. Send a chat message, Libby replies.
  3. Mantra screen → Enable notifications → Android asks → allow.
  4. Swipe the app away (fully closed). Trigger: `curl -X POST -H "Authorization: Bearer <pw>" https://<railway>/api/mantra/trigger` → notification pops up within seconds, text "You have a new Mantra".
  5. Tap it → app cold-starts **on the Mantra screen** with the mantra; answer it.
  6. App open on Home, trigger again → banner appears; Open → Mantra screen.
  7. Rebuild + `android:install` again → still logged in, stats unchanged.
- [ ] **Step 6:** Fix anything that failed, re-run the affected checks, then hand back for branch finishing.
