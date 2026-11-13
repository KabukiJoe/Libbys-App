# Native Android app (Capacitor) + Firebase notifications

Date: 2026-11-13
Status: draft, waiting for review

## Goal

Turn libbys-app from a PWA into a native Android app, mainly so that mantra notifications arrive
reliably. This is also the base for the later keybox (Bluetooth lock) feature, which needs native
Bluetooth.

Success means: an APK installed on the phone that logs in, chats with Libby, and reliably shows a
mantra notification at the scheduled time, even when the app is closed. Tapping it opens the Mantra
screen.

## Decisions

- **Capacitor**, wrapping the existing React frontend. No UI rewrite.
- **Native only.** The browser/PWA version is dropped (service worker, manifest, web push).
  Browser development with Vite keeps working for UI work.
- **Railway stays** as the backend: mantra scheduler, Kindroid calls, secrets, data.
  Only the backend's push module and its routes change.
- **Firebase Cloud Messaging (FCM)** for notifications. Notifications carry no private text, only
  "You have a new Mantra". The app fetches the mantra from the backend.
- **App ID `app.libbys`**, name "Libby's App". Already registered in Firebase; must stay the same.
- **Sideloaded APK**, installed over USB. No Play Store.

## Not in scope

- The keybox / Bluetooth lock feature (separate spec, after this one).
- Moving the scheduler or Kindroid calls onto the phone.
- Release signing for the Play Store.

## Architecture

```
Phone: Libby's App (Capacitor, React UI bundled in the APK)
   │  HTTPS, Authorization: Bearer <APP_PASSWORD>
   ▼
Railway: Express API (no longer serves the frontend)
   ├─ Kindroid (chat, mantras)
   └─ Firebase Admin ──► FCM ──► notification on the phone
```

## Frontend changes (`frontend/`)

**Capacitor setup**
- Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/push-notifications`.
- `capacitor.config.json`: `appId: "app.libbys"`, `appName: "Libby's App"`, `webDir: "dist"`.
- `npx cap add android` creates `frontend/android/`, committed to Git.
- `google-services.json` goes into `frontend/android/app/` and is git-ignored.
  (It is currently in the repo root, untracked; it moves there.)
- App icon generated from `public/icon.svg` with `@capacitor/assets`.

**Backend address** (`src/api.js`)
- All requests use `import.meta.env.VITE_API_URL + path`. Empty for local dev (Vite proxy as today),
  the Railway https URL for APK builds (`frontend/.env.production`, git-ignored, with a committed
  `.env.production.example`).

**Notifications** (`src/features/mantra/push.js`, rewritten)
- `pushSupported()`: true only in the native app (`Capacitor.isNativePlatform()`).
- `pushPermission()`: maps the plugin's permission state to `granted` / `denied` / `prompt` /
  `unsupported`. Async now; MantraScreen loads it in an effect.
- `enablePush()`: request permission (Android 13+ asks the user), register with FCM, send the token
  to the backend.
- `syncPush()`: on app start, if permission is granted, register again and re-send the token
  (tokens can change).
- On start, create the notification channel `mantra` with high importance, so the notification pops
  up on screen.

**Navigation** (`src/App.jsx`)
- Remove the `?open=mantra` URL handling.
- Listen for `pushNotificationActionPerformed` (notification tapped) → switch to the Mantra screen.
  Registered at startup so it also works when the tap launched the app.
- Listen for `pushNotificationReceived` (app is open) → show a small banner, "New mantra", with a
  button that opens the Mantra screen. Not shown when the Mantra screen is already open.

**Removed**
- `public/sw.js`, `public/manifest.webmanifest`, the manifest link in `index.html`, the service
  worker registration in `main.jsx`.
- MantraScreen's text "Notifications need the installed app on https" (no longer possible).

## Backend changes (`backend/`)

**Push module** (`mantra/push.js`, rewritten)
- Uses `firebase-admin`, configured from `FIREBASE_SERVICE_ACCOUNT` (the service account JSON as one
  string). If missing: push disabled with a warning, like today.
- `addToken(token)`: stores the token in `data.pushTokens`, no duplicates.
- `notifyAll({ title, body })`: same name and call site as today. Sends to every token with
  `android.priority: high`, `android.ttl: 300s` (the answer window), channel `mantra`, and
  `data.open = "mantra"`. Tokens Firebase reports as invalid
  (`messaging/registration-token-not-registered`, `messaging/invalid-registration-token`) are
  removed. Other errors are logged.
- `mantra/index.js`: the `url` field in the `notifyAll` call is dropped; nothing else changes.

**Store** (`store.js`)
- `EMPTY()` gets `pushTokens: []` instead of `pushSubscriptions`. Old `pushSubscriptions` in an
  existing `data.json` are ignored and removed on the next write.

**Routes** (`mantra/routes.js`)
- `POST /api/push/subscribe` takes `{ token }` (string, required) instead of `{ subscription }`.
- `GET /api/push/public-key` is removed.

**Server** (`server.js`)
- CORS for `/api`: allow only the app's origin `https://localhost` (Capacitor's Android default),
  methods GET/POST, headers `Content-Type` and `Authorization`. Answers preflight `OPTIONS`
  before the password check.
- No longer serves `frontend/dist`.

**Dependencies and config**
- Remove `web-push`, add `firebase-admin`.
- `.env.example`: remove `VAPID_*`, add `FIREBASE_SERVICE_ACCOUNT`.
- Railway: add `FIREBASE_SERVICE_ACCOUNT`, remove `VAPID_*`.

## Repo and deployment

- Root `package.json`: `build` only installs the backend; `start` unchanged.
- New scripts in `frontend/package.json`:
  - `android:sync`: `vite build && cap sync android`
  - `android:apk`: sync, then build a debug APK with Gradle
  - `android:install`: install the APK on the phone over USB (`adb install -r`)
- README rewritten for the new setup: Android Studio, Firebase, building and installing, Railway
  variables.
- Updating: backend changes deploy to Railway as before. UI changes need a new APK installed over the
  old one (data and login are kept, as long as it's built on the same PC with the same debug key).

## Error handling

- Backend unreachable or wrong URL: existing error messages in the screens ("Failed: …").
- Notification permission denied: MantraScreen shows the existing "blocked, allow it in the phone's
  app settings" message.
- Push not configured on the server: `notifyAll` does nothing and logs a warning; the app still works,
  mantras appear by polling while the Mantra screen is open.
- FCM send failure for one token doesn't stop the others.

## Testing

**Automated (backend, `node --test`)**
- Push module with `firebase-admin` mocked: tokens are de-duplicated; `notifyAll` sends to all
  tokens with the right options; invalid tokens are removed; disabled when not configured.
- `POST /api/push/subscribe` rejects a missing token.
- CORS: allowed origin gets the headers, other origins don't, preflight works without a password.
- Existing mantra tests keep passing.

**Manual (on the phone)**
1. Install the APK, log in with the password.
2. Chat: send a message, get Libby's reply.
3. Mantra screen: enable notifications, Android asks, allow.
4. Close the app, trigger a mantra (`POST /api/mantra/trigger`), notification arrives and pops up.
5. Tap it: app opens on the Mantra screen with the mantra; answer it.
6. With the app open on the home screen, trigger again: the in-app banner appears and opens the
   Mantra screen.
7. Reinstall a newer APK over the old one: still logged in, stats kept.

## Your setup steps (outside the code)

- Done: Firebase project, Android app `app.libbys` registered, `google-services.json` downloaded,
  Android Studio installed.
- Later: create the Firebase service account key and put it on Railway; enable USB debugging on the
  phone.
