-- AlterTable
ALTER TABLE "CatalogImportRun"
  ADD COLUMN "categoryScope" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "maxRecords" INTEGER,
  ADD COLUMN "minImageCount" INTEGER;
