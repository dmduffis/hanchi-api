/**
 * Upsert San Francisco cultural communities (country / ethnic heritage) without
 * wiping existing NYC / LA / Detroit / LI data.
 *
 * Based on SF Cultural Districts that represent cultural heritage communities —
 * excludes gender / LGBTQ identity districts.
 *
 * Source: SF Cultural Districts Program
 * https://www.sf.gov/san-francisco-cultural-districts-program
 *
 * Usage: npx tsx scripts/add-sf-communities.ts
 *    or: npm run communities:add-sf
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
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

/** Official SF Cultural Districts that map to country / ethnic heritage. */
const COMMUNITIES = [
  {
    id: "japantown-sf",
    name: "Japantown Cultural District",
    neighborhood: "Western Addition, San Francisco",
    city: "San Francisco",
    description:
      "One of only three remaining Japantowns in the U.S. — ramen, sushi, mochi, and community festivals around Post and Buchanan.",
    heroEmoji: "🇯🇵",
    lat: 37.7854,
    lng: -122.4297,
    delta: 0.012,
  },
  {
    id: "calle-24-sf",
    name: "Calle 24 Latino Cultural District",
    neighborhood: "Mission District, San Francisco",
    city: "San Francisco",
    description:
      "The Latino heart of the Mission — murals, markets, and pan-Latino kitchens along 24th Street (Calle Veinticuatro).",
    heroEmoji: "🇲🇽",
    lat: 37.7525,
    lng: -122.4183,
    delta: 0.014,
  },
  {
    id: "soma-pilipinas-sf",
    name: "SoMa Pilipinas Filipino Cultural District",
    neighborhood: "South of Market, San Francisco",
    city: "San Francisco",
    description:
      "San Francisco's Filipino cultural district — lumpia, adobo, and community spaces across SoMa, with deep roots at the I-Hotel.",
    heroEmoji: "🇵🇭",
    lat: 37.7785,
    lng: -122.4055,
    delta: 0.016,
  },
  {
    id: "african-american-arts-sf",
    name: "African American Arts and Cultural District",
    neighborhood: "Bayview Hunters Point, San Francisco",
    city: "San Francisco",
    description:
      "Bayview–Hunters Point's African American arts and cultural district — soul food, community arts, and Black San Francisco history.",
    heroEmoji: "🖤",
    lat: 37.7315,
    lng: -122.3845,
    delta: 0.028,
  },
  {
    id: "american-indian-sf",
    name: "American Indian Cultural District",
    neighborhood: "Mission District, San Francisco",
    city: "San Francisco",
    description:
      "The first large U.S. cultural district dedicated to American Indian legacy — on Ramaytush Ohlone land in the Mission.",
    heroEmoji: "🪶",
    lat: 37.7595,
    lng: -122.4192,
    delta: 0.014,
  },
  {
    id: "sunset-chinese-sf",
    name: "Sunset Chinese Cultural District",
    neighborhood: "Sunset District, San Francisco",
    city: "San Francisco",
    description:
      "The Outer Sunset's Chinese cultural district — bakeries, seafood houses, and family kitchens west of 19th Avenue to the ocean.",
    heroEmoji: "🇨🇳",
    lat: 37.7535,
    lng: -122.4945,
    delta: 0.03,
  },
  {
    id: "pacific-islander-sf",
    name: "Pacific Islander Cultural District",
    neighborhood: "Visitacion Valley / Sunnydale, San Francisco",
    city: "San Francisco",
    description:
      "Visitacion Valley and Sunnydale's Pacific Islander cultural district — Samoan, Tongan, and broader PI community life in the southeast.",
    heroEmoji: "🇼🇸",
    lat: 37.7135,
    lng: -122.4075,
    delta: 0.016,
  },
] as const;

/** Previously seeded districts that are not country / ethnic heritage — remove on run. */
const REMOVE_IDS = [
  "transgender-district-sf",
  "leather-lgbtq-sf",
  "castro-lgbtq-sf",
] as const;

function squarePolygonWkt(lat: number, lng: number, delta: number): string {
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  return `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;
}

async function main() {
  console.log(`Removing ${REMOVE_IDS.length} non-heritage SF districts…`);
  for (const id of REMOVE_IDS) {
    const deleted = await prisma.community.deleteMany({ where: { id } });
    if (deleted.count > 0) console.log(`  ✕ removed ${id}`);
  }

  console.log(
    `\nUpserting ${COMMUNITIES.length} San Francisco cultural communities…`,
  );

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

  console.log("\nSyncing Yelp for SF Cultural Districts…");
  for (const c of COMMUNITIES) {
    const result = await syncYelpForCommunity(c.id, {
      radiusMeters: 2500,
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
