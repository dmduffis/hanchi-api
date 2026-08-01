import { prisma } from "./prisma";
import { ethnicitiesFromYelp } from "./ethnicities";
import {
  WIKI_COMMUNITY_ETHNICITIES,
  WIKI_COMMUNITY_SEARCH_TERMS,
} from "../data/wikipediaYelpMeta";
import {
  formatYelpAddress,
  formatYelpCategory,
  searchYelpBusinesses,
  type YelpBusiness,
} from "./yelp";

export type YelpSyncResult = {
  communityId: string;
  communityName: string;
  fetched: number;
  upserted: number;
  skipped: number;
};

/** Preferred Yelp search terms for enclaves where generic "restaurants" is too noisy. */
const COMMUNITY_SEARCH_TERMS: Record<string, string | string[]> = {
  "little-colombia": "colombian",
  "little-ecuador": "ecuadorian",
  "little-mexico-sunset-park": "mexican",
  "little-mexico-port-richmond": "mexican",
  "little-india": "indian",
  "little-pakistan": "pakistani",
  "little-bangladesh": "bangladeshi",
  "koreatown-manhattan": "korean",
  "koreatown-queens": ["korean", "korean bbq"],
  "chinatown-flushing": "chinese",
  "chinatown-manhattan": "chinese",
  "chinatown-sunset-park": "chinese",
  "little-senegal": ["senegalese", "west african", "african"],
  "little-africa-si": ["liberian", "west african", "african"],
  "little-africa-bronx": ["ghanaian", "west african", "african"],
  "little-dominican-republic": "dominican",
  "little-haiti": "haitian",
  "little-poland": "polish",
  "little-ukraine": "ukrainian",
  "little-odessa": ["russian", "ukrainian"],
  "little-manila": "filipino",
  "little-egypt": ["egyptian", "middle eastern"],
  "little-yemen": ["yemeni", "middle eastern", "arabic"],
  "little-palestine": ["palestinian", "middle eastern"],
  "little-guyana-queens": ["guyanese", "roti"],
  "little-guyana-bronx": ["guyanese", "roti"],
  "guyana-gateway": ["guyanese", "roti"],
  "little-caribbean": ["caribbean", "jamaican", "jerk"],
  "little-bhod-tibet": ["tibetan", "nepali", "himalayan", "momo"],
  "little-albania": "albanian",
  "little-india-hicksville": ["indian", "south indian", "pakistani"],
  "little-portugal-mineola": ["portuguese", "bacalhau"],
  "little-el-salvador-brentwood": ["salvadoran", "pupusas", "central american"],
  "koreatown-nassau": ["korean", "korean bbq"],
  "little-arabia-dearborn": [
    "lebanese",
    "yemeni",
    "middle eastern",
    "arabic",
    "shawarma",
  ],
  "little-baghdad-sterling-heights": [
    "iraqi",
    "chaldean",
    "middle eastern",
    "arabic",
  ],
  "banglatown-hamtramck": ["bangladeshi", "bengali", "indian"],
  "mexicantown-detroit": ["mexican", "tacos"],
  "koreatown-la": ["korean", "korean bbq"],
  "thai-town-la": ["thai", "pad thai"],
  "little-tokyo-la": ["japanese", "ramen", "sushi"],
  "little-ethiopia-la": ["ethiopian", "eritrean"],
  "little-arabia-anaheim": [
    "middle eastern",
    "lebanese",
    "syrian",
    "arabic",
    "shawarma",
  ],
  "little-saigon-westminster": ["vietnamese", "pho", "banh mi"],
  "chinatown-chicago": ["chinese", "dim sum", "hot pot"],
  "argyle-chicago": ["vietnamese", "pho", "banh mi"],
  "devon-avenue-chicago": ["indian", "pakistani", "south asian"],
  "little-village-chicago": ["mexican", "tacos"],
  "pilsen-chicago": ["mexican", "tacos"],
  "bridgeview-chicago": [
    "middle eastern",
    "palestinian",
    "lebanese",
    "arabic",
    "shawarma",
  ],
  "albany-park-chicago": ["korean", "korean bbq"],
  "greektown-chicago": ["greek", "gyros", "mediterranean"],
  "little-italy-chicago": ["italian", "pizza"],
  "humboldt-park-chicago": ["puerto rican", "caribbean", "latin"],
  "polish-village-chicago": ["polish", "pierogi", "eastern european"],
  "ukrainian-village-chicago": ["ukrainian", "eastern european"],
  "bolingbrook-chicago": ["pakistani", "indian", "halal"],
  "chinatown-houston": ["chinese", "dim sum", "hot pot"],
  "hillcroft-houston": ["indian", "pakistani", "halal"],
  "little-saigon-houston": ["vietnamese", "pho", "banh mi"],
  "little-lagos-houston": ["nigerian", "african", "west african"],
  "sugar-land-houston": ["indian", "pakistani"],
  "katy-houston": ["indian", "south asian"],
  "east-end-houston": ["mexican", "tex-mex", "taqueria"],
  "chinatown-id-seattle": ["chinese", "dim sum", "asian"],
  "little-saigon-seattle": ["vietnamese", "pho", "banh mi"],
  "white-center-seattle": ["vietnamese", "cambodian", "latin"],
  "beacon-hill-seattle": ["filipino", "vietnamese", "latin"],
  "bellevue-seattle": ["indian", "chinese", "asian"],
  "kent-seattle": ["indian", "south asian"],
  "redmond-seattle": ["indian", "south asian"],
  "chinatown-boston": ["chinese", "dim sum"],
  "chinatown-quincy": ["chinese", "dim sum", "asian"],
  "chinatown-malden": ["chinese", "asian"],
  "east-boston": ["salvadoran", "latin", "pupusas"],
  "watertown-boston": ["armenian", "middle eastern"],
  "somerville-boston": ["brazilian", "latin"],
  "chinatown-dc": ["chinese", "dim sum"],
  "little-ethiopia-dc": ["ethiopian", "injera"],
  "little-ethiopia-silver-spring": ["ethiopian", "injera"],
  "eden-center-dc": ["vietnamese", "pho", "banh mi"],
  "mount-pleasant-dc": ["salvadoran", "latin", "pupusas"],
  "annandale-dc": ["korean", "korean bbq"],
  "richardson-chinatown": ["chinese", "dim sum", "asian"],
  "little-asia-plano": ["chinese", "korean", "asian"],
  "plano-indian": ["indian", "south asian"],
  "frisco-indian": ["indian", "south asian"],
  "irving-pakistani": ["pakistani", "indian", "halal"],
  "oak-cliff-dallas": ["mexican", "tex-mex", "taqueria"],
  "carrollton-asian": ["korean", "asian"],
  "japantown-sf": ["japanese", "ramen", "sushi"],
  "calle-24-sf": ["mexican", "salvadoran", "latin"],
  "soma-pilipinas-sf": ["filipino", "lumpia"],
  "sunset-chinese-sf": ["chinese", "dim sum"],
  "african-american-arts-sf": ["soul food", "southern", "creole"],
  "pacific-islander-sf": ["samoan", "hawaiian", "pacific islander"],
  "american-indian-sf": "restaurants",
};

/** Ethnicity ids that "belong" to an enclave — used to reclaim misplaced Yelp POIs. */
const COMMUNITY_ETHNICITIES: Record<string, string[]> = {
  "little-colombia": ["colombian"],
  "little-ecuador": ["ecuadorian"],
  "little-mexico-sunset-park": ["mexican"],
  "little-mexico-port-richmond": ["mexican"],
  "little-india": ["indian"],
  "little-pakistan": ["pakistani"],
  "little-bangladesh": ["bangladeshi"],
  "koreatown-manhattan": ["korean"],
  "koreatown-queens": ["korean"],
  "chinatown-flushing": ["chinese", "taiwanese"],
  "chinatown-manhattan": ["chinese"],
  "chinatown-sunset-park": ["chinese"],
  "little-senegal": ["senegalese", "west_african", "ghanaian"],
  "little-africa-si": ["liberian", "west_african", "ghanaian", "senegalese"],
  "little-africa-bronx": ["ghanaian", "west_african", "nigerian", "senegalese"],
  "little-dominican-republic": ["dominican"],
  "little-haiti": ["haitian"],
  "little-poland": ["polish"],
  "little-ukraine": ["ukrainian"],
  "little-odessa": ["russian", "ukrainian"],
  "little-manila": ["filipino"],
  "little-egypt": ["egyptian", "middle_eastern"],
  "little-yemen": ["yemeni", "middle_eastern"],
  "little-palestine": ["palestinian", "middle_eastern", "lebanese"],
  "little-guyana-queens": ["guyanese"],
  "little-guyana-bronx": ["guyanese"],
  "guyana-gateway": ["guyanese"],
  "little-caribbean": ["jamaican", "caribbean", "haitian", "guyanese"],
  "little-bhod-tibet": ["nepali"],
  "little-albania": ["albanian"],
  "little-india-hicksville": ["indian", "pakistani", "bangladeshi"],
  "little-portugal-mineola": ["portuguese"],
  "little-el-salvador-brentwood": ["salvadoran"],
  "koreatown-nassau": ["korean"],
  "little-arabia-dearborn": [
    "lebanese",
    "yemeni",
    "palestinian",
    "iraqi",
    "middle_eastern",
  ],
  "little-baghdad-sterling-heights": ["iraqi", "middle_eastern"],
  "banglatown-hamtramck": ["bangladeshi", "indian"],
  "mexicantown-detroit": ["mexican"],
  "koreatown-la": ["korean"],
  "thai-town-la": ["thai"],
  "little-tokyo-la": ["japanese"],
  "little-ethiopia-la": ["ethiopian"],
  "little-arabia-anaheim": [
    "lebanese",
    "syrian",
    "palestinian",
    "yemeni",
    "middle_eastern",
  ],
  "little-saigon-westminster": ["vietnamese"],
  "chinatown-chicago": ["chinese", "taiwanese"],
  "argyle-chicago": ["vietnamese"],
  "devon-avenue-chicago": ["indian", "pakistani", "bangladeshi"],
  "little-village-chicago": ["mexican"],
  "pilsen-chicago": ["mexican"],
  "bridgeview-chicago": [
    "palestinian",
    "lebanese",
    "yemeni",
    "iraqi",
    "middle_eastern",
  ],
  "albany-park-chicago": ["korean"],
  "greektown-chicago": ["greek"],
  "little-italy-chicago": ["italian"],
  "humboldt-park-chicago": ["puerto_rican", "caribbean"],
  "polish-village-chicago": ["polish"],
  "ukrainian-village-chicago": ["ukrainian"],
  "bolingbrook-chicago": ["pakistani", "indian"],
  "chinatown-houston": ["chinese", "taiwanese"],
  "hillcroft-houston": ["indian", "pakistani"],
  "little-saigon-houston": ["vietnamese"],
  "little-lagos-houston": ["nigerian", "west_african"],
  "sugar-land-houston": ["indian"],
  "katy-houston": ["indian"],
  "east-end-houston": ["mexican"],
  "chinatown-id-seattle": ["chinese", "vietnamese"],
  "little-saigon-seattle": ["vietnamese"],
  "white-center-seattle": ["vietnamese", "cambodian"],
  "beacon-hill-seattle": ["filipino", "vietnamese"],
  "bellevue-seattle": ["indian", "chinese"],
  "kent-seattle": ["indian"],
  "redmond-seattle": ["indian"],
  "chinatown-boston": ["chinese"],
  "chinatown-quincy": ["chinese"],
  "chinatown-malden": ["chinese"],
  "east-boston": ["salvadoran"],
  "watertown-boston": ["armenian", "middle_eastern"],
  "somerville-boston": ["brazilian"],
  "chinatown-dc": ["chinese"],
  "little-ethiopia-dc": ["ethiopian"],
  "little-ethiopia-silver-spring": ["ethiopian"],
  "eden-center-dc": ["vietnamese"],
  "mount-pleasant-dc": ["salvadoran"],
  "annandale-dc": ["korean"],
  "richardson-chinatown": ["chinese"],
  "little-asia-plano": ["chinese", "korean"],
  "plano-indian": ["indian"],
  "frisco-indian": ["indian"],
  "irving-pakistani": ["pakistani", "indian"],
  "oak-cliff-dallas": ["mexican"],
  "carrollton-asian": ["korean"],
  "japantown-sf": ["japanese"],
  "calle-24-sf": ["mexican", "salvadoran"],
  "soma-pilipinas-sf": ["filipino"],
  "sunset-chinese-sf": ["chinese"],
  // US cultural districts — no foreign-country ethnicity reclaim.
  "pacific-islander-sf": ["hawaiian"],
};

async function getCommunityCentroid(
  communityId: string,
): Promise<{ lat: number; lng: number; name: string } | null> {
  const rows = await prisma.$queryRawUnsafe<
    { name: string; latitude: number | string | null; longitude: number | string | null }[]
  >(
    `
    SELECT
      c.name,
      ST_Y(ST_Centroid(c.boundary)) AS latitude,
      ST_X(ST_Centroid(c.boundary)) AS longitude
    FROM "Community" c
    WHERE c.id = $1
    LIMIT 1
    `,
    communityId,
  );

  const row = rows[0];
  if (!row) return null;
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, name: row.name };
}

async function setPoiLocation(
  poiId: string,
  lat: number,
  lng: number,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "Poi" SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
    lng,
    lat,
    poiId,
  );
}

/** Keep POIs that fall inside the community polygon when boundary exists. */
async function isInsideCommunity(
  communityId: string,
  lat: number,
  lng: number,
): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ inside: boolean }[]>(
    `
    SELECT ST_Contains(
      c.boundary,
      ST_SetSRID(ST_MakePoint($1, $2), 4326)
    ) AS inside
    FROM "Community" c
    WHERE c.id = $3
    LIMIT 1
    `,
    lng,
    lat,
    communityId,
  );
  return Boolean(rows[0]?.inside);
}

function ethnicityMatchesCommunity(
  communityId: string,
  ethnicities: string[],
): boolean {
  const preferred =
    COMMUNITY_ETHNICITIES[communityId] ??
    WIKI_COMMUNITY_ETHNICITIES[communityId];
  if (!preferred?.length) return false;
  return ethnicities.some((e) => preferred.includes(e));
}

async function upsertYelpBusiness(
  communityId: string,
  business: YelpBusiness,
): Promise<"upserted" | "skipped"> {
  const lat = business.coordinates?.latitude;
  const lng = business.coordinates?.longitude;
  if (lat == null || lng == null) return "skipped";

  const inside = await isInsideCommunity(communityId, lat, lng);
  if (!inside) return "skipped";

  const ethnicities = ethnicitiesFromYelp(business);
  const data = {
    communityId,
    name: business.name,
    category: formatYelpCategory(business),
    address: formatYelpAddress(business),
    hours: null as string | null,
    yelpId: business.id,
    rating: business.rating ?? null,
    priceLevel: business.price ?? null,
    imageUrl: business.image_url || null,
    yelpUrl: business.url || null,
    ethnicities,
  };

  const existing = await prisma.poi.findUnique({
    where: { yelpId: business.id },
  });

  // Same Yelp place near multiple enclaves: keep first assignment, unless this
  // enclave is a better ethnicity match — or the POI is still unassigned.
  if (existing && existing.communityId !== communityId) {
    if (existing.communityId != null) {
      const reclaim = ethnicityMatchesCommunity(communityId, ethnicities);
      if (!reclaim) return "skipped";
    }
  }

  const poi = existing
    ? await prisma.poi.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.poi.create({ data });

  await setPoiLocation(poi.id, lat, lng);
  return "upserted";
}

async function upsertStandaloneYelpBusiness(
  business: YelpBusiness,
): Promise<"upserted" | "skipped"> {
  const lat = business.coordinates?.latitude;
  const lng = business.coordinates?.longitude;
  if (lat == null || lng == null) return "skipped";

  const ethnicities = ethnicitiesFromYelp(business);
  // Metro sync only keeps restaurants we can tag culturally.
  if (ethnicities.length === 0) return "skipped";

  const existing = await prisma.poi.findUnique({
    where: { yelpId: business.id },
  });

  // Never orphan an enclave-bound restaurant into the free pool.
  if (existing?.communityId) return "skipped";

  const data = {
    communityId: null as string | null,
    name: business.name,
    category: formatYelpCategory(business),
    address: formatYelpAddress(business),
    hours: null as string | null,
    yelpId: business.id,
    rating: business.rating ?? null,
    priceLevel: business.price ?? null,
    imageUrl: business.image_url || null,
    yelpUrl: business.url || null,
    ethnicities,
  };

  const poi = existing
    ? await prisma.poi.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.poi.create({ data });

  await setPoiLocation(poi.id, lat, lng);
  return "upserted";
}

export type MetroSyncCenter = {
  name: string;
  lat: number;
  lng: number;
  radiusMeters?: number;
};

export type MetroSyncConfig = {
  id: string;
  name: string;
  centers: MetroSyncCenter[];
  terms: string[];
  limitPerSearch?: number;
};

export type MetroSyncResult = {
  metroId: string;
  metroName: string;
  fetched: number;
  upserted: number;
  skipped: number;
};

/** Built-in metros for cuisine-wide sync (no enclave required). */
export const METRO_SYNCS: Record<string, MetroSyncConfig> = {
  nyc: {
    id: "nyc",
    name: "New York City",
    centers: [
      { name: "manhattan", lat: 40.758, lng: -73.985, radiusMeters: 9000 },
      { name: "brooklyn", lat: 40.678, lng: -73.944, radiusMeters: 10000 },
      { name: "queens", lat: 40.728, lng: -73.794, radiusMeters: 11000 },
      { name: "bronx", lat: 40.8448, lng: -73.8648, radiusMeters: 8000 },
    ],
    terms: [
      "korean",
      "chinese",
      "indian",
      "mexican",
      "dominican",
      "jamaican",
      "polish",
      "ukrainian",
      "japanese",
      "thai",
      "vietnamese",
      "ethiopian",
      "middle eastern",
      "senegalese",
      "filipino",
      "colombian",
      "ecuadorian",
      "pakistani",
      "haitian",
      "guyanese",
      "yemeni",
      "nepali",
    ],
    limitPerSearch: 30,
  },
};

/**
 * Pull ethnic restaurants across a metro by cuisine terms.
 * Upserts POIs with communityId null (skips already enclave-bound yelpIds).
 */
export async function syncYelpForMetro(
  metroId: string,
  opts?: { limitPerSearch?: number },
): Promise<MetroSyncResult> {
  const metro = METRO_SYNCS[metroId];
  if (!metro) {
    throw new Error(
      `Unknown metro: ${metroId}. Known: ${Object.keys(METRO_SYNCS).join(", ")}`,
    );
  }

  const limit = opts?.limitPerSearch ?? metro.limitPerSearch ?? 30;
  const seen = new Set<string>();
  const businesses: YelpBusiness[] = [];

  for (const center of metro.centers) {
    for (const term of metro.terms) {
      const batch = await searchYelpBusinesses({
        latitude: center.lat,
        longitude: center.lng,
        radiusMeters: center.radiusMeters ?? 8000,
        limit,
        term,
      });
      for (const b of batch) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        businesses.push(b);
      }
      await new Promise((r) => setTimeout(r, 280));
    }
  }

  let upserted = 0;
  let skipped = 0;
  for (const business of businesses) {
    const result = await upsertStandaloneYelpBusiness(business);
    if (result === "upserted") upserted += 1;
    else skipped += 1;
  }

  return {
    metroId: metro.id,
    metroName: metro.name,
    fetched: businesses.length,
    upserted,
    skipped,
  };
}

/**
 * Pull Yelp restaurants/food near a community centroid and upsert POIs
 * that fall inside the community boundary.
 */
export async function syncYelpForCommunity(
  communityId: string,
  opts?: { radiusMeters?: number; limit?: number; term?: string },
): Promise<YelpSyncResult> {
  const centroid = await getCommunityCentroid(communityId);
  if (!centroid) {
    throw new Error(`Community not found or missing boundary: ${communityId}`);
  }

  const termOpt =
    opts?.term ??
    COMMUNITY_SEARCH_TERMS[communityId] ??
    WIKI_COMMUNITY_SEARCH_TERMS[communityId] ??
    "restaurants";
  const terms = Array.isArray(termOpt) ? termOpt : [termOpt];

  const seen = new Set<string>();
  const businesses: YelpBusiness[] = [];
  for (const term of terms) {
    const batch = await searchYelpBusinesses({
      latitude: centroid.lat,
      longitude: centroid.lng,
      radiusMeters: opts?.radiusMeters ?? 1600,
      limit: opts?.limit ?? 40,
      term,
    });
    for (const b of batch) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      businesses.push(b);
    }
    if (terms.length > 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  let upserted = 0;
  let skipped = 0;

  for (const business of businesses) {
    const result = await upsertYelpBusiness(communityId, business);
    if (result === "upserted") upserted += 1;
    else skipped += 1;
  }

  return {
    communityId,
    communityName: centroid.name,
    fetched: businesses.length,
    upserted,
    skipped,
  };
}

export async function syncYelpForAllCommunities(
  opts?: { radiusMeters?: number; limit?: number; term?: string },
): Promise<YelpSyncResult[]> {
  const communities = await prisma.community.findMany({
    select: { id: true },
    orderBy: { name: "asc" },
  });

  const results: YelpSyncResult[] = [];
  for (const community of communities) {
    const result = await syncYelpForCommunity(community.id, opts);
    results.push(result);
    await new Promise((r) => setTimeout(r, 350));
  }
  return results;
}
