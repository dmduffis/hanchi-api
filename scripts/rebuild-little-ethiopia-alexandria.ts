/**
 * Rebuild Little Ethiopia Alexandria on the west Alexandria corridor
 * (Southern Towers / Van Dorn / Duke) — wiki pin was city-hall Old Town
 * and only captured Hawwi on Queen St.
 *
 * Usage: npx tsx scripts/rebuild-little-ethiopia-alexandria.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_COMMUNITY_SYNC_RADIUS_M,
  effectiveDelta,
} from "../src/lib/communityBounds";
import { syncYelpForCommunity } from "../src/lib/yelpSync";

const ID = "little-ethiopia-alexandria-virginia";
/** Van Dorn × Duke — west Alexandria Ethiopian commercial pocket. */
const LAT = 38.81;
const LNG = -77.13;
const DELTA = 0.022;

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
      name: "Little Ethiopia in Alexandria",
      neighborhood: "Van Dorn & Southern Towers, Alexandria",
      city: "Alexandria, Virginia",
      description:
        "West Alexandria's Ethiopian corridor near Van Dorn and Southern Towers — injera, tibs, and markets shared with the wider DMV diaspora.",
      heroEmoji: "🇪🇹",
    },
  });
  console.log("updated metadata", ID);

  await prisma.$executeRawUnsafe(
    `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
    squarePolygonWkt(LAT, LNG, effectiveDelta(DELTA)),
    ID,
  );
  console.log("boundary set", LAT, LNG, "delta", DELTA);

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

  const sample = await prisma.poi.findMany({
    where: { communityId: ID },
    select: { name: true, ethnicities: true, address: true, category: true },
    orderBy: { name: "asc" },
  });
  console.log("pois now", sample.length);
  for (const p of sample) {
    console.log(
      " ",
      p.name,
      "|",
      p.ethnicities.join(",") || "(none)",
      "|",
      p.category,
      "|",
      p.address,
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
