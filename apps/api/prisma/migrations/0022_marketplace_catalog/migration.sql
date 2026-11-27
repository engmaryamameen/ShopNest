-- Catalog imports, source attribution and marketplace pricing.
-- Consolidates unpublished local changes; migrations 0001–0021 are unchanged.

ALTER TABLE "ProductSource" ADD COLUMN "importRunId" UUID;
CREATE INDEX "ProductSource_importRunId_idx" ON "ProductSource"("importRunId");
ALTER TABLE "ProductSource" ADD CONSTRAINT "ProductSource_importRunId_fkey"
  FOREIGN KEY ("importRunId") REFERENCES "CatalogImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CatalogImportRun" ADD COLUMN "candidateSnapshot" JSONB;
CREATE TABLE "CatalogImportPreview" (
  "id" UUID NOT NULL,
  "source" "CatalogSource" NOT NULL,
  "products" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogImportPreview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CatalogImportPreview_expiresAt_idx" ON "CatalogImportPreview"("expiresAt");

ALTER TABLE "CatalogImportRun" ADD COLUMN "demoPriceCents" INTEGER;
ALTER TABLE "CatalogImportRun" ADD COLUMN "demoStockQuantity" INTEGER;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "CatalogSource" ADD VALUE 'OPEN_BEAUTY_FACTS';
ALTER TYPE "CatalogSource" ADD VALUE 'DARAZ';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "pricingSnapshot" JSONB,
ADD COLUMN     "shippingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subtotalCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pricingSnapshot" JSONB,
ADD COLUMN     "regularUnitPriceCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "gtin" TEXT,
ADD COLUMN     "productType" TEXT;

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "automatic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "brandIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "maxDiscountCents" INTEGER,
ADD COLUMN     "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "productTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "vendorIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "VendorOffer" ADD COLUMN     "discountEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "discountEndsAt" TIMESTAMP(3),
ADD COLUMN     "discountStartsAt" TIMESTAMP(3),
ADD COLUMN     "discountType" "PromotionType" NOT NULL DEFAULT 'PERCENT',
ADD COLUMN     "discountValue" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "priceIncludesTax" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxClassId" UUID,
ADD COLUMN     "taxable" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "TaxClass" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaxClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSourceCheckpoint" (
    "id" UUID NOT NULL,
    "source" "CatalogSource" NOT NULL,
    "category" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 1,
    "exhausted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSourceCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxClass_name_key" ON "TaxClass"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSourceCheckpoint_source_category_version_key" ON "CatalogSourceCheckpoint"("source", "category", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Product_gtin_key" ON "Product"("gtin");

-- AddForeignKey
ALTER TABLE "VendorOffer" ADD CONSTRAINT "VendorOffer_taxClassId_fkey" FOREIGN KEY ("taxClassId") REFERENCES "TaxClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TaxClass" ADD CONSTRAINT "TaxClass_rate_check" CHECK ("rateBps" BETWEEN 0 AND 10000);
ALTER TABLE "VendorOffer" ADD CONSTRAINT "VendorOffer_discount_check" CHECK ("discountValue" >= 0 AND ("discountType" <> 'PERCENT' OR "discountValue" <= 100));
ALTER TABLE "VendorOffer" ADD CONSTRAINT "VendorOffer_discount_dates_check" CHECK ("discountStartsAt" IS NULL OR "discountEndsAt" IS NULL OR "discountEndsAt" > "discountStartsAt");
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_max_discount_check" CHECK ("maxDiscountCents" IS NULL OR "maxDiscountCents" > 0);

ALTER TABLE "ProductSource" ADD COLUMN "attribution" JSONB;

ALTER TABLE "VendorOffer" ADD COLUMN "importRunId" UUID;
ALTER TABLE "VendorOffer" ADD CONSTRAINT "VendorOffer_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "CatalogImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "VendorOffer_importRunId_idx" ON "VendorOffer"("importRunId");
-- Recover provenance only for offers the previous importer unmistakably created.
UPDATE "VendorOffer" AS o SET "importRunId" = s."importRunId"
FROM "ProductSource" AS s, "Vendor" AS v
WHERE o."productId" = s."productId" AND o."vendorId" = v.id
  AND v.slug = 'shopnest-direct' AND s."importRunId" IS NOT NULL
  AND o."vendorSku" = lower(s.source::text) || '-' || s."externalId";

ALTER TABLE "CatalogImportPreview" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'READY', ADD COLUMN "requestScope" JSONB, ADD COLUMN "errorMessage" TEXT, ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "CatalogImportPreview" ADD CONSTRAINT "CatalogImportPreview_status_check" CHECK (status IN ('PREPARING', 'READY', 'FAILED'));
CREATE INDEX "CatalogImportPreview_pending_idx" ON "CatalogImportPreview" ("createdAt") WHERE status = 'PREPARING';

ALTER TABLE "VendorOffer" ADD CONSTRAINT "VendorOffer_fixed_discount_within_price" CHECK (NOT "discountEnabled" OR "discountType" <> 'FIXED_AMOUNT' OR "discountValue" <= "priceCents");
ALTER TABLE "Order" ADD CONSTRAINT "Order_monetary_breakdown_nonnegative" CHECK ("totalCents" >= 0 AND "subtotalCents" >= 0 AND "taxCents" >= 0 AND "shippingCents" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_monetary_breakdown_nonnegative" CHECK ("unitPriceCents" >= 0 AND "regularUnitPriceCents" >= 0 AND "discountCents" >= 0 AND "taxCents" >= 0 AND "totalCents" >= 0);

ALTER TYPE "CatalogSource" ADD VALUE 'AMAZON_BERKELEY';

ALTER TABLE "Category" ADD COLUMN "imageAttribution" JSONB;
