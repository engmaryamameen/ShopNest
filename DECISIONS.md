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

## Account Lifecycle (Phase 1)

### Mail provider is selected by env, same pattern as geocoding

`MailModule` picks `SmtpMailAdapter` vs. `LocalMailAdapter` based on `app.mailProvider`, mirroring `LocationModule`'s existing `GEOCODING_PROVIDER` factory. `LocalMailAdapter` logs the rendered email (link included) via Pino instead of sending it — every flow that depends on "receiving an email" (verification, password reset, later vendor staff invites) is fully functional and testable without real SMTP credentials configured.

### Verification/reset tokens are single-use and structurally separate from `User`

`EmailVerificationToken` and `PasswordResetToken` are their own tables (not columns on `User`), each with `tokenHash` (SHA-256 of a 64-random-byte raw token, same primitive as refresh tokens — `generateSecureToken()` in `token.util.ts`), `expiresAt`, and `consumedAt`. A token is marked consumed on its *first* use regardless of outcome — reusing the same verification link a second time correctly returns "invalid," not "already verified" (that outcome is reserved for a still-valid, different token used after the user was already verified by another one).

**Security properties, verified, not just asserted:**
- **Hashed at rest**: only `tokenHash` (SHA-256) is ever persisted — the raw token exists solely in the emailed link and the requester's memory of it. Confirmed by reading every write path (`createEmailVerificationToken`, `requestPasswordReset`) — neither ever calls `.create()` with a raw-token field.
- **Never returned by any API response**: `verifyEmail()`/`resetPassword()` return plain outcome strings (`'verified' | 'invalid' | 'expired' | ...`), never the token or its hash. Confirmed by reading every controller response shape in `auth.controller.ts`.
- **Excluded from request logs**: `nestjs-pino`'s default request serializer does not log request bodies at all (confirmed empirically — captured request logs during live testing show `headers`/`method`/`url`, no `body` key) — a `token`/`newPassword` field in a POST body is never written to the structured request log regardless of the Pino redaction list. The Pino redaction list itself (`app.module.ts`) still separately covers `req.body.password`/`req.headers.cookie`/etc. as defense-in-depth for any future logging that *does* include the body.
- **`LocalMailAdapter` intentionally logs the raw token** (that's the "email" content, for dev/test) — and is refused at boot in production (`env.validation.ts`: `MAIL_PROVIDER` must be `smtp` when `NODE_ENV=production`), so this can never leak into a real deployment's logs.
- **Single-use and expiring**: enforced in `verifyEmail()`/`resetPassword()` (checked directly, plus covered by unit tests for consumed/expired/unknown-token cases).
- **Reset invalidates every session**: `resetPassword()` revokes every `RefreshTokenFamily` for the user in the same transaction as the password change (verified by unit test and by live smoke test — see the Phase 1 checkpoint).
- **Account enumeration**: `forgot-password` and `resend-verification` respond identically (`204`, empty body) whether or not the email is registered — proven by a direct integration test (`test/concurrency.integration.spec.ts`, "Account enumeration prevention"), not just code inspection.
- **Rate limiting actually engages**: proven by a direct integration test that bursts 20 requests at `login` (15/min limit) and asserts at least one `429` — previously only inferred from the limit being configured, never exercised.

### Password reset revokes every session

`resetPassword()` updates the password hash, consumes the reset token, and revokes every `RefreshTokenFamily` for that user — all inside one transaction. A reset proves control of the account via email, but any device holding a session from before the reset (e.g. an attacker who had the old password) must not remain trusted. Same effect as `logout-all`, folded into the same transaction as the password change rather than a separate call.

### Account suspension is enforced at both login and mid-session

`login()` rejects a non-`ACTIVE` user after password verification (403, not 401 — credentials were valid, access is what's denied). `JwtAccessStrategy.validate()` additionally re-checks `user.status` on every authenticated request in the same round trip it already uses to check `RefreshTokenFamily.isRevoked` — an access token can be live for up to 15 minutes after an admin suspends the account, so login-time enforcement alone isn't sufficient. `UsersService.updateStatus()` also revokes every refresh-token family when suspending, so a suspended user can't silently refresh their way to a new access token either. An admin can never suspend their own account (checked before the update, not just relied on as a UI constraint).

### Audit logging is declarative, not manually threaded through services

`AuditLogInterceptor` (global `APP_INTERCEPTOR`) is a no-op on any route without an `@Audit({ action, targetType })` decorator; on a decorated route, it writes one `AuditLog` row after the handler succeeds — never before, so a subsequently-thrown error never produces a misleading "this happened" row (proven by a direct test: a handler that throws is confirmed to never call `record()`). This was chosen over manually calling an audit service at each of the ~9 existing admin mutation call sites specifically because a decorator can't be forgotten on a *new* route the way a manual call can — the enforcement lives with the route metadata, not with each service's implementation.

Redaction of the persisted request-body metadata is pattern-based (`/password|token|secret|hash/i` against key names), not an exact-match list — insurance against a future audited route's DTO carrying a differently-named sensitive field (`newPassword`, `apiSecret`, …) without anyone remembering to extend an exact list. Verified by test with several such field-name variants in one payload.

**Failure/transaction semantics, stated explicitly:** the audit write is fire-and-forget from the request's perspective (never awaited in the response path) and `AuditLogService.record()` never throws (internal try/catch) — so a dropped or failed audit write can **never** turn a successful mutation into a failed HTTP response, and never adds latency to it either. This is a deliberate tradeoff: **this audit trail is best-effort observability, not a transactionally-guaranteed compliance log.** The audit row is not written inside the same Prisma transaction as the business mutation (the interceptor runs outside and after whatever transaction the handler used) — a write that fails at the exact moment of a DB blip is silently lost, not retried. If a future requirement needs a stronger guarantee (e.g. regulatory audit trail that must never lose an entry), the fix is either writing the `AuditLog` row inside the same transaction as the mutation, or an outbox/relay pattern — neither is built now, and this is a conscious scope decision, not an oversight.

### Migration 0005 was generated via schema-diff, not `migrate dev`, due to benign pre-existing drift

`prisma migrate dev` refused to proceed on the shared local dev database, reporting migration `0003_background_catalog_sync` as "modified after it was applied." Root cause, confirmed by direct inspection before working around it (never by resetting the database):

- `SELECT migration_name, checksum, finished_at FROM _prisma_migrations` showed **two** rows for `0003_background_catalog_sync` — one with `finished_at = NULL` (an aborted first attempt, different checksum) and one that completed successfully. This is a leftover artifact from an earlier local iteration on that migration (`git log` shows a later commit, "Fix docker issues on local," touching that same migration file) — `migrate dev`'s shadow-database replay-and-diff check compares the *current* migration file's checksum against history and flags any mismatch, including this kind of "failed once, fixed, retried successfully" pattern.
- Confirmed **benign**: `\d "CatalogImportRun"` on the live dev database showed every column, index, and `CHECK` constraint that migrations 0003 and 0004 are supposed to produce, already present and correct — the *data* was never actually inconsistent, only Prisma's own bookkeeping ledger had a stale entry.
- Fix: generated the new migration's SQL via `prisma migrate diff --from-schema-datamodel <pre-Phase-1 schema.prisma> --to-schema-datamodel <current schema.prisma> --script` — a pure schema-file-to-schema-file diff that never touches the database or replays migration history, so the historical ledger artifact is irrelevant to it. The resulting SQL was reviewed, written into `migrations/0005_phase1_auth_hardening/migration.sql` by hand (matching the project's existing convention of hand-placed migration files), applied to the dev database, and recorded via `prisma migrate resolve --applied`.

**Verified across all three paths a migration needs to work on, not just the dev database it was authored against:**
1. **Fresh database, full history** — `DROP`/`CREATE DATABASE`, then `prisma migrate deploy` applying `0001`→`0005` in order from empty: succeeded cleanly, zero drift warnings, resulting schema inspected column-by-column and matches expectations exactly. The full API unit suite (132 tests) and the full integration suite (15 tests, including the concurrency/rate-limit/enumeration suites) were then run **against this fresh database** and passed — proving the migration produces a schema the application actually works against, not just one that looks structurally right.
2. **Upgrade from the real pre-Phase-1 schema with existing data** — a second fresh database had *only* migrations `0001`–`0004` applied (the exact pre-Phase-1 state, via a temporary schema pointed at a copy of just those four migration folders), then seeded with a realistic row set (a user, their cart, an active refresh-token family, a category, a product) using raw inserts shaped like the pre-Phase-1 schema. Migration `0005` was then applied on top via the real `prisma migrate deploy` (which correctly detected `0001`–`0004` as already applied and ran only the new one). Verified: the existing user got `status='ACTIVE'`/`emailVerifiedAt=NULL` defaults, the existing refresh-token family got a `lastSeenAt` default with new nullable columns left `NULL`, the pre-existing category/product/cart rows were untouched, and the new tables (`AuditLog`, `EmailVerificationToken`, etc.) exist and are empty. The API was then booted directly against this upgraded-with-data database and correctly served the pre-existing product through a real HTTP request — not just a schema inspection.
3. **CI's ephemeral database** — mechanically identical to path 1 (`prisma migrate deploy` against a database that has never seen any ShopNest migration before), which is exactly what `.github/workflows/ci.yml`'s "Apply migrations to the ephemeral test database" step does. Path 1's verification directly proves this path; no separate mechanism was needed.

All three produced the same expected schema. Nothing about migration `0005` depends on undocumented local database history — the workaround only concerned *generating* the SQL safely on a drifted local ledger, not the migration itself, which is a normal, portable, additive migration like any other.

## Testing

### The concurrency integration suite boots the real app in-process

`test/concurrency.integration.spec.ts` previously required a separately-running server (`http://localhost:13001`) and shelled out to `docker exec shopnest-db-1 psql ...` for direct-SQL test setup (backdating a token's `usedAt`, promoting a user to admin) — a hard dependency on a specific container name and the dev database, and consequently never run in CI. `createApp()` (`src/main.ts`) was factored out of `bootstrap()` so the test suite can build the exact same, fully-configured Nest application (same pipes, filters, interceptors, CORS) and `app.listen(0)` on an ephemeral port itself; direct-SQL setup goes through `PrismaClient` (`$executeRaw` tagged templates, parameterized) instead of a shell-out. The suite now runs against whatever `DATABASE_URL` is configured — the CI `api` job's Postgres service container, or a local Postgres for `pnpm test:e2e` — and is wired into `.github/workflows/ci.yml` as a real CI step.

### E2E account-lifecycle journey runs against a real browser, real API, real database

`apps/web/e2e/account-lifecycle.spec.ts` (+ `mobile.spec.ts` for a responsive-layout pass) drives register → verify → forgot/reset → sessions/revoke → logout → suspend/reactivate → admin-authorization entirely through the real Next.js UI, in a real Chromium, against a really-running API and Postgres — no mocked fetches, no component-level shortcuts. Two mechanisms make that possible without weakening anything in the app itself:

- **`MAIL_TEST_CAPTURE_FILE`** (`local-mail.adapter.ts`): when set, `LocalMailAdapter` additionally appends each sent message as one JSON line to that file. The suite reads a real verification/reset link back out of a real send, instead of the alternative of adding an HTTP-reachable "give me the last token" endpoint (a real backdoor) or reaching into the database for it (impossible anyway — tokens are hashed at rest, see the Phase 1 section above). Unset by default; only ever set for this CI job / a local E2E run.
- **`EMAIL_VERIFICATION_TOKEN_TTL_MS` / `PASSWORD_RESET_TOKEN_TTL_MS`** are set short (`TEST_TOKEN_TTL_MS` in `playwright.config.ts`, currently 8s) for the E2E API process, so the "expired link" journeys can be driven through real elapsed time (`page.waitForTimeout`) instead of a DB backdoor that would make the test's setup diverge from what a real expired link looks like. This value is shared by *every* test in the run, including happy-path ones — it has to comfortably outlast a normal register→read-mail→navigate round trip (worth remembering if this ever needs bumping again for a slower CI runner).
- **`PLAYWRIGHT_USE_SYSTEM_CHROME`**: this suite was authored in a network-restricted sandbox that couldn't download Playwright's pinned Chromium build. Rather than write untested test code, this env var switches Playwright to `channel: 'chrome'` (an already-installed system Chrome) so the suite could actually be executed and its real output used to find and fix real bugs — see below. CI doesn't set this var and uses Playwright's normal pinned-Chromium install instead (`playwright install --with-deps chromium`, `.github/workflows/ci.yml`'s `e2e` job); this is a portability escape hatch, not the intended CI path.

**Real bugs this suite's first execution actually found and fixed** (the entire reason "trust real browser output, not just that the code compiles" matters):
- `apps/api/package.json`'s `start` script (`node dist/main`) pointed at a path that has never existed — Nest's actual build output is `dist/src/main.js` (`nest-cli.json`'s `sourceRoot: "src"`). The Docker image was never affected (`apps/api/Dockerfile`'s `CMD` already used the correct path), but `pnpm --filter @shopnest/api start` was silently broken for any other caller. Fixed.
- Login with no `?returnTo=` lands on `/` (the real homepage — a 200 render, not a redirect stub) — **not** `/shop`. Register special-cases an unqualified `returnTo` to `/shop` specifically (`register/page.tsx`); login intentionally doesn't (`validate-return-to.ts`'s plain `/` fallback). Several test assertions (including in the pre-existing `auth.spec.ts`, which — per the Phase 0 audit — had never actually run in CI) wrongly assumed both landed on `/shop`. Fixed by asserting what each route actually does, not what seemed intuitive.
- `openAccountMenu`'s locator matched two elements (the real header trigger *and* static "Welcome back" copy inside the always-mounted, merely off-canvas mobile drawer) — Playwright correctly refused to guess. Scoped to `header` + a `button` role.
- A test helper that re-used a `/login?returnTo=...` URL by unconditionally calling `page.goto('/login')` first was silently discarding the query string before the login form was ever touched. Fixed to only navigate if not already on a `/login*` URL.
- `registerViaUI`/`loginViaUI` helpers originally only awaited the click event, not the async request it triggers — a caller that navigated immediately afterward could race the response that actually sets the auth cookies. Fixed by awaiting the specific `POST /auth/{register,login}` response alongside the click.

All 24 tests pass, run twice in a row for stability (desktop project × the full journey, `mobile-chromium` project × a focused responsive-layout pass — full duplication of business logic across viewports isn't proportionate to what actually changes between them).

## Catalog Remodel (Phase 2)

### Product/VendorOffer split — additive migration, then a separately-confirmed destructive one

`Product` (canonical — name/description/category/brand/media) and `VendorOffer` (commercial — price/stock/condition, owned by a `Vendor`) used to be one row. Splitting them landed in two migrations, not one:

- **`0006_phase2_catalog_vendor_remodel`** (additive): every new table (`Brand`, `Vendor`, `VendorMember`, `VendorOffer`, `VendorOrder`, `ProductMedia`, `AttributeDefinition`/`ProductAttributeValue`, `ProductVariant`/`VariantAttributeValue`, `InventoryAdjustment`), plus nullable `vendorOfferId`/`vendorOrderId`/`vendorName` columns alongside the still-live `Product.priceCents`/`stockQuantity`/`imageUrl`/`isActive` and `CartItem`/`OrderItem.productId`. Nothing existing was dropped in this step.
- **`prisma/backfill-vendor-offers.ts`** (idempotent, safe to re-run — checked before every write): seeded the system vendor (`"ShopNest Direct"`), then for every existing `Product` created one `VendorOffer` (+ a matching `IMPORT_INITIAL` `InventoryAdjustment`), moved every `Product.imageUrl` into `ProductMedia`, re-pointed every `CartItem`/`OrderItem`/`OrderStatusHistory` at the new tables. Run against dev: 226 `VendorOffer`s, 194 `ProductMedia`, 18 `CartItem`s, 36 `Order`s backfilled; re-run confirmed idempotent (0 duplicates).
- Every service (`CatalogService`, `CartService`, `OrdersService`, `CatalogImportService`) was rewritten to read/write the new tables exclusively — `Product.priceCents` etc. were kept live only as a **write-only echo** during this window (satisfying the NOT-NULL constraint; nothing new ever read them) — see the git history for `catalog.service.ts`/`catalog-import.service.ts` if the exact echo code is ever needed for reference.
- **`0007_phase2_destructive_drop_deprecated`** (destructive, explicitly confirmed before running — see below): drops `Product.priceCents`/`stockQuantity`/`imageUrl`/`isActive` and `CartItem`/`OrderItem.productId`; makes `CartItem.vendorOfferId` and `OrderItem.vendorOfferId`/`vendorOrderId`/`vendorName` `NOT NULL`. The backfill script was deleted in the same commit — its job was complete and proven, and it can no longer compile against the post-destructive schema (by design: it read/wrote exactly the columns this migration removes).
- `prisma migrate diff` was tried first for `0007` and produced an **incorrect** script — it re-added the `productId` foreign key with a different `onDelete` behavior instead of emitting `DROP COLUMN`. `0007` was hand-written instead, matching every other migration in this project's history.

### A real bug the clone-database verification caught: `prisma format`'s silent relation auto-completion

Before applying `0007` anywhere, it was tested end-to-end against a full `CREATE DATABASE ... WITH TEMPLATE shopnest_dev` clone of the real dev database — not just a schema/type check. That caught a genuine bug: after removing `CartItem.product`/`OrderItem.product` from the schema, `Product.cartItems`/`Product.orderItems` were left behind as now-dangling back-relations. `prisma format` — run routinely after every schema edit — silently "fixed" this by **re-inserting** a new `productId` field and relation on `CartItem`/`OrderItem` to keep the relation pair complete, rather than erroring. `prisma validate` passed (the schema was internally consistent), `prisma generate` succeeded, and `tsc` was clean — the phantom field only surfaced as a runtime `P2022` ("column does not exist") the moment the app tried to query a `CartItem` against the destructively-migrated clone, because the live database correctly had no such column while the regenerated client still expected one.

Fix: removed the `cartItems`/`orderItems` back-relations from `Product` entirely (the relationship now only exists through `VendorOffer`), which stopped `prisma format` from having anything to auto-complete. Re-verified: 149 unit + 15 integration tests green against the clone, then the same migration applied to the real dev database with the same suite green again.

**Takeaway codified as practice, not just a one-off fix**: `prisma format`/`validate`/`generate` all succeeding is necessary but not sufficient proof a schema change is safe — a schema-level tool can silently paper over a relational mismatch that only a real database + a real query surfaces. Every migration in this project (0005, 0006, 0007) has now been proven this way — against a real, disposable clone carrying real data, not just structurally.

### Currency: no per-offer field, by construction

`VendorOffer` deliberately has no `currency` column. The platform stays single-currency (`Order.currency`, already `"USD"`-default, unchanged) — adding a per-offer `currency` field would invite exactly the bug the Phase 2 corrections asked to avoid (a checkout silently mixing currencies because the schema made it representable). If multi-currency is ever needed, it needs an explicit conversion/settlement design, not a field that happens to exist.

### VendorOffer uniqueness for a nullable `variantId`

A normal composite `@@unique([vendorId, productId, variantId])` does not stop the same vendor from creating unlimited duplicate base-product offers, because Postgres treats every `NULL` in a unique constraint as distinct from every other `NULL` (so `variantId IS NULL` rows never collide with each other under a plain composite key). `0006` adds a hand-written partial unique index — `UNIQUE (vendorId, productId) WHERE "variantId" IS NULL` — specifically to close that gap; the declarative `@@unique` still correctly covers every variant-specific row on its own, since non-null tuples compare normally.

### Every stock mutation gets a matching `InventoryAdjustment`, same transaction, no exceptions

Checkout decrement, cancellation/return restoration, admin manual edit, and import initialization/re-sync each write one `InventoryAdjustment` row (`SALE`/`RETURN`/`CORRECTION`/`IMPORT_INITIAL`) inside the exact same Prisma transaction as the `VendorOffer.stockQuantity` change it explains — verified by a unit test at each call site (`orders.service.spec.ts`'s cancellation-restore test asserts both the offer update *and* the adjustment's `delta` sign; `catalog.service.spec.ts`'s create-product test asserts the same for initial stock; `catalog-import.service.spec.ts`'s re-sync test asserts a `CORRECTION` delta, not a duplicate `IMPORT_INITIAL`).

### Phase 2 checkpoint, consolidated

Everything above in this section was verified piecemeal as it was built. Restated together, against the schema as it stands after every later phase's migrations (0008–0013) layered on top, because a checkpoint that only held true the day it was written isn't worth much:

- **Additive migration + backfill**: `0006` (additive) → `backfill-vendor-offers.ts` (226 `VendorOffer`s, 194 `ProductMedia`, 18 `CartItem`s, 36 `Order`s, confirmed idempotent on re-run) → `0007` (destructive, confirmed executed — `Product.priceCents`/`stockQuantity`/`imageUrl`/`isActive` and the old `productId` FKs are gone from the live schema, not just planned).
- **Default-variant / vendor-offer uniqueness**: the plan's original §3.1 design (mandatory non-null `ProductVariant` per product) was superseded during implementation by a simpler, equivalent one — `VendorOffer.variantId` is nullable (`null` = base product, no configurable variant), closed against duplicate base-product offers by a hand-written partial unique index (`UNIQUE (vendorId, productId) WHERE variantId IS NULL`) alongside the declarative `@@unique([vendorId, productId, variantId])` for variant-specific rows. Documented above under "VendorOffer uniqueness for a nullable `variantId`."
- **Inventory-adjustment atomicity**: every `stockQuantity` mutation and its paired `InventoryAdjustment` row write in the same transaction, at every call site (checkout, cancellation, admin correction, import). Documented above; unit-tested at each site.
- **Catalog scheduler/worker cutover**: `CatalogImportWorker`/`CatalogImportScheduler` call the same `CatalogImportService.executeRun()`/`processBatch()` path as the manually-triggered admin endpoint — confirmed directly in source (`ensureSystemVendor`/batch processing are not duplicated anywhere else) — so the background path and the request path have never diverged.
- **Multi-vendor checkout concurrency**: previously unverified as its own scenario — the existing concurrency suite only exercised a single vendor's stock race. Added `describe('Multi-vendor checkout', ...)` to `test/concurrency.integration.spec.ts`: a cart holding offers from two independently-approved vendors checks out into one `Order` with one `VendorOrder` per vendor (asserted against the real response, not inferred), and a same-vendor stock race (two buyers, one unit) run immediately after resolves exactly like the single-vendor suite already covered — deterministic cross-vendor lock ordering doesn't change that outcome. 19/19 integration tests pass with this addition.
- **Fresh-vs-upgraded schema equivalence**: re-verified after all of Phases 2–5's migrations (13 total, through `0013_reviews_wishlist_addresses`) — `prisma migrate deploy` against a genuinely empty database (`CREATE DATABASE shopnest_fresh_check`) applies all 13 cleanly, and `prisma migrate status` reports "up to date" against both that fresh database and the real, continuously-upgraded dev database. Same conclusion as the original Phase 1 (migration 0005) three-path verification, now re-confirmed at the current migration count rather than assumed still true.
- **Destructive migration status**: occurred. `0007_destructive_drop_deprecated` is applied on the real dev database (confirmed via `prisma migrate status` and the schema inspection above) — this was the one item this plan named as a narrow-approval blocker, and it cleared that gate earlier in this run, not deferred.

## Vendor App (Phase 3)

### A real bug real-browser verification caught: JWT role claims went stale on approval

`VendorOnboardingService.approve()` promotes `User.role` from `CUSTOMER` to `VENDOR` (and any co-owner/staff on the same vendor) the moment an admin approves the application — deliberately, so a `PENDING` applicant has no vendor capabilities yet (see the inline comment at the call site). That part was correct and covered by unit tests from the start. What unit tests couldn't catch: the *already-issued* access token sitting in the applicant's browser still embeds the old `role: CUSTOMER` claim, and `JwtAccessStrategy.validate()` returned that embedded payload unchanged — so `RolesGuard` (which reads `request.user.role`) kept rejecting every `@Roles(Role.VENDOR)` endpoint with 403 until the token's 15-minute TTL naturally expired and a refresh happened to mint a fresh one. A newly-approved vendor could log in, see their own "Approved" dashboard (`vendor.status` is read live, unaffected), and then get silently 403'd on every real action for up to 15 minutes with no visible recovery path short of logging out and back in.

This was found by a real Playwright walkthrough of the full apply → admin-approves → create-offer journey with no manual token-refresh step — the same shape of gap the Phase 1 verification pass was specifically asked to guard against ("a live server/database smoke test" isn't the same evidence as driving the actual UI). A curl-based manual check had masked it because an explicit `POST /auth/refresh` was part of that script.

Fix, at the root rather than papering over it client-side: `JwtAccessStrategy.validate()` already re-queries the token family every request to enforce live revocation and live account-suspension status (`family.user.status`, not a token claim) — the exact same "database is authoritative, not the token" principle already established for those two checks. `role` was the one field still trusted from the token. `validate()` now also selects `family.user.role` and returns it in place of the payload's embedded value, so `RolesGuard` always sees the live role on every request, with no dependency on a refresh happening to have occurred. This fixes every role transition uniformly (vendor approval today; any future admin-promotion or demotion path later), not just this one call site, and costs nothing extra — the query was already being made. Covered by `jwt-access.strategy.spec.ts` (new — no prior spec existed for this strategy at all, despite it enforcing two other security-relevant checks already).

### Vendor's own product search is deliberately unfiltered by existing offers

The public catalog search (`GET /products`, `CatalogService.listProducts`) only returns products with at least one `ACTIVE` `VendorOffer` — correct for shoppers, who shouldn't see unsellable products. A vendor picking a product to list for the *first* time is searching for exactly the opposite: products nobody is selling yet. Reusing the public endpoint would make it structurally impossible to be the first seller of anything. `CatalogService.searchForListing()` / `GET /vendor/offers/search-products` is a separate, `@Roles(Role.VENDOR)`-gated search with no offer-existence filter, only `publishStatus: PUBLISHED`.

### Vendor order fulfilment reuses the customer-facing order state machine, not a parallel copy

`VENDOR_TRANSITIONS` (`order-state-machine.ts`) restricts a vendor's own `PATCH /vendor/orders/:id/status` to `PENDING → CONFIRMED → SHIPPED` — `DELIVERED` and `CANCELLED` stay outside single-seller authority (delivery confirmation and platform-level cancellation are not a vendor's call to make unilaterally). `OrdersService.recomputeOrderStatus` (made `public`, not duplicated) re-aggregates the parent `Order.status` from all of its `VendorOrder`s after every vendor-level transition, the same aggregation used by the customer/admin paths — there is exactly one status-aggregation implementation in the codebase.

### Form labels use `htmlFor`/`id`, not just visual adjacency

The first pass at the vendor apply/offer-creation forms used plain sibling `<label>text</label>` + `<input>` pairs with no `htmlFor`/`id` association — visually correct, but invisible to a screen reader (and to Playwright's `getByLabel`, which caught it immediately). Every new form field in `vendor-apply-form.tsx` and the offer-creation form in `vendor-offer-list.tsx` now pairs an explicit `id` with a `htmlFor`, matching the pattern already used by the account/security forms (`#email`/`#password`-style ids) elsewhere in the app.

### End-to-end verification for this phase

`apps/api/src/auth/__tests__/jwt-access.strategy.spec.ts` (new, 5 tests) locks in the live-role behavior above plus the two pre-existing live checks (revocation, suspension) that had no direct coverage before. `apps/web/e2e/vendor-lifecycle.spec.ts` (new) drives apply → admin approval (in a second, independent browser context/session) → offer creation via the real product picker → activation → empty orders/staff pages rendering → a real staff invite, entirely through the rendered UI against a real API and database, with no manual token refresh — the exact path that regresses if the role-claim fix above is ever reverted. Combined with the Phase 1 suite, the full E2E run is 25/25 passing (desktop `chromium` + `mobile-chromium`'s responsive pass), plus the full API suite at 204 tests (199 Phase 0–2 + 5 new) and the 50 Phase 3 vendor-module unit tests reported when that module was first built.

## Admin App (Phase 4)

### SUPER_ADMIN is a one-way hierarchy over ADMIN, not a separate role tree

The plan called for `CRUD /admin/admins` (creating further admin accounts) to be gated behind a role distinct from the day-to-day catalog/order/vendor `ADMIN` role — so that being able to run the store doesn't imply being able to grant others the same. Adding `SUPER_ADMIN` as a fourth `Role` enum value raised an immediate design fork: either every existing `@Roles(Role.ADMIN)` call site across `catalog`, `catalog-import`, `orders`, `users`, and `vendor` gets rewritten to `@Roles(Role.ADMIN, Role.SUPER_ADMIN)`, or `RolesGuard` itself expresses the hierarchy once. Chose the latter: `RolesGuard.canActivate` treats a `SUPER_ADMIN` caller as satisfying any `@Roles(Role.ADMIN)` requirement, one-way only (an `ADMIN` does **not** satisfy a `@Roles(Role.SUPER_ADMIN)` route). This is a single, centrally-tested rule (`roles.guard.spec.ts`'s "SUPER_ADMIN hierarchy" suite) instead of a scattered, easy-to-forget convention that a new admin route would need to remember to apply. The seeded bootstrap admin (`admin@shopnest.dev`) is promoted to `SUPER_ADMIN` in `seed.ts` — there has to be at least one account able to create further admins before any `POST /admin/admins` call has ever run.

### Creating an admin account never gives the creator (or anyone) a known password

`AdminService.createAdmin(email)` hashes a random, immediately-discarded 32-byte value to satisfy the `passwordHash` `NOT NULL` column, then calls the existing `AuthService.requestPasswordReset(email)` — the same token table and email template "forgot password" already uses — so the new admin sets their own credential via a real, already-hardened reset link. No new mail template, no new token table, no parallel "admin invite" mechanism: this is the same pattern already established for vendor-staff invites (§ Vendor App), applied a third time to the same problem shape ("grant access without the granter ever knowing the credential").

### `preview()` and `executeRun()` share one `applyScope()` — a preview that could diverge from the real run is worse than no preview

`CatalogImportRun` gained `categoryScope String[]`, `maxRecords Int?`, `minImageCount Int?` — set at enqueue time (`POST /admin/catalog-imports/dummy-json`), persisted on the row so the background worker (which claims runs asynchronously, independent of the original HTTP request) can read the same scope back when it later calls `executeRun(runId)`. `POST /admin/catalog-imports/preview` runs the identical `applyScope()` filter read-only (no transaction, no advisory lock, nothing written) against a live fetch from the real supplier, comparing each scoped product's checksum against `ProductSource` to report create/update/unchanged counts. Both call sites route through the same private method specifically so an admin previewing a scope and then running it can trust the preview — a preview computed by separate, potentially-drifting logic would be worse than not having one.

`SupplierProduct` gained `imageCount` (from DummyJSON's `images[]` array length, independent of the single `imageUrl` already stored) to back the `minImageCount` filter — a real adapter extension, not a stub; both possible states (an `images` array present, or only a `thumbnail`) are covered in `dummy-json.adapter.spec.ts`.

### Superseded: raising the transaction timeout was not the fix — bounded, checkpointed batches are

The first fix for the whole-catalog-import transaction timeout (a real bug: triggering a full ~194-product DummyJSON sync through the new admin UI hit Prisma's 5-second interactive-transaction default and rolled back an otherwise-successful run) was to raise the timeout to 60 seconds. That was a correctness patch, not the real fix, and was replaced before this phase closed: a single transaction spanning the entire run — no matter how generous its timeout — holds its row locks, its connection, and its rollback cost for the whole run's duration, all scaling with catalog size rather than with what's actually safe to hold a lock for. A supplier catalog 10x this one's size would just hit the new, larger timeout instead.

The real fix: `executeRun` now processes the scoped product list as a series of small, independently-committed batches (`app.catalogImportBatchSize`, default 25 — `CATALOG_IMPORT_BATCH_SIZE` env var), each its own short `$transaction` with Prisma's ordinary default timeout (appropriate again, because a bounded batch is small regardless of total catalog size). `CatalogImportRun` gained `scopedCount`/`processedCount`/`skippedCount` columns; `processedCount` is checkpointed at the end of every batch's transaction, alongside that batch's contribution to `createdCount`/`updatedCount`/`unchangedCount` and a renewed `lockedAt` (the worker's lease). A run that fails partway — a dropped connection, a worker crash, a real constraint violation — leaves every already-committed batch standing; `executeRun`, called again (by a retry or by a different worker reclaiming the lease after it expires), reads `processedCount` and resumes from exactly there rather than redoing or losing work. The advisory lock (`pg_try_advisory_xact_lock`) is now re-acquired per batch instead of held for the whole run — safe, because the actual guarantee against two concurrent runs for the same source is the partial unique index `CatalogImportRun_one_active_source_idx` (`source` WHERE `status IN (QUEUED, RUNNING)`, migration `0004`), not the advisory lock; the lock is defense-in-depth against two batches interleaving their writes, not the sole mechanism.

Verified against a real database, not just mocks (`test/catalog-import.integration.spec.ts`): a genuine mid-run Postgres unique-constraint violation aborts only its own batch's transaction (the prior batch's writes are provably still there — queried directly, not inferred), and a resumed run completes with no duplicate rows. A second `CatalogImportWorker` instance correctly reclaims a run whose lease (`lockedAt`) is older than the configured lease window, and does *not* touch one that's still live. Unit-level checkpoint/retry/no-double-count coverage lives in `catalog-import.service.spec.ts`.

### A permanently-invalid supplier record is skipped and counted, not an all-or-nothing fetch failure

`DummyJsonAdapter.fetchProducts()` previously threw on the first structurally invalid record in a page, discarding every other, valid record fetched alongside it — defensible in isolation, but the wrong tradeoff once real batches make "skip the bad one, keep going" both meaningful and safe. `normalize()` now returns `null` for an invalid record (logged, never thrown) instead of throwing; `fetchProducts()` returns `{ products, skippedCount }` and `CatalogSourceAdapter`'s interface changed to match. A **duplicate** external id, by contrast, still hard-fails the whole fetch — that's a supplier-side data-integrity problem where silently keeping one copy could hide real corruption, a different failure class from "one record happened to be incomplete." `skippedCount` is surfaced on both `preview()` and the `CatalogImportRun` row, not silently dropped.

### Review moderation queue deferred to Phase 5, not built against a model that doesn't exist yet

The original phase plan listed "review moderation queue" under Phase 4. The `Review` model itself is Phase 5 scope (§3.3 of the plan) — Phase 4 cannot build a moderation UI for rows that can't be written yet. Resolved by building the moderation queue immediately after `Review` lands in Phase 5, not by inventing a placeholder screen now — it remains approved, in-scope work, not a deferral off the plan. Every other Phase 4 item (real `AdminModule` with live dashboard aggregates, `AuditLog` viewer, `SUPER_ADMIN`-gated admin-account management, catalog-import preview/scope/history) shipped as originally scoped.

### A real gap a targeted security review caught: no way to revoke a pending vendor-staff invite

Every other invite-style flow in this app (email verification, password reset) is single-use and expiring, but none of them needed a third state — nobody "revokes" their own password-reset link. Vendor-staff invites do: an owner can invite the wrong address, or change their mind, while the invite is still pending. That path didn't exist — `VendorStaffService` could create and accept invites, and revoke an already-*accepted* membership, but had no way to kill a token before it was used. Fixed with a distinct `VendorStaffInvite.revokedAt` column (migration `0012`) rather than overloading `consumedAt` — a revoked-but-never-accepted invite and an accepted one need to stay distinguishable in an owner's own member-management view, not collapse into one ambiguous timestamp. `acceptInvite` checks `revokedAt` alongside `consumedAt`/`expiresAt` with one shared "invalid or expired" message (not distinguishing which, so a stale/guessed token can't be used to probe which failure mode applies). `DELETE /vendor/staff/invites/:inviteId`, owner-only, rejects revoking an already-accepted invite (that's what `DELETE /vendor/staff/:memberId` is for) and is idempotent on an already-revoked one.

The same review pass found two smaller, related gaps and fixed both: `InviteVendorStaffDto.email` was missing the `@Transform(trim + lowercase)` every other email-accepting DTO in the app already has (`RegisterDto`, `LoginDto`, `ForgotPasswordDto`, `ResendVerificationDto`) — fixed to match, with the acceptance-time comparison in `acceptInvite` also trimming (not just lowercasing) as defense-in-depth. And `acceptInvite`'s `vendorMember.upsert` had a real, if narrow, concurrent-double-accept race: two simultaneous accept calls for the same invite can both pass the pre-transaction `consumedAt` check before either commits, then race on the same `(vendorId, userId)` upsert — the loser previously got an unhandled P2002 (a 500) instead of the harmless no-op it should be. Fixed by catching that specific race and returning the winner's already-created membership row.

### JwtAccessStrategy's live-role/status lookup: verified minimal, indexed, and fail-closed

Three properties a security review specifically asked to be confirmed, not just claimed:
- **Minimal fields**: the query selects only `isRevoked` and `user.{status,role}` — no email, password hash, or other data the hot per-request authentication path doesn't need. Asserted directly in `jwt-access.strategy.spec.ts` against the actual `select` object passed to Prisma, not inferred from reading the code.
- **Indexed**: the lookup is `refreshTokenFamily.findUnique({ where: { id: payload.familyId } })` — `id` is `RefreshTokenFamily`'s primary key, so this is always a primary-key index lookup; the joined `User` row is reached through `User.id`, also a primary key. Nothing to add — this was already optimal, confirmed rather than assumed.
- **Fails closed on a DB outage**: `validate()` has exactly one job when the Prisma call rejects — propagate the rejection. There is no code path anywhere that falls back to the raw, unverified JWT payload. `JwtAuthGuard` (default Passport `handleRequest`) turns that rejection into a 401. `OptionalJwtAuthGuard`'s custom `handleRequest` (used by the global `APP_GUARD` so `RolesGuard` always has *some* `request.user` to read) receives `(err, user=undefined)` on the same rejection and returns `undefined` — the request proceeds *unauthenticated*, exactly like "no token was presented at all," never authenticated with stale or unchecked claims. Both guards now have direct tests for this (`optional-jwt-auth.guard.spec.ts` is new — this guard had no test coverage before this pass) rather than relying on reading the Passport/NestJS source to believe it.

### SUPER_ADMIN hierarchy scope, explicitly bounded by tests

The one-way `RolesGuard` rule (§ Admin App, above) covers exactly one relationship — `SUPER_ADMIN` satisfies a plain `@Roles(Role.ADMIN)` requirement. A review specifically asked this not be allowed to accidentally widen into "SUPER_ADMIN passes every guard." Added direct deny tests: a `SUPER_ADMIN` is still denied a route gated on an unrelated role (`@Roles(Role.VENDOR)`) exactly like anyone without that role; a plain `ADMIN` is likewise denied that same route (no implicit vendor access); explicitly listing `[Role.ADMIN, Role.SUPER_ADMIN]` on a route behaves identically to the implicit hierarchy (the hierarchy is additive convenience, not a required replacement for correct `@Roles()` usage). Also confirmed, structurally: `RolesGuard` only ever intercepts `@Roles()` metadata — it has no interaction with the separate, orthogonal ownership mechanisms (`VendorMembershipService` resolving *which* vendor a caller may act for, order-ownership checks) that gate access within a role, not between roles; nothing about the hierarchy touches those.

## Customer Experience (Phase 5)

### Reviews are structurally tied to a delivered order item, not a convention

`Review.orderItemId` is `NOT NULL` and `@unique` (one review per order item, one order item per review), matching the plan's §3.3 design rather than the weaker "optional verified-purchase flag" alternative. `ReviewsService.create()` validates inside the write that the order item belongs to the caller and its parent order reached `DELIVERED` before the insert is attempted — but the FK itself is what makes an unverified review structurally impossible, not just application logic that could be bypassed by a different call site. `@@unique([userId, productId])` separately caps total reviews per user per product at one, even across repeat purchases. `Product.ratingAverage`/`ratingCount` are never hand-set — `recomputeRating()` runs transactionally on every create/hide/publish, the same discipline already established for `InventoryAdjustment`.

### Review moderation shipped immediately once `Review` existed, not deferred further

Per the Phase 4 note above ("Review moderation queue deferred to Phase 5"), the moderation queue (`GET/PATCH /admin/reviews`, `AdminReviewsPage` with status tabs) was built in the same pass as the `Review` model itself — it was never a separate, later task.

### Two real bugs found only by live HTTP verification, not by unit tests

Both were caught by curling the running API against the real dev database after implementation, before either was assumed correct:

- **The full-text-search product listing path was missing fields the plain-listing path already had.** `CatalogService.listProducts` branches to a raw-SQL `searchProducts()` method (`ts_rank`/`search_vector`/a `LATERAL JOIN` for the buy-box offer) when a `q` param is present, and to a Prisma `findMany` + `toProductCard` mapper otherwise. When `ratingAverage`/`ratingCount`/`offerId` were added to the product-card shape, only the non-search path was updated — `curl "/products?q=Headphones"` returned cards with no `offerId` (nothing addable to cart) and no rating. These are two genuinely separate code paths reading the same conceptual data, and both need updating on every product-card shape change going forward; this was not the first time this file has needed a two-path fix (see the Phase 2 section for `toProductCard`/`toProductDetail`).
- **A `$queryRaw` UUID/text comparison threw in `AddressesService`.** `POST /me/addresses` 500'd with `operator does not exist: uuid = text` — Prisma's tagged-template `$queryRaw` interpolates a plain string value as `text` by default, and the row-lock query compared it against `Address.userId`, a `uuid` column. Fixed with an explicit `${userId}::uuid` cast, matching the convention already established in `CartService`'s identical lock pattern. This is the same class of bug as the Phase 1/2 raw-SQL work, now confirmed a second time as a standing convention rather than a one-off fix: every `$queryRaw` comparison against a `uuid` column in this codebase casts explicitly.

### `/shop`'s browse grid needed its own wishlist affordance — it didn't inherit the homepage's

The wishlist heart button lives on `ProductCard` (`apps/web/src/components/product/product-card.tsx`), used by the homepage's carousel sections. `/shop`'s grid renders through a separate component, `ProductGrid`, which had no wishlist button at all — confirmed by a real Playwright run against `/shop` before assuming the feature worked everywhere a product appears. `/shop` is the primary product-discovery surface; wishlist is Phase 5 scope, not something that should only work from the homepage. Added a small, separate `WishlistButton` client component (not a copy of `ProductCard`'s local one — `ProductGrid` doesn't need the hover-reveal-add-to-cart treatment, just the button) and wired it into `ProductGrid`'s card overlay.

### `ProductGrid`/`ProductCard` consolidation: type- and helper-level now, visual merge stays deferred to Phase 7

The plan's Phase 5 scope calls for consolidating `ProductGrid` (the plain grid used on `/shop`) onto `ProductCard` (the homepage's fixed-width `w-[300px]` hover-reveal carousel card). Done now: both consume the same `ProductCardResponse` API type (no more locally-declared, drifting `interface Product`), and the 11-file duplicated local `formatPrice` was removed in favor of the single `lib/format-price.ts` import everywhere. Not done now, explicitly: replacing `ProductGrid`'s markup with `ProductCard` itself — `ProductCard`'s fixed width is built for a horizontal-scroll carousel and would break `/shop`'s responsive `grid-cols-*` layout, and the plan separately reserves homepage-carousel layout changes for Phase 7 specifically so they're not built twice against a UI that's about to be redesigned there anyway. Doing the type/helper-level consolidation now and the structural one in Phase 7 satisfies both instructions without conflict; deferring 100% of it would have left the duplicated type/helper debt sitting through two more phases for no reason.

### E2E coverage: address-book "Default" badge assertions need `{ exact: true }`

`customer-experience.spec.ts`'s address-book test initially asserted `page.getByText('Default')` had exactly one match after flipping the default address — and got 2, briefly read as a real backend double-default bug. Direct curl verification against the running API (`GET /me/addresses` before/after `PATCH .../default`) showed the backend was correct throughout: exactly one row ever has `isDefault: true`. The second match was Playwright's `getByText` doing its default case-insensitive substring match against the *other* address card's "Set as default" button, which also contains the substring "default". Fixed by passing `{ exact: true }` everywhere this test asserts on the badge count — a reminder that a failing E2E assertion needs its own locator specificity checked before it's read as evidence of an application bug.

## Returns, Promotions, Payment Boundary (Phase 6)

### Payment is a real boundary, not a checkout side-effect nobody calls

Checkout previously created an `Order` with no notion of payment at all — the whole flow assumed a charge would somehow succeed. `PaymentProvider` (`charge`/`refund`, `src/payment/`) is now a real interface in the same provider-selected-by-env shape as mail/geocoding, with `MockPaymentAdapter` the only adapter in this scope (no real gateway credentials — see the plan's §12, unchanged from the original assessment). `charge()` runs inside the checkout transaction, after the post-discount total is computed and before the `Order` row is created; a decline (`PaymentDeclinedException`, HTTP 402) rolls back the whole transaction the same way a stock-race `ConflictException` already did — no order, no stock decrement, nothing partially committed. The mock adapter declines deterministically for one configurable amount (`PAYMENT_MOCK_DECLINE_CENTS`, default $666.00) rather than randomly, so the decline path is directly testable without flakiness — the same "test card" convention real gateways use. `Order.paymentRef` stores the charge's provider reference, reused as the reference on any later refund (approved returns, see below).

### Returns: one request per item, ever, and approval is atomic with refund

`ReturnRequest.orderItemId` is `@unique` — a customer can request a return for a given item exactly once, and (since there's no re-file endpoint) a rejected request is terminal by construction, not by convention. Eligibility is checked against the *item's own* `VendorOrder.status`, not the aggregate `Order.status` — a return is about one seller's fulfilment, same granularity every other post-checkout concern in this schema already uses. There's no separate "approved, refund pending" state: this scope's mock refund is synchronous, so `decide()` restores inventory (`InventoryAdjustment`, `reason=RETURN`, same chokepoint discipline as every other stock mutation in this app), calls `payment.refund()`, and flips status to `REFUNDED` all inside one transaction — `REQUESTED → REFUNDED` or `REQUESTED → REJECTED`, nothing in between. Refund amount is `unitPriceCents × quantity` for the specific item, not the whole order — a multi-item order can have one item returned without touching the rest.

Vendor and admin decision endpoints (`PATCH /vendor/returns/:id/approve|reject`, `PATCH /admin/returns/...`) share one private `decide()` method, parameterized by an optional `vendorId` ownership check — the vendor path 403s on another vendor's request, the admin path has no such restriction (support override, same asymmetry as every other vendor-vs-admin pair in this app).

### Promotions: one code per order, PLATFORM discount absorbed at the Order level, VENDOR discount charged to the vendor's own subtotal

Matching the plan's deliberately bounded scope (§3.10): a `Promotion` is either `PLATFORM`-scope (any admin-created code, discounts the whole cart) or `VENDOR`-scope (a vendor's own code, discounts only that vendor's share of a multi-vendor cart) — enforced at the database level by a hand-written `CHECK` (`scope='VENDOR' AND vendorId IS NOT NULL OR scope='PLATFORM' AND vendorId IS NULL`), not just application logic. `PromotionRedemption.orderId` is `@unique` — this scope allows exactly one code per order, structurally, not just by not building a stacking UI.

A `PLATFORM` discount reduces `Order.totalCents` (what the customer actually pays) but leaves every `VendorOrder.subtotalCents` untouched — each vendor's own accounting reflects what they're actually owed, and the platform absorbs the discount at the aggregate level. A `VENDOR` discount instead reduces that one `VendorOrder`'s own `discountCents`, so the vendor who funded the code sees the cost in their own numbers. This wasn't in the plan's original wording explicitly but is the natural reading of "vendor-funded promo" vs. "platform-funded promo," and avoids inventing a proportional-allocation rule that isn't needed for correctness.

Apply-time (`POST /cart/promotion`) only sanity-checks the code itself (active, in-window) — redemption limits and minimum-subtotal are re-checked authoritatively at checkout, under a `SELECT ... FOR UPDATE` lock on the `Promotion` row, using the same "recheck under lock" discipline this codebase already uses for the idempotency-key double-check. Locking the row also serializes two concurrent checkouts redeeming the *same* code against each other, making the `maxRedemptions`/`maxRedemptionsPerUser` `COUNT` queries race-free without a separate mechanism. A `PERCENT` code that would floor to `0` cents on a small enough cart is rejected outright rather than recorded as a zero-amount redemption — `PromotionRedemption.amountCents` is `CHECK`ed `> 0` at the database level, so this is a real constraint the service has to respect, not just a nicety.

### Verified live, not just via mocks

The full flow — apply a code, see a discount preview, check out, get charged, request a return, get refunded — was run against a real booted app and a real Postgres clone before being trusted: a 10%-off platform code correctly discounted a $40 cart to $36 and appeared as `discountCents: 400` on the created order; a cart priced at exactly the mock decline amount correctly 402'd with zero stock decremented; an admin-approved return correctly restored stock (8 → 10 units) and recorded a `RETURN` `InventoryAdjustment`; a vendor attempting to touch another scope's promotion via its own endpoint correctly 404'd (the `owned()` check filters by `scope` before checking `vendorId`, so a `VENDOR`-scope lookup against a `PLATFORM` promotion never even reaches the ownership comparison). The migration itself was also re-verified the same way as every prior one in this project: applied to a `pg_dump`/`pg_restore` clone of the real dev database (not `CREATE DATABASE ... TEMPLATE`, which needs exclusive access the live dev API's open connections don't allow), the full app booted against that clone and exercised over real HTTP, before being applied to the real dev database.

### E2E: `getByRole` name matching is case-insensitive by default — a recurring gotcha in this suite

Two more instances of the same class of false alarm already documented above (the address-book "Default" badge): the new `promotions-and-returns.spec.ts` suite's "Add to Cart" button locator initially matched 12 elements, because Playwright's `getByRole(..., {name})` does case-insensitive substring matching unless `exact: true` is passed, and the PDP's main button ("Add to Cart") collided with `OffersList`'s per-seller buttons ("Add to cart", lowercase). Same issue with a "Remove" button colliding with the cart line-item's own "Remove" button. Both fixed with `exact: true` — now the standing default for any button-text locator in this codebase's E2E suites that isn't provably unique on the page.

## Homepage UI Polish (Phase 7)

### The hero carousel had no real height below the `lg` breakpoint

`HeroCarousel`'s slides are `absolute inset-0` (so cross-fading between them doesn't shift layout), which means they contribute nothing to their parent `<section>`'s height — the section's only declared height was `lg:min-h-[344px]` (large screens only) plus an unconditional `min-h-full`, which resolves against whatever height its ancestor happens to have. Below `lg`, no ancestor in the chain declares an explicit height either, so `min-h-full` had nothing real to inherit from. A direct measurement confirmed the section was rendering anyway on mobile (342px) — but only by accident: a sibling flex item (a decorative divider between the category rail and the hero, meant to only ever appear at `lg`+ alongside the category rail) had a hardcoded `h-[374px]` and was *also* incorrectly visible below the `sm` breakpoint (a `sm:hidden lg:block` combination that reads as "hidden from `sm` up, shown again at `lg`" — which leaves it visible below `sm` too, not hidden as intended). The parent flex row's `items-stretch` was stretching the hero to match that divider's height, incidentally. Fixed both bugs together: the divider is now `hidden lg:block` (matching `CategoryRail`'s own visibility exactly, no accidental mobile appearance), and the hero section gets real, breakpoint-matched `min-h-[390px] sm:min-h-[430px] lg:min-h-[344px]` values mirroring what its inner content already declared — so it no longer depends on a sibling for its size. Verified via direct `boundingBox()` measurement at both viewport sizes before and after, not just visual inspection.

### `ProductSection` (homepage product rails) now shares the same fade-edge scroll treatment as `CategoryBrowser`

`CategoryBrowser` already used `HorizontalFadeScroll` (a scroll-edge gradient + `canScrollLeft`/`canScrollRight` state component built earlier in this project); `ProductSection` — the "Best Selling"/"Explore Our Products" rails — had its own bespoke scroll container with prev/next buttons that were always enabled regardless of scroll position, no fade-edge cue, and its own duplicated `overflow-x-auto`/scrollbar-hiding classes. Refactored `ProductSection` onto the same `HorizontalFadeScroll` component: the scroll buttons are now correctly `disabled` at each end (verified — the "previous" button is disabled at scroll position 0, and both re-enable/disable correctly after a scroll click), and the same left/right gradient overlay now appears consistently across both of the homepage's horizontal scrollers instead of only one. This removed the internal `ProductScroller` sub-component entirely — its job is now `HorizontalFadeScroll`'s.

### `ProductGrid`/`ProductCard` visual consolidation (deferred from Phase 5, completed here)

Phase 5 deliberately stopped at the type/helper level (`ProductCardResponse`, shared `formatPrice`) because `ProductCard`'s hardcoded `w-[300px]` would have broken `/shop`'s responsive grid, and this phase — homepage layout work — was the plan's designated place to finish the merge. The fix was narrow: `ProductCard`'s root width changed from a fixed `w-[300px]` to `w-full` (it was already built entirely from relative/absolute positioning inside its own bounding box, so nothing else about it depends on a specific pixel width), and the one caller that needs a fixed carousel width (`ProductSection`) now applies `w-[300px]` on its own per-item wrapper `<div>` instead. `/shop`'s `ProductGrid` was rewritten to render `<ProductCard>` directly inside its existing `grid-cols-*` cells — `ProductCard`'s `w-full` fills whatever cell width the grid gives it. This is a real functional upgrade for `/shop`, not just a visual one: `ProductCard` carries a hover-reveal "Add to cart" button and a rating display that the old `ProductGrid` markup never had, so `/shop`'s grid gained add-to-cart-without-visiting-the-PDP for the first time. The now-fully-redundant standalone `WishlistButton` component (added to `ProductGrid` in Phase 5, before this consolidation existed) was deleted — `ProductCard` already has its own equivalent, identically-shaped wishlist button built in, so keeping both would have been two implementations of the same control. Verified via direct screenshot comparison (desktop grid renders correctly at each breakpoint) and the full Playwright suite (including `mobile-chromium`) re-run clean — the `/shop` wishlist E2E test needed no changes at all, since `ProductCard`'s wishlist button uses the exact same `aria-label` shape and `data-testid="product-card"` marker the deleted component did.

### Category cards and service-benefit cards were already at the intended polish bar

Reading `CategoryBrowser` and `ServiceBenefits` before touching anything (rather than assuming the plan's "remaining items" list was still fully outstanding) showed both already had real hover treatments — category cards lift, tint red, and gain a shadow on hover with a focus-visible ring for keyboard users; service-benefit icons lift on hover — matching the quality bar the rest of this pass aims for. No changes made to either; re-implementing already-correct work would have been pure churn. This is worth recording explicitly so it doesn't read as a skipped item later: it was checked, not skipped.

## Ops Readiness (Phase 8)

### Media storage closes the plan's last named external-credential gap

The plan named exactly two capabilities as blocked on external credentials this environment doesn't
have: a payment gateway (closed in Phase 6) and object storage for product media. `MediaStorageProvider`
(`src/media/`) is the same shape as every other provider-selected-by-env interface in this app —
`LocalMediaStorageAdapter` is the only implementation, writing to local disk and serving files back
at `/uploads/*`. Wired into one real, complete flow (not left as an unused interface): a file-upload
control on the admin product form calls `POST /admin/media/upload`, gets back an absolute URL, and
uses it as the product's image — verified end to end through a real browser (file picked → uploaded →
preview rendered from the returned URL) and via direct byte-for-byte round-trip comparison of the
uploaded and served-back file. `next.config.ts`'s `images.remotePatterns` needed an explicit `http://
localhost` entry alongside the existing `https://**` one — a locally-served upload URL is plain `http`
in dev, and `next/image` enforces its remote-pattern allowlist strictly regardless of same-machine
convenience.

### A real Node/tsc toolchain conflict, and what it revealed about the build's output layout

`prisma/seed.ts` is run directly by Node's native `--experimental-strip-types` (`db:seed`), which —
on this Node version — requires an explicit `.ts` extension on relative imports; this project's `tsc`
(`type-check`, `nest build`) rejects that same extension unless `allowImportingTsExtensions` is set.
Excluding `prisma/seed.ts` from both `tsconfig.json` and `tsconfig.build.json` resolves the conflict
without touching either toolchain's own required behavior — but doing so had a side effect worth
recording: `tsc` infers `rootDir` as the common ancestor of whatever's still included, so removing
`prisma/` from that set silently changed the build output from `dist/src/main.js` to `dist/main.js`,
which would have quietly broken `apps/api/Dockerfile`'s `CMD` and reintroduced the exact `start`-script
bug already fixed and documented in the Phase 1 section of this file. Caught by actually running the
rebuilt server, not by trusting a clean `tsc` exit code — `rootDir` is now pinned explicitly in
`tsconfig.build.json` rather than left to inference, so a future exclude change can't silently move
the output layout again.

### The realistic demo seed required hand-constructing valid historical orders

`Review.orderItemId` is `NOT NULL` — there is no way to seed a review without a real order item
attached to a `DELIVERED` `VendorOrder`, by design (see the Phase 5 section on structural
verified-purchase enforcement). The seed script's `seedDeliveredOrder()` helper hand-constructs an
`Order`/`VendorOrder`/`OrderItem` chain in the exact shape `OrdersService.checkout()` produces — same
fields, same relationships — skipping only the row-locking that a live concurrent request needs and a
one-time seed script run alone against a controlled database does not. This means every other part of
the app (review eligibility checks, order-history display, return-request eligibility) treats a
seeded order identically to a real checkout, rather than needing a special case for "seed data."

### Dev database reset — a genuine pause point, not a routine step

Resetting the shared local dev database (to replace test-run junk data — category/product names like
`CartCat-...`/`MvCat-...` left over from this session's own live-testing against it — with the new
realistic seed) was blocked by the environment's own permission classifier before it ran, and correctly
so: a full database wipe is exactly the class of action this project's execution model reserves for
explicit confirmation rather than autonomous continuation, even though every row in that database was
either the original seed or this session's own test output. Asked; user chose a full reset + reseed
over a surgical row-level cleanup. `prisma migrate reset --force --skip-seed` also served as one more
fresh-database migration-history verification (all 14 migrations reapplied cleanly from empty) before
the new seed script ran.

### Monitoring/alerting scoped to what's real, not fabricated to look complete

The plan named "monitoring/alerting + import/job metrics" as Phase 8 scope. Standing up fake
Prometheus/PagerDuty integration nobody in this environment can receive an alert from would be worse
than being direct about the gap — it would read as a working capability that silently isn't. What
shipped instead, documented in `docs/operations.md`: confirmation that structured, redacted Pino
logging and `CatalogImportRun`'s durable, queryable job-status rows already provide what a real
alerting pipeline would consume, plus the concrete next step (ship the existing JSON logs to whatever
platform is actually available) rather than new instrumentation this environment has nothing to feed.

### A stale dev server, not application code, caused a mass E2E failure — found by not trusting the number

The full Playwright suite (run as this phase's final verification) came back 34 failed / 3 passed —
every failure the identical `page.fill('#email', ...)` timeout, on both the desktop and mobile
projects. That shape — one failure mode repeated everywhere rather than scattered across unrelated
features — doesn't match "several things broke," it matches "the thing under test never came up."
`curl localhost:3000` confirmed it: the whole Next.js app was returning 500, including the homepage.
The `next dev` process had been running continuously for hours across this session (since well before
this phase started) and Next.js does not hot-reload `next.config.ts` edits — the `images.remotePatterns`
change earlier in this phase needed a restart it never got, and the process was left in a broken state
rather than serving stale-but-working pages. Restarting it (not touching any application code) took
the homepage from 500 to 200, and the identical Playwright run that had just failed 34 tests passed
all 37 immediately after, in a quarter of the wall-clock time. Recorded here as the reason, rather than
just noting "re-ran and it passed": a suite failing in one uniform shape across every unrelated test is
itself a diagnostic signal, worth reading before touching any of the tests or the code they exercise.

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

### The catalog is admin-curated by default; supplier imports are optional and manual

Earlier in this project's life, DummyJSON's scheduler/worker ran automatically on every API start. That's now off by default (`CATALOG_WORKER_ENABLED=false`, `CATALOG_SCHEDULE_ENABLED=false`) — the primary way products enter ShopNest is an admin creating and editing them by hand through the admin UI, pointing at any image URL (including one uploaded via the media endpoint), from any source they choose. Supplier imports remain fully functional but are opt-in per run, triggered from `/admin/imports`: additive and idempotent (checksum-based, never deletes), never overwrite a product's `publishStatus` once it exists (see below), and never run unless an admin explicitly clicks the button.

### CatalogSourceAdapter is a real multi-supplier interface, not a DummyJSON-only mechanism

`CatalogSourceAdapter` (`fetchProducts(): Promise<FetchProductsResult>`) is implemented by `DummyJsonAdapter`, `OpenFoodFactsAdapter`, and `AmazonAdapter`; `CatalogSourceRegistry` resolves a `CatalogSource` enum value to the matching adapter instance, and `CatalogImportService` is written once against the interface — `enqueue`, `preview`, and `executeRun` all take the source as data (a request field or the `CatalogImportRun.source` column), not a hardcoded constant. eBay's Browse API was considered and not built — it requires real OAuth application credentials this environment doesn't have, a genuine external dependency it cannot provide.

Amazon was initially assessed the same way and left out of the first pass of this work, on the assumption that "Amazon Reviews 2023" (the McAuley Lab research dataset) meant downloading a multi-gigabyte file with no way to query it — not actually true, and worth correcting here rather than quietly fixing without explanation. Live testing (`curl`, then a real Node streaming script) found the dataset is hosted on Hugging Face as one JSONL file per product category, resolvable over plain keyless HTTPS, and — critically — genuinely streamable: `AmazonAdapter` reads a category file with `response.body.getReader()`, parses complete JSONL lines as they arrive, and calls `reader.cancel()` the moment it has enough valid records, so a run never downloads more than a small slice of a file that can run 100MB+. A live test against `meta_Software.jsonl` collected 8 real records (with genuine multi-image data) and cancelled the connection in under half a second. The corrected lesson: "no query API" and "unreachable" are not the same claim, and the second one deserved direct verification before being treated as a blocker, the same discipline already applied to every other integration in this project.

### A supplier with no commercial data creates a DRAFT product, never a fake price

Open Food Facts and Amazon both carry product identity and imagery but rarely a usable price or stock figure — Amazon's dataset has no inventory concept at all, and its `price` field is null or `0` for most records. `SupplierProduct.priceCents`/`stockQuantity` are optional in the shared type specifically so an adapter can be honest about not having them, rather than inventing a placeholder value. When absent, `CatalogImportService` creates the canonical `Product` as `DRAFT` and skips `VendorOffer` creation entirely — the product exists and is fully editable, but isn't purchasable or visible in the storefront until an admin prices and publishes it by hand, the same path as a product created from scratch. A corollary: once a product exists, a re-sync never rewrites its `publishStatus` — only creation decides DRAFT vs. PUBLISHED. Without that rule, a later re-sync of a product an admin had since priced and published would silently demote it back to DRAFT every time a source without pricing data (or with an intermittently-null price) came back around.

### Multiple images per product, not just one

`SupplierProduct` originally carried a single optional `imageUrl`. Amazon's real catalog data lists several genuine images per product (multiple angles, packaging, in-use shots) and DummyJSON already returns a full `images[]` gallery that was previously discarded after only being used to count them. `SupplierProduct` gained `imageUrls?: string[]` alongside the existing `imageUrl` (kept as the primary/first one, so a single-image source like Open Food Facts doesn't need to wrap one URL in an array), and `CatalogImportService.upsertProduct` now writes one `ProductMedia` row per image, position-ordered, instead of always just position 0. A re-sync that returns fewer images than last time prunes the now-stale trailing positions (`deleteMany` on `position >= images.length`) rather than leaving orphaned rows behind — a no-op for a brand-new product, which has nothing to prune yet.

### Open Food Facts is genuinely flaky under rapid sequential requests — retried and isolated per category, not treated as fatal

Live verification surfaced a real production characteristic, not a bug in the adapter: hitting ten scoped category searches back-to-back against the real Open Food Facts API intermittently 503s roughly half of them (`curl` against all ten categories in a row: `503 200 503 200 503 200 503 503 503 200`). The adapter's first version hard-failed the whole fetch on the very first non-200 response, which — given that failure rate — would make a real import fail most of the time. Fixed with two changes: each category fetch retries up to three times with a short linear backoff before giving up, and a category that still fails after retries is skipped (logged, not thrown) rather than aborting the run, because each category is an independent search, not a page of one paginated resource the way DummyJSON's feed is — one category's outage has no bearing on whether the others' data is valid. The fetch as a whole only throws if every category fails.

### A manually-triggered import processes immediately — the disabled background worker must not mean the button silently does nothing

`POST /admin/catalog-imports/run` originally only inserted a `QUEUED` row and returned — with `CATALOG_WORKER_ENABLED=false` by default, nothing was left to ever claim it, so a real admin click sat forever showing `QUEUED` with no path to `RUNNING`, found live by clicking through the actual admin UI (not just from test coverage, which mocked the worker and never noticed the gap). Fixed by having the controller fire one unawaited `CatalogImportWorker.poll()` immediately after enqueueing — the exact same claim/lease/retry method the interval-based worker already calls on a timer, just invoked once, synchronously triggered by this specific request. This is still not a background job: it runs because an admin asked it to, once, right now, not on a schedule. The frontend runs table also gained a 3-second auto-refresh (`RunsAutoRefresh`, active only while a run is `QUEUED`/`RUNNING`) so progress shows up without a manual page reload — the two gaps compounded into what looked like a completely broken button.

### categoryScope matches by substring, not exact slug equality

An admin scoping an Amazon import to `"Electronics"` got zero results even after that category file was added to the fetch list — the file is named `meta_Electronics.jsonl`, but every record inside it carries `main_category: "All Electronics"`, and the original `applyScope` required the slugified scope term and the slugified category name to be equal. First recorded here as "not fixable, just extend the category list and point admins at Preview" — that undersold it. Requiring exact equality was the actual bug: no supplier's internal vocabulary reliably matches what an admin types from memory (DummyJSON alone has no umbrella "electronics" either — it's split into `smartphones`/`laptops`/`tablets`/`mobile-accessories`), so exact-match scoping was unusable for anything but a term copied verbatim from a previous Preview call. Fixed by matching substring-contains instead of equality (`slugify(categoryName).includes(slugify(scopeTerm))`) — `"electronics"` now matches `"all-electronics"` and `"car-electronics"` alike, verified live against the real Amazon feed (67 real matches, up from 0). A scope term that slugifies to an empty string (blank/whitespace input) is dropped before filtering, not left in the needle list — `"".includes()` is true for everything, so an accidental blank entry would otherwise silently disable scoping rather than matching nothing.

### The admin product list was showing every DRAFT/offer-less product as "Active" with a fake $0.00 price

A screenshot of real imported Amazon products — genuinely `DRAFT`, genuinely no `VendorOffer` — showed a green "Active" badge and `$0.00`/`0` price and stock in the admin products table. The backend was already correct (`offerId: null`, `priceCents`/`stockQuantity` defaulted to `0` only because `ProductCardResponse`'s shape has no nullable-money representation); the bug was entirely in `AdminProductList`, which derived its status badge from `publishStatus !== 'ARCHIVED'` — a check written back when every product always had a real offer, collapsing `DRAFT` and `PUBLISHED` into the same "Active" label. Fixed to a real three-state badge (`Draft`/`Published`/`Archived`) and to show "Not priced"/"—" instead of `$0.00`/`0` whenever `offerId` is null, so an unpublished, unpriced product cannot visually pass for a live one.

The edit form had the same conflation one level deeper: `startEdit()` pre-checked the "Active" checkbox for any non-archived product, including a `DRAFT` one — so saving a price on an imported product without touching that checkbox would have silently published it as a side effect of an unrelated field's stale default, not a decision the admin actually made. Fixed to derive the checkbox from `publishStatus === 'PUBLISHED'` specifically, relabeled "Published (visible in the storefront)", with an inline note on a `DRAFT` product explaining it needs a price and that checkbox before it goes live. The backend's own publish path was already correct and needed no change — `updateProduct` calls `syncSystemVendorOffer`, which creates the `VendorOffer` on demand if one doesn't exist yet — pricing a `DRAFT` import through the ordinary edit form was already the intended, working mechanism; only the UI's own signals about what state a product was actually in were wrong.

### Import-generated slugs could contain characters the admin edit form's own validator rejects

Verified live end-to-end (not just unit-tested): editing one of the DRAFT products above and saving failed with "slug must be lowercase-kebab-case" — the create-time slug was never invalid by choice, just built by directly interpolating two values without running them through `slugify()` first: the `CatalogSource` name (`CatalogSource.DUMMY_JSON.toLowerCase()` is `"dummy_json"`, an underscore) and the supplier's `externalId` (an Amazon ASIN like `"B0BLXXGZJL"` is uppercase). Both silently passed at import time — `upsertProduct` writes directly via Prisma, bypassing `CreateProductDto`'s `@Matches` validation entirely — and then failed on the very first edit through the admin UI, which does go through that DTO. Fixed by slugifying both interpolated segments, not just the product name; the 67 already-imported rows with an invalid slug were backfilled in place (`UPDATE ... SET slug = lower(slug)`, checked for collisions first — none) rather than left broken until re-imported. A structural gap worth naming directly: `upsertProduct`'s bypass of the same DTO validation the admin form enforces is what let an invalid slug reach the database in the first place; the fix here closes the specific characters that caused it, not the general bypass — a supplier could in principle still introduce a new character neither `slugify()` nor this fix anticipates.

## Admin Shell & Dashboard Redesign

### A separate design-token namespace, not a reskin of the storefront's brand tokens

The admin redesign (sidebar/topbar shell, Dashboard) uses a different palette than the storefront's existing `brand`/`accent`/`ink` tokens (`globals.css`) — deliberately not reusing them, so restyling admin screens can never accidentally bleed into customer-facing pages. New tokens live under an `admin-*` namespace (`--color-admin-primary`, `--color-admin-ink`, etc.), named semantically rather than as a generated 50–900 scale — only the shades the design actually specifies exist as tokens, nothing interpolated or guessed. Two new Google Fonts (Inter, Nunito) were added alongside the two (Lato, Poppins) already loaded for the storefront.

### Icons are bundled offline, not fetched from Iconify's API at runtime

`@iconify/react`'s default mode resolves icon names via a live call to Iconify's public API on first render — fine for a prototype, not for production chrome that renders on every admin page load. Used `@iconify/react/offline` with the `@iconify-icons/*` per-icon npm packages instead (`@iconify-icons/mingcute`, `@iconify-icons/material-symbols`, `@iconify-icons/fluent-mdl2`, `@iconify-icons/mdi`) — icon SVG data ships in the JS bundle, zero network calls at render time. Every icon name was verified to actually resolve (`require()`'d directly) before being wired into a component; one guessed name (`material-symbols/arrow-menu-close`) didn't exist and was swapped for the real one (`menu-open`) before it could ship broken.

### Dead UI stayed out, not because it's hard, but because nothing real is behind it yet

The source design's topbar includes a global search bar, a notification bell, and a light/dark theme toggle. None were built: there's no cross-entity admin search backend, no notification system/model in ShopNest at all, and no dark-mode support anywhere in the app (checked directly — zero `dark:` Tailwind variants, no `next-themes`). Matches this project's standing rule against decorative, non-functional UI (the same reasoning that governed the wishlist heart icon and the catalog-import panel's copy earlier in this project) — adding icons that don't do anything would be new dead UI, not a restyle of old dead UI. The topbar that shipped instead is a single real, computed page title synced with the sidebar's own nav labels. Logout, by contrast, *is* wired to the real `/auth/logout` endpoint — the difference is whether a real capability already exists to hook up to, not an aesthetic one.

### The sidebar nav reflects ShopNest's actual pages, not the source design's generic e-commerce vocabulary

The design's sidebar items (Coupon Code, Brand, Transaction) don't all correspond to something real here — ShopNest has Promotions, not a literal "Coupon Code" concept, no Brand admin page, and no standalone Transactions view. Rather than build placeholder pages just to match the reference labels, or keep labels that point at nothing, the sidebar was restructured around what genuinely exists: Dashboard · Catalog (Products, Categories, Reviews, Imports) · Commerce (Orders, Returns, Promotions) · Admin (Vendors, Users, Admins, Audit Log) — 12 real destinations, nothing invented, nothing dropped. `Admins` stays conditional on `SUPER_ADMIN`, matching the route's own guard.

### The dashboard's weekly stat cards had to change scope to stay honest, not just get restyled

The source design pairs a big number ("Total Sales $350K") with a percentage change ("↑10.4%") on the same card — that only means something if both describe the same time window. The original dashboard's "Total revenue" was all-time, which can't coherently carry a week-over-week percentage. Rather than bolt a weekly percentage onto an all-time total (and have the two numbers quietly describe different things), the two headline cards became genuinely 7-day-scoped ("Sales — Last 7 days", "Orders — Last 7 days"), each paired with a real week-over-week comparison computed from actual order rows (`AdminService.buildWeeklyTrend`). The original all-time figures weren't dropped — they moved to their own row below, un-paired with a percentage, since that's the only honest way to show them.

### A real timezone bug, caught by a test using genuine `new Date()` behavior against this server's actual clock

`buildWeeklyTrend`'s first version computed the day-bucket boundary using the server's *local* midnight (`setHours(0,0,0,0)`) but read it back out using a *UTC*-derived day-key (`toISOString().slice(0,10)`) — silently correct on a server running in UTC, silently wrong everywhere else. This server's local clock is UTC+5, so every order fell in the wrong day's bucket, caught by a unit test asserting today's/yesterday's bucket contents against `new Date()` at real test-run time rather than a hardcoded date. Fixed by making every boundary — the window starts, the per-day bucketing, and the weekday label formatting (`toLocaleDateString(..., { timeZone: 'UTC' })`) — consistently UTC, not a mix.

### `topProducts`/`weeklyTrend` are computed from real `Order`/`OrderItem` rows — nothing sampled or estimated

Top products rank by real `OrderItem.quantity` summed via `groupBy`, scoped to non-cancelled orders from the last 30 days; the displayed price is a real average of what it actually sold for in that window, not a live catalog lookup pretending to be a sale price. `revenueChangePercent`/`orderCountChangePercent` are `null` — not `0%`, not a fabricated `∞%` — whenever the prior 7-day window had zero activity, since a percentage change from zero isn't a meaningful number. Verified against real, non-empty order data (temporarily seeded, screenshotted, then fully removed) before shipping — the empty-state and non-empty-state render paths were both exercised in a real browser, not assumed from reading the code.

### Same discipline as the catalog-import work: extend the backend, rebuild, restart, then verify live — in that order, every time

Two real mistakes were caught mid-pass by insisting on a live check rather than trusting `tsc`/tests alone: the API process serving live traffic was still running the *previous* build after the `DashboardSummary` type was extended (a `Cannot read properties of undefined (reading 'reduce')` runtime error, not a compile error — `tsc` had nothing to say about a field that exists in source but not in the currently-running process), and a stale `next dev` process (killed and restarted, same as twice before this session) was serving a page where a brand-new Tailwind `@theme` token hadn't been picked up, making an entire active-nav-item render invisible (white text on a transparently-unstyled background) until restarted. Neither was caught by type-checking or lint — both were caught by opening the actual page and looking.
