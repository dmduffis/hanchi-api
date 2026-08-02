/**
 * Move Wikipedia communities that were geocoded to a city-hall / metro
 * centroid onto their actual neighborhood pins.
 *
 * Usage: npx tsx scripts/fix-city-centroid-boundaries.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { effectiveDelta } from "../src/lib/communityBounds";

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

type Fix = { id: string; lat: number; lng: number; delta?: number };

/** Neighborhood pins for rows stuck on city-level Nominatim results. */
const FIXES: Fix[] = [
  // NYC metro — were at City Hall (40.7128, -74.006)
  { id: "astoria-queens-new-york-city", lat: 40.772, lng: -73.93 },
  {
    id: "bangladesh-street-jackson-heights-queens-new-york-city-new-york",
    lat: 40.7475,
    lng: -73.8915,
  },
  { id: "bay-ridge-brooklyn-new-york-city", lat: 40.634, lng: -74.028 },
  { id: "greenpoint-new-york-city", lat: 40.7305, lng: -73.954 },
  { id: "hicksville-new-york", lat: 40.7681, lng: -73.5251 },
  {
    id: "jackson-heights-queens-new-york-city",
    lat: 40.7557,
    lng: -73.8831,
  },
  {
    id: "jewtown-port-richmond-staten-island-nyc",
    lat: 40.636,
    lng: -74.134,
  },
  {
    id: "kiryas-joel-new-york-near-monroe-new-york",
    lat: 41.342,
    lng: -74.167,
  },
  {
    id: "lapskaus-boulevard-brooklyn-new-york-city-new-york",
    lat: 40.634,
    lng: -74.023,
  },
  {
    id: "little-cambodia-the-bronx-new-york-city-new-york",
    lat: 40.845,
    lng: -73.865,
  },
  {
    id: "pelham-parkway-bronx-new-york-city-new-york",
    lat: 40.858,
    lng: -73.856,
  },
  {
    id: "richmond-hill-queens-new-york-city",
    lat: 40.6998,
    lng: -73.8312,
  },
  // LA — were at City Hall (34.052, -118.244)
  {
    id: "historic-filipinotown-los-angeles-california",
    lat: 34.0689,
    lng: -118.272,
  },
  {
    id: "little-italy-los-angeles-california",
    lat: 34.0628,
    lng: -118.238,
  },
  { id: "westwood-los-angeles-california", lat: 34.0635, lng: -118.4455 },
  { id: "wilmington-los-angeles-california", lat: 33.786, lng: -118.263 },
  // Toronto — were at downtown (43.653, -79.383)
  {
    id: "chinatown-scarborough-toronto-ontario",
    lat: 43.7764,
    lng: -79.2318,
  },
  { id: "east-chinatown-toronto-ontario", lat: 43.6667, lng: -79.3486 },
  { id: "thorncliffe-park-toronto-ontario", lat: 43.7075, lng: -79.345 },
  {
    id: "yonge-street-in-north-york-toronto-ontario",
    lat: 43.7615,
    lng: -79.4111,
  },
  // Oakland — were at downtown (37.804, -122.271)
  {
    id: "east-oakland-oakland-california-especially-fruitvale",
    lat: 37.775,
    lng: -122.224,
  },
  {
    id: "international-boulevard-oakland-california",
    lat: 37.775,
    lng: -122.224,
  },
  {
    id: "oakland-chinatown-oakland-california",
    lat: 37.8003,
    lng: -122.2718,
  },
  { id: "west-oakland-oakland-california", lat: 37.812, lng: -122.295 },
  // Vancouver — were at downtown (49.283, -123.121)
  {
    id: "greektown-vancouver-british-columbia",
    lat: 49.263,
    lng: -123.097,
  },
  {
    id: "little-saigon-vancouver-british-columbia",
    lat: 49.237,
    lng: -123.04,
  },
];

function squarePolygonWkt(lat: number, lng: number, delta: number): string {
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  return `POLYGON((${minLng} ${minLat},${maxLng} ${minLat},${maxLng} ${maxLat},${minLng} ${maxLat},${minLng} ${minLat}))`;
}

async function main() {
  console.log(`Fixing ${FIXES.length} city-centroid community boundaries…`);
  let updated = 0;
  let missing = 0;

  for (const c of FIXES) {
    const existing = await prisma.community.findUnique({
      where: { id: c.id },
      select: { id: true },
    });
    if (!existing) {
      console.warn(`  skip missing ${c.id}`);
      missing += 1;
      continue;
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
      squarePolygonWkt(c.lat, c.lng, effectiveDelta(c.delta ?? 0.012)),
      c.id,
    );
    updated += 1;
    console.log(`  ✓ ${c.id} → ${c.lat}, ${c.lng}`);
  }

  console.log(`Done. Updated ${updated}, missing ${missing}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
