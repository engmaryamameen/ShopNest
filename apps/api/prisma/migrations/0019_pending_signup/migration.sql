CREATE TABLE "PendingSignup" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "fullName" TEXT,
  "passwordHash" TEXT NOT NULL,
  "challengeHash" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PendingSignup_email_key" ON "PendingSignup"("email");
CREATE UNIQUE INDEX "PendingSignup_challengeHash_key" ON "PendingSignup"("challengeHash");
CREATE INDEX "PendingSignup_expiresAt_idx" ON "PendingSignup"("expiresAt");
