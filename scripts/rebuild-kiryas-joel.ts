/**
 * Rebuild Kiryas Joel (Satmar Hasidic village near Monroe / Palm Tree):
 * - Fix name/copy (not "Israeli")
 * - Drop Manhattan orphan pins
 * - Resync local kosher / Jewish food inside a tight Orange County boundary
 *
 * Usage: npx tsx scripts/rebuild-kiryas-joel.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_COMMUNITY_SYNC_RADIUS_M,
  effectiveDelta,
} from "../src/lib/communityBounds";
import { syncYelpForCommunity } from "../src/lib/yelpSync";

const ID = "kiryas-joel-new-york-near-monroe-new-york";
/** Village core near Forest Rd / Bakertown, Orange County. */
const LAT = 41.342;
const LNG = -74.167;
const DELTA = 0.014;

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
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
  const existing = await prisma.community.findUnique({ where: { id: ID } });
  if (!existing) {
    throw new Error(`Community not found: ${ID}`);
  }

  await prisma.community.update({
    where: { id: ID },
    data: {
      name: "Kiryas Joel",
      neighborhood: "Palm Tree / Monroe, Orange County",
      city: "Orange County, New York",
      description:
        "Satmar Hasidic Kiryas Joel in Orange County — a tightly knit Yiddish-speaking village near Monroe with kosher bakeries, pizza, and groceries.",
      heroEmoji: "✡️",
    },
  });
  console.log("updated metadata", ID);

  const delta = effectiveDelta(DELTA);
  await prisma.$executeRawUnsafe(
    `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
    squarePolygonWkt(LAT, LNG, delta),
    ID,
  );
  console.log("boundary set", LAT, LNG, "delta", delta);

  const orphaned = await prisma.poi.updateMany({
    where: { communityId: ID },
    data: { communityId: null },
  });
  console.log("orphaned stale pois", orphaned.count);

  const result = await syncYelpForCommunity(ID, {
    radiusMeters: Math.max(DEFAULT_COMMUNITY_SYNC_RADIUS_M, 3500),
    limit: 50,
  });
  console.log("yelp sync", result);

  const sample = await prisma.$queryRawUnsafe<
    { name: string; address: string | null; category: string; km: number }[]
  >(
    `
    SELECT p.name, p.address, p.category,
      ST_Distance(p.location::geography, ST_Centroid(c.boundary)::geography) / 1000 AS km
    FROM "Poi" p
    JOIN "Community" c ON c.id = p."communityId"
    WHERE p."communityId" = $1 AND p.location IS NOT NULL
    ORDER BY km ASC
    `,
    ID,
  );
  console.log("pois now", sample.length);
  for (const p of sample) {
    console.log(
      `  ${Number(p.km).toFixed(2)}km  ${p.name} — ${p.category} — ${p.address}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
