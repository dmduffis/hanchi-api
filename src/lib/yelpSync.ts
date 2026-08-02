import { prisma } from "./prisma";
import { ethnicitiesFromYelp } from "./ethnicities";
import { DEFAULT_COMMUNITY_SYNC_RADIUS_M } from "./communityBounds";
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
  // Wikipedia Astoria (absorbs old curated little-egypt + wiki ethnicity variants)
  "astoria-queens-new-york": [
    "egyptian",
    "greek",
    "albanian",
    "palestinian",
    "middle eastern",
    "mediterranean",
  ],
  "little-egypt": ["egyptian", "middle eastern", "mediterranean"],
  "little-yemen": ["yemeni", "middle eastern", "arabic", "mediterranean"],
  "little-palestine": ["palestinian", "middle eastern", "mediterranean"],
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
    "middle eastern",
    "mediterranean",
    "arabic",
    "shawarma",
  ],
  "yemeni-south-end-dearborn": [
    "yemeni",
    "yemen",
    "mandi",
    "saltah",
    "fahsa",
    "haraz",
    "qahwah",
    "middle eastern",
    "arabic",
  ],
  "little-baghdad-sterling-heights": [
    "iraqi",
    "chaldean",
    "middle eastern",
    "mediterranean",
    "arabic",
    "kebab",
    "shawarma",
  ],
  "banglatown-hamtramck": [
    "bangladeshi",
    "bengali",
    "indian",
    "south asian",
    "biryani",
    "halal",
  ],
  "mexicantown-detroit": ["mexican", "tacos"],
  "koreatown-la": ["korean", "korean bbq"],
  "thai-town-la": ["thai", "pad thai"],
  "little-tokyo-la": ["japanese", "ramen", "sushi"],
  "little-ethiopia-la": ["ethiopian", "eritrean"],
  "little-arabia-anaheim": [
    "middle eastern",
    "mediterranean",
    "lebanese",
    "syrian",
    "arabic",
    "shawarma",
  ],
  "little-saigon-orange-county-california": [
    "vietnamese",
    "pho",
    "banh mi",
  ],
  "little-saigon-westminster": ["vietnamese", "pho", "banh mi"],
  "chinatown-chicago": ["chinese", "dim sum", "hot pot"],
  "argyle-chicago": ["vietnamese", "pho", "banh mi"],
  "devon-avenue-chicago": ["indian", "pakistani", "south asian"],
  "little-village-chicago": ["mexican", "tacos"],
  "pilsen-chicago": ["mexican", "tacos"],
  "bridgeview-chicago": [
    "middle eastern",
    "mediterranean",
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
  "chinatown-houston": ["chinese", "dim sum", "hot pot", "chinese restaurant"],
  "hillcroft-houston": ["indian", "pakistani", "halal", "indian restaurant"],
  "little-saigon-houston": ["vietnamese", "pho", "banh mi", "vietnamese restaurant"],
  "little-lagos-houston": ["nigerian", "west african", "african restaurant", "jollof"],
  "sugar-land-houston": ["indian", "pakistani", "indian restaurant"],
  "katy-houston": ["indian", "pakistani", "indian restaurant"],
  "east-end-houston": ["mexican", "taqueria", "mexican restaurant"],
  "chinatown-id-seattle": ["chinese", "dim sum", "chinese restaurant", "vietnamese"],
  "little-saigon-seattle": ["vietnamese", "pho", "banh mi", "vietnamese restaurant"],
  "white-center-seattle": ["vietnamese", "cambodian", "vietnamese restaurant"],
  "beacon-hill-seattle": ["filipino", "vietnamese", "filipino restaurant"],
  "bellevue-seattle": ["indian", "chinese", "indian restaurant", "chinese restaurant"],
  "kent-seattle": ["indian", "pakistani", "indian restaurant"],
  "redmond-seattle": ["indian", "pakistani", "indian restaurant"],
  "chinatown-boston": ["chinese", "dim sum", "chinese restaurant"],
  "chinatown-quincy": ["chinese", "dim sum", "chinese restaurant"],
  "chinatown-malden": ["chinese", "dim sum", "chinese restaurant"],
  "east-boston": ["salvadoran", "pupusas", "latin american"],
  "watertown-boston": ["armenian", "middle eastern", "armenian restaurant"],
  "somerville-boston": [
    "brazilian",
    "churrascaria",
    "brazilian bakery",
    "brazilian steakhouse",
  ],
  "chinatown-washington-d-c": [
    "chinese",
    "dim sum",
    "chinese restaurant",
  ],
  "little-ethiopia-shaw-washington-d-c": [
    "ethiopian",
    "injera",
    "ethiopian restaurant",
  ],
  "chinatown-dc": ["chinese", "dim sum", "chinese restaurant"],
  "little-ethiopia-dc": ["ethiopian", "injera", "ethiopian restaurant"],
  "little-ethiopia-silver-spring": ["ethiopian", "injera", "ethiopian restaurant"],
  "eden-center-dc": ["vietnamese", "pho", "banh mi", "vietnamese restaurant"],
  "mount-pleasant-dc": ["salvadoran", "pupusas", "latin american"],
  "annandale-dc": ["korean", "korean bbq", "korean restaurant"],
  "richardson-chinatown": ["chinese", "dim sum", "chinese restaurant"],
  "little-asia-plano": ["chinese", "korean", "chinese restaurant", "korean restaurant"],
  "plano-indian": ["indian", "pakistani", "indian restaurant"],
  "frisco-indian": ["indian", "pakistani", "indian restaurant"],
  "irving-pakistani": ["pakistani", "indian", "halal", "pakistani restaurant"],
  "oak-cliff-dallas": ["mexican", "taqueria", "mexican restaurant"],
  "carrollton-asian": ["korean", "korean bbq", "korean restaurant"],
  "wooster-square-ct": ["italian", "pizza", "apizza", "italian restaurant"],
  "little-poland-new-britain": ["polish", "pierogi", "polish restaurant"],
  "park-street-hartford": ["puerto rican", "caribbean", "puerto rican restaurant"],
  "south-end-hartford": ["italian", "pizza", "italian restaurant"],
  "hollow-bridgeport": [
    "portuguese",
    "brazilian",
    "churrascaria",
    "brazilian bakery",
    "bacalhau",
  ],
  "little-italy-bridgeport": ["italian", "pizza", "italian restaurant"],
  "danbury-brazilian": [
    "brazilian",
    "churrascaria",
    "brazilian bakery",
    "brazilian steakhouse",
  ],
  "stamford-caribbean": ["jamaican", "caribbean", "west indian", "jamaican restaurant"],
  "fair-haven-ct": ["puerto rican", "mexican", "latin american"],
  "little-havana-miami": ["cuban", "cuban restaurant", "cafe cubano"],
  "little-haiti-miami": ["haitian", "caribbean", "haitian restaurant"],
  "hialeah-miami": ["cuban", "cuban restaurant", "ventanita"],
  "sweetwater-miami": ["nicaraguan", "central american", "nicaraguan restaurant"],
  "allapattah-miami": ["dominican", "dominican restaurant", "caribbean"],
  "westchester-miami": ["colombian", "colombian restaurant", "arepas"],
  "doral-miami": ["venezuelan", "arepas", "venezuelan restaurant"],
  "kendall-miami": ["cuban", "cuban restaurant", "latin american"],
  "north-miami-haitian": ["haitian", "caribbean", "haitian restaurant"],
  "pompano-brazilian": [
    "brazilian",
    "churrascaria",
    "brazilian bakery",
    "brazilian steakhouse",
  ],
  "mills-50-orlando": ["vietnamese", "pho", "banh mi", "vietnamese restaurant"],
  "pine-hills-orlando": ["jamaican", "caribbean", "west indian", "jamaican restaurant"],
  "azalea-park-orlando": ["colombian", "colombian restaurant", "arepas"],
  "kissimmee-orlando": ["puerto rican", "puerto rican restaurant", "caribbean"],
  "kirkman-orlando": ["indian", "pakistani", "indian restaurant"],
  "apopka-orlando": ["mexican", "taqueria", "mexican restaurant"],
  "ybor-city-tampa": ["cuban", "spanish", "cuban sandwich", "cuban restaurant"],
  "west-tampa": ["cuban", "cuban restaurant", "cafe cubano"],
  "greektown-tarpon-springs-florida": [
    "greek",
    "greek restaurant",
    "mediterranean",
  ],
  "tarpon-springs-greek": ["greek", "greek restaurant", "mediterranean"],
  "baymeadows-jacksonville": ["indian", "pakistani", "indian restaurant"],
  "cedar-riverside-minneapolis": ["somali", "east african", "halal", "somali restaurant"],
  "little-mekong-stpaul": ["hmong", "vietnamese", "thai", "laotian"],
  "hmongtown-stpaul": ["hmong", "vietnamese", "southeast asian"],
  "lake-street-minneapolis": ["mexican", "taqueria", "mexican restaurant"],
  "eat-street-minneapolis": ["vietnamese", "chinese", "vietnamese restaurant"],
  "district-del-sol-stpaul": ["mexican", "taqueria", "mexican restaurant"],
  "central-ave-minneapolis": ["mexican", "taqueria", "mexican restaurant"],
  "brooklyn-park-minneapolis": ["hmong", "vietnamese", "southeast asian"],
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
  "astoria-queens-new-york": [
    "egyptian",
    "greek",
    "albanian",
    "palestinian",
    "middle_eastern",
  ],
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
  // Yemeni Dearborn spots reclaim into yemeni-south-end-dearborn, not here.
  "little-arabia-dearborn": [
    "lebanese",
    "palestinian",
    "iraqi",
    "middle_eastern",
  ],
  "yemeni-south-end-dearborn": ["yemeni", "middle_eastern"],
  "little-baghdad-sterling-heights": ["iraqi", "middle_eastern"],
  "banglatown-hamtramck": ["bangladeshi", "indian", "pakistani"],
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
  "little-saigon-orange-county-california": ["vietnamese"],
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
  "chinatown-washington-d-c": ["chinese"],
  "little-ethiopia-shaw-washington-d-c": ["ethiopian"],
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
  "wooster-square-ct": ["italian"],
  "little-poland-new-britain": ["polish"],
  "park-street-hartford": ["puerto_rican", "caribbean"],
  "south-end-hartford": ["italian"],
  "hollow-bridgeport": ["portuguese", "brazilian"],
  "little-italy-bridgeport": ["italian"],
  "danbury-brazilian": ["brazilian"],
  "stamford-caribbean": ["jamaican", "caribbean"],
  "fair-haven-ct": ["puerto_rican", "mexican"],
  "little-havana-miami": ["cuban"],
  "little-haiti-miami": ["haitian"],
  "hialeah-miami": ["cuban"],
  "sweetwater-miami": ["nicaraguan"],
  "allapattah-miami": ["dominican"],
  "westchester-miami": ["colombian"],
  "doral-miami": ["venezuelan"],
  "kendall-miami": ["cuban"],
  "north-miami-haitian": ["haitian"],
  "pompano-brazilian": ["brazilian"],
  "mills-50-orlando": ["vietnamese"],
  "pine-hills-orlando": ["jamaican", "caribbean"],
  "azalea-park-orlando": ["colombian"],
  "kissimmee-orlando": ["puerto_rican"],
  "kirkman-orlando": ["indian", "pakistani"],
  "apopka-orlando": ["mexican"],
  "ybor-city-tampa": ["cuban", "spanish"],
  "west-tampa": ["cuban"],
  "greektown-tarpon-springs-florida": ["greek"],
  "tarpon-springs-greek": ["greek"],
  "baymeadows-jacksonville": ["indian", "pakistani"],
  "cedar-riverside-minneapolis": ["somali", "east_african"],
  "little-mekong-stpaul": ["hmong", "vietnamese", "laotian", "cambodian"],
  "hmongtown-stpaul": ["hmong"],
  "lake-street-minneapolis": ["mexican"],
  "eat-street-minneapolis": ["vietnamese", "chinese"],
  "district-del-sol-stpaul": ["mexican"],
  "central-ave-minneapolis": ["mexican"],
  "brooklyn-park-minneapolis": ["hmong", "vietnamese"],
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

function preferredEthnicities(communityId: string): string[] | undefined {
  return (
    COMMUNITY_ETHNICITIES[communityId] ??
    WIKI_COMMUNITY_ETHNICITIES[communityId]
  );
}

function ethnicityMatchesCommunity(
  communityId: string,
  ethnicities: string[],
): boolean {
  const preferred = preferredEthnicities(communityId);
  if (!preferred?.length) return false;
  return ethnicities.some((e) => preferred.includes(e));
}

/** Broad Yelp labels that should inherit a community's primary culture when inside its box. */
const GENERIC_ETHNICITIES = new Set([
  "middle_eastern",
  "caribbean",
  "west_african",
]);

/**
 * Overlapping Arab corridors (Dearborn) should not inherit a sibling culture
 * from a generic "Middle Eastern" Yelp label.
 */
const SKIP_GENERIC_ETHNICITY_ENRICH = new Set([
  "yemeni-south-end-dearborn",
  "little-arabia-dearborn",
]);

/**
 * If Yelp only says "Middle Eastern" / "Mediterranean", also tag the enclave's
 * primary culture so culture filters still match (e.g. Iraqi in Little Baghdad).
 */
function enrichEthnicitiesForCommunity(
  communityId: string,
  ethnicities: string[],
): string[] {
  if (SKIP_GENERIC_ETHNICITY_ENRICH.has(communityId)) return ethnicities;

  const preferred = preferredEthnicities(communityId);
  if (!preferred?.length) return ethnicities;

  const hasCommunitySpecific = ethnicities.some(
    (e) => preferred.includes(e) && !GENERIC_ETHNICITIES.has(e),
  );
  if (hasCommunitySpecific) return ethnicities;

  const onlyGeneric =
    ethnicities.length > 0 &&
    ethnicities.every((e) => GENERIC_ETHNICITIES.has(e));
  if (!onlyGeneric && ethnicities.length > 0) return ethnicities;

  const primary = preferred.find((e) => !GENERIC_ETHNICITIES.has(e));
  if (!primary) return ethnicities;

  const merged = [...ethnicities.filter((e) => e !== primary), primary];
  return merged.slice(0, 2);
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

  const ethnicities = enrichEthnicitiesForCommunity(
    communityId,
    ethnicitiesFromYelp(business),
  );
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
      radiusMeters: opts?.radiusMeters ?? DEFAULT_COMMUNITY_SYNC_RADIUS_M,
      limit: opts?.limit ?? 50,
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
