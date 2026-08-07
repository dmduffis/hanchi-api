-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN "photoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill from legacy photoUrl
UPDATE "JournalEntry"
SET "photoUrls" = ARRAY["photoUrl"]
WHERE "photoUrl" IS NOT NULL AND "photoUrl" <> '' AND cardinality("photoUrls") = 0;
