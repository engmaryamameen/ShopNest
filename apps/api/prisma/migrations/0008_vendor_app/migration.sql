-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'VENDOR';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_VENDOR_APPROVE';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_VENDOR_REJECT';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_VENDOR_SUSPEND';

-- CreateTable
CREATE TABLE "VendorStaffInvite" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "VendorMemberRole" NOT NULL DEFAULT 'STAFF',
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorStaffInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorStaffInvite_tokenHash_key" ON "VendorStaffInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "VendorStaffInvite_vendorId_idx" ON "VendorStaffInvite"("vendorId");

-- CreateIndex
CREATE INDEX "VendorStaffInvite_email_idx" ON "VendorStaffInvite"("email");

-- AddForeignKey
ALTER TABLE "VendorStaffInvite" ADD CONSTRAINT "VendorStaffInvite_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorStaffInvite" ADD CONSTRAINT "VendorStaffInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

