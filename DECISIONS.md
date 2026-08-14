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
