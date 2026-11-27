-- Destructive migration — drops the pre-remodel commercial fields on
-- Product and the superseded productId FKs on CartItem/OrderItem, now
-- that the additive migration (0006) + backfill + application cutover are
-- complete and independently verified (unit + integration suites green
-- against a full clone of the dev database with this migration applied —
-- see DECISIONS.md for the verification record and the reasoning for
-- hand-writing this file instead of trusting `prisma migrate diff`, which
-- produced an incorrect script for this particular change).

-- CartItem: productId is fully superseded by vendorOfferId.
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_productId_fkey";
DROP INDEX "CartItem_cartId_productId_key";
ALTER TABLE "CartItem" DROP COLUMN "productId";
ALTER TABLE "CartItem" ALTER COLUMN "vendorOfferId" SET NOT NULL;

-- OrderItem: same for productId; vendorOrderId/vendorName also become
-- mandatory now that every row (backfilled + newly written) has them.
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";
ALTER TABLE "OrderItem" DROP COLUMN "productId";
ALTER TABLE "OrderItem" ALTER COLUMN "vendorOfferId" SET NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "vendorOrderId" SET NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "vendorName" SET NOT NULL;

-- OrderStatusHistory: every status transition now happens on a specific
-- VendorOrder.
ALTER TABLE "OrderStatusHistory" ALTER COLUMN "vendorOrderId" SET NOT NULL;

-- Product: commercial fields are fully superseded by VendorOffer
-- (price/stock) and ProductMedia (images/isActive -> publishStatus).
DROP INDEX "Product_isActive_createdAt_idx";
ALTER TABLE "Product" DROP COLUMN "imageUrl";
ALTER TABLE "Product" DROP COLUMN "isActive";
ALTER TABLE "Product" DROP COLUMN "priceCents";
ALTER TABLE "Product" DROP COLUMN "stockQuantity";
