/**
 * Reset NYC enclave boundaries with effectiveDelta and re-sync Yelp
 * (additive — does not wipe existing POIs).
 *
 * Usage: npx tsx scripts/resync-nyc.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_COMMUNITY_SYNC_RADIUS_M,
  effectiveDelta,
} from "../src/lib/communityBounds";
import { syncYelpForCommunity } from "../src/lib/yelpSync";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  }),
});

const ENCLAVES = [
  { id: "chinatown-flushing", lat: 40.759, lng: -73.83, delta: 0.014 },
  { id: "chinatown-manhattan", lat: 40.7155, lng: -73.997, delta: 0.01 },
  { id: "chinatown-sunset-park", lat: 40.641, lng: -74.009, delta: 0.012 },
  { id: "guyana-gateway", lat: 40.669, lng: -73.931, delta: 0.014 },
  { id: "koreatown-manhattan", lat: 40.7473, lng: -73.9869, delta: 0.006 },
  { id: "koreatown-queens", lat: 40.748, lng: -73.814, delta: 0.02 },
  { id: "little-africa-si", lat: 40.621, lng: -74.072, delta: 0.016 },
  { id: "little-africa-bronx", lat: 40.834, lng: -73.921, delta: 0.016 },
  { id: "little-albania", lat: 40.8545, lng: -73.888, delta: 0.018 },
  { id: "little-bangladesh", lat: 40.707, lng: -73.793, delta: 0.016 },
  { id: "little-bhod-tibet", lat: 40.755, lng: -73.87, delta: 0.016 },
  { id: "little-caribbean", lat: 40.652, lng: -73.96, delta: 0.014 },
  { id: "little-colombia", lat: 40.747, lng: -73.891, delta: 0.018 },
  { id: "little-dominican-republic", lat: 40.847, lng: -73.938, delta: 0.012 },
  { id: "little-ecuador", lat: 40.748, lng: -73.869, delta: 0.016 },
  { id: "astoria-queens-new-york", lat: 40.772, lng: -73.93, delta: 0.012 },
  { id: "little-guyana-queens", lat: 40.68, lng: -73.837, delta: 0.016 },
  { id: "little-guyana-bronx", lat: 40.899, lng: -73.847, delta: 0.016 },
  { id: "little-haiti", lat: 40.64, lng: -73.955, delta: 0.014 },
  { id: "little-india", lat: 40.7475, lng: -73.8915, delta: 0.012 },
  { id: "little-manila", lat: 40.746, lng: -73.902, delta: 0.014 },
  { id: "little-mexico-port-richmond", lat: 40.635, lng: -74.125, delta: 0.018 },
  { id: "little-mexico-sunset-park", lat: 40.648, lng: -74.005, delta: 0.012 },
  { id: "little-odessa", lat: 40.5776, lng: -73.9614, delta: 0.012 },
  { id: "little-palestine", lat: 40.622, lng: -74.028, delta: 0.012 },
  { id: "little-pakistan", lat: 40.635, lng: -73.963, delta: 0.012 },
  { id: "little-poland", lat: 40.73, lng: -73.954, delta: 0.01 },
  {
    id: "ridgewood-queens-new-york",
    lat: 40.7012,
    lng: -73.8978,
    delta: 0.018,
  },
  {
    id: "sunnyside-queens-new-york",
    lat: 40.7445,
    lng: -73.9205,
    delta: 0.014,
  },
  { id: "little-senegal", lat: 40.8029, lng: -73.9531, delta: 0.014 },
  { id: "little-ukraine", lat: 40.728, lng: -73.987, delta: 0.01 },
  { id: "little-yemen", lat: 40.857, lng: -73.868, delta: 0.018 },
] as const;

function square(lat: number, lng: number, delta: number): string {
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  return `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;
}

async function main() {
  console.log(`Updating ${ENCLAVES.length} NYC boundaries…`);
  for (const e of ENCLAVES) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
      square(e.lat, e.lng, effectiveDelta(e.delta)),
      e.id,
    );
    console.log(`  ✓ ${e.id}`);
  }

  console.log(
    `\nSyncing Yelp (radius ${DEFAULT_COMMUNITY_SYNC_RADIUS_M}m)…`,
  );
  for (const e of ENCLAVES) {
    const before = await prisma.poi.count({ where: { communityId: e.id } });
    const result = await syncYelpForCommunity(e.id, {
      radiusMeters: DEFAULT_COMMUNITY_SYNC_RADIUS_M,
      limit: 50,
    });
    const after = await prisma.poi.count({ where: { communityId: e.id } });
    console.log(
      `  ${e.id}: before=${before} after=${after} fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped}`,
    );
    await new Promise((r) => setTimeout(r, 350));
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
