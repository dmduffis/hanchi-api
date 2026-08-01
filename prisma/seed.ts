import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, RouteType } from "@prisma/client";

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

/** Rough square polygon around a lat/lng center (degrees ≈ city-block scale). */
function squarePolygonWkt(lat: number, lng: number, delta = 0.008): string {
  const minLng = lng - delta;
  const maxLng = lng + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;
  return `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;
}

function pointWkt(lat: number, lng: number): string {
  return `POINT(${lng} ${lat})`;
}

async function setCommunityBoundary(
  id: string,
  lat: number,
  lng: number,
  delta = 0.008,
): Promise<void> {
  const wkt = squarePolygonWkt(lat, lng, delta);
  await prisma.$executeRawUnsafe(
    `UPDATE "Community" SET boundary = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
    wkt,
    id,
  );
}

async function setPoiLocation(
  id: string,
  lat: number,
  lng: number,
): Promise<void> {
  const wkt = pointWkt(lat, lng);
  await prisma.$executeRawUnsafe(
    `UPDATE "Poi" SET location = ST_SetSRID(ST_GeomFromText($1), 4326) WHERE id = $2`,
    wkt,
    id,
  );
}

/**
 * NYC Immigrant Enclaves — aligned to sinta-mobile mockCommunities
 * (Mayor's Office map, 30 neighborhoods).
 */
const COMMUNITIES: {
  id: string;
  name: string;
  neighborhood: string;
  description: string;
  heroEmoji: string;
  lat: number;
  lng: number;
  /** Slightly larger polygons for denser corridors */
  delta?: number;
  city?: string;
}[] = [
  {
    id: "chinatown-flushing",
    name: "Chinatown in Flushing",
    neighborhood: "Flushing, Queens",
    description:
      "One of the largest Chinatowns outside Asia. Main Street and Roosevelt hum with regional Chinese cuisines — Shanghainese, Taiwanese, Sichuan, and more.",
    heroEmoji: "🥟",
    lat: 40.759,
    lng: -73.83,
    delta: 0.012,
  },
  {
    id: "chinatown-manhattan",
    name: "Chinatown in Manhattan",
    neighborhood: "Lower Manhattan",
    description:
      "The original New York Chinatown around Canal and Mott — bakers, banquet halls, and Little Fuzhou energy on East Broadway.",
    heroEmoji: "🏮",
    lat: 40.7155,
    lng: -73.997,
  },
  {
    id: "chinatown-sunset-park",
    name: "Chinatown in Sunset Park",
    neighborhood: "Brooklyn",
    description:
      "Brooklyn's Chinatown along 8th Avenue — dim sum mornings and a walk up to the park for harbor views.",
    heroEmoji: "🏯",
    lat: 40.641,
    lng: -74.009,
  },
  {
    id: "guyana-gateway",
    name: "Guyana Gateway",
    neighborhood: "Crown Heights, Brooklyn",
    description:
      "A Guyanese gateway near Utica Avenue — roti shops, bakeries, and Caribbean groceries for the Crown Heights community.",
    heroEmoji: "🇬🇾",
    lat: 40.669,
    lng: -73.931,
  },
  {
    id: "koreatown-manhattan",
    name: "Koreatown in Manhattan",
    neighborhood: "Manhattan",
    description:
      "A vertical village around 32nd Street — karaoke above BBQ, skincare next to soju bars.",
    heroEmoji: "🍜",
    lat: 40.7473,
    lng: -73.9869,
    delta: 0.005,
  },
  {
    id: "koreatown-queens",
    name: "Koreatown in Queens",
    neighborhood: "Murray Hill / Flushing, Queens",
    description:
      "Queens Koreatown near Flushing — quieter than 32nd Street, with barbecue halls and bakeries locals swear by.",
    heroEmoji: "🇰🇷",
    lat: 40.748,
    lng: -73.814,
    delta: 0.018,
  },
  {
    id: "little-africa-si",
    name: "Little Africa in Staten Island",
    neighborhood: "Clifton, Staten Island",
    description:
      "Clifton's Little Africa — Liberian and West African restaurants, markets, and community life on the North Shore.",
    heroEmoji: "🌍",
    lat: 40.621,
    lng: -74.072,
  },
  {
    id: "little-africa-bronx",
    name: "Little Africa in the Bronx",
    neighborhood: "Bronx",
    description:
      "A growing West African corridor near 167th Street — stews, grilled meats, and weekend gatherings.",
    heroEmoji: "🥘",
    lat: 40.834,
    lng: -73.921,
  },
  {
    id: "little-albania",
    name: "Little Albania",
    neighborhood: "Fordham, Bronx",
    description:
      "Fordham's Albanian stretch — cafés, bakeries, and Balkan grilling near the Grand Concourse.",
    heroEmoji: "🇦🇱",
    lat: 40.862,
    lng: -73.898,
  },
  {
    id: "little-bangladesh",
    name: "Little Bangladesh",
    neighborhood: "Jamaica, Queens",
    description:
      "Jamaica's Little Bangladesh — hilsa, biryani, and sweet shops near Hillside and Jamaica Center.",
    heroEmoji: "🇧🇩",
    lat: 40.707,
    lng: -73.793,
  },
  {
    id: "little-bhod-tibet",
    name: "Little Bhod-Tibet",
    neighborhood: "Jackson Heights, Queens",
    description:
      "A Himalayan pocket near Northern Boulevard — momos, butter tea energy, and prayer flags in shop windows.",
    heroEmoji: "🏔️",
    lat: 40.755,
    lng: -73.87,
    delta: 0.014,
  },
  {
    id: "little-caribbean",
    name: "Little Caribbean",
    neighborhood: "Flatbush, Brooklyn",
    description:
      "Flatbush's Little Caribbean — jerk smoke in the air, roti shops, and Carnival energy year-round.",
    heroEmoji: "🇯🇲",
    lat: 40.652,
    lng: -73.96,
  },
  {
    id: "little-colombia",
    name: "Little Colombia",
    neighborhood: "Jackson Heights, Queens",
    description:
      "Jackson Heights' Colombian strip — arepas, pan de bono, and late cafés under the 7 train.",
    heroEmoji: "🇨🇴",
    lat: 40.747,
    lng: -73.891,
    delta: 0.018,
  },
  {
    id: "little-dominican-republic",
    name: "Little Dominican Republic",
    neighborhood: "Washington Heights, Manhattan",
    description:
      "Washington Heights — the largest Dominican community in the U.S. Chimichurris, merengue, and breakfast plates that ruin diners.",
    heroEmoji: "🇩🇴",
    lat: 40.847,
    lng: -73.938,
    delta: 0.01,
  },
  {
    id: "little-ecuador",
    name: "Little Ecuador",
    neighborhood: "Corona / Jackson Heights, Queens",
    description:
      "Corona and Jackson Heights' Ecuadorian corridor — hornado, encebollado, and bakeries near Junction Blvd.",
    heroEmoji: "🇪🇨",
    lat: 40.748,
    lng: -73.869,
    delta: 0.016,
  },
  {
    id: "little-egypt",
    name: "Little Egypt",
    neighborhood: "Astoria, Queens",
    description:
      "Astoria's Little Egypt — shisha cafés, koshari, and Steinway Street evenings that stretch late.",
    heroEmoji: "🇪🇬",
    lat: 40.77,
    lng: -73.912,
  },
  {
    id: "little-guyana-queens",
    name: "Little Guyana in Queens",
    neighborhood: "Richmond Hill & Ozone Park, Queens",
    description:
      "Liberty Avenue's Little Guyana — roti shops, mandirs, mosques, and Indo-Caribbean bakeries between Lefferts and the Van Wyck.",
    heroEmoji: "🇬🇾",
    lat: 40.68,
    lng: -73.837,
    delta: 0.012,
  },
  {
    id: "little-guyana-bronx",
    name: "Little Guyana in the Bronx",
    neighborhood: "Bronx",
    description:
      "A Bronx Guyanese pocket near Nereid Avenue — cook-up rice, pepperpot energy, and weekend family tables.",
    heroEmoji: "🍲",
    lat: 40.899,
    lng: -73.847,
  },
  {
    id: "little-haiti",
    name: "Little Haiti",
    neighborhood: "Flatbush, Brooklyn",
    description:
      "Flatbush's Little Haiti — griot, diri kole, and Creole on Church and Nostrand.",
    heroEmoji: "🇭🇹",
    lat: 40.64,
    lng: -73.955,
  },
  {
    id: "little-india",
    name: "Little India",
    neighborhood: "Jackson Heights, Queens",
    description:
      "74th Street's Little India — spice markets, chaat stalls, and the densest Desi shopping strip in the city.",
    heroEmoji: "🇮🇳",
    lat: 40.7475,
    lng: -73.8915,
  },
  {
    id: "little-manila",
    name: "Little Manila",
    neighborhood: "Woodside / Jackson Heights, Queens",
    description:
      "Little Manila in western Queens — lumpia, halo-halo, and grocery stores stocked like Manila.",
    heroEmoji: "🇵🇭",
    lat: 40.746,
    lng: -73.902,
  },
  {
    id: "little-mexico-port-richmond",
    name: "Little Mexico in Port Richmond",
    neighborhood: "Port Richmond, Staten Island",
    description:
      "Port Richmond's Little Mexico — tacos, pan dulce, and a North Shore strip that feels like home.",
    heroEmoji: "🇲🇽",
    lat: 40.635,
    lng: -74.125,
    delta: 0.015,
  },
  {
    id: "little-mexico-sunset-park",
    name: "Little Mexico in Sunset Park",
    neighborhood: "Sunset Park, Brooklyn",
    description:
      "Sunset Park's Mexican corridor on 5th Avenue — tacos al pastor, tortillerias, and weekend markets.",
    heroEmoji: "🌮",
    lat: 40.648,
    lng: -74.005,
  },
  {
    id: "little-odessa",
    name: "Little Odessa",
    neighborhood: "Brighton Beach, Brooklyn",
    description:
      "Brighton Beach's Little Odessa — smoked fish, Georgian bakery, and Russian under the elevated tracks.",
    heroEmoji: "🇷🇺",
    lat: 40.5776,
    lng: -73.9614,
  },
  {
    id: "little-palestine",
    name: "Little Palestine",
    neighborhood: "Bay Ridge, Brooklyn",
    description:
      "Bay Ridge's Little Palestine — knafeh, falafel, and 5th Avenue cafés that stay busy late.",
    heroEmoji: "🇵🇸",
    lat: 40.622,
    lng: -74.028,
  },
  {
    id: "little-pakistan",
    name: "Little Pakistan",
    neighborhood: "Midwood & Kensington, Brooklyn",
    description:
      "Brooklyn's Little Pakistan on Coney Island Avenue — kebab houses, sweet shops, and Friday-night crowds.",
    heroEmoji: "🇵🇰",
    lat: 40.635,
    lng: -73.963,
    delta: 0.01,
  },
  {
    id: "little-poland",
    name: "Little Poland",
    neighborhood: "Greenpoint, Brooklyn",
    description:
      "Greenpoint's Little Poland — pierogi, kielbasa, and bakeries that still open early for the regulars.",
    heroEmoji: "🇵🇱",
    lat: 40.73,
    lng: -73.954,
  },
  {
    id: "little-senegal",
    name: "Little Senegal",
    neighborhood: "Harlem, Manhattan",
    description:
      "Le Petit Sénégal on West 116th — thieboudienne, fabric shops, and Wolof in the air.",
    heroEmoji: "🇸🇳",
    lat: 40.8029,
    lng: -73.9531,
  },
  {
    id: "little-ukraine",
    name: "Little Ukraine",
    neighborhood: "East Village, Manhattan",
    description:
      "East Village's Little Ukraine — pierogi counters, churches, and a neighborhood that still feels like home for many families.",
    heroEmoji: "🇺🇦",
    lat: 40.728,
    lng: -73.987,
  },
  {
    id: "little-yemen",
    name: "Little Yemen",
    neighborhood: "Bronx",
    description:
      "The Bronx's Little Yemen — saltah, fahsa, and cafés near Bronx Park East that stay open late.",
    heroEmoji: "🇾🇪",
    lat: 40.857,
    lng: -73.868,
    delta: 0.015,
  },
  // —— Long Island (Nassau / Suffolk) ——
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
    delta: 0.02,
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
    delta: 0.016,
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
    delta: 0.028,
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
  // —— Greater Detroit ——
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
    delta: 0.025,
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
    delta: 0.028,
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
    delta: 0.02,
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
    delta: 0.02,
  },
  // —— Greater Los Angeles / Orange County ——
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
    delta: 0.02,
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
    delta: 0.012,
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
    delta: 0.01,
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
    delta: 0.01,
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
    delta: 0.02,
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
    delta: 0.025,
  },
  // —— Chicago / Chicagoland ——
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
];

async function main() {
  console.log("Seeding Sinta database…");

  await prisma.routeStop.deleteMany();
  await prisma.route.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.stamp.deleteMany();
  await prisma.dish.deleteMany();
  await prisma.poi.deleteMany();
  await prisma.community.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: {
      id: "seed-user-1",
      email: "explorer@sinta.app",
      displayName: "Sinta Explorer",
      intents: ["explore"],
      cultures: ["kr"],
    },
  });

  for (const c of COMMUNITIES) {
    await prisma.community.create({
      data: {
        id: c.id,
        name: c.name,
        neighborhood: c.neighborhood,
        city: c.city ?? "New York",
        description: c.description,
        heroEmoji: c.heroEmoji,
      },
    });
    await setCommunityBoundary(c.id, c.lat, c.lng, c.delta ?? 0.008);
  }

  // —— Curated starter POIs / dishes (Yelp sync fills the rest) ——
  const himalayanYak = await prisma.poi.create({
    data: {
      id: "r-momo-hut",
      communityId: "little-bhod-tibet",
      name: "Himalayan Yak",
      category: "restaurant",
      address: "Northern Blvd, Queens",
      hours: "11:00–22:00",
      ethnicities: ["nepali"],
      dishes: {
        create: [
          {
            id: "d-momos",
            name: "Momos",
            description: "Steamed Himalayan dumplings with spicy tomato achar.",
            priceRange: "$$",
          },
          {
            id: "d-thukpa",
            name: "Thukpa",
            description: "Hearty noodle soup with vegetables and tender meat.",
            priceRange: "$$",
          },
        ],
      },
    },
  });
  await setPoiLocation(himalayanYak.id, 40.756, -73.869);

  const butterTeaHouse = await prisma.poi.create({
    data: {
      id: "r-butter-tea",
      communityId: "little-bhod-tibet",
      name: "Prayer Flag Café",
      category: "cafe",
      address: "37th Ave near Northern Blvd",
      hours: "09:00–20:00",
      ethnicities: ["nepali"],
      dishes: {
        create: [
          {
            id: "d-butter-tea",
            name: "Butter Tea",
            description: "Salty Tibetan po cha — warming and rich.",
            priceRange: "$",
          },
        ],
      },
    },
  });
  await setPoiLocation(butterTeaHouse.id, 40.754, -73.871);

  const tatiana = await prisma.poi.create({
    data: {
      id: "r-tatiana",
      communityId: "little-odessa",
      name: "Tatiana Restaurant",
      category: "restaurant",
      address: "3152 Brighton 6th St",
      hours: "12:00–23:00",
      ethnicities: ["russian", "ukrainian"],
      dishes: {
        create: [
          {
            id: "d14",
            name: "Smoked Fish Platter",
            description: "Assorted smoked fish with dark bread.",
            priceRange: "$$$",
          },
        ],
      },
    },
  });
  await setPoiLocation(tatiana.id, 40.578, -73.96);

  const odessaMarket = await prisma.poi.create({
    data: {
      id: "r-odessa-market",
      communityId: "little-odessa",
      name: "Brighton Beach Market",
      category: "market",
      address: "Brighton Beach Ave",
      hours: "08:00–20:00",
      ethnicities: ["russian"],
      dishes: {
        create: [
          {
            id: "d-blini",
            name: "Blini with Caviar",
            description: "Thin pancakes with sour cream and caviar.",
            priceRange: "$$$",
          },
        ],
      },
    },
  });
  await setPoiLocation(odessaMarket.id, 40.577, -73.962);

  const jongro = await prisma.poi.create({
    data: {
      id: "r-jongro",
      communityId: "koreatown-manhattan",
      name: "Jongro BBQ",
      category: "restaurant",
      address: "22 W 32nd St",
      hours: "11:30–02:00",
      ethnicities: ["korean"],
      dishes: {
        create: [
          {
            id: "d9",
            name: "Korean BBQ",
            description: "Table-grilled short rib with banchan.",
            priceRange: "$$$",
          },
        ],
      },
    },
  });
  await setPoiLocation(jongro.id, 40.7475, -73.987);

  const herNameIsHan = await prisma.poi.create({
    data: {
      id: "r-her-name",
      communityId: "koreatown-manhattan",
      name: "Her Name Is Han",
      category: "restaurant",
      address: "17 E 31st St",
      hours: "17:00–23:00",
      ethnicities: ["korean"],
      dishes: {
        create: [
          {
            id: "d10",
            name: "Tteokbokki",
            description: "Chewy rice cakes in spicy gochujang sauce.",
            priceRange: "$$",
          },
        ],
      },
    },
  });
  await setPoiLocation(herNameIsHan.id, 40.7468, -73.9855);

  const africaKine = await prisma.poi.create({
    data: {
      id: "r-africa-kine",
      communityId: "little-senegal",
      name: "Africa Kine",
      category: "restaurant",
      address: "256 W 116th St",
      hours: "12:00–22:00",
      ethnicities: ["senegalese"],
      dishes: {
        create: [
          {
            id: "d13",
            name: "Thieboudienne",
            description: "Senegal's national fish-and-rice dish.",
            priceRange: "$$",
          },
          {
            id: "d-yassa",
            name: "Chicken Yassa",
            description: "Onion-lemon marinated chicken with rice.",
            priceRange: "$$",
          },
        ],
      },
    },
  });
  await setPoiLocation(africaKine.id, 40.803, -73.9535);

  const senegalMarket = await prisma.poi.create({
    data: {
      id: "r-senegal-market",
      communityId: "little-senegal",
      name: "Le Petit Marché",
      category: "market",
      address: "W 116th St",
      hours: "10:00–19:00",
      ethnicities: ["senegalese"],
      dishes: {
        create: [
          {
            id: "d-attaya",
            name: "Attaya Tea",
            description: "Sweet Senegalese mint tea poured from height.",
            priceRange: "$",
          },
        ],
      },
    },
  });
  await setPoiLocation(senegalMarket.id, 40.8025, -73.9525);

  const nanXiang = await prisma.poi.create({
    data: {
      id: "r-nan-xiang",
      communityId: "chinatown-flushing",
      name: "Nan Xiang Xiao Long Bao",
      category: "restaurant",
      address: "Main St, Flushing",
      hours: "10:00–21:00",
      ethnicities: ["chinese"],
      dishes: {
        create: [
          {
            id: "d-xlb",
            name: "Soup Dumplings",
            description: "Delicate steamed buns filled with pork and molten broth.",
            priceRange: "$$",
          },
          {
            id: "d-shengjian",
            name: "Shengjian Bao",
            description: "Pan-fried soup buns with crispy bottoms.",
            priceRange: "$",
          },
        ],
      },
    },
  });
  await setPoiLocation(nanXiang.id, 40.759, -73.83);

  const jacksonDosa = await prisma.poi.create({
    data: {
      id: "r-jackson-dosa",
      communityId: "little-india",
      name: "Jackson Diner",
      category: "restaurant",
      address: "37th Ave, Jackson Heights",
      hours: "11:00–22:00",
      ethnicities: ["indian"],
      dishes: {
        create: [
          {
            id: "d-masala-dosa",
            name: "Masala Dosa",
            description: "Crispy fermented crepe with spiced potato filling.",
            priceRange: "$$",
          },
          {
            id: "d-chole-bhature",
            name: "Chole Bhature",
            description: "Chickpea curry with puffy fried bread.",
            priceRange: "$$",
          },
        ],
      },
    },
  });
  await setPoiLocation(jacksonDosa.id, 40.7498, -73.891);

  const singhRoti = await prisma.poi.create({
    data: {
      id: "r-singh-roti",
      communityId: "little-guyana-queens",
      name: "Singh's Roti Shop",
      category: "restaurant",
      address: "Liberty Ave, Richmond Hill",
      hours: "10:00–21:00",
      ethnicities: ["guyanese"],
      dishes: {
        create: [
          {
            id: "d-doubles",
            name: "Doubles",
            description: "Curried chickpeas on soft fried bara.",
            priceRange: "$",
          },
          {
            id: "d-goat-roti",
            name: "Goat Roti",
            description: "Flaky skin with tender curried goat.",
            priceRange: "$$",
          },
        ],
      },
    },
  });
  await setPoiLocation(singhRoti.id, 40.6965, -73.831);

  const tacoSunset = await prisma.poi.create({
    data: {
      id: "r-taco-sunset",
      communityId: "little-mexico-sunset-park",
      name: "Tacos El Bronco",
      category: "restaurant",
      address: "5th Ave, Sunset Park",
      hours: "11:00–23:00",
      ethnicities: ["mexican"],
      dishes: {
        create: [
          {
            id: "d-al-pastor",
            name: "Tacos al Pastor",
            description: "Trompo-carved pork with pineapple on corn tortillas.",
            priceRange: "$",
          },
          {
            id: "d-horchata",
            name: "Horchata",
            description: "Cinnamon rice drink — cold and sweet.",
            priceRange: "$",
          },
        ],
      },
    },
  });
  await setPoiLocation(tacoSunset.id, 40.6455, -74.01);

  const malecon = await prisma.poi.create({
    data: {
      id: "r-malecon",
      communityId: "little-dominican-republic",
      name: "El Malecon",
      category: "restaurant",
      address: "W 175th St, Washington Heights",
      hours: "07:00–23:00",
      ethnicities: ["dominican"],
      dishes: {
        create: [
          {
            id: "d-mangu",
            name: "Mangú",
            description: "Mashed plantains with pickled onions and fried cheese.",
            priceRange: "$$",
          },
          {
            id: "d-pollo-guisado",
            name: "Pollo Guisado",
            description: "Slow-simmered Dominican chicken stew with rice.",
            priceRange: "$$",
          },
        ],
      },
    },
  });
  await setPoiLocation(malecon.id, 40.8465, -73.938);

  const yemenHouse = await prisma.poi.create({
    data: {
      id: "r-yemen-house",
      communityId: "little-yemen",
      name: "Yemen Café",
      category: "restaurant",
      address: "Atlantic Ave, Brooklyn",
      hours: "11:00–22:00",
      ethnicities: ["yemeni"],
      dishes: {
        create: [
          {
            id: "d-mandi",
            name: "Mandi",
            description: "Slow-cooked lamb over fragrant basmati rice.",
            priceRange: "$$$",
          },
          {
            id: "d-fahsa",
            name: "Fahsa",
            description: "Bubbling lamb stew with hilbeh foam.",
            priceRange: "$$",
          },
        ],
      },
    },
  });
  await setPoiLocation(yemenHouse.id, 40.69, -73.986);

  await prisma.stamp.create({
    data: {
      userId: user.id,
      communityId: "koreatown-manhattan",
    },
  });

  await prisma.journalEntry.create({
    data: {
      userId: user.id,
      communityId: "koreatown-manhattan",
      poiId: jongro.id,
      note: "Late-night BBQ after work — banchan never ends.",
      photoUrl: null,
    },
  });

  const neonNoodles = await prisma.route.create({
    data: {
      id: "route-neon-noodles",
      title: "Neon & Noodles",
      description: "Late-night Koreatown for after-work explorers",
      type: RouteType.curated,
      stops: {
        create: [
          { poiId: jongro.id, order: 1 },
          { poiId: herNameIsHan.id, order: 2 },
        ],
      },
    },
  });

  const queensHimalaya = await prisma.route.create({
    data: {
      id: "route-queens-himalaya",
      title: "Himalayan Queens Afternoon",
      description: "Momos, thukpa, and butter tea in Little Bhod-Tibet",
      type: RouteType.seasonal,
      stops: {
        create: [
          { poiId: himalayanYak.id, order: 1 },
          { poiId: butterTeaHouse.id, order: 2 },
        ],
      },
    },
  });

  await prisma.route.create({
    data: {
      id: "route-ai-harlem-boardwalk",
      title: "Harlem to the Boardwalk (suggested)",
      description:
        "Stub AI suggestion spanning Little Senegal flavors and Brighton Beach classics.",
      type: RouteType.ai_generated,
      stops: {
        create: [
          { poiId: africaKine.id, order: 1 },
          { poiId: tatiana.id, order: 2 },
        ],
      },
    },
  });

  console.log("Seed complete.");
  console.log({
    user: user.id,
    communities: COMMUNITIES.length,
    curatedPois: 8,
    routes: [neonNoodles.id, queensHimalaya.id, "route-ai-harlem-boardwalk"],
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
