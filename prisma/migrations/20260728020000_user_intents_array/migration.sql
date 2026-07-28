-- Multi-select intents (replaces single intent column).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "intents" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "User"
SET "intents" = ARRAY["intent"]
WHERE "intent" IS NOT NULL
  AND "intent" <> ''
  AND (cardinality("intents") = 0 OR "intents" IS NULL);

ALTER TABLE "User" DROP COLUMN IF EXISTS "intent";
