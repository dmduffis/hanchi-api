/**
 * Re-apply expanded boundaries and re-sync Yelp for all five-metro enclaves
 * (Houston, Seattle, Boston, DC, DFW) with a wider search radius.
 *
 * Usage: npx tsx scripts/resync-five-metros.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_COMMUNITY_SYNC_RADIUS_M,
  effectiveDelta,
} from "../src/lib/communityBounds";
import { syncYelpForCommunity } from "../src/lib/yelpSync";
import { FIVE_METRO_COMMUNITIES as COMMUNITIES } from "./data/five-metros-communities";

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

function squarePolygonWkt(lat: number, lng: number, delta: number): string {
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  return `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;
}

async function main() {
  console.log(`Updating boundaries for ${COMMUNITIES.length} enclaves…`);
  for (const c of COMMUNITIES) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
      squarePolygonWkt(c.lat, c.lng, effectiveDelta(c.delta)),
      c.id,
    );
    console.log(
      `  ✓ boundary ${c.id} (δ=${effectiveDelta(c.delta)})`,
    );
  }

  console.log(
    `\nRe-syncing Yelp (radius ${DEFAULT_COMMUNITY_SYNC_RADIUS_M}m)…`,
  );
  for (const c of COMMUNITIES) {
    const before = await prisma.poi.count({ where: { communityId: c.id } });
    const result = await syncYelpForCommunity(c.id, {
      radiusMeters: DEFAULT_COMMUNITY_SYNC_RADIUS_M,
      limit: 50,
    });
    const after = await prisma.poi.count({ where: { communityId: c.id } });
    console.log(
      `  ${c.id}: before=${before} after=${after} fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped}`,
    );
    await new Promise((r) => setTimeout(r, 400));
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
