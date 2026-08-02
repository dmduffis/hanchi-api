/**
 * Upsert Greater Detroit enclaves without wiping existing communities / POIs.
 *
 * Usage: npx tsx scripts/add-detroit-communities.ts
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
    id: "little-arabia-dearborn",
    name: "Little Arabia in Dearborn",
    neighborhood: "Warren Avenue, Dearborn",
    city: "Metro Detroit",
    description:
      "America's Arab capital — Warren Avenue bakeries, shawarma spots, and the densest Middle Eastern food corridor outside the Middle East.",
    heroEmoji: "🇱🇧",
    lat: 42.3223,
    lng: -83.1763,
    delta: 0.036,
  },
  {
    id: "yemeni-south-end-dearborn",
    name: "Yemeni South End in Dearborn",
    neighborhood: "Salina / South End & Schaefer",
    city: "Metro Detroit",
    description:
      "Metro Detroit's historic Yemeni community — South End roots around Salina since the Rouge Plant era, plus mandi houses, sabaya bakeries, and coffee chains along Schaefer and Michigan Avenue into Dearborn Heights.",
    heroEmoji: "🇾🇪",
    // South End (Salina) + Schaefer / Michigan Ave food corridor; keep north
    // edge below the densest Warren Ave Lebanese strip.
    lat: 42.308,
    lng: -83.158,
    delta: 0.028,
  },
  {
    id: "little-baghdad-sterling-heights",
    name: "Little Baghdad in Sterling Heights",
    neighborhood: "15 Mile & Dequindre, Sterling Heights",
    city: "Metro Detroit",
    description:
      "Metro Detroit's Chaldean and Iraqi hub — restaurants, markets, and bilingual storefronts around 15 Mile and Dequindre.",
    heroEmoji: "🇮🇶",
    lat: 42.5806,
    lng: -83.0675,
    delta: 0.04,
  },
  {
    id: "banglatown-hamtramck",
    name: "Banglatown in Hamtramck",
    neighborhood: "Conant Street, Hamtramck",
    city: "Metro Detroit",
    description:
      "Hamtramck's Banglatown — Bangladeshi groceries, sweets shops, and South Asian restaurants along Conant Street.",
    heroEmoji: "🇧🇩",
    lat: 42.3978,
    lng: -83.057,
    delta: 0.036,
  },
  {
    id: "mexicantown-detroit",
    name: "Mexicantown in Detroit",
    neighborhood: "Southwest Detroit",
    city: "Metro Detroit",
    description:
      "Detroit's Mexicantown — tacos, bakeries, and murals along Vernor and Bagley in Southwest Detroit.",
    heroEmoji: "🇲🇽",
    lat: 42.3185,
    lng: -83.0865,
    delta: 0.032,
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
  console.log(`Upserting ${COMMUNITIES.length} Metro Detroit enclaves…`);

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

  console.log("\nSyncing Yelp for Metro Detroit enclaves…");
  // Sync Little Yemen after Little Arabia so Yemeni spots can reclaim.
  const syncOrder = [...COMMUNITIES].sort((a, b) => {
    if (a.id === "yemeni-south-end-dearborn") return 1;
    if (b.id === "yemeni-south-end-dearborn") return -1;
    return 0;
  });
  for (const c of syncOrder) {
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
