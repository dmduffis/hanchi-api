/**
 * Offline-complete Wikipedia geocodes using centroids + state capitals.
 * Merges existing Nominatim/centroid cache hits. No network.
 *
 * Usage: npx tsx scripts/complete-wikipedia-geocode.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "data");
const PARSED = path.join(ROOT, "wikipedia-enclaves-parsed.json");
const CACHE = path.join(ROOT, "wikipedia-enclave-geocodes.json");
const CENTROIDS = path.join(ROOT, "us-ca-city-centroids.json");
const OUT = path.join(ROOT, "wikipedia-enclaves-ready.json");

type Parsed = {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  country: "US" | "CA";
  ethnicitySection: string;
  heroEmoji: string;
  countryCode: string | null;
  affinities: string[];
  yelpTerms: string[] | null;
  ethnicities: string[] | null;
  geocodeQuery: string;
  description: string;
  raw?: string;
};

type GeoHit = {
  lat: number;
  lng: number;
  displayName?: string;
  at: string;
  source?: string;
};

const STATE_CENTROIDS: Record<string, { lat: number; lng: number; label: string }> = {
  alabama: { lat: 32.3777, lng: -86.3004, label: "Alabama" },
  alaska: { lat: 58.3019, lng: -134.4197, label: "Alaska" },
  arizona: { lat: 33.4484, lng: -112.074, label: "Arizona" },
  arkansas: { lat: 34.7465, lng: -92.2896, label: "Arkansas" },
  california: { lat: 36.7783, lng: -119.4179, label: "California" },
  colorado: { lat: 39.7392, lng: -104.9903, label: "Colorado" },
  connecticut: { lat: 41.7658, lng: -72.6734, label: "Connecticut" },
  delaware: { lat: 39.1582, lng: -75.5244, label: "Delaware" },
  florida: { lat: 28.5383, lng: -81.3792, label: "Florida" },
  georgia: { lat: 33.749, lng: -84.388, label: "Georgia" },
  hawaii: { lat: 21.3069, lng: -157.8583, label: "Hawaii" },
  idaho: { lat: 43.615, lng: -116.2023, label: "Idaho" },
  illinois: { lat: 41.8781, lng: -87.6298, label: "Illinois" },
  indiana: { lat: 39.7684, lng: -86.1581, label: "Indiana" },
  iowa: { lat: 41.5868, lng: -93.625, label: "Iowa" },
  kansas: { lat: 39.0473, lng: -95.6752, label: "Kansas" },
  kentucky: { lat: 38.2527, lng: -85.7585, label: "Kentucky" },
  louisiana: { lat: 29.9511, lng: -90.0715, label: "Louisiana" },
  maine: { lat: 43.6591, lng: -70.2568, label: "Maine" },
  maryland: { lat: 39.2904, lng: -76.6122, label: "Maryland" },
  massachusetts: { lat: 42.3601, lng: -71.0589, label: "Massachusetts" },
  michigan: { lat: 42.3314, lng: -83.0458, label: "Michigan" },
  minnesota: { lat: 44.9778, lng: -93.265, label: "Minnesota" },
  mississippi: { lat: 32.2988, lng: -90.1848, label: "Mississippi" },
  missouri: { lat: 38.627, lng: -90.1994, label: "Missouri" },
  montana: { lat: 46.8787, lng: -113.9966, label: "Montana" },
  nebraska: { lat: 41.2565, lng: -95.9345, label: "Nebraska" },
  nevada: { lat: 36.1699, lng: -115.1398, label: "Nevada" },
  "new hampshire": { lat: 42.9956, lng: -71.4548, label: "New Hampshire" },
  "new jersey": { lat: 40.7357, lng: -74.1724, label: "New Jersey" },
  "new mexico": { lat: 35.0844, lng: -106.6504, label: "New Mexico" },
  "new york": { lat: 40.7128, lng: -74.006, label: "New York" },
  "north carolina": { lat: 35.7796, lng: -78.6382, label: "North Carolina" },
  "north dakota": { lat: 46.8772, lng: -96.7898, label: "North Dakota" },
  ohio: { lat: 39.9612, lng: -82.9988, label: "Ohio" },
  oklahoma: { lat: 35.4676, lng: -97.5164, label: "Oklahoma" },
  oregon: { lat: 45.5152, lng: -122.6784, label: "Oregon" },
  pennsylvania: { lat: 39.9526, lng: -75.1652, label: "Pennsylvania" },
  "rhode island": { lat: 41.824, lng: -71.4128, label: "Rhode Island" },
  "south carolina": { lat: 34.0007, lng: -81.0348, label: "South Carolina" },
  "south dakota": { lat: 44.0805, lng: -103.231, label: "South Dakota" },
  tennessee: { lat: 36.1627, lng: -86.7816, label: "Tennessee" },
  texas: { lat: 30.2672, lng: -97.7431, label: "Texas" },
  utah: { lat: 40.7608, lng: -111.891, label: "Utah" },
  vermont: { lat: 44.4759, lng: -73.2121, label: "Vermont" },
  virginia: { lat: 37.5407, lng: -77.436, label: "Virginia" },
  washington: { lat: 47.6062, lng: -122.3321, label: "Washington" },
  "west virginia": { lat: 38.3498, lng: -81.6326, label: "West Virginia" },
  wisconsin: { lat: 43.0389, lng: -87.9065, label: "Wisconsin" },
  wyoming: { lat: 41.14, lng: -104.8202, label: "Wyoming" },
  "district of columbia": { lat: 38.9072, lng: -77.0369, label: "D.C." },
  "d.c.": { lat: 38.9072, lng: -77.0369, label: "D.C." },
  dc: { lat: 38.9072, lng: -77.0369, label: "D.C." },
  alberta: { lat: 51.0447, lng: -114.0719, label: "Alberta" },
  "british columbia": { lat: 49.2827, lng: -123.1207, label: "British Columbia" },
  manitoba: { lat: 49.8951, lng: -97.1384, label: "Manitoba" },
  ontario: { lat: 43.6532, lng: -79.3832, label: "Ontario" },
  quebec: { lat: 45.5017, lng: -73.5673, label: "Quebec" },
  saskatchewan: { lat: 50.4452, lng: -104.6189, label: "Saskatchewan" },
  "nova scotia": { lat: 44.6488, lng: -63.5752, label: "Nova Scotia" },
};

/** Extra city aliases beyond us-ca-city-centroids.json */
const EXTRA_CITIES: { city: string; region: string; lat: number; lng: number }[] = [
  { city: "Downey", region: "California", lat: 33.9401, lng: -118.1332 },
  { city: "Dublin", region: "California", lat: 37.7022, lng: -121.9358 },
  { city: "Union City", region: "California", lat: 37.5958, lng: -122.0191 },
  { city: "Delano", region: "California", lat: 35.7688, lng: -119.2471 },
  { city: "East Los Angeles", region: "California", lat: 34.0239, lng: -118.172 },
  { city: "Lakewood", region: "California", lat: 33.8536, lng: -118.1339 },
  { city: "Lakewood", region: "Colorado", lat: 39.7047, lng: -105.0814 },
  { city: "Dearborn Heights", region: "Michigan", lat: 42.3369, lng: -83.2733 },
  { city: "Cicero", region: "Illinois", lat: 41.8456, lng: -87.7539 },
  { city: "Little Village", region: "Illinois", lat: 41.844, lng: -87.71 },
  { city: "Deadwood", region: "South Dakota", lat: 44.3767, lng: -103.7296 },
  { city: "Cortez", region: "Colorado", lat: 37.3489, lng: -108.5859 },
  { city: "Perry", region: "Iowa", lat: 41.8383, lng: -94.1072 },
  { city: "Des Moines", region: "Iowa", lat: 41.5868, lng: -93.625 },
  { city: "Racine", region: "Wisconsin", lat: 42.7261, lng: -87.7829 },
  { city: "Beloit", region: "Wisconsin", lat: 42.5083, lng: -89.0318 },
  { city: "Delavan", region: "Wisconsin", lat: 42.6331, lng: -88.6437 },
  { city: "West Liberty", region: "Iowa", lat: 41.5701, lng: -91.2613 },
  { city: "Doctor Phillips", region: "Florida", lat: 28.4511, lng: -81.4923 },
  { city: "Cumming", region: "Georgia", lat: 34.2073, lng: -84.1402 },
  { city: "Covina", region: "California", lat: 34.0901, lng: -117.8903 },
  { city: "West Covina", region: "California", lat: 34.0686, lng: -117.939 },
  { city: "Deutschtown", region: "Pennsylvania", lat: 40.455, lng: -79.997 },
  { city: "Pittsburgh", region: "Pennsylvania", lat: 40.4406, lng: -79.9959 },
  { city: "Corona", region: "New York", lat: 40.747, lng: -73.86 },
  { city: "Spanish Harlem", region: "New York", lat: 40.7957, lng: -73.9389 },
  { city: "Parma", region: "Ohio", lat: 41.4048, lng: -81.7229 },
  { city: "Gary", region: "Indiana", lat: 41.5934, lng: -87.3464 },
  { city: "Sherrelwood", region: "Colorado", lat: 39.8403, lng: -105.0014 },
  { city: "Richmond", region: "Virginia", lat: 37.5407, lng: -77.436 },
  { city: "Newport News", region: "Virginia", lat: 37.0871, lng: -76.473 },
  { city: "Ellicott City", region: "Maryland", lat: 39.2673, lng: -76.7983 },
  { city: "Rockville", region: "Maryland", lat: 39.084, lng: -77.1528 },
  { city: "Silver Spring", region: "Maryland", lat: 38.9907, lng: -77.0261 },
  { city: "Malden", region: "Massachusetts", lat: 42.4251, lng: -71.0662 },
  { city: "Quincy", region: "Massachusetts", lat: 42.2529, lng: -71.0023 },
  { city: "Lowell", region: "Massachusetts", lat: 42.6334, lng: -71.3162 },
  { city: "Fall River", region: "Massachusetts", lat: 41.7015, lng: -71.155 },
  { city: "Brockton", region: "Massachusetts", lat: 42.0834, lng: -71.0184 },
  { city: "Jersey City", region: "New Jersey", lat: 40.7178, lng: -74.0431 },
  { city: "Paterson", region: "New Jersey", lat: 40.9168, lng: -74.171 },
  { city: "Edison", region: "New Jersey", lat: 40.5187, lng: -74.4121 },
  { city: "Fort Lee", region: "New Jersey", lat: 40.8509, lng: -73.9701 },
  { city: "Palisades Park", region: "New Jersey", lat: 40.8482, lng: -73.9974 },
  { city: "Flushing", region: "New York", lat: 40.7675, lng: -73.8331 },
  { city: "Sunset Park", region: "New York", lat: 40.6455, lng: -74.0124 },
  { city: "Manhattan", region: "New York", lat: 40.7831, lng: -73.9712 },
  { city: "Jamaica", region: "New York", lat: 40.7023, lng: -73.788 },
  { city: "Kensington", region: "New York", lat: 40.6415, lng: -73.972 },
  { city: "Flatbush", region: "New York", lat: 40.652, lng: -73.959 },
  { city: "Richmond Hill", region: "New York", lat: 40.6998, lng: -73.8312 },
  { city: "Hicksville", region: "New York", lat: 40.7684, lng: -73.5251 },
  { city: "Great Neck", region: "New York", lat: 40.8007, lng: -73.7285 },
  { city: "Albany", region: "New York", lat: 42.6526, lng: -73.7562 },
  { city: "Buffalo", region: "New York", lat: 42.8864, lng: -78.8784 },
  { city: "Rochester", region: "New York", lat: 43.1566, lng: -77.6088 },
  { city: "Syracuse", region: "New York", lat: 43.0481, lng: -76.1474 },
  { city: "Binghamton", region: "New York", lat: 42.0987, lng: -75.918 },
  { city: "Toronto", region: "Ontario", lat: 43.6532, lng: -79.3832 },
  { city: "Vancouver", region: "British Columbia", lat: 49.2827, lng: -123.1207 },
  { city: "Montreal", region: "Quebec", lat: 45.5017, lng: -73.5673 },
  { city: "Calgary", region: "Alberta", lat: 51.0447, lng: -114.0719 },
  { city: "Edmonton", region: "Alberta", lat: 53.5461, lng: -113.4938 },
  { city: "Mississauga", region: "Ontario", lat: 43.589, lng: -79.6441 },
  { city: "Markham", region: "Ontario", lat: 43.8561, lng: -79.337 },
  { city: "Richmond Hill", region: "Ontario", lat: 43.8828, lng: -79.4403 },
  { city: "Scarborough", region: "Ontario", lat: 43.7764, lng: -79.2318 },
  { city: "Brampton", region: "Ontario", lat: 43.7315, lng: -79.7624 },
  { city: "Windsor", region: "Ontario", lat: 42.3149, lng: -83.0364 },
  { city: "Brossard", region: "Quebec", lat: 45.4457, lng: -73.463 },
  { city: "Burnaby", region: "British Columbia", lat: 49.2488, lng: -122.9805 },
  { city: "Surrey", region: "British Columbia", lat: 49.1913, lng: -122.849 },
  { city: "Gimli", region: "Manitoba", lat: 50.6322, lng: -96.9907 },
  { city: "Winnipeg", region: "Manitoba", lat: 49.8951, lng: -97.1384 },
  { city: "Chinatown", region: "California", lat: 37.7943, lng: -122.4064 },
  { city: "Spring Valley", region: "Nevada", lat: 36.108, lng: -115.245 },
  { city: "Honolulu", region: "Hawaii", lat: 21.3069, lng: -157.8583 },
  { city: "Salt Lake City", region: "Utah", lat: 40.7608, lng: -111.891 },
  { city: "Sacramento", region: "California", lat: 38.5816, lng: -121.4944 },
  { city: "Seattle", region: "Washington", lat: 47.6062, lng: -122.3321 },
  { city: "Bellevue", region: "Washington", lat: 47.6101, lng: -122.2015 },
  { city: "Philadelphia", region: "Pennsylvania", lat: 39.9526, lng: -75.1652 },
  { city: "Baltimore", region: "Maryland", lat: 39.2904, lng: -76.6122 },
  { city: "Boston", region: "Massachusetts", lat: 42.3601, lng: -71.0589 },
  { city: "Chicago", region: "Illinois", lat: 41.8781, lng: -87.6298 },
  { city: "Houston", region: "Texas", lat: 29.7604, lng: -95.3698 },
  { city: "Dallas", region: "Texas", lat: 32.7767, lng: -96.797 },
  { city: "Richardson", region: "Texas", lat: 32.9483, lng: -96.7299 },
  { city: "Chamblee", region: "Georgia", lat: 33.8923, lng: -84.2988 },
  { city: "Fresno", region: "California", lat: 36.7378, lng: -119.7871 },
  { city: "Oakland", region: "California", lat: 37.8044, lng: -122.2712 },
  { city: "Monterey Park", region: "California", lat: 34.0625, lng: -118.1228 },
  { city: "Rowland Heights", region: "California", lat: 33.9761, lng: -117.9053 },
  { city: "Westminster", region: "California", lat: 33.7592, lng: -117.9897 },
  { city: "Garden Grove", region: "California", lat: 33.7739, lng: -117.9414 },
  { city: "Anaheim", region: "California", lat: 33.8366, lng: -117.9143 },
  { city: "Los Angeles", region: "California", lat: 34.0522, lng: -118.2437 },
  { city: "San Francisco", region: "California", lat: 37.7749, lng: -122.4194 },
  { city: "San Diego", region: "California", lat: 32.7157, lng: -117.1611 },
  { city: "San Jose", region: "California", lat: 37.3382, lng: -121.8863 },
  { city: "Fremont", region: "California", lat: 37.5485, lng: -121.9886 },
  { city: "Long Beach", region: "California", lat: 33.7701, lng: -118.1937 },
  { city: "Glendale", region: "California", lat: 34.1425, lng: -118.2551 },
  { city: "Minneapolis", region: "Minnesota", lat: 44.9778, lng: -93.265 },
  { city: "Saint Paul", region: "Minnesota", lat: 44.9537, lng: -93.09 },
  { city: "St. Paul", region: "Minnesota", lat: 44.9537, lng: -93.09 },
  { city: "Detroit", region: "Michigan", lat: 42.3314, lng: -83.0458 },
  { city: "Dearborn", region: "Michigan", lat: 42.3223, lng: -83.1763 },
  { city: "Hamtramck", region: "Michigan", lat: 42.3928, lng: -83.0496 },
  { city: "Milwaukee", region: "Wisconsin", lat: 43.0389, lng: -87.9065 },
  { city: "Fort Wayne", region: "Indiana", lat: 41.0793, lng: -85.1394 },
  { city: "Indianapolis", region: "Indiana", lat: 39.7684, lng: -86.1581 },
  { city: "Tulsa", region: "Oklahoma", lat: 36.154, lng: -95.9928 },
  { city: "Oklahoma City", region: "Oklahoma", lat: 35.4676, lng: -97.5164 },
  { city: "Las Vegas", region: "Nevada", lat: 36.1699, lng: -115.1398 },
  { city: "Denver", region: "Colorado", lat: 39.7392, lng: -104.9903 },
  { city: "Aurora", region: "Colorado", lat: 39.7294, lng: -104.8319 },
  { city: "Phoenix", region: "Arizona", lat: 33.4484, lng: -112.074 },
  { city: "Tucson", region: "Arizona", lat: 32.2226, lng: -110.9747 },
  { city: "Portland", region: "Oregon", lat: 45.5152, lng: -122.6784 },
  { city: "Salem", region: "Oregon", lat: 44.9429, lng: -123.0351 },
  { city: "Atlanta", region: "Georgia", lat: 33.749, lng: -84.388 },
  { city: "Miami", region: "Florida", lat: 25.7617, lng: -80.1918 },
  { city: "Orlando", region: "Florida", lat: 28.5383, lng: -81.3792 },
  { city: "Tampa", region: "Florida", lat: 27.9506, lng: -82.4572 },
  { city: "Washington", region: "District of Columbia", lat: 38.9072, lng: -77.0369 },
  { city: "New Orleans", region: "Louisiana", lat: 29.9511, lng: -90.0715 },
  { city: "Nashville", region: "Tennessee", lat: 36.1627, lng: -86.7816 },
  { city: "Charlotte", region: "North Carolina", lat: 35.2271, lng: -80.8431 },
  { city: "Raleigh", region: "North Carolina", lat: 35.7796, lng: -78.6382 },
  { city: "Louisville", region: "Kentucky", lat: 38.2527, lng: -85.7585 },
  { city: "Cleveland", region: "Ohio", lat: 41.4993, lng: -81.6944 },
  { city: "Columbus", region: "Ohio", lat: 39.9612, lng: -82.9988 },
  { city: "Cincinnati", region: "Ohio", lat: 39.1031, lng: -84.512 },
  { city: "Kansas City", region: "Missouri", lat: 39.0997, lng: -94.5786 },
  { city: "St. Louis", region: "Missouri", lat: 38.627, lng: -90.1994 },
  { city: "Omaha", region: "Nebraska", lat: 41.2565, lng: -95.9345 },
  { city: "Providence", region: "Rhode Island", lat: 41.824, lng: -71.4128 },
  { city: "Hartford", region: "Connecticut", lat: 41.7658, lng: -72.6734 },
  { city: "New Haven", region: "Connecticut", lat: 41.3083, lng: -72.9279 },
  { city: "Bridgeport", region: "Connecticut", lat: 41.1865, lng: -73.1952 },
  { city: "Stamford", region: "Connecticut", lat: 41.0534, lng: -73.5387 },
  { city: "Allentown", region: "Pennsylvania", lat: 40.6084, lng: -75.4902 },
  { city: "Reading", region: "Pennsylvania", lat: 40.3356, lng: -75.9269 },
  { city: "Scranton", region: "Pennsylvania", lat: 41.409, lng: -75.6624 },
  { city: "Troy", region: "New York", lat: 42.7284, lng: -73.6918 },
  { city: "Utica", region: "New York", lat: 43.1009, lng: -75.2327 },
  { city: "Yonkers", region: "New York", lat: 40.9312, lng: -73.8987 },
  { city: "White Plains", region: "New York", lat: 41.033, lng: -73.7629 },
  { city: "New Rochelle", region: "New York", lat: 40.9115, lng: -73.7824 },
  { city: "Hempstead", region: "New York", lat: 40.7062, lng: -73.6187 },
  { city: "Mineola", region: "New York", lat: 40.7493, lng: -73.6407 },
  { city: "Brentwood", region: "New York", lat: 40.7812, lng: -73.2462 },
  { city: "Central Islip", region: "New York", lat: 40.7904, lng: -73.2018 },
  { city: "Bay Shore", region: "New York", lat: 40.7251, lng: -73.2454 },
  { city: "Huntington Station", region: "New York", lat: 40.8534, lng: -73.4115 },
  { city: "North York", region: "Ontario", lat: 43.7615, lng: -79.4111 },
  { city: "Little Italy", region: "Ontario", lat: 43.655, lng: -79.42 },
  { city: "Corso Italia", region: "Ontario", lat: 43.677, lng: -79.445 },
  { city: "Little Portugal", region: "Ontario", lat: 43.6475, lng: -79.435 },
  { city: "Saint-Leonard", region: "Quebec", lat: 45.5875, lng: -73.595 },
  { city: "Saint Leonard", region: "Quebec", lat: 45.5875, lng: -73.595 },
  { city: "Port Richmond", region: "New York", lat: 40.633, lng: -74.14 },
  { city: "Duluth", region: "Minnesota", lat: 46.7867, lng: -92.1005 },
  { city: "Greater Toronto Area", region: "Ontario", lat: 43.6532, lng: -79.3832 },
  { city: "Greater Montreal", region: "Quebec", lat: 45.5017, lng: -73.5673 },
  { city: "South Milwaukee", region: "Wisconsin", lat: 42.9106, lng: -87.8606 },
  { city: "Spartanburg", region: "South Carolina", lat: 34.9496, lng: -81.932 },
  { city: "Vancouver", region: "B.C.", lat: 49.2827, lng: -123.1207 },
  { city: "Vancouver", region: "BC", lat: 49.2827, lng: -123.1207 },
];

function normalizeKey(city: string, region: string): string {
  return `${city.trim().toLowerCase()}|${region.trim().toLowerCase()}`;
}

function deltaForSection(section: string): number {
  if (/china|mexico|india|philippines|vietnam|korea|japan/i.test(section)) {
    return 0.014;
  }
  return 0.012;
}

function loadCityMap(): Map<string, { lat: number; lng: number }> {
  const map = new Map<string, { lat: number; lng: number }>();
  if (fs.existsSync(CENTROIDS)) {
    const rows = JSON.parse(fs.readFileSync(CENTROIDS, "utf8")) as {
      city: string;
      region: string;
      lat: number;
      lng: number;
    }[];
    for (const r of rows) map.set(normalizeKey(r.city, r.region), r);
  }
  for (const r of EXTRA_CITIES) map.set(normalizeKey(r.city, r.region), r);
  return map;
}

function findStateInText(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\btoronto\b|\bmississauga\b|\bscarborough\b|\bnorth york\b|\bbrampton\b|\bmarkham\b|\bgta\b|\bgreat(?:er)? toronto\b/i.test(lower)) {
    return "ontario";
  }
  if (/\bmontreal\b|\bsaint[- ]?leonard\b|\bbrossard\b|\bgreat(?:er)? montreal\b/i.test(lower)) {
    return "quebec";
  }
  if (/\bduluth\b|\btwin cities\b|\bst\.?\s*paul\b|\bminneapolis\b|\bmn\b/i.test(lower)) {
    return "minnesota";
  }
  if (/\bstaten island\b|\bnyc\b|\bnew york city\b/i.test(lower)) {
    return "new york";
  }
  if (/\b\bwi\b|\bwisconsin\b/i.test(lower) || /\bsouth milwaukee\b/i.test(lower)) {
    return "wisconsin";
  }
  if (/\b\bsc\b|\bsouth carolina\b|\bspartanburg\b/i.test(lower)) {
    return "south carolina";
  }
  if (/\bb\.?c\.?\b|\bbritish columbia\b|\bvancouver\b/i.test(lower)) {
    return "british columbia";
  }
  // Prefer longer names first
  const keys = Object.keys(STATE_CENTROIDS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (new RegExp(`\\b${k.replace(/\./g, "\\.")}\\b`, "i").test(lower)) {
      return k;
    }
  }
  return null;
}

function findCityMatch(
  text: string,
  region: string,
  cities: Map<string, { lat: number; lng: number }>,
): { city: string; lat: number; lng: number } | null {
  const lower = text.toLowerCase();
  const candidates: { city: string; lat: number; lng: number; len: number }[] = [];
  for (const [key, hit] of cities) {
    const [city, reg] = key.split("|");
    if (!city || !reg) continue;
    if (reg !== region.toLowerCase()) continue;
    if (lower.includes(city)) {
      candidates.push({ city, lat: hit.lat, lng: hit.lng, len: city.length });
    }
  }
  candidates.sort((a, b) => b.len - a.len);
  return candidates[0] ?? null;
}

function resolve(
  e: Parsed,
  cities: Map<string, { lat: number; lng: number }>,
): GeoHit | null {
  const hay = [e.raw, e.city, e.neighborhood, e.geocodeQuery, e.name]
    .filter(Boolean)
    .join(" | ");

  const region = findStateInText(hay);
  if (region) {
    const cityHit = findCityMatch(hay, region, cities);
    if (cityHit) {
      return {
        lat: cityHit.lat,
        lng: cityHit.lng,
        displayName: `${cityHit.city}, ${STATE_CENTROIDS[region]?.label ?? region}`,
        at: new Date().toISOString(),
        source: "city-match",
      };
    }
    const state = STATE_CENTROIDS[region];
    if (state) {
      return {
        lat: state.lat,
        lng: state.lng,
        displayName: state.label,
        at: new Date().toISOString(),
        source: "state-centroid",
      };
    }
  }

  // Try city field "City, Region"
  const parts = e.city.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const hit = cities.get(normalizeKey(parts[0]!, parts[1]!));
    if (hit) {
      return {
        lat: hit.lat,
        lng: hit.lng,
        displayName: `${parts[0]}, ${parts[1]}`,
        at: new Date().toISOString(),
        source: "city-field",
      };
    }
  }

  return null;
}

function main() {
  const parsed = JSON.parse(fs.readFileSync(PARSED, "utf8")) as {
    enclaves: Parsed[];
  };
  const cache = (
    fs.existsSync(CACHE)
      ? JSON.parse(fs.readFileSync(CACHE, "utf8"))
      : {}
  ) as Record<string, GeoHit | { error: string; at: string }>;

  const cities = loadCityMap();
  const ready: (Parsed & { lat: number; lng: number; delta: number })[] = [];
  const failed: { id: string; reason: string }[] = [];
  let fromCache = 0;
  let fromResolve = 0;

  for (const e of parsed.enclaves) {
    const cached = cache[e.id];
    if (cached && "lat" in cached && Number.isFinite(cached.lat)) {
      ready.push({
        ...e,
        lat: cached.lat,
        lng: cached.lng,
        delta: deltaForSection(e.ethnicitySection),
      });
      fromCache += 1;
      continue;
    }

    const hit = resolve(e, cities);
    if (hit) {
      cache[e.id] = hit;
      ready.push({
        ...e,
        lat: hit.lat,
        lng: hit.lng,
        delta: deltaForSection(e.ethnicitySection),
      });
      fromResolve += 1;
    } else {
      failed.push({ id: e.id, reason: "unresolved" });
    }
  }

  // Persist only successful geocodes + keep structure clean
  const cleanCache: Record<string, GeoHit> = {};
  for (const [id, v] of Object.entries(cache)) {
    if (v && "lat" in v && Number.isFinite(v.lat)) cleanCache[id] = v;
  }
  fs.writeFileSync(CACHE, JSON.stringify(cleanCache, null, 2));
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: ready.length,
        failed: failed.length,
        fromCache,
        fromResolve,
        enclaves: ready,
        failedRows: failed,
      },
      null,
      2,
    ),
  );

  console.log(
    `Ready ${ready.length} (cache ${fromCache}, resolved ${fromResolve}), failed ${failed.length}`,
  );
  console.log(`Wrote ${OUT}`);
}

main();
