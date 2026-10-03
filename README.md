# Libby's App

A minimal phone-first web app: type a message, hit send, read your Kindroid kin's reply in a group chat.
Installable to the home screen as a PWA. Protected by a shared password.

## Structure

```
backend/    Node 22 + Express. /api (password-protected), serves the built frontend in production
  kindroid.js   Kindroid API client
  auth.js       Password check for /api
  store.js      JSON file storage (DATA_DIR)
  mantra/       Daily mantra scheduler, push notifications, /api/mantra routes
  test/         `npm test` (node --test)
frontend/   React + Vite + Tailwind CSS v4
  src/screens/       Home and password screens
  src/features/      One folder per feature (permission/, …)
  src/components/    Shared UI (Header, Bubble, ActionButton, …)
package.json  Root scripts used for deployment
```

## Development

Install dependencies once:

```
npm run install:all
```

Configure the backend: copy `backend/.env.example` to `backend/.env` and fill it in (see
[Configuration](#configuration)). The dev script loads it automatically.

Then run both in separate terminals:

```
npm run dev:backend     # API on http://localhost:3000
npm run dev:frontend    # Vite on http://localhost:5174, proxies /api to the backend
```

The Vite dev server listens on the network, so you can open `http://<your-pc-ip>:5174` on your phone
(same wifi).

The backend port comes from the `PORT` environment variable (default 3000). If you change it, update
the proxy target in `frontend/vite.config.js`.

## Production

```
npm run build   # installs dependencies and builds frontend/dist
npm start       # Express serves frontend/dist and the API
```

### Deploying to Railway

1. Push the repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**.
3. Railway runs `npm run build` and `npm start` from the repo root (change them in the service settings if
   it does not pick them up).
4. Add the [configuration](#configuration) variables under the service's **Variables** tab.
5. **Settings → Networking → Generate Domain** to get an https URL.
6. Add a **Volume** to the service, mounted at `/data`, and set `DATA_DIR=/data`.
7. Keep **Serverless / App Sleeping** off, otherwise the mantra scheduler doesn't run.

### Installing on your phone

Open the Railway URL in Chrome on Android, then **⋮ → Add to Home screen** (or **Install app**). It opens
full-screen without the browser bar.

## Configuration

| Variable           | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `KINDROID_API_KEY` | Kindroid → Settings → General → API & advanced integrations                 |
| `KINDROID_GROUP_ID`| The group chat the message is posted to                                      |
| `KINDROID_AI_ID`   | The kin that replies (must be a member of the group)                         |
| `APP_PASSWORD`     | Password you enter in the app. If unset, every API request is rejected.      |
| `KINDROID_MANTRA_GROUP_ID` | Group chat the mantras are requested in. If unset, the scheduler is off. |
| `DATA_DIR`         | Folder for `data.json`. Default `backend/data`; on Railway the volume path.  |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Push keys: `npx web-push generate-vapid-keys`        |
| `VAPID_SUBJECT`    | `mailto:` address sent to push services                                      |
| `MANTRA_PROMPT`    | Optional. Default `Send a mantra for Roger`                                  |
| `MANTRA_TIMEZONE`  | Optional. Default `Europe/Berlin`                                            |

Locally these go in `backend/.env` (git-ignored), on Railway under **Variables**. Never put them in the
frontend.

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

## Mantra

Every day at 02:00 (`MANTRA_TIMEZONE`) the server plans 3–5 mantras at random times between 08:00 and
20:00, at least 1 h apart (settings in `backend/mantra/config.js`). At each time it posts `MANTRA_PROMPT`
to the mantra group, takes the kin's reply as the mantra and sends a push notification. The mantra has to
be typed exactly (case-sensitive, outer whitespace ignored) within 5 minutes, one attempt; a typo or
timeout counts as failed. If the server was down, slots more than 15 minutes late are skipped.

- `GET /api/mantra` → open mantra (if any), counters, today's remaining count
- `POST /api/mantra/:id/answer` `{ "answer": "..." }` → `{ result, reason, expected, stats }`
- `POST /api/mantra/trigger` → requests a mantra immediately (for testing)
- `GET /api/push/public-key`, `POST /api/push/subscribe`

Notifications need the app on https (Railway); tap **Enable notifications** on the Mantra screen once.
