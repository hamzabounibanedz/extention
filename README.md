## Delivery Tool – Multi-carrier shipping for Google Sheets

Delivery Tool is a multi-tenant logistics platform that turns a standard Google Sheet into a full-featured shipping console for Algerian e‑commerce merchants. It lets operators map any order sheet, send shipments to supported carriers, sync tracking statuses, manage fees and blacklist rules, and control licensing from a central backend and admin dashboard.

This repository contains the full stack:

- **Google Sheets add-on** (`apps/sheets-addon`): sidebar UI and Apps Script backend that runs inside the user’s spreadsheet.
- **Backend API** (`backend`): Fastify + PostgreSQL service for licensing, shipment routing, geo data, and admin operations.
- **Carrier adapters package** (`packages/carriers`): pluggable adapters for each delivery company (mixed maturity by carrier).
- **Admin dashboard** (`apps/admin-dashboard`): small web app for issuing and managing client licenses.
- **Shared types** (`shared`): TypeScript models shared across backend and tools.
- **Infrastructure** (`infrastructure/docker`): Docker Compose for Postgres + backend.

---

## Business overview

- **Audience**: Algerian online sellers and fulfilment teams who already manage orders in Google Sheets.
- **Problem**: Each carrier has its own portal/API and CSV format. Operators repeatedly copy/paste, reformat, and manually track statuses, which is slow and error-prone.
- **Solution**: A single Google Sheets sidebar that:
  - Reads **any** order layout via a one-time column mapping.
  - Sends shipments to different carriers from the same sheet.
  - Syncs tracking statuses back into the sheet.
  - Applies per‑wilaya shipping fees and blacklist rules.
  - Provides stats and audit logs for operations.
- **Monetisation**: Time‑limited trial and paid subscription per client, managed via license codes issued in the admin dashboard.

Key business flows:

- First install → trial start → license activation via WhatsApp code.
- Sheet configuration via a mapping wizard (columns, default carrier, header row).
- Day‑to‑day operations: send, sync tracking, highlight blacklist, compute fees, view stats.
- Admin operations: issue/revoke/extend licenses and monitor client status.

---

## Repository structure

```text
.
├── apps/
│   ├── sheets-addon/        # Google Sheets add-on (Apps Script)
│   └── admin-dashboard/     # Admin web UI (Vite + TS)
├── backend/                 # Fastify API + Postgres access
├── packages/
│   └── carriers/            # Carrier adapter interfaces + stubs
├── shared/                  # Shared TS types
├── infrastructure/
│   └── docker/              # Docker Compose + backend Dockerfile
├── docs/
│   └── OPERATIONS.md        # Operational runbook
├── .vscode/                 # Editor recommendations
├── package.json             # Root workspace + scripts
├── package-lock.json
├── tsconfig.base.json
└── .nvmrc
```

---

## Core components

### 1. Google Sheets add-on (`apps/sheets-addon`)

Runs as a **Google Workspace Add-on** attached to a spreadsheet. Major features:

- **Column mapping**
  - Reads header row and lets the user map 20+ fields (name, phone, address, wilaya, COD amount, stop‑desk, blacklist flags, tracking, etc.).
  - Mapping is stored per spreadsheet + sheet (`SavedSheetMapping`) and reused across features.
  - Supports custom header languages; mapping is by column, not by header text.

- **Sending orders**
  - Builds an internal `order` object from each selected row (`OrderEngine.gs`), validating:
    - Phone format (Algerian 05/06/07 numbers).
    - Address presence.
    - Wilaya (1–58) and optional stop‑desk ID.
    - Duplicates (order ID, phone+product, tracking number).
  - Sends batches of rows to the backend `/v1/shipments/send` endpoint.
  - Writes back shipment ID, tracking number, status text, and label URL into mapped columns.

- **Tracking sync**
  - Interactive sync on the current selection: reads tracking column, calls `/v1/shipments/tracking`, writes status.
  - Optional time-based **auto-sync trigger** which iterates all mapped sheets and refreshes tracking data safely.

- **Shipping fees**
  - Per‑carrier rules: default fee + optional per‑wilaya overrides.
  - Applies fees to a mapped “delivery fee” column for a selection, with overwrite control.

- **Blacklist highlighting**
  - Uses a mapped “blacklist” boolean column and highlights entire rows (pink/white) across used columns.
  - Blacklist also influences order validation warnings when sending.

- **Stats**
  - Buckets shipments by status (delivered, returned, failed, in transit) using multilingual patterns.
  - Produces per‑carrier and per‑product metrics inside the sheet.

- **License and settings**
  - Talks to the backend to start trial or activate a license code.
  - Caches license status + JWT with automatic refresh when a token expires.
  - Stores per‑user carrier credentials and business settings (sender info, parcel size, etc.).

The add-on is written in **plain Apps Script (V8)** and HTML/JS templates. Shared logic (e.g. mapping normalization) is centralized in helpers like `SetupApi.gs` and `PropertiesStorage.gs`.

### 2. Backend API (`backend`)

Node.js + Fastify service responsible for persistence, security, and business rules:

- **License and trial management**
  - HMAC-based client identity hashing (email + pepper) stored in Postgres.
  - Trial creation, expiration logic, and status normalization.
  - License codes activation, subscription end dates, and status computation.
  - Issues signed JWT access tokens for shipment routes.

- **Shipments module**
  - Exposes `/v1/shipments/send` and `/v1/shipments/tracking` routes.
  - Enforces daily trial quotas using a robust counter (Postgres with in-memory fallback).
  - Delegates actual carrier work to `CarrierAdapter` implementations from `@delivery-tool/carriers`.

- **Admin module**
  - `/admin/*` routes protected by an admin secret header.
  - License code issuance, extension, revocation, and reporting.

- **Geo + health**
  - `/v1/geo/communes` for wilaya/commune lists used by the add-on dropdowns.
  - `/health` liveness endpoint.

Environment configuration is defined in `backend/src/config/env.ts` and validated on startup (required secrets, database URL, etc.).

### 3. Carrier adapters (`packages/carriers`)

Defines a simple interface:

- `createShipment(order, credentials)`
- `getTracking({ externalShipmentId, trackingNumber }, credentials)`

Concrete adapters (e.g. Yalidine, ZR) live in subfolders. Yalidine is still stubbed, while ZR has live HTTP integration paths. Wiring/expanding carriers happens entirely inside this package and the backend’s shipments service, leaving the add-on contract unchanged.

### 4. Admin dashboard (`apps/admin-dashboard`)

Lightweight TypeScript SPA (Vite) used by internal operators/owners:

- Enter admin secret once (stored in `sessionStorage`).
- Issue license codes bound to an email.
- List / search clients and their license status.
- Extend or revoke licenses.
- View summary stats of active / expired / trial clients.

It talks only to the backend’s `/admin/*` endpoints.

---

## Getting started (development)

### Prerequisites

- Node.js `20.x` (see `.nvmrc`).
- npm (bundled with Node).
- Docker (optional, for running Postgres + backend quickly).
- Access to a Google Workspace account to deploy / test the add-on.

### Install dependencies

From the repository root:

```bash
npm install
```

This uses npm workspaces to install all package dependencies (`shared`, `carriers`, `backend`, apps, etc.).

### Run the backend locally

With Docker (recommended):

```bash
cd infrastructure/docker
docker compose up --build
```

This will:

- Start a PostgreSQL instance.
- Build and start the backend service with environment variables defined in the Compose file.
- Load variables from the repository root `.env` (mounted via `env_file: ../../.env`).

Without Docker, define the backend variables once in the repository root `.env`, then run:

```bash
npm run dev:backend
```

The backend now loads `./.env` from the repository root automatically on startup.

### Run the admin dashboard (dev)

```bash
cd apps/admin-dashboard
npm run dev
```

The Vite dev server proxies `/admin/*` requests to the local backend, as configured in `vite.config.ts`.

### Develop the Sheets add-on

The add-on lives in `apps/sheets-addon` and is deployed via **Apps Script / clasp** or directly through the Apps Script editor:

- `src/server/*.gs`: server-side Apps Script (business logic).
- `src/ui/*.html`: sidebar and dialogs (HTML templates + client JS).

Typical workflow:

1. Open the Apps Script project that corresponds to this folder.
2. Copy or sync the `.gs` and `.html` files from this repo into the project.
3. Configure the backend URL and API key (see below).
4. Open a spreadsheet, install the add-on, and interact with the custom menu + sidebar.

---

## Configuration

### Backend configuration

Key environment variables (see `backend/src/config/env.ts` and `infrastructure/docker/docker-compose.yml`):

- `DATABASE_URL`: Postgres connection string.
- `API_KEY`: API key required by the add-on (`X-API-Key` header).
- `ADMIN_SECRET`: secret header for admin dashboard (`X-Admin-Secret`).
- `JWT_SECRET`: preferred symmetric key for signing shipment access tokens.
- `LICENSE_SIGNING_SECRET`: legacy alias still supported for compatibility.
- `LICENSE_PEPPER`: HMAC pepper for hashing client identities.
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: local Docker Compose Postgres settings.

Additional configuration (e.g. ports) is handled by Fastify and Docker.

### Add-on configuration

The add-on is configured primarily through:

- **Script properties**:
  - `dt.api.baseUrl`: default backend base URL, if not set per-user.
  - `dt.whatsapp.link`: contact link shown in license card.
- **User properties**:
  - User-specific API key.
  - Carrier credentials (per carrier).
  - Business settings (sender name, address, parcel dimensions, etc.).
- **Document properties**:
  - Per-sheet column mappings.
  - Fee rules, sync metadata, ops log, etc.

License flows use `/v1/license/status` and `/v1/license/activate` endpoints; successful responses store a JWT in the user’s storage and keep a small cache of license state for sidebar rendering.

---

## Data model and licensing

### Core entities

- **InternalOrder**: normalized view of a row in the sheet, including customer info, product, price, COD amount, delivery type, wilaya/commune, blacklist flags, and metadata.
- **SavedSheetMapping**: configuration mapping between sheet columns and internal fields, including header row and default carrier.
- **FeeRulesBlob**: per-carrier, per‑wilaya fee configuration persisted in JSON.
- **LicenseRecord**: trial/subscription state for a client, stored in Postgres and surfaced to the add-on.

All TypeScript types are defined in `shared/` and consumed by the backend; the Apps Script side mirrors them via JSDoc for consistency.

### License lifecycle

1. **Trial**: when the sidebar opens, the add-on calls `/v1/license/status` with the user’s email. The backend either returns an existing license or creates a trial record.
2. **Activation**: admin issues a WhatsApp code via the dashboard. User enters those into the sidebar, which calls `/v1/license/activate`. The backend validates code + email and upgrades the license.
3. **Access token**: the backend issues a JWT (shipment access token) that the add-on sends on shipment routes (`X-DT-Access-Token`). The add-on proactively refreshes this token when it detects expiry.
4. **Gates**: high-impact actions (`send`, `sync`, fees, blacklist highlighting) call `license_assertOperationsAllowed_()` before touching data.

---

## Testing and quality

### Backend tests

The backend and carrier package include unit tests (Node’s `test` module + `assert/strict`) for:

- License resolution and expiry normalization.
- Access token generation and verification.
- Carrier adapter stub behavior.

Run from the repository root or from each package:

```bash
cd backend
npm test

cd ../packages/carriers
npm test
```

### Manual verification checklist

When validating a deployment or a new environment, verify:

- License trial start and activation flows work from the sidebar.
- Column mapping is saved and reused across send/sync/stats/fees.
- Fees and blacklist operations are blocked when the license is expired.
- Auto-sync trigger correctly updates tracking statuses on all mapped sheets.
- Admin dashboard can issue, extend, and revoke licenses and reports accurate stats.

---

## Security and privacy

- All API access from the add-on uses an **API key** and, for shipment routes, a **short-lived JWT**.
- Client identities (emails) are stored hashed with HMAC + pepper in the backend.
- Carrier credentials and business settings are stored in Google **UserProperties**, never in sheet cells.
- Secrets are never committed to the repository; use environment variables and Script Properties instead.

---

## Status of carrier integrations

Carrier support is mixed:

- `YalidineAdapter` is still stubbed and returns structured “not implemented” errors.
- `ZrAdapter` contains live HTTP integration paths (territories, bulk parcel creation, tracking search).

To wire real carriers, implement HTTP calls inside the adapter implementations, leaving the add-on contract untouched.

