CREATE TYPE "CatalogSource" AS ENUM ('DUMMY_JSON');
CREATE TYPE "CatalogImportStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "ProductSource" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "productId" UUID NOT NULL,
  "source" "CatalogSource" NOT NULL,
  "externalId" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductSource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductSource_productId_fkey" FOREIGN KEY ("productId")
    REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CatalogImportRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source" "CatalogSource" NOT NULL,
  "status" "CatalogImportStatus" NOT NULL DEFAULT 'RUNNING',
  "discoveredCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "unchangedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "CatalogImportRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductSource_source_externalId_key" ON "ProductSource"("source", "externalId");
CREATE UNIQUE INDEX "ProductSource_productId_source_key" ON "ProductSource"("productId", "source");
CREATE INDEX "ProductSource_productId_idx" ON "ProductSource"("productId");
CREATE INDEX "CatalogImportRun_source_startedAt_idx" ON "CatalogImportRun"("source", "startedAt");
CREATE INDEX "CatalogImportRun_status_startedAt_idx" ON "CatalogImportRun"("status", "startedAt");

ALTER TABLE "CatalogImportRun"
  ADD CONSTRAINT "catalog_import_counts_non_negative"
  CHECK (
    "discoveredCount" >= 0 AND "createdCount" >= 0 AND
    "updatedCount" >= 0 AND "unchangedCount" >= 0
  );
