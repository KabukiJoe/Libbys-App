# Memo

A minimal phone-first native Android app (Capacitor): type a message, hit send, read your Kindroid kin's
reply in a group chat. Protected by a shared password. Push notifications go through Firebase Cloud
Messaging.

## Structure

```
backend/    Node 22 + Express. API only (/api, password-protected); does not serve the frontend
  kindroid.js   Kindroid API client
  auth.js       Password check for /api
  store.js      JSON file storage (DATA_DIR)
  mantra/       Daily mantra scheduler, FCM push, /api/mantra routes
  test/         `npm test` (node --test)
frontend/   React + Vite + Tailwind CSS v4, wrapped as an Android app with Capacitor
  src/screens/       Home and password screens
  src/features/      One folder per feature (permission/, ...)
  src/components/    Shared UI (Header, Bubble, ActionButton, ...)
  android/           Generated Android project (app id `app.libbys`)
package.json  Root scripts used for deployment (build only installs the backend)
```

The backend runs on Railway; the app on the phone talks to it over https. CORS only allows the app's
origin (`https://localhost`).

## Development

Install dependencies once:

```
npm run install:all
```

Configure the backend: copy `backend/.env.example` to `backend/.env` and fill it in (see
[Configuration](#configuration)). The dev script loads it automatically.

For UI work you can still use the browser. Run both in separate terminals:

```
npm run dev:backend     # API on http://localhost:3000
npm run dev:frontend    # Vite on http://localhost:5174, proxies /api to the backend
```

Push notifications only work in the native app, not in the browser. The backend port comes from `PORT`
(default 3000); if you change it, update the proxy target in `frontend/vite.config.js`.

## Android app

### Prerequisites

- Android Studio (with the SDK). Its bundled JDK (JDK 25) is used for the build: set `JAVA_HOME` to
  `C:\Program Files\Android\Android Studio\jbr`.
- `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`, and `%LOCALAPPDATA%\Android\Sdk\platform-tools` (where
  `adb` lives) on `PATH`.
- Phone: enable Developer options and **USB debugging**, connect it by USB and accept the prompt.

The Gradle wrapper in `frontend/android` was bumped to 9.1.0 because Capacitor's default Gradle version
cannot run on JDK 25. If you regenerate the Android project or `npx cap update` resets it, set
`distributionUrl` in `frontend/android/gradle/wrapper/gradle-wrapper.properties` to Gradle 9.1.0 again.

### Firebase (push notifications)

1. In the Firebase console create a project and add an Android app with package name `app.libbys`.
2. Download `google-services.json` and put it in `frontend/android/app/` **before building**. If it is
   missing, Gradle silently skips the Google Services plugin and push just doesn't work. It is
   git-ignored; never commit it.
3. Firebase console -> Project settings -> Service accounts -> **Generate new private key**. Paste the
   JSON as one line into the `FIREBASE_SERVICE_ACCOUNT` variable on Railway (and in `backend/.env` if you
   test push locally). Never commit it.

### Build and install

Copy `frontend/.env.production.example` to `frontend/.env.production` and set `VITE_API_URL` to the
Railway https URL. It is baked into the APK at build time (git-ignored).

From `frontend/`:

```
npm run android:sync      # vite build + cap sync
npm run android:apk       # sync + Gradle assembleDebug -> android/app/build/outputs/apk/debug/app-debug.apk
npm run android:install   # adb install -r the debug APK onto the connected phone
```

On first launch open the Mantra screen and tap **Enable notifications**, then allow them.

### Updating

- Backend changes: deploy to Railway.
- UI changes: rebuild the APK and run `android:install` over the old one. Building on the same PC (same
  debug key) keeps the app's data and login.

## Deploying the backend to Railway

1. Push the repo to GitHub.
2. In Railway: **New Project -> Deploy from GitHub repo**.
3. Railway runs `npm run build` (installs the backend only) and `npm start` from the repo root (change
   them in the service settings if it does not pick them up).
4. Add the [configuration](#configuration) variables under the service's **Variables** tab.
5. **Settings -> Networking -> Generate Domain** to get an https URL (use it for `VITE_API_URL`).
6. Add a **Volume** to the service, mounted at `/data`, and set `DATA_DIR=/data`.
7. Keep **Serverless / App Sleeping** off, otherwise the mantra scheduler doesn't run.

## Configuration

| Variable           | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `KINDROID_API_KEY` | Kindroid -> Settings -> General -> API & advanced integrations              |
| `KINDROID_GROUP_ID`| The group chat the message is posted to                                      |
| `KINDROID_AI_ID`   | The kin that replies (must be a member of the group)                         |
| `APP_PASSWORD`     | Password you enter in the app. If unset, every API request is rejected.      |
| `KINDROID_MANTRA_GROUP_ID` | Group chat the mantras are requested in. If unset, the scheduler is off. |
| `DATA_DIR`         | Folder for `data.json`. Default `backend/data`; on Railway the volume path.  |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service-account JSON on one line, for push (see [Firebase](#firebase-push-notifications)) |
| `MANTRA_PROMPT`    | Optional. Default `Send a mantra for Roger`                                  |
| `MANTRA_TIMEZONE`  | Optional. Default `Europe/Berlin`                                            |
| `MANTRA_LOG_SCHEDULE` | Optional. `true` logs the planned times (debugging; spoils the surprise)  |

Locally these go in `backend/.env` (git-ignored), on Railway under **Variables**. Never put them in the
frontend. The only frontend setting is `VITE_API_URL` in `frontend/.env.production`.

## API

All `/api` requests need `Authorization: Bearer <APP_PASSWORD>`; otherwise they get `401`.

`GET /api/auth-check` → `{ "ok": true }` if the password is right.

`POST /api/chat` posts the message to the group (Kindroid `/groupchats-user-message`), then asks the
kin to reply (`/groupchats-ai-response`):

```json
{ "message": "hello" }
```

Response:

```json
{ "reply": "..." }
```

On failure it returns `502` with `{ "error": "..." }`.

`POST /api/push/subscribe` registers the phone for push notifications:

```json
{ "token": "<FCM token>" }
```

## Mantra

Every day at 02:00 (`MANTRA_TIMEZONE`) the server plans 3–5 mantras at random times between 08:00 and
20:00, at least 1 h apart (settings in `backend/mantra/config.js`). At each time it posts `MANTRA_PROMPT`
to the mantra group, takes the kin's reply as the mantra and sends a push notification (Firebase Cloud Messaging). The mantra has to
be typed exactly (case-sensitive, outer whitespace ignored) within 5 minutes, one attempt; a typo or
timeout counts as failed. If the server was down, slots more than 15 minutes late are skipped.

- `GET /api/mantra` → open mantra (if any) and counters. Nothing about upcoming mantras: when and how
  many stays secret (also in the logs, unless `MANTRA_LOG_SCHEDULE=true`).
- `POST /api/mantra/:id/answer` `{ "answer": "..." }` → `{ result, reason, expected, stats }`
- `POST /api/mantra/trigger` → requests a mantra immediately (for testing)
- `POST /api/push/subscribe` `{ "token": "<FCM token>" }` registers the device

Notifications only say "You have a new Mantra"; the text is fetched from the backend when you open the app. Tap **Enable notifications** on the Mantra screen once and allow them.
