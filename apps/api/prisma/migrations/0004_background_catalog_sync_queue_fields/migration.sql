ALTER TABLE "CatalogImportRun"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockedBy" TEXT;

CREATE INDEX "CatalogImportRun_status_availableAt_idx"
  ON "CatalogImportRun"("status", "availableAt");

CREATE UNIQUE INDEX "CatalogImportRun_one_active_source_idx"
  ON "CatalogImportRun"("source")
  WHERE "status" IN ('QUEUED', 'RUNNING');