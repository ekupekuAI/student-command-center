# Student Command Center

A personal study command center with subjects, tasks, notes, study-session
tracking, activity history, and an AI study assistant — all scoped per user.

- **Frontend:** Vanilla JavaScript SPA built with [Vite](https://vite.dev)
- **Backend:** [FastAPI](https://fastapi.tiangolo.com) + SQLAlchemy 2 + PostgreSQL
- **Database:** PostgreSQL on [Neon](https://neon.tech) (via [Alembic](https://alembic.sqlalchemy.org) migrations)
- **AI assistant:** Server-side calls to [OpenRouter](https://openrouter.ai) (`openrouter/free`), keyed per user with hard rate limits

## Features

- Register / login / logout with JWT auth (bcrypt password hashing, token
  revocation on logout, per-user data isolation)
- Subjects, tasks, notes, study sessions, and an activity stream — every
  record is owned by exactly one user
- AI study assistant that builds context from **the signed-in user's own data**
  only, with strict request/history/token budgets
- Profile page (stats, profile editing, password change) and Settings page
  (theme, weekly goal, timer, JSON export)
- Production hardening: per-IP login rate limiting, per-user AI rate limiting,
  security headers, no interactive docs in production, secrets via env only

## Architecture

```
student-command-center/
├── index.html, src/          # Vite SPA (vanilla JS + CSS)
├── backend/
│   ├── app/                  # FastAPI application
│   │   ├── core/             # config, security, rate limiting, AI service
│   │   ├── models/           # SQLAlchemy models
│   │   ├── routers/          # auth, subjects, tasks, notes, study, activities, ai, health
│   │   └── services/         # auth tokens, student context builder
│   ├── alembic/              # database migrations
│   └── tests/                # pytest suite (backend API tests)
└── package.json              # frontend scripts
```

## Prerequisites

- Node.js 20+ and npm
- Python 3.12+
- A PostgreSQL database (any host; Neon recommended)
- An OpenRouter API key (for the AI assistant)

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
```

Create `backend/.env` from the template and fill in real values:

```bash
copy .env.example .env
```

### 2. Database migration

```bash
cd backend
alembic upgrade head
```

- On a **fresh/empty database**, the migration creates all tables and **no**
  default account.
- When upgrading a database that **already has data**, set both
  `DEV_USER_EMAIL` and `DEV_USER_PASSWORD` so the migration can create the
  account that owns the existing rows. Example:

  ```powershell
  $env:DEV_USER_EMAIL="you@example.com"; $env:DEV_USER_PASSWORD="<strong-password>"
  alembic upgrade head
  ```

### 3. Frontend

```bash
npm install
```

Create `.env` from the template (optional — the frontend already defaults to
`http://127.0.0.1:8000/api`):

```bash
copy .env.example .env
```

## Running locally

Backend (from `backend/`):

```bash
uvicorn app.main:app --reload --port 8000
```

Frontend (from the repo root):

```bash
npm run dev
```

Then open http://localhost:5173, register an account, and sign in.

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string (psycopg3), e.g. Neon. |
| `JWT_SECRET` | Yes | Random secret for signing JWTs. Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Must be set to a real value in production (the app refuses to start in production with the placeholder). |
| `ENVIRONMENT` | Yes | `development` or `production`. In production, `/docs` and `/redoc` are disabled and HSTS is added. |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins, e.g. `https://your-app.example.com`. |
| `OPENROUTER_API_KEY` | No (AI disabled without it) | OpenRouter API key. Server-side only, never exposed to the browser. |
| `OPENROUTER_MODEL` | No | Model identifier, default `openrouter/free`. |
| `APP_NAME` | No | Display name for the API. |
| `APP_SITE_URL` | No | Public origin of the app, sent to OpenRouter as `HTTP-Referer`. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | JWT lifetime in minutes (default 7 days). |
| `OPENROUTER_BASE_URL` | No | OpenRouter base URL (default `https://openrouter.ai/api/v1`). |
| `AI_REQUEST_TIMEOUT_SECONDS` | No | Timeout per AI request (default 45). |
| `AI_MAX_OUTPUT_TOKENS` | No | Max completion tokens (default 700). |
| `AI_HISTORY_LIMIT` | No | Max chat history messages sent (default 12). |
| `AI_CONTEXT_BUDGET_CHARS` | No | Max characters of user context sent (default 6000). |
| `AI_RATE_LIMIT_PER_MINUTE` | No | AI requests per user per minute (default 20). |
| `AUTH_RATE_LIMIT_PER_MINUTE` | No | Login/register attempts per IP per minute (default 60). |
| `DEV_USER_EMAIL`, `DEV_USER_PASSWORD` | Migration-time only | Create the owner account during `alembic upgrade` on a pre-existing database. Never commit the real password. |

### Frontend (`.env`)

| Variable | Description |
| --- | --- |
| `VITE_API_BASE_URL` | Backend base URL (default `http://127.0.0.1:8000/api`). |

## Running tests

```bash
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

The suite runs against in-memory SQLite with a mocked AI provider — no real
credentials or network calls.

Frontend production build:

```bash
npm run build   # outputs to dist/
```

## Deployment

1. **Database:** create a Neon (or any PostgreSQL) database; run migrations with
   `alembic upgrade head` against it.
2. **Backend:** run FastAPI with a production ASGI server. Example with uvicorn:
   `uvicorn app.main:app --host 0.0.0.0 --port 8000` (use a process manager such
   as systemd/supervisor, and put it behind a TLS-terminating reverse proxy).
   Set `ENVIRONMENT=production`, a real `JWT_SECRET`, and `CORS_ORIGINS` to your
   frontend origin.
3. **Frontend:** build with `npm run build` and serve `dist/` from any static
   host (or your reverse proxy). Set `VITE_API_BASE_URL` at build time to your
   deployed backend URL.
4. **AI:** set `OPENROUTER_API_KEY`. Without it, AI chat returns a friendly
   "not configured" message; every other feature works.

## Security notes

- Secrets live only in git-ignored `.env` files; never commit `DATABASE_URL`,
  `JWT_SECRET`, `OPENROUTER_API_KEY`, or passwords.
- All user-owned endpoints scope queries by `user_id`; tests enforce that one
  user can never read or mutate another user's data.
- Passwords are bcrypt-hashed; JWTs carry a `token_version` so logout revokes
  them immediately.
- Login/register are rate-limited per IP and AI chat per user (in-memory
  sliding window) to slow brute force and control AI cost.
- Error responses never leak provider internals, credentials, or exception
  text.
- The rate limiter is in-memory (single-process). If you scale to multiple
  backend workers, move it to a shared store (e.g. Redis) at the edge/proxy.