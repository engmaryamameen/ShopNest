CREATE TABLE "AdminFavorite" (
    "userId" UUID NOT NULL,
    "path" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminFavorite_pkey" PRIMARY KEY ("userId", "path"),
    CONSTRAINT "AdminFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
