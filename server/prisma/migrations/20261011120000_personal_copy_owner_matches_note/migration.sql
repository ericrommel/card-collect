-- A copy's ownerId must be the note's ownerId. Abort if any stored row already disagrees.
-- The sentinel is temporary, and the drop lets a failed earlier attempt retry.
DROP TABLE IF EXISTS "personal_copy_owner_check";
CREATE TEMP TABLE "personal_copy_owner_check" (
    "ok" INTEGER NOT NULL,
    CONSTRAINT "personal_copy_owner_must_match_note" CHECK ("ok" = 1)
);
INSERT INTO "personal_copy_owner_check" ("ok")
SELECT CASE
  WHEN EXISTS (
    SELECT 1
    FROM "personal_copies" AS "copy"
    INNER JOIN "personal_cards" AS "note" ON "note"."id" = "copy"."personalCardId"
    WHERE "copy"."ownerId" <> "note"."ownerId"
  ) THEN 0
  ELSE 1
END;
DROP TABLE "personal_copy_owner_check";

-- id is already unique, so this pair is unique too. The copy foreign key needs it.
CREATE UNIQUE INDEX "personal_cards_id_ownerId_key" ON "personal_cards"("id", "ownerId");

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_personal_copies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "availability" TEXT NOT NULL DEFAULT 'KEEP',
    "condition" TEXT,
    "rawPrinting" TEXT,
    "printing" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    "personalCardId" TEXT NOT NULL,
    CONSTRAINT "personal_copies_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "personal_copies_personalCardId_ownerId_fkey" FOREIGN KEY ("personalCardId", "ownerId") REFERENCES "personal_cards" ("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_personal_copies" ("availability", "condition", "createdAt", "id", "ownerId", "personalCardId", "printing", "rawPrinting", "updatedAt") SELECT "availability", "condition", "createdAt", "id", "ownerId", "personalCardId", "printing", "rawPrinting", "updatedAt" FROM "personal_copies";
DROP TABLE "personal_copies";
ALTER TABLE "new_personal_copies" RENAME TO "personal_copies";
CREATE INDEX "personal_copies_ownerId_idx" ON "personal_copies"("ownerId");
CREATE INDEX "personal_copies_personalCardId_idx" ON "personal_copies"("personalCardId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
