/**
 * Rebuild Excelsior District SF — wiki lists it under Latin America /
 * Guatemala (not Yemen). Old row used SF city-hall coords + Yemeni Yelp.
 *
 * Usage: npx tsx scripts/rebuild-excelsior-sf.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_COMMUNITY_SYNC_RADIUS_M,
  effectiveDelta,
} from "../src/lib/communityBounds";
import { syncYelpForCommunity } from "../src/lib/yelpSync";

const ID = "excelsior-district-san-francisco-california";
/** Mission St × Ocean Ave — heart of the Excelsior. */
const LAT = 37.7235;
const LNG = -122.434;
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
  await prisma.community.update({
    where: { id: ID },
    data: {
      name: "Excelsior District",
      neighborhood: "Excelsior, San Francisco",
      city: "San Francisco, California",
      description:
        "San Francisco's Excelsior — a Latino and Filipino neighborhood along Mission Street, with Guatemalan, Salvadoran, Mexican, and Filipino markets and restaurants.",
      heroEmoji: "🇬🇹",
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
    radiusMeters: Math.min(DEFAULT_COMMUNITY_SYNC_RADIUS_M, 1800),
    limit: 50,
  });
  console.log("yelp sync", result);

  const n = await prisma.poi.count({ where: { communityId: ID } });
  const sample = await prisma.poi.findMany({
    where: { communityId: ID },
    select: { name: true, ethnicities: true, address: true },
    take: 15,
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
