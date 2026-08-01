/**
 * Upsert Chicago / Chicagoland enclaves without wiping existing data.
 *
 * Usage: npx tsx scripts/add-chicago-communities.ts
 *    or: npm run communities:add-chicago
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

const COMMUNITIES = [
  {
    id: "chinatown-chicago",
    name: "Chinatown in Chicago",
    neighborhood: "Armour Square, Chicago",
    city: "Chicago",
    description:
      "Chicago's Chinatown around Wentworth and Cermak — dim sum, hot pot, and the Chinatown Gate at the heart of the South Side corridor.",
    heroEmoji: "🇨🇳",
    lat: 41.8522,
    lng: -87.6321,
    delta: 0.014,
  },
  {
    id: "argyle-chicago",
    name: "Argyle Street in Chicago",
    neighborhood: "Uptown, Chicago",
    city: "Chicago",
    description:
      "Uptown's Argyle Street — Chicago's Little Saigon of phở, bánh mì, and Vietnamese groceries under the Red Line.",
    heroEmoji: "🇻🇳",
    lat: 41.9733,
    lng: -87.6582,
    delta: 0.012,
  },
  {
    id: "devon-avenue-chicago",
    name: "Devon Avenue in Chicago",
    neighborhood: "West Ridge, Chicago",
    city: "Chicago",
    description:
      "West Ridge's Devon Avenue — Indian and Pakistani restaurants, sweet shops, and markets stretching west from Western Avenue.",
    heroEmoji: "🇮🇳",
    lat: 41.9978,
    lng: -87.6995,
    delta: 0.02,
  },
  {
    id: "little-village-chicago",
    name: "Little Village in Chicago",
    neighborhood: "South Lawndale, Chicago",
    city: "Chicago",
    description:
      "Chicago's Little Village — 26th Street taquerías, panaderías, and the arch that welcomes you into one of the Midwest's densest Mexican corridors.",
    heroEmoji: "🇲🇽",
    lat: 41.8455,
    lng: -87.7055,
    delta: 0.018,
  },
  {
    id: "pilsen-chicago",
    name: "Pilsen in Chicago",
    neighborhood: "Lower West Side, Chicago",
    city: "Chicago",
    description:
      "Pilsen's murals, 18th Street taquerías, and galleries — a Mexican cultural heartland just southwest of downtown.",
    heroEmoji: "🇲🇽",
    lat: 41.8562,
    lng: -87.6569,
    delta: 0.014,
  },
  {
    id: "bridgeview-chicago",
    name: "Bridgeview in Chicagoland",
    neighborhood: "Bridgeview, Illinois",
    city: "Chicago",
    description:
      "Southwest suburban Bridgeview — Middle Eastern restaurants, bakeries, and one of the Midwest's largest Arab American communities.",
    heroEmoji: "🇵🇸",
    lat: 41.7501,
    lng: -87.8042,
    delta: 0.022,
  },
  {
    id: "albany-park-chicago",
    name: "Albany Park in Chicago",
    neighborhood: "Albany Park, Chicago",
    city: "Chicago",
    description:
      "Albany Park along Lawrence Avenue — Korean barbecue roots, plus one of Chicago's most globally mixed food streets.",
    heroEmoji: "🇰🇷",
    lat: 41.9681,
    lng: -87.7231,
    delta: 0.016,
  },
  {
    id: "greektown-chicago",
    name: "Greektown in Chicago",
    neighborhood: "Near West Side, Chicago",
    city: "Chicago",
    description:
      "Greektown on South Halsted — gyros, saganaki, and late-night baklava just west of the Loop.",
    heroEmoji: "🇬🇷",
    lat: 41.8785,
    lng: -87.6474,
    delta: 0.01,
  },
  {
    id: "little-italy-chicago",
    name: "Little Italy in Chicago",
    neighborhood: "Taylor Street, Chicago",
    city: "Chicago",
    description:
      "Taylor Street's Little Italy — red-sauce classics, espresso bars, and the historic Near West Side Italian corridor.",
    heroEmoji: "🇮🇹",
    lat: 41.8695,
    lng: -87.6615,
    delta: 0.012,
  },
  {
    id: "humboldt-park-chicago",
    name: "Paseo Boricua in Humboldt Park",
    neighborhood: "Humboldt Park, Chicago",
    city: "Chicago",
    description:
      "Division Street's Paseo Boricua — Puerto Rican flags, cafés, and the cultural heart of Chicago's Boricua community.",
    heroEmoji: "🇵🇷",
    lat: 41.9035,
    lng: -87.7055,
    delta: 0.014,
  },
  {
    id: "polish-village-chicago",
    name: "Polish Village in Chicago",
    neighborhood: "Avondale, Chicago",
    city: "Chicago",
    description:
      "Avondale's Polish Village (Jackowo) — pierogi, bakeries, and Milwaukee Avenue storefronts that still speak Polish.",
    heroEmoji: "🇵🇱",
    lat: 41.9395,
    lng: -87.7255,
    delta: 0.014,
  },
  {
    id: "ukrainian-village-chicago",
    name: "Ukrainian Village in Chicago",
    neighborhood: "West Town, Chicago",
    city: "Chicago",
    description:
      "Ukrainian Village — onion-dome churches, Eastern European delis, and a dense West Town cultural corridor.",
    heroEmoji: "🇺🇦",
    lat: 41.8965,
    lng: -87.6775,
    delta: 0.012,
  },
  {
    id: "bolingbrook-chicago",
    name: "Bolingbrook in Chicagoland",
    neighborhood: "Bolingbrook, Illinois",
    city: "Chicago",
    description:
      "Southwest suburban Bolingbrook — one of Chicagoland's strongest Pakistani restaurant and market corridors.",
    heroEmoji: "🇵🇰",
    lat: 41.6986,
    lng: -88.0684,
    delta: 0.024,
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
  console.log(`Upserting ${COMMUNITIES.length} Chicago enclaves…`);

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

  console.log("\nSyncing Yelp for Chicago enclaves…");
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
