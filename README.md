# ShopNest

A production-grade TypeScript e-commerce platform built with NestJS, Next.js 15, PostgreSQL, and Prisma. Demonstrates senior-level engineering decisions: concurrency-safe checkout, refresh token rotation with theft detection, full-text search, and a clean domain model.

## Tech Stack

| Layer | Technology |
|---|---|
| API | NestJS 11 (Express adapter), Prisma 6, PostgreSQL 17 |
| Frontend | Next.js 15 (App Router, Server Components) |
| Auth | Argon2id passwords, SHA-256 refresh tokens, JWT access tokens |
| State | Zustand (user identity only), TanStack Query (server data) |
| Monorepo | Turborepo + pnpm workspaces |
| CI | GitHub Actions (audit, type-check, lint, test, build) |
| Deployment | Railway (separate services for API and web) |

## Getting Started

**Prerequisites:** Node 22+, pnpm 10+, PostgreSQL 17

```bash
git clone https://github.com/engmaryamameen/ShopNest
cd ShopNest
pnpm install

# API
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your DATABASE_URL and JWT secrets

# Web
cp apps/web/.env.example apps/web/.env.local

# Run migrations
cd apps/api && pnpm exec prisma migrate dev --name init
pnpm exec ts-node prisma/seed.ts   # creates admin + sample data

# Start dev servers
cd ../..
pnpm dev
```

- API: http://localhost:3001
- Web: http://localhost:3000
- Swagger: http://localhost:3001/api

## Docker

```bash
# Requires JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in environment
JWT_ACCESS_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(64).toString('hex'))") \
JWT_REFRESH_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(64).toString('hex'))") \
docker compose up --build
```

## Project Structure

```
apps/
  api/         NestJS REST API
    prisma/    Schema, migrations, seed
    src/
      auth/    Registration, login, refresh, logout, logout-all
      catalog/ Categories, products, full-text search
      cart/    Persistent cart with row-level locking
      orders/  Atomic checkout, state machine, cancellation
      common/  Guards, filters, interceptors, decorators
  web/         Next.js 15 frontend
    src/
      app/     App Router pages (shop, cart, orders, admin)
      components/
      lib/     API client, return-to validation
      store/   Zustand user identity store
packages/
  api-client/  Shared OpenAPI-generated TypeScript types
```

## Key Engineering Decisions

See [DECISIONS.md](./DECISIONS.md) for the full rationale.

- **SHA-256 for refresh token lookup** (not Argon2id — random salts make lookup impossible)
- **Token family model** for instant revocation without a token blacklist
- **30-second grace period** on refresh to handle concurrent browser tabs without false theft signals
- **Discriminated union return type** from refresh transaction so revocation commits before throw
- **Cart row lock** as single serialization point for all cart mutations and checkout
- **Idempotency key rechecked inside transaction** after acquiring cart lock
- **`Prisma.join()` with `IN (...)` and `ORDER BY id`** for deterministic product row lock order
- **`OriginGuard` via `APP_GUARD`** for CSRF protection (not CORS, which is not CSRF protection)
- **Integer cents** throughout (`priceCents`, `totalCents`, `unitPriceCents`) — Stripe-compatible, no float drift
- **Price/name/slug snapshots** on `OrderItem` so historical orders survive product edits

## Running Tests

```bash
# All tests
pnpm test

# API unit tests with coverage
pnpm --filter @shopnest/api test:cov

# Web unit tests
pnpm --filter @shopnest/web test

# E2E (requires running dev servers)
pnpm --filter @shopnest/web test:e2e
```

## License

MIT — see [LICENSE](./LICENSE)
