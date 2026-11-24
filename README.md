# ShopNest

Catalog imports are disabled while ownership and overwrite safeguards are incomplete. Existing import history remains available, and queued runs are not processed. The worker and scheduler are off by default. Import execution can only be enabled in an isolated test process using `NODE_ENV=test` and `CATALOG_IMPORT_TEST_ENABLED=true`; this is not a production import feature.

## Fictional demo catalog

For an isolated development installation, set `NODE_ENV=development` and `DEMO_CATALOG_ENABLED=true` in both API and web processes, then sign in as an existing platform administrator and open **Demo data** in the admin navigation. The action creates two fictional sellers and two fictional products; payments and orders are simulated. It creates no login accounts, does not alter roles, and does not reset previously added stock. A repeated request reports that the fixture was already applied. If a fixture name collides with existing data, the operation fails and rolls back; inspect the collision before retrying. The action is unavailable in production.

To exercise vendor access, register a separate test user, apply to sell, and approve that application as an administrator. The fictional sellers created by the demo action do not have login accounts.

A TypeScript marketplace built with NestJS, Next.js, PostgreSQL, and Prisma. Customers can place simulated orders, vendors manage offers, and administrators oversee the catalog and orders. See the limitations below before deploying.

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
cd apps/api && pnpm exec prisma migrate deploy
cd ../..
# Only run the seed against a disposable development database.
pnpm --filter @shopnest/api db:seed

# Start dev servers
pnpm dev
```

- API: http://localhost:3001
- Web: http://localhost:3000
- Swagger: http://localhost:3001/api

Before migrating an existing database, review [migration 0016 recovery](docs/migrations/0016-recovery.md). Do not reset a database to resolve migration errors.

### Demo accounts

The seed script can promote an existing user to administrator and uses predictable default passwords. Run it only against a disposable local database, never against production or a shared database.


`db:seed` prints the full list on every run. All seeded accounts (other than the admin) share one
password, overridable via `DEMO_PASSWORD`:

| Account | Email | Role |
|---|---|---|
| Admin | `admin@shopnest.dev` | `SUPER_ADMIN` |
| Customer | `customer@shopnest.dev` | Has 2 delivered orders and 2 reviews already on them |
| Acme Outdoor Co. (owner) | `owner@acme-outdoor.example` | Vendor owner |
| Acme Outdoor Co. (staff) | `staff@acme-outdoor.example` | Vendor staff — demonstrates the invite/role split |
| Urban Threads (owner) | `owner@urbanthreads.example` | Vendor owner |
| TechHub Direct (owner) | `owner@techhubdirect.example` | Vendor owner |

Passwords: admin's is `Admin@ShopNest2025!` (override with `ADMIN_PASSWORD`); everyone else's is
`Demo@ShopNest2025!` (override with `DEMO_PASSWORD`).

For Google sign-in configuration and account-linking behavior, see [Google sign-in](docs/google-sign-in.md).

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
      auth/       Registration, login, refresh, logout, logout-all
      catalog/    Categories, brands, products, variants, full-text search
      cart/       Persistent cart with row-level locking, promo codes
      orders/     Multi-vendor checkout, state machine, cancellation
      vendor/     Onboarding, offers, staff, vendor-scoped orders/promotions/returns
      admin/      Dashboard, audit log, admin accounts
      reviews/    Structurally verified-purchase reviews + moderation
      returns/    Return requests, inventory restoration, refunds
      promotions/ Platform- and vendor-scope discount codes
      payment/    Payment provider boundary (mock adapter)
      media/      Media storage boundary (local adapter)
      common/     Guards, filters, interceptors, decorators
  web/         Next.js 15 frontend
    src/
      app/        App Router pages (shop, cart, orders, vendor, admin)
      components/
      lib/        API client, return-to validation
      store/      Zustand user identity store
packages/
  api-client/  Shared OpenAPI-generated TypeScript types
docs/
  operations.md               Backup/restore, security headers, monitoring
  catalog-background-sync.md  Import worker/scheduler runtime flow
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
- **`Review.orderItemId` is `NOT NULL` and `@unique`** — a review structurally cannot exist without a real, delivered order item behind it
- **Payment and media storage as real interfaces**, each with one local/mock adapter — no gateway or bucket credentials in this environment, but nothing half-built waiting on them
- **Promotion row locked at checkout**, re-validated under that lock — the same "recheck under lock" discipline as the idempotency-key check, closing the redemption-race window

See [docs/operations.md](./docs/operations.md) for backup/restore, security headers, and monitoring.

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
