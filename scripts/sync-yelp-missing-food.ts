/**
 * Sync Yelp restaurants for communities that currently have 0 POIs.
 * Run in small daily batches so you stay under Yelp's daily call limit
 * (~2–3 search calls per community).
 *
 * Usage:
 *   npx tsx scripts/sync-yelp-missing-food.ts --dry-run
 *   npx tsx scripts/sync-yelp-missing-food.ts --limit=50
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { syncYelpForCommunity } from "../src/lib/yelpSync";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const needsSsl =
  /supabase\.(co|com)/.test(connectionString) ||
  connectionString.includes("sslmode=require");

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  }),
});

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const limit = argNum("limit", 50);
  const dryRun = process.argv.includes("--dry-run");

  const zeros = await prisma.$queryRawUnsafe<
    { id: string; name: string; city: string }[]
  >(
    `
    SELECT c.id, c.name, c.city
    FROM "Community" c
    WHERE NOT EXISTS (
      SELECT 1 FROM "Poi" p WHERE p."communityId" = c.id
    )
    ORDER BY c.city, c.id
    `,
  );

  const withPoi = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM "Community" c
     WHERE EXISTS (SELECT 1 FROM "Poi" p WHERE p."communityId" = c.id)`,
  );

  console.log(
    `Communities with food: ${withPoi[0]?.n ?? 0}; without: ${zeros.length}`,
  );

  const batch = zeros.slice(0, limit);
  console.log(
    `${dryRun ? "Would sync" : "Syncing"} ${batch.length} (limit=${limit}; ~${batch.length * 2}–${batch.length * 3} Yelp calls)…`,
  );

  if (dryRun) {
    for (const c of batch.slice(0, 25)) {
      console.log(`  ${c.id} · ${c.city}`);
    }
    if (batch.length > 25) console.log(`  …and ${batch.length - 25} more`);
    return;
  }

  let ok = 0;
  let empty = 0;
  for (const c of batch) {
    try {
      const result = await syncYelpForCommunity(c.id, {
        radiusMeters: 2800,
        limit: 40,
      });
      console.log(
        `  ${c.id}: fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped}`,
      );
      if (result.upserted === 0) empty += 1;
      else ok += 1;
    } catch (err) {
      console.log(
        `  ${c.id}: ERROR ${err instanceof Error ? err.message : err}`,
      );
    }
    await new Promise((r) => setTimeout(r, 450));
  }

  console.log(`Done. gained food=${ok}, still empty=${empty}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
