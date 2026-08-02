/**
 * Wipe Yelp-synced POIs (keep curated seed places), reset community
 * boundaries from seed coords, then re-sync every enclave.
 *
 * Usage: npx tsx scripts/resync-yelp-all.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_COMMUNITY_SYNC_RADIUS_M,
  effectiveDelta,
} from "../src/lib/communityBounds";
import { ethnicitiesFromText } from "../src/lib/ethnicities";
import { syncYelpForCommunity } from "../src/lib/yelpSync";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  }),
});

type Enclave = {
  id: string;
  lat: number;
  lng: number;
  delta: number;
};

/** Generous corridors so targeted Yelp searches have room to land. */
const ENCLAVES: Enclave[] = [
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
  { id: "little-senegal", lat: 40.8029, lng: -73.9531, delta: 0.014 },
  { id: "little-ukraine", lat: 40.728, lng: -73.987, delta: 0.01 },
  { id: "little-yemen", lat: 40.857, lng: -73.868, delta: 0.018 },
  { id: "little-india-hicksville", lat: 40.7681, lng: -73.5251, delta: 0.022 },
  { id: "little-portugal-mineola", lat: 40.7493, lng: -73.6407, delta: 0.018 },
  {
    id: "little-el-salvador-brentwood",
    lat: 40.785,
    lng: -73.224,
    delta: 0.03,
  },
  { id: "koreatown-nassau", lat: 40.7635, lng: -73.705, delta: 0.028 },
  { id: "little-arabia-dearborn", lat: 42.3223, lng: -83.1763, delta: 0.036 },
  {
    id: "yemeni-south-end-dearborn",
    lat: 42.308,
    lng: -83.158,
    delta: 0.028,
  },
  {
    id: "little-baghdad-sterling-heights",
    lat: 42.5806,
    lng: -83.0675,
    delta: 0.04,
  },
  { id: "banglatown-hamtramck", lat: 42.3978, lng: -83.057, delta: 0.036 },
  { id: "mexicantown-detroit", lat: 42.3185, lng: -83.0865, delta: 0.032 },
  { id: "koreatown-la", lat: 34.061, lng: -118.302, delta: 0.022 },
  { id: "thai-town-la", lat: 34.1015, lng: -118.305, delta: 0.014 },
  { id: "little-tokyo-la", lat: 34.0501, lng: -118.2405, delta: 0.012 },
  { id: "little-ethiopia-la", lat: 34.0545, lng: -118.366, delta: 0.012 },
  { id: "little-arabia-anaheim", lat: 33.8345, lng: -117.9555, delta: 0.022 },
  {
    id: "little-saigon-orange-county-california",
    lat: 33.745,
    lng: -117.954,
    delta: 0.028,
  },
];

function square(lat: number, lng: number, delta: number): string {
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  return `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;
}

async function main() {
  console.log("1) Deleting Yelp-synced POIs (keeping curated seed places)…");
  const deleted = await prisma.poi.deleteMany({
    where: { yelpId: { not: null } },
  });
  console.log(`   removed ${deleted.count}`);

  console.log("2) Resetting community boundaries…");
  for (const e of ENCLAVES) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
      square(e.lat, e.lng, effectiveDelta(e.delta)),
      e.id,
    );
  }
  console.log(`   updated ${ENCLAVES.length} boundaries`);

  console.log("3) Syncing all enclaves from Yelp…");
  // Sync ethnicity-specific corridors before denser neighbors when possible
  const order = [...ENCLAVES].sort((a, b) => a.id.localeCompare(b.id));
  for (const e of order) {
    const result = await syncYelpForCommunity(e.id, {
      radiusMeters: DEFAULT_COMMUNITY_SYNC_RADIUS_M,
      limit: 50,
    });
    console.log(
      `   ${result.communityId}: fetched=${result.fetched} upserted=${result.upserted} skipped=${result.skipped}`,
    );
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log("4) Backfilling ethnicities from name/category…");
  const pois = await prisma.poi.findMany({
    select: { id: true, name: true, category: true, ethnicities: true },
  });
  let updated = 0;
  for (const poi of pois) {
    const inferred = ethnicitiesFromText(`${poi.name} ${poi.category}`);
    if (!inferred.length) continue;
    const same =
      inferred.length === poi.ethnicities.length &&
      inferred.every((v, i) => v === poi.ethnicities[i]);
    if (same) continue;
    await prisma.poi.update({
      where: { id: poi.id },
      data: { ethnicities: inferred },
    });
    updated += 1;
  }
  console.log(`   updated ${updated}`);

  const counts = await prisma.poi.groupBy({
    by: ["communityId"],
    _count: { _all: true },
  });
  console.log("\nPOI counts:");
  for (const row of counts.sort(
    (a, b) => a.communityId.localeCompare(b.communityId),
  )) {
    console.log(`  ${String(row._count._all).padStart(3)}  ${row.communityId}`);
  }
  console.log(
    `total ${counts.reduce((n, r) => n + r._count._all, 0)}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
