/**
 * Rebuild Little Albania on the Belmont / Arthur Avenue corridor
 * (Fordham pin was too far west; Yelp only found 2 spots).
 *
 * Usage: npx tsx scripts/rebuild-little-albania.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_COMMUNITY_SYNC_RADIUS_M,
  effectiveDelta,
} from "../src/lib/communityBounds";
import { syncYelpForCommunity } from "../src/lib/yelpSync";

const ID = "little-albania";
/** Arthur Avenue × E 187th — Belmont commercial core. */
const LAT = 40.8545;
const LNG = -73.888;
const DELTA = 0.018;

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
  await prisma.community.update({
    where: { id: ID },
    data: {
      name: "Little Albania",
      neighborhood: "Belmont & Fordham, Bronx",
      city: "New York",
      description:
        "The Bronx Albanian corridor around Belmont and Arthur Avenue — cafés, bakeries, and Balkan grilling shared with Little Italy.",
      heroEmoji: "🇦🇱",
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
    radiusMeters: Math.max(DEFAULT_COMMUNITY_SYNC_RADIUS_M, 2800),
    limit: 50,
  });
  console.log("yelp sync", result);

  const n = await prisma.poi.count({ where: { communityId: ID } });
  const sample = await prisma.poi.findMany({
    where: { communityId: ID },
    select: { name: true, ethnicities: true, address: true, category: true },
    orderBy: { name: "asc" },
  });
  console.log("pois now", n);
  for (const p of sample) {
    console.log(
      " ",
      p.name,
      "|",
      p.ethnicities.join(","),
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
