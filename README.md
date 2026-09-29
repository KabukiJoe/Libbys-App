# Libby's App

A minimal phone-first web app: type a message, hit send, read your Kindroid kin's reply in a group chat.
Installable to the home screen as a PWA. Protected by a shared password.

## Structure

```
backend/    Node 22 + Express. /api (password-protected), serves the built frontend in production
  kindroid.js   Kindroid API client
  auth.js       Password check for /api
frontend/   React + Vite + Tailwind CSS v4
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
