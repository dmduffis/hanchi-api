/**
 * Upsert Long Island enclaves without wiping existing NYC communities / POIs.
 *
 * Usage: npx tsx scripts/add-long-island-communities.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_COMMUNITY_SYNC_RADIUS_M,
  effectiveDelta,
} from "../src/lib/communityBounds";
import { syncYelpForCommunity } from "../src/lib/yelpSync";

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
  {
    id: "little-india-hicksville",
    name: "Little India in Hicksville",
    neighborhood: "Hicksville, Nassau",
    city: "Long Island",
    description:
      "Long Island's Desi hub — South Asian groceries, sweets shops, and restaurants clustered around Broadway and Old Country Road.",
    heroEmoji: "🇮🇳",
    lat: 40.7681,
    lng: -73.5251,
    delta: 0.022,
  },
  {
    id: "little-portugal-mineola",
    name: "Little Portugal in Mineola",
    neighborhood: "Mineola, Nassau",
    city: "Long Island",
    description:
      "The heart of New York's Portuguese community — pastelarias, seafood spots, and Jericho Turnpike weekends that feel like a festa.",
    heroEmoji: "🇵🇹",
    lat: 40.7493,
    lng: -73.6407,
    delta: 0.018,
  },
  {
    id: "little-el-salvador-brentwood",
    name: "Little El Salvador",
    neighborhood: "Brentwood & Central Islip, Suffolk",
    city: "Long Island",
    description:
      "Suffolk's Salvadoran corridor — pupuserías, panaderías, and Central American markets that anchor Brentwood and Central Islip.",
    heroEmoji: "🇸🇻",
    lat: 40.785,
    lng: -73.224,
    delta: 0.03,
  },
  {
    id: "koreatown-nassau",
    name: "Koreatown in Nassau",
    neighborhood: "New Hyde Park / Northern Blvd, Nassau",
    city: "Long Island",
    description:
      "Where the Kimchi Belt crosses into Nassau — Korean BBQ, bakeries, and H Mart runs along Northern Boulevard past the Queens line.",
    heroEmoji: "🇰🇷",
    lat: 40.7635,
    lng: -73.705,
    delta: 0.028,
  },
] as const;

function squarePolygonWkt(lat: number, lng: number, delta: number): string {
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  return `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;
}

async function main() {
  console.log(`Upserting ${COMMUNITIES.length} Long Island enclaves…`);

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
      squarePolygonWkt(c.lat, c.lng, effectiveDelta(c.delta)),
      c.id,
    );
    console.log(`  ✓ ${c.id}`);
  }

  console.log("\nSyncing Yelp for Long Island enclaves…");
  for (const c of COMMUNITIES) {
    const result = await syncYelpForCommunity(c.id, {
      radiusMeters: DEFAULT_COMMUNITY_SYNC_RADIUS_M,
      limit: 50,
    });
    console.log(
      `  ${result.communityId}: fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped}`,
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
