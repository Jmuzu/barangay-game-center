# Barangay Game Center

A React (Next.js) prototype for the Brgy Game Center player home experience with a local SQLite persistence route.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Redux Toolkit for shared client state
- SQLite persistence through the Next.js `/api/state` route
- Jest + React Testing Library for unit/component tests

This is a separate, standalone project from `codes/react/online-fruit-game`. The fruit game is treated
as an integrated external game and is linked to, not embedded or merged into, this codebase.

## Getting Started

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3100` by default (kept distinct from `online-fruit-game`, which runs on
`http://localhost:3000`). Run the fruit game separately with its own `npm run dev` if you want the "Play"
launch link to resolve.

## Scripts

- `npm run dev` – start the dev server on port 3100 using Webpack for native SQLite compatibility on Windows.
- `npm run build` – production build.
- `npm run test` – run unit and component tests once.
- `npm run test:watch` – run tests in watch mode.
- `npm run lint` – lint the project.

## Barangay Platform SSO

Game Center is a child app: direct page access and first-party APIs require a valid Barangay Platform session. Configure the same random secret of at least 32 bytes as `GAME_CENTER_SSO_SECRET` in ignored `.env.local` files in both apps. Also set `GAME_CENTER_URL=http://localhost:3100` in Barangay Platform and `BARANGAY_PLATFORM_URL=http://localhost:3000` here. Example variable names are in `.env.example` in each app.

The parent server issues a single-use 60-second signed launch token and posts it to Game Center; the token is not placed in the URL. Game Center revalidates the parent session, sets its HttpOnly child cookie, and provisions a zero-balance player keyed by the parent user ID. Residents map to Game Center Player; parent Admin and SuperAdmin both map to Game Center SuperAdmin and receive the same access. The child session is revalidated against the parent on each request. The header's "Back to Barangay Platform" link returns residents to `/dashboard`, admins to `/admin`, and superadmins to `/superadmin`, using `BARANGAY_PLATFORM_URL`. If a child session is missing or stale, sign in again through Barangay Platform's Game Center sidebar link.

## Data and Persistence

- The SQL seed under `src/@code/database/seed.sql` initializes the SQLite database on first run, including the game catalog.
- Runtime state is stored in `src/@code/database/game-center.sqlite` in the `app_state` table.
- The browser hydrates through `GET /api/state`; Redux remains the UI state cache.
- `PUT /api/state` persists client changes and `DELETE /api/state` resets SQLite from the seed data.
- The database file is ignored by Git and must be backed up or migrated separately for deployment.

## PayMongo Sandbox

The wallet top-up demo is test-mode only. It accepts only a PayMongo `sk_test_` key, is disabled in production, and does not add coins from a browser redirect. Coins are credited only after a valid test-mode `checkout_session.payment.paid` webhook.

Configure these local environment variables in the development environment (never commit their values):

Start from `.env.example` and keep the actual values in an ignored local `.env.local` file.

```text
PAYMONGO_SECRET_KEY=sk_test_...
PAYMONGO_TEST_WEBHOOK_SECRET=...
PAYMONGO_PAYMENT_METHOD_TYPES=gcash
GAME_CENTER_BASE_URL=https://your-public-test-tunnel.example
```

`PAYMONGO_PAYMENT_METHOD_TYPES` is optional and defaults to `gcash`. To offer additional methods, use a comma-separated list of methods enabled for the PayMongo account. This demo accepts `gcash`, `paymaya`, `grab_pay`, and `shopeepay`; PayMongo can still reject methods that are not enabled or supported for the account's Checkout flow.

Register a PayMongo **test-mode** webhook at `https://your-public-test-tunnel.example/api/payments/webhook` for `checkout_session.payment.paid`, and copy its endpoint secret to `PAYMONGO_TEST_WEBHOOK_SECRET`. PayMongo requires a publicly reachable endpoint for webhook delivery; a local HTTPS tunnel can be used for the demo. Restart Next.js after setting variables. Open `/wallet/top-up`, complete a test e-wallet authorization, and wait for the webhook-confirmed status. The seeded demo profile is the only credited player in this prototype.

While a purchase is pending, the status endpoint also checks its stored Checkout Session against PayMongo test mode. This recovers paid sessions if webhook delivery was missed; the browser return itself never grants coins.

The package IDs, PHP amounts, and coin quantities are server-owned in `src/@shared/utils/coinPackages.ts`; checkout accepts only the package ID and grants exactly 1 coin per ₱1. On first database initialization after this rule, a one-time migration corrects previous sandbox package grants with compensating ledger entries and syncs the seeded player's admin coin balance. This sandbox integration is not a production payment system and has no live-key support, real-money balance isolation, refunds, withdrawals, or cash-out.

## Architecture

```text
src/
  @shared/        # framework-agnostic reusable code (components, types, enums, utils, helpers, interfaces)
  @code/          # cross-cutting app infrastructure (state, routers, components)
  screens/        # page-level components and their page-relative subcomponents
  app/            # Next.js App Router route files (thin, delegate to screens/*)
  @code/database/ # SQLite adapter and SQL seed
```

`http` and `interceptors` folders under `@code` remain intentionally omitted in this prototype. The
SQLite state route is the current local persistence boundary; authentication and production authorization
are still not implemented.

**Naming deviation:** the workspace architecture instructions call this folder `pages`. In a Next.js App
Router project, a literal `pages/` (or `src/pages/`) directory is auto-detected by Next's Pages Router and
conflicts with `app/` routes of the same name (confirmed via a failed build in this project). This folder
is named `screens` instead, aliased as `@screens/*`, to keep the same "page components + page-relative
subcomponents" responsibility without triggering that collision.
