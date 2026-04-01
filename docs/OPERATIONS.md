# Delivery Tool Operations

This runbook documents the minimum operational steps for local development, smoke testing, and safe secret handling.

## 1) Local prerequisites

- Node.js 20+
- Docker Desktop (Linux containers enabled)
- npm 10+

## 2) Environment setup

Create or update root `.env` with test-safe values:

- `API_KEY`
- `ADMIN_SECRET`
- `JWT_SECRET` (at least 32 chars)
- `LICENSE_PEPPER`
- `DATABASE_URL`
- `ZR_WEBHOOK_SECRET`

Never use production secrets in local environments.

## 3) Start backend + database

From `infrastructure/docker`:

```bash
docker compose --env-file ../../.env up -d --build
```

Health check:

```bash
curl http://localhost:3000/health
```

## 4) Start admin dashboard

From repo root:

```bash
npm install
npm run dev:admin
```

Open:

- http://localhost:5173

Paste your `ADMIN_SECRET` in the dashboard login input.

## 5) Backend smoke checks

Run:

```bash
npm run test -w @delivery-tool/backend
```

For end-to-end API checks, validate:

- `/health`
- `/v1/carriers` with and without `X-API-Key`
- `/v1/license/status`
- `/v1/license/activate`
- `/v1/shipments/send` and `/v1/shipments/tracking` with `X-DT-Access-Token`
- `/admin/v1/stats` with `X-Admin-Secret`

## 6) Shutdown

From `infrastructure/docker`:

```bash
docker compose down
```
## Delivery Tool operations overview

This project contains:

- `apps/sheets-addon` – Google Sheets add-on code (Apps Script + HTML sidebar)
- `backend` – Fastify + Postgres API for license, shipments, geo and admin
- `shared` – shared TypeScript types across backend and add-on
- `packages/carriers` – carrier adapter abstraction (mixed maturity by carrier)
- `apps/admin-dashboard` – small admin UI for license management

### Environment requirements

Backend expects the following environment variables (defined in repository root `.env`):

- `POSTGRES_USER` – local Docker Postgres username
- `POSTGRES_PASSWORD` – local Docker Postgres password
- `POSTGRES_DB` – local Docker database name
- `DATABASE_URL` – Postgres connection string
- `API_KEY` – API key required for `/v1/*` routes (Authorization / X-API-Key)
- `ADMIN_SECRET` – secret required for `/admin/*` routes (X-Admin-Secret)
- `JWT_SECRET` – preferred signing secret for shipment access tokens
- `LICENSE_SIGNING_SECRET` – legacy alias (still supported)
- `LICENSE_PEPPER` – HMAC pepper for hashing client email in trial table (required in production)
- `ACTIVATION_CODES` – optional comma-separated codes enabling dev yearly licenses
- `TRIAL_DAYS` – length of trial window for in-memory/local evaluation
- `TRIAL_DAILY_SHIPMENT_LIMIT` – optional per-day limit on send/sync API calls
- `ZR_WEBHOOK_SECRET` – optional webhook signature secret for `/webhooks/zr`

In **production**, the backend enforces:

- `DATABASE_URL`, `API_KEY`, `ADMIN_SECRET`, `JWT_SECRET` (>= 32 chars) and `LICENSE_PEPPER` must be set.
- `trialDays` is forced to 7 days.

### License and trial model

- Trials are stored in `dt_trial_entitlement` using a HMAC hash of the client email and `LICENSE_PEPPER`.
- Paid licenses are stored in `dt_license` and issued via admin license codes (`dt_admin_license_code`).
- The Sheets add-on uses:
  - `POST /v1/license/activate` for manual activation with a code.
  - `POST /v1/license/status` to auto-start a trial and fetch the access token.
- Legacy `POST /v1/license/validate` is kept only for very old clients and is **deprecated**; new integrations
  must use `/v1/license/status` + `/v1/license/activate`.
- Status resolution now prefers `dt_license` rows (paid subscriptions) before falling back to trial logic.

### Typical flows

- **First install / trial start**
  - User opens the sidebar, configures backend URL and optionally an API key.
  - Add-on calls `/v1/license/status` with the user email; backend either returns an existing license or creates a trial row.

- **License activation**
  - Admin issues a DLV-XXXX-XXXX-XXXX code from the admin dashboard (`/admin/v1/license-codes`).
  - User enters the code in the sidebar, which calls `/v1/license/activate`.
  - Backend updates `dt_license` for the Google email and returns an access token.

- **Send / sync**
  - Add-on maps columns and sends orders to `/v1/shipments/send` with an internal order payload.
  - Sync reads tracking numbers and calls `/v1/shipments/tracking` to refresh status.
  - Auto-sync trigger periodically scans mapped sheets and runs tracking updates.

### Admin operations

- Admin dashboard (Vite app) talks to backend:
  - Issue codes: `POST /admin/v1/license-codes`
  - List codes: `GET /admin/v1/license-codes`
  - List clients: `GET /admin/v1/clients?search=…`
  - Extend license: `POST /admin/v1/licenses/extend` (updates both `dt_license` and `dt_admin_license_code`)
  - Revoke license: `POST /admin/v1/licenses/revoke` (marks both `dt_license` and `dt_admin_license_code` as revoked)
  - Stats: `GET /admin/v1/stats`

The dashboard stores `ADMIN_SECRET` only in browser sessionStorage; rotating the secret requires re-entering it.

