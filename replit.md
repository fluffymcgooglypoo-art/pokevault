# PokeVault

A desktop-first Pokémon card inventory and NFC management web app for serious traders. Track your collection, program NFC tags, monitor market prices, and power OBS stream overlays — all from one fast operations console.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/pokevault run dev` — run the frontend (port 18666)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Wouter + TanStack Query + shadcn/ui
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Short codes: nanoid
- Desktop: Electron 36 + nfc-pcsc (PC/SC, no driver swap needed)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod validation schemas
- `lib/db/src/schema/` — Drizzle table definitions
  - `cards.ts` — card inventory table
  - `nfc_tags.ts` — NFC tag registrations
  - `price_history.ts` — price tracking over time
  - `activity_log.ts` — recent activity feed
- `artifacts/api-server/src/routes/` — Express route handlers
  - `cards.ts` — CRUD, mark-sold
  - `nfc.ts` — URL byte check, tag registration, short link resolution
  - `prices.ts` — price history per card
  - `overlay.ts` — OBS overlay data endpoint
  - `dashboard.ts` — summary, recent activity, top cards
- `artifacts/pokevault/src/` — React frontend
- `artifacts/desktop/` — Electron main process, preload, nfc-pcsc integration

## Architecture decisions

- NTAG213 usable limit set at 137 bytes (7-byte NDEF URI header overhead from 144 total)
- Short codes generated with nanoid(8) — stored on both `cards` and `nfc_tags` tables
- Profit/loss computed server-side: unrealized uses marketValue, realized uses soldPrice
- OBS overlay route (`/overlay/:shortCode`) has transparent background, no app chrome — designed as a browser source
- NFC: WebUSB (ACR122U) in browser; nfc-pcsc (PC/SC) in Electron — `use-acr122u.ts` auto-selects based on `window.electronApi.isElectron`
- Electron API port: 8082 (avoids clash with Replit dev workflow port 8080)
- In Electron dev the main window loads from the Vite dev server; `preload.ts` sets `apiBaseUrl` so `setBaseUrl()` in `main.tsx` routes all `/api/…` fetches to `localhost:8082`
- In Electron production the Express server also serves the built React static files (`ELECTRON=1`, `RENDERER_PATH=…`)

## Product

- **Dashboard** — portfolio P&L, total invested vs. market value, realized gains, NFC tag count, recent activity feed, top cards by market value
- **Inventory** — searchable/filterable card list; card detail with price history chart, condition, NFC status, and action buttons
- **NFC Workflow** — step-by-step: select card → paste URL → byte limit check → generate short link → write to tag via Web NFC
- **OBS Overlay** — `/overlay/:shortCode` — transparent browser source showing card name, condition, market price, P&L; polls every 10 seconds
- **Settings** — placeholder for future configuration

## User preferences

- Desktop-first, no mobile requirement for v1
- Clean business style, fast workflow focused
- Not dependent on Google Sheets

## Electron Desktop App

### Development workflow (local machine, not Replit)

Prerequisites: Node.js 18+, pnpm, PostgreSQL running with `DATABASE_URL` set.

```bash
# 1 — Install everything
pnpm install

# 2 — Build the API server (only needed once, or after API changes)
pnpm --filter @workspace/api-server run build

# 3 — In one terminal: start the API server on port 8082
PORT=8082 DATABASE_URL=<your-db-url> pnpm --filter @workspace/api-server run start

# 4 — In another terminal: start the Vite dev server
pnpm --filter @workspace/pokevault run dev

# 5 — In a third terminal: build + launch Electron
pnpm --filter @workspace/desktop run dev
```

The Electron window will open pointing to the Vite dev server. NFC reads/writes use
the system PC/SC stack (no Zadig or driver swap required).

### Production build (Windows installer)

```bash
# Build everything
pnpm --filter @workspace/api-server run build
BASE_PATH=/ pnpm --filter @workspace/pokevault run build
pnpm --filter @workspace/desktop run dist
```

The `.exe` installer lands in `artifacts/desktop/release/`.  The packaged app
bundles the built API server and renderer as resources and spawns the API server
on startup.  Node.js must be installed on the target machine (or bundle it via
`extraResources` in `electron-builder.yml`).

### NFC in Electron vs browser

| | Browser (WebUSB) | Electron (PC/SC) |
|---|---|---|
| Driver | Requires Zadig/WinUSB swap | Uses existing Windows Smart Card stack |
| Auto-detect | Manual "Connect Reader" click | Automatic on plug-in |
| Library | Built-in WebUSB hook | `nfc-pcsc` via `ipcMain` |
| Hook | `use-acr122u.ts` (WebUSB path) | `use-acr122u.ts` (Electron IPC path) |

## Gotchas

- Always run codegen after editing `openapi.yaml`: `pnpm --filter @workspace/api-spec run codegen`
- Never call `pnpm dev` at workspace root — use workflows or `--filter` commands
- The `nanoid` dependency is in `artifacts/api-server/` — must be a `dependencies` entry (not devDependencies)
- Overlay page must keep `body { background: transparent }` for OBS chroma key / browser source use
- `artifacts/desktop` is not a Replit web artifact — it has no preview path. Build and run it locally.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
