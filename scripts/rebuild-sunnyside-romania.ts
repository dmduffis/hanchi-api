/**
 * Rebuild the Romanian Sunnyside enclave at the real 41st St / 43rd Ave
 * corridor (wiki row was mis-geocoded to east Queens).
 *
 * Usage: npx tsx scripts/rebuild-sunnyside-romania.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_COMMUNITY_SYNC_RADIUS_M,
  effectiveDelta,
} from "../src/lib/communityBounds";
import { syncYelpForCommunity } from "../src/lib/yelpSync";

const ID = "sunnyside-queens-new-york";
/** Between Romanian Garden (43rd Ave) and Danubius (41st St). */
const LAT = 40.7445;
const LNG = -73.9205;
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
    await prisma.community.create({
      data: {
        id: ID,
        name: "Little Romania",
        neighborhood: "Sunnyside, Queens",
        city: "New York City, New York",
        description:
          "Sunnyside's Romanian corridor — sarmale, mici, and live music at spots like Romanian Garden and Danubius along 41st Street and 43rd Avenue.",
        heroEmoji: "🇷🇴",
      },
    });
    console.log("created", ID);
  } else {
    await prisma.community.update({
      where: { id: ID },
      data: {
        name: "Little Romania",
        neighborhood: "Sunnyside, Queens",
        city: "New York City, New York",
        description:
          "Sunnyside's Romanian corridor — sarmale, mici, and live music at spots like Romanian Garden and Danubius along 41st Street and 43rd Avenue.",
        heroEmoji: "🇷🇴",
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

  const orphaned = await prisma.poi.updateMany({
    where: { communityId: ID },
    data: { communityId: null },
  });
  console.log("orphaned stale pois", orphaned.count);

  const result = await syncYelpForCommunity(ID, {
    // Keep tight — Astoria is ~1.5km north and will otherwise flood the pin.
    radiusMeters: Math.min(DEFAULT_COMMUNITY_SYNC_RADIUS_M, 1200),
    limit: 40,
  });
  console.log("yelp sync", result);

  // Drop anything outside the Sunnyside ZIP / address band (Astoria spillover).
  const attached = await prisma.poi.findMany({
    where: { communityId: ID },
    select: { id: true, name: true, address: true },
  });
  const spill = attached.filter((p) => {
    const a = p.address ?? "";
    if (/Astoria|1110[236]/i.test(a)) return true;
    if (/Woodside|11377/i.test(a)) return true;
    return false;
  });
  if (spill.length) {
    await prisma.poi.updateMany({
      where: { id: { in: spill.map((p) => p.id) } },
      data: { communityId: null },
    });
    console.log(
      "orphaned spillover",
      spill.length,
      spill.map((p) => p.name),
    );
  }

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
