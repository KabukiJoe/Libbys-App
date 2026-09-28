# Libby's App

A minimal phone-first web app: type a message, hit send, read the chatbot's reply.
Installable to the home screen as a PWA.

> Status: the backend currently returns a placeholder reply. Real chatbot integration is still to do.

## Structure

```
backend/    Node 22 + Express. POST /api/chat, serves the built frontend in production
frontend/   React + Vite + Tailwind CSS v4
package.json  Root scripts used for deployment
```

## Development

Install dependencies once:

```
npm run install:all
```

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
4. **Settings → Networking → Generate Domain** to get an https URL.

### Installing on your phone

Open the Railway URL in Chrome on Android, then **⋮ → Add to Home screen** (or **Install app**). It opens
full-screen without the browser bar.

## API

`POST /api/chat`

```json
{ "message": "hello" }
```

Response:

```json
{ "reply": "..." }
```

## Adding the chatbot

Implement the call in `backend/server.js` inside the `/api/chat` handler. Keep API keys in environment
variables (locally in a `.env` file, which is git-ignored; on Railway under **Variables**). Never put them
in the frontend.
