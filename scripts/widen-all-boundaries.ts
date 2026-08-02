/**
 * Expand community polygons by BOUNDARY_EXPAND_BUFFER_M, then re-sync Yelp
 * (additive upsert). Skips Metro Detroit (already widened separately).
 *
 * Usage: npx tsx scripts/widen-all-boundaries.ts
 *    or: npm run communities:widen-all
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  BOUNDARY_EXPAND_BUFFER_M,
  DEFAULT_COMMUNITY_SYNC_RADIUS_M,
} from "../src/lib/communityBounds";
import { syncYelpForCommunity } from "../src/lib/yelpSync";

const SKIP_IDS = new Set([
  "little-arabia-dearborn",
  "yemeni-south-end-dearborn",
  "little-baghdad-sterling-heights",
  "banglatown-hamtramck",
  "mexicantown-detroit",
]);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const needsSsl =
  /supabase\.(co|com)/.test(connectionString) ||
  connectionString.includes("sslmode=require");

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  }),
});

async function main() {
  const skipList = [...SKIP_IDS];
  console.log(
    `1) Expanding community boundaries by ${BOUNDARY_EXPAND_BUFFER_M}m (skipping Detroit)…`,
  );
  // Envelope keeps a Polygon-typed column happy after geography buffer.
  await prisma.$executeRawUnsafe(
    `
    UPDATE "Community"
    SET boundary = ST_SetSRID(
      ST_Envelope(ST_Buffer(boundary::geography, $1)::geometry),
      4326
    )
    WHERE boundary IS NOT NULL
      AND id <> ALL($2::text[])
    `,
    BOUNDARY_EXPAND_BUFFER_M,
    skipList,
  );
  console.log("   boundaries expanded");

  const communities = await prisma.community.findMany({
    where: { id: { notIn: skipList } },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  console.log(
    `\n2) Syncing Yelp for ${communities.length} communities (radius ${DEFAULT_COMMUNITY_SYNC_RADIUS_M}m)…`,
  );
  for (const c of communities) {
    try {
      const before = await prisma.poi.count({ where: { communityId: c.id } });
      const result = await syncYelpForCommunity(c.id, {
        radiusMeters: DEFAULT_COMMUNITY_SYNC_RADIUS_M,
        limit: 50,
      });
      const after = await prisma.poi.count({ where: { communityId: c.id } });
      console.log(
        `  ${c.id}: before=${before} after=${after} fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped}`,
      );
    } catch (err) {
      console.error(`  ✗ ${c.id}:`, err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
