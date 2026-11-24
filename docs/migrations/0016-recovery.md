# Migration 0016 recovery

Migration 0015 already adds `AMAZON` to `CatalogSource`; original migration 0016 attempts to add it again. A fresh deployment therefore fails before 0017. The corrected 0016 adds the same value with `IF NOT EXISTS`. No application data or custom SQL is removed.

This is a deliberate edit of a historical migration. Prisma records a checksum per migration; changing a completed migration can make `migrate dev` request a destructive reset even when the schema is correct. Do not reset an existing database. Back up the database and migration records before any recovery, check the database and schema target, and stop application writers during recovery. Test this procedure on a restored copy first.

Original 0016 SHA-256: `47ac515b457cf2bd39e391a10f6a1bb2fcc86d67ba3b1f8b6f2bb6b14fcc3810`. Corrected SHA-256: `f092c2ac0a0d9ca1428cfe41f1486c78ac9c3b34ad8ea2dab17696fcc773a1bc`. Verify the files and applied migration history match these values before proceeding. Do not apply this procedure to an unknown history, another schema, a modified 0015, or any other migration failure.

- **Fresh database:** use `prisma migrate deploy` with the corrected migrations.
- **Original 0016 failed with duplicate `AMAZON`:** first verify 0015 succeeded with the expected checksum, `AMAZON` exists exactly once in `public."CatalogSource"`, and 0016 failed only on its single enum statement. Run `prisma migrate resolve --rolled-back 0016_amazon_source`, then `prisma migrate deploy` with the corrected migration. The failed row remains in history as rolled back.
- **Original 0016 recorded as completed:** after the same checks and backup, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/migrations/0016-checksum-repair.sql` from the repository root. The script changes the checksum of exactly one completed original 0016 row and aborts for unexpected history; it retains all migration rows. Then run `prisma migrate deploy` from `apps/api`.

Check `prisma migrate status`, the relevant enum, application data, and custom database objects afterward. The checksum script intentionally changes migration metadata; retain the backup and document when it was run. Prisma's schema diff can propose removing custom SQL objects and database defaults: review it, and never apply generated SQL automatically.
