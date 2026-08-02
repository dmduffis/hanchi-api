/**
 * Rebuild the Serbian/Balkan Ridgewood–Glendale enclave at the real
 * Myrtle / Forest Ave corridor (wiki row was mis-geocoded to east Queens).
 *
 * Usage: npx tsx scripts/rebuild-ridgewood-serbia.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_COMMUNITY_SYNC_RADIUS_M,
  effectiveDelta,
} from "../src/lib/communityBounds";
import { syncYelpForCommunity } from "../src/lib/yelpSync";

const ID = "ridgewood-queens-new-york";
/** Myrtle Ave × Fresh Pond Rd — heart of Balkan Ridgewood. */
const LAT = 40.7012;
const LNG = -73.8978;
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
  const existing = await prisma.community.findUnique({ where: { id: ID } });
  if (!existing) {
    await prisma.community.create({
      data: {
        id: ID,
        name: "Little Serbia",
        neighborhood: "Ridgewood & Glendale, Queens",
        city: "New York City, New York",
        description:
          "Queens' Serbian and Balkan corridor — Myrtle and Forest Avenue markets, ćevapi, and the Serbian Association anchoring Ridgewood and Glendale.",
        heroEmoji: "🇷🇸",
      },
    });
    console.log("created", ID);
  } else {
    await prisma.community.update({
      where: { id: ID },
      data: {
        name: "Little Serbia",
        neighborhood: "Ridgewood & Glendale, Queens",
        city: "New York City, New York",
        description:
          "Queens' Serbian and Balkan corridor — Myrtle and Forest Avenue markets, ćevapi, and the Serbian Association anchoring Ridgewood and Glendale.",
        heroEmoji: "🇷🇸",
      },
    });
    console.log("updated metadata", ID);
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
    squarePolygonWkt(LAT, LNG, effectiveDelta(DELTA)),
    ID,
  );
  console.log("boundary set", LAT, LNG, "delta", DELTA);

  // Drop the mis-attached Greek food truck from the old east-Queens pin.
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
    select: { name: true, ethnicities: true, address: true },
    take: 12,
    orderBy: { name: "asc" },
  });
  console.log("pois now", n);
  for (const p of sample) {
    console.log(" ", p.name, "|", p.ethnicities.join(","), "|", p.address);
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
