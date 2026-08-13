# Architecture Decision Records

Engineering choices made during the ShopNest rebuild, with rationale.

## Authentication

### SHA-256 for refresh token hashing (not Argon2id)

Argon2id uses a random salt, so two hashes of the same input produce different outputs. This makes database lookup impossible: `WHERE tokenHash = argon2.hash(received)` would never match the stored hash.

Refresh tokens are 64 random bytes (512 bits of entropy). SHA-256 is appropriate here because we are not protecting a low-entropy secret like a password — we are providing a deterministic lookup key for an already-high-entropy value. The security guarantee comes from the token's entropy, not the hash function's resistance to brute force.

### Token family model for revocation

Each login creates a `RefreshTokenFamily`. Every access JWT embeds the `familyId`. `JwtAccessStrategy` checks `RefreshTokenFamily.isRevoked` on every authenticated request.

This provides instant revocation (`logout-all` marks all families as revoked; the next access token attempt fails immediately) without a token blacklist or short access token lifetimes as the sole protection.

### 30-second grace period on token rotation

When a refresh token is marked `isUsed=true`, we record `usedAt`. If the same token arrives again within 30 seconds, we return `recently-rotated` rather than treating it as theft. This handles the real-world case where the same user opens two tabs simultaneously and both attempt a refresh at the same time.

If the token arrives after the grace period, we revoke the entire family (theft signal) before throwing. The revocation commits in the same transaction — never rolled back by the throw.

### Discriminated union return from refresh transaction

Throwing inside a Prisma transaction causes rollback. If we threw after revoking a family, the revocation would roll back. The fix: return a typed discriminated union (`RefreshOutcome`) from the transaction, let it commit, then throw based on the kind outside.

## Checkout Concurrency

### Cart row lock as serialization point

All cart mutations (add, update, remove, clear) and checkout lock the `Cart` row first inside a transaction (`SELECT ... FOR UPDATE`). This serializes all operations per user: two concurrent checkouts cannot both succeed; a checkout and a cart modification cannot interleave.

### Idempotency key rechecked inside transaction

The pre-transaction check is a performance optimization, not a correctness guarantee. Two concurrent requests with the same key can both miss the outside check. After acquiring the cart lock inside the transaction, we recheck. The second request to acquire the lock sees the committed order and returns it.

### `Prisma.join()` with `ORDER BY id` for product locks

Locking multiple rows in different orders across concurrent transactions causes deadlocks. The `ORDER BY id` clause in the product lock query ensures all transactions acquire locks in the same deterministic order, preventing deadlocks regardless of the order items appear in the cart.

### Conditional `UPDATE WHERE stockQuantity >= quantity`

After validating stock at the application level, we do a conditional SQL UPDATE that also checks the constraint. If another transaction decremented stock between our read and write, the `$executeRaw` returns 0 affected rows, and we throw a ConflictException. The client retries with the same idempotency key.

### P2034 → 409, client retries

Prisma P2034 signals a transaction conflict (PostgreSQL `40001` serialization failure). We return HTTP 409 with a stable error code. The client retries with the same idempotency key — no server-side retry needed.

## Order State Machine

Transitions:

- `PENDING → CONFIRMED` (admin only)
- `PENDING → CANCELLED` (customer or admin)
- `CONFIRMED → SHIPPED` (admin only)
- `CONFIRMED → CANCELLED` (admin only — customer cannot cancel once confirmed)
- `SHIPPED → DELIVERED` (admin only)
- `DELIVERED`, `CANCELLED` are terminal

Inventory is restored inside the cancellation transaction under the order row lock, ensuring exactly-once restoration regardless of concurrent cancellation attempts.

## Security

### OriginGuard is the CSRF protection mechanism

CORS is not CSRF protection. A cross-origin form POST with `application/x-www-form-urlencoded` sends cookies and bypasses CORS entirely. `OriginGuard`, registered globally via `APP_GUARD`, validates the `Origin` header on all unsafe HTTP methods (POST, PUT, PATCH, DELETE). The Next.js server explicitly sets `Origin: WEB_URL` on server-to-server calls.

### Cookie attributes

Both `access_token` and `refresh_token`:
- `HttpOnly: true` — not accessible to JavaScript
- `SameSite: Lax` — sent on same-site requests and top-level navigation; Strict would break email links
- `Path: /` — needed for middleware, logout, refresh, and all other auth endpoints
- `Domain: NOT SET` — host-only; more restrictive than setting a domain
- `Secure: true` in production

### Pino redaction

`req.headers.cookie`, `req.headers.authorization`, `req.body.password`, `req.body.passwordHash`, `req.body.refreshToken`, and `res.headers["set-cookie"]` are redacted to `[REDACTED]` in all log output.

### Admin creation

Admins are created via seed script or CLI only — never through an HTTP endpoint. There is no admin registration route.

### Rate limiting via `@nestjs/throttler`

A global `ThrottlerGuard` (registered first in the `APP_GUARD` chain, before `OptionalJwtAuthGuard`) applies a per-IP default limit (`app.throttleLimit`/`app.throttleTtlMs`, env-configurable) to every route. `register`, `login`, and `refresh` — the credential-guessing and account-enumeration surface — additionally carry a stricter static `@Throttle()` override on the route itself; `/health` is exempt (`@SkipThrottle()`) so orchestrator liveness/readiness probes are never rate-limited. Per-route throttle values are static (decorator arguments are evaluated at class-definition time, before dependency injection provides `ConfigService` to an instance) — only the module-wide default is env-driven.

### Environment validation fails fast at boot

`ConfigModule.forRoot({ validate })` (`config/env.validation.ts`) validates `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `NODE_ENV`/`PORT` with `class-validator` before the application finishes bootstrapping — a missing or malformed secret now throws immediately with every problem listed at once, instead of the previous behavior (secrets silently defaulting to `''`, only surfacing as a runtime failure the first time something tried to sign a JWT). Operational tuning knobs (timeouts, poll intervals, feature flags) keep their `??` defaults in `app.config.ts` unvalidated — enforcing every tunable would be enforcement theater, not safety.

## Testing

### The concurrency integration suite boots the real app in-process

`test/concurrency.integration.spec.ts` previously required a separately-running server (`http://localhost:13001`) and shelled out to `docker exec shopnest-db-1 psql ...` for direct-SQL test setup (backdating a token's `usedAt`, promoting a user to admin) — a hard dependency on a specific container name and the dev database, and consequently never run in CI. `createApp()` (`src/main.ts`) was factored out of `bootstrap()` so the test suite can build the exact same, fully-configured Nest application (same pipes, filters, interceptors, CORS) and `app.listen(0)` on an ephemeral port itself; direct-SQL setup goes through `PrismaClient` (`$executeRaw` tagged templates, parameterized) instead of a shell-out. The suite now runs against whatever `DATABASE_URL` is configured — the CI `api` job's Postgres service container, or a local Postgres for `pnpm test:e2e` — and is wired into `.github/workflows/ci.yml` as a real CI step.

## Data Model

### Integer cents

All monetary values are stored as integer cents (`priceCents`, `totalCents`, `unitPriceCents`). This avoids floating-point arithmetic errors and is directly compatible with Stripe's API. The `currency` field is `"USD"` by default.

### Price snapshots on OrderItem

`OrderItem` stores `unitPriceCents`, `productName`, and `productSlug` at order creation time. Historical orders are unaffected by subsequent price or name changes on the `Product` record.

### Email normalization

Email is normalized (`trim().toLowerCase()`) at the application level in DTOs, and a PostgreSQL CHECK constraint (`email = LOWER(BTRIM(email))`) enforces the invariant at the database level. A standard `@unique` index covers lookups without schema drift from functional indexes.

### Full-text search

A generated `tsvector` column with weights (A for name, B for description) and a GIN index enables PostgreSQL full-text search. `ts_rank` orders results by relevance.

## Supplier Catalog Imports

### ShopNest owns the canonical catalog

The storefront reads only ShopNest's PostgreSQL catalog. DummyJSON is treated as an upstream supplier, never as a runtime dependency for customer requests. An upstream outage can prevent a new import but cannot take down product browsing, carts, or checkout.

### External identity is separate from product identity

`ProductSource` maps `(source, externalId)` to a canonical `Product`. This prevents supplier identifiers from becoming ShopNest primary keys and allows another supplier to be added without changing catalog ownership. Both `(source, externalId)` and `(productId, source)` are unique invariants.

### Checksums make repeated imports idempotent

Normalized supplier fields are hashed with SHA-256. If the checksum has not changed, the importer updates only `lastSeenAt`; it does not rewrite the product. Changed records update the existing canonical product, while unseen external identities create one product and one source mapping atomically.

### Import runs are auditable

Every attempt creates a `CatalogImportRun` with timestamps, final status, counts, and a bounded error message. A transaction-scoped PostgreSQL advisory lock rejects overlapping imports for the same source. The external HTTP request happens before the database transaction so slow supplier latency does not hold database locks.
