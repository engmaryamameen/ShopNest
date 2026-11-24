-- Run only after taking and verifying a backup and reading 0016-recovery.md.
-- This reconciles the checksum of a completed, original 0016 migration with
-- the reviewed idempotent replacement. It changes no application tables.
BEGIN;
DO $$
DECLARE updated_count integer;
BEGIN
  IF (SELECT count(*) FROM "_prisma_migrations" WHERE migration_name = '0015_open_food_facts_source' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND checksum = 'f511babf4dbdd9c84889818ca0f126f9658205b8d4f17d14756aac194b5b696e') <> 1 THEN
    RAISE EXCEPTION 'Unexpected 0015 migration history; stop and investigate';
  END IF;
  IF (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'CatalogSource' AND e.enumlabel = 'AMAZON') <> 1 THEN
    RAISE EXCEPTION 'Expected AMAZON enum value is missing or ambiguous';
  END IF;
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '0016_amazon_source' AND finished_at IS NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'Unresolved failed migration exists; use failed migration recovery';
  END IF;
  UPDATE "_prisma_migrations" SET checksum = 'f092c2ac0a0d9ca1428cfe41f1486c78ac9c3b34ad8ea2dab17696fcc773a1bc'
    WHERE migration_name = '0016_amazon_source' AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND checksum = '47ac515b457cf2bd39e391a10f6a1bb2fcc86d67ba3b1f8b6f2bb6b14fcc3810';
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 1 THEN RAISE EXCEPTION 'Expected exactly one completed original 0016 record, found %', updated_count; END IF;
END $$;
COMMIT;
