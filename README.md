# Barangay Game Center

A React (Next.js) application for the Brgy Game Center player experience, backed by the standalone NestJS API and SQL Server.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Redux Toolkit for shared client state
- Prisma/SQL Server persistence through `codes/nestjs/barangay-game-center-api`
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

- `npm run dev` – start the frontend on port 3100.
- `npm run build` – production build.
- `npm run test` – run unit and component tests once.
- `npm run test:watch` – run tests in watch mode.
- `npm run lint` – lint the project.

## Barangay Platform SSO

Game Center is a child app: direct page access and first-party APIs require a valid Barangay Platform session. Configure the same random secret of at least 32 bytes as `GAME_CENTER_SSO_SECRET` in ignored `.env.local` files in both apps. Also set `GAME_CENTER_URL=http://localhost:3100` in Barangay Platform and `BARANGAY_PLATFORM_URL=http://localhost:3000` here. Example variable names are in `.env.example` in each app.

The parent server issues a single-use 60-second signed launch token and posts it to Game Center; the token is not placed in the URL. The Next server exchanges the token with the Nest API, which verifies the signature, revalidates the parent session, consumes the one-use launch, and provisions a zero-balance player keyed by the parent user ID. The Next server sets the returned child token in an HttpOnly cookie and forwards it as a Bearer token only in server-to-server API requests. Residents map to Game Center Player; parent Admin and SuperAdmin both map to Game Center SuperAdmin. Set `GAME_CENTER_API_URL` to the Nest API address (default local development: `http://localhost:3200`).

## Data and Persistence

- The UI calls same-origin Next route adapters; those adapters forward requests to the Nest API and attach the HttpOnly child-session token as Bearer auth server-side.
- Nest stores player state, mission catalog, transfers, game registrations, provider transactions, launch replays, and test purchases in SQL Server through Prisma.
- `GET/PUT/DELETE /api/state` manage the current player's state. Wallet, mission, game-play, integration, and payment mutations are handled by dedicated API operations and are not accepted from arbitrary Redux snapshots.
- Legacy SQLite files are no longer runtime dependencies. Retain the existing local database as the migration source and rollback backup until `npm run db:import-sqlite` completes and record counts/balances are verified.
- Set the backend's `DATABASE_URL`, shared `GAME_CENTER_SSO_SECRET`, `BARANGAY_PLATFORM_URL`, and API-owned PayMongo test configuration in its ignored `.env` file.

## PayMongo Sandbox

The wallet top-up demo is test-mode only. It accepts only a PayMongo `sk_test_` key, is disabled in production, and does not add coins from a browser redirect. Coins are credited only after a valid test-mode `checkout_session.payment.paid` webhook.

Configure PayMongo test variables in the Nest API environment (never commit their values):

Start from `codes/nestjs/barangay-game-center-api/.env.example` and keep the actual values in its ignored local `.env` file.

```text
PAYMONGO_SECRET_KEY=sk_test_...
PAYMONGO_TEST_WEBHOOK_SECRET=...
PAYMONGO_PAYMENT_METHOD_TYPES=gcash
GAME_CENTER_BASE_URL=https://your-public-test-tunnel.example
```

`PAYMONGO_PAYMENT_METHOD_TYPES` is optional and defaults to `gcash`. To offer additional methods, use a comma-separated list of methods enabled for the PayMongo account. This demo accepts `gcash`, `paymaya`, `grab_pay`, and `shopeepay`; PayMongo can still reject methods that are not enabled or supported for the account's Checkout flow.

Register a PayMongo **test-mode** webhook at `https://your-public-test-tunnel.example/api/payments/webhook` for `checkout_session.payment.paid`, and copy its endpoint secret to the API's `PAYMONGO_TEST_WEBHOOK_SECRET`. PayMongo requires a publicly reachable endpoint for webhook delivery; a local HTTPS tunnel can be used for the demo. Start the API and frontend, open `/wallet/top-up`, complete a test e-wallet authorization, and wait for webhook-confirmed status.

While a purchase is pending, the status endpoint also checks its stored Checkout Session against PayMongo test mode. This recovers paid sessions if webhook delivery was missed; the browser return itself never grants coins.

The API validates package IDs and amounts server-side and grants exactly 1 coin per ₱1. The sandbox integration is not a production payment system and has no live-key support, real-money balance isolation, refunds, withdrawals, or cash-out.

## Architecture

```text
src/
  @shared/        # framework-agnostic reusable code (components, types, enums, utils, helpers, interfaces)
  @code/          # cross-cutting app infrastructure (state, routers, components)
  screens/        # page-level components and their page-relative subcomponents
  app/            # Next.js App Router route files (thin, delegate to screens/*)
  @code/api/      # server-only authenticated proxy to Nest
```

The Next handlers remain thin transport adapters; authentication, authorization, persistence, and wallet mutations are enforced in the Nest API.

**Naming deviation:** the workspace architecture instructions call this folder `pages`. In a Next.js App
Router project, a literal `pages/` (or `src/pages/`) directory is auto-detected by Next's Pages Router and
conflicts with `app/` routes of the same name (confirmed via a failed build in this project). This folder
is named `screens` instead, aliased as `@screens/*`, to keep the same "page components + page-relative
subcomponents" responsibility without triggering that collision.
