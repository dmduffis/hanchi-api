/**
 * Upsert + expand boundaries + Yelp re-sync for Connecticut, Florida
 * (Greater Miami / Orlando / Tampa / Jacksonville), and Twin Cities.
 *
 * Usage: npx tsx scripts/resync-ct-fl-mn.ts
 *    or: npm run communities:resync-ct-fl-mn
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { syncYelpForCommunity } from "../src/lib/yelpSync";
import { CONNECTICUT_COMMUNITIES } from "./data/connecticut-communities";
import { FLORIDA_COMMUNITIES } from "./data/florida-communities";
import { MINNESOTA_COMMUNITIES } from "./data/minnesota-communities";

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

const COMMUNITIES = [
  ...CONNECTICUT_COMMUNITIES,
  ...FLORIDA_COMMUNITIES,
  ...MINNESOTA_COMMUNITIES,
];

function squarePolygonWkt(lat: number, lng: number, delta: number): string {
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  return `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;
}

async function main() {
  console.log(`Upserting + boundary update for ${COMMUNITIES.length} enclaves…`);

  for (const c of COMMUNITIES) {
    await prisma.community.upsert({
      where: { id: c.id },
      create: {
        id: c.id,
        name: c.name,
        neighborhood: c.neighborhood,
        city: c.city,
        description: c.description,
        heroEmoji: c.heroEmoji,
      },
      update: {
        name: c.name,
        neighborhood: c.neighborhood,
        city: c.city,
        description: c.description,
        heroEmoji: c.heroEmoji,
      },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
      squarePolygonWkt(c.lat, c.lng, c.delta),
      c.id,
    );
    console.log(`  ✓ ${c.id}`);
  }

  console.log("\nRe-syncing Yelp (radius 4000m)…");
  for (const c of COMMUNITIES) {
    const before = await prisma.poi.count({ where: { communityId: c.id } });
    const result = await syncYelpForCommunity(c.id, {
      radiusMeters: 4000,
      limit: 40,
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
