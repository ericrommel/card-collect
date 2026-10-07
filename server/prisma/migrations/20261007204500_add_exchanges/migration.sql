-- CreateTable
CREATE TABLE "exchanges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "proposerConfirmedAt" DATETIME,
    "counterpartyConfirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    CONSTRAINT "exchanges_setId_fkey" FOREIGN KEY ("setId") REFERENCES "sets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exchanges_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exchanges_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exchange_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exchangeId" TEXT NOT NULL,
    "copyId" TEXT,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "collectibleNumber" TEXT NOT NULL,
    "collectibleName" TEXT NOT NULL,
    "rarity" TEXT,
    "condition" TEXT,
    CONSTRAINT "exchange_lines_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "exchanges" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exchange_lines_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "user_copies" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user_copies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "availability" TEXT NOT NULL DEFAULT 'KEEP',
    "condition" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "reservedByExchangeId" TEXT,
    CONSTRAINT "user_copies_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_copies_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "variants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "user_copies_reservedByExchangeId_fkey" FOREIGN KEY ("reservedByExchangeId") REFERENCES "exchanges" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_user_copies" ("availability", "condition", "createdAt", "id", "ownerId", "updatedAt", "variantId") SELECT "availability", "condition", "createdAt", "id", "ownerId", "updatedAt", "variantId" FROM "user_copies";
DROP TABLE "user_copies";
ALTER TABLE "new_user_copies" RENAME TO "user_copies";
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Existing rows get a fresh 144-bit token. New accounts use the same
-- amount of randomness from the application (base64url); both are opaque.
INSERT INTO "new_users" ("createdAt", "displayName", "email", "id", "passwordHash", "publicId") SELECT "createdAt", "displayName", "email", "id", "passwordHash", lower(hex(randomblob(18))) FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_publicId_key" ON "users"("publicId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "exchanges_setId_status_idx" ON "exchanges"("setId", "status");

-- CreateIndex
CREATE INDEX "exchanges_proposerId_status_idx" ON "exchanges"("proposerId", "status");

-- CreateIndex
CREATE INDEX "exchanges_counterpartyId_status_idx" ON "exchanges"("counterpartyId", "status");

-- CreateIndex
CREATE INDEX "exchange_lines_exchangeId_idx" ON "exchange_lines"("exchangeId");
