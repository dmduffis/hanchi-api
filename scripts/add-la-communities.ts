/**
 * Upsert Greater LA / Orange County enclaves without wiping existing data.
 *
 * Usage: npx tsx scripts/add-la-communities.ts
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
    id: "koreatown-la",
    name: "Koreatown in Los Angeles",
    neighborhood: "Wilshire / Western, Los Angeles",
    city: "Los Angeles",
    description:
      "The largest Koreatown outside Seoul — barbecue halls, noraebang nights, and late-night soondubu around Wilshire and Western.",
    heroEmoji: "🇰🇷",
    lat: 34.061,
    lng: -118.302,
    delta: 0.022,
  },
  {
    id: "thai-town-la",
    name: "Thai Town in Los Angeles",
    neighborhood: "East Hollywood, Los Angeles",
    city: "Los Angeles",
    description:
      "America's only official Thai Town — pad thai, boat noodles, and markets along Hollywood Boulevard between Normandie and Western.",
    heroEmoji: "🇹🇭",
    lat: 34.1015,
    lng: -118.305,
    delta: 0.014,
  },
  {
    id: "little-tokyo-la",
    name: "Little Tokyo in Los Angeles",
    neighborhood: "Downtown Los Angeles",
    city: "Los Angeles",
    description:
      "One of only three official Japantowns in the U.S. — ramen, sushi, and the Japanese American National Museum in downtown LA.",
    heroEmoji: "🇯🇵",
    lat: 34.0501,
    lng: -118.2405,
    delta: 0.012,
  },
  {
    id: "little-ethiopia-la",
    name: "Little Ethiopia in Los Angeles",
    neighborhood: "Fairfax Avenue, Los Angeles",
    city: "Los Angeles",
    description:
      "Ethiopian restaurants, coffee, and shops clustered on Fairfax near Olympic — injera, tibs, and first-Thursday nights.",
    heroEmoji: "🇪🇹",
    lat: 34.0545,
    lng: -118.366,
    delta: 0.012,
  },
  {
    id: "little-arabia-anaheim",
    name: "Little Arabia in Anaheim",
    neighborhood: "Brookhurst Street, Anaheim",
    city: "Orange County",
    description:
      "Orange County's Arab corridor — shawarma, bakeries, and Middle Eastern markets along Brookhurst in Anaheim.",
    heroEmoji: "🇸🇾",
    lat: 33.8345,
    lng: -117.9555,
    delta: 0.022,
  },
  {
    id: "little-saigon-westminster",
    name: "Little Saigon in Westminster",
    neighborhood: "Bolsa Avenue, Westminster",
    city: "Orange County",
    description:
      "The largest Little Saigon in the U.S. — phở, bánh mì, and Vietnamese plazas around Bolsa Avenue in Westminster and Garden Grove.",
    heroEmoji: "🇻🇳",
    lat: 33.745,
    lng: -117.954,
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
  console.log(`Upserting ${COMMUNITIES.length} LA / OC enclaves…`);

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

  console.log("\nSyncing Yelp for LA / OC enclaves…");
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
