/**
 * Parse Wikipedia ethnic enclaves list → structured US/CA JSON.
 *
 * Source: scripts/data/wikipedia-enclaves-source.md
 * Output: scripts/data/wikipedia-enclaves-parsed.json
 *
 * Usage: npx tsx scripts/parse-wikipedia-enclaves.ts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "data");
const SOURCE = path.join(ROOT, "wikipedia-enclaves-source.md");
const OUT = path.join(ROOT, "wikipedia-enclaves-parsed.json");

type CultureFilterId =
  | "chinese"
  | "korean"
  | "south-asian"
  | "caribbean"
  | "latino"
  | "african"
  | "middle-eastern"
  | "european"
  | "filipino"
  | null;

export type ParsedEnclave = {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  country: "US" | "CA";
  ethnicitySection: string;
  heroEmoji: string;
  countryCode: string | null;
  affinities: CultureFilterId[];
  yelpTerms: string[] | null;
  ethnicities: string[] | null;
  raw: string;
  geocodeQuery: string;
};

const US_STATES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
  "washington, d.c.": "DC",
  "washington d.c.": "DC",
  "washington, dc": "DC",
  "d.c.": "DC",
  dc: "DC",
};

const CA_PROVINCES: Record<string, string> = {
  alberta: "AB",
  "british columbia": "BC",
  manitoba: "MB",
  "new brunswick": "NB",
  "newfoundland and labrador": "NL",
  "nova scotia": "NS",
  ontario: "ON",
  "prince edward island": "PE",
  quebec: "QC",
  saskatchewan: "SK",
};

const SKIP_COUNTRY_HINTS = [
  /\bmexico\b/i,
  /\bmexico city\b/i,
  /\bguatemalan?\b/i,
  /\bhonduras\b/i,
  /\bbaja california\b/i,
  /\btijuana\b/i,
  /\bmexicali\b/i,
  /\bhavana\b/i,
  /\bcuba\b/i,
  /\bpuerto rico\b/i,
  /\bjamaica\b(?!,?\s*(queens|ny|new york))/i,
  /\bdominican republic\b/i,
  /\bhaiti\b(?!,?\s*(fl|florida|miami))/i,
];

/** Map ethnicity heading → metadata. */
const ETHNICITY_META: Record<
  string,
  {
    emoji: string;
    countryCode: string | null;
    affinities: CultureFilterId[];
    yelpTerms: string[] | null;
    ethnicities: string[] | null;
  }
> = {
  "african americans": {
    emoji: "🖤",
    countryCode: null,
    affinities: ["african"],
    yelpTerms: ["soul food", "southern", "creole"],
    ethnicities: ["caribbean", "jamaican"],
  },
  "cape verde": {
    emoji: "🇨🇻",
    countryCode: "cv",
    affinities: ["african"],
    yelpTerms: ["cape verdean", "african"],
    ethnicities: ["west_african"],
  },
  ethiopia: {
    emoji: "🇪🇹",
    countryCode: "et",
    affinities: ["african"],
    yelpTerms: ["ethiopian", "eritrean"],
    ethnicities: ["ethiopian"],
  },
  nigeria: {
    emoji: "🇳🇬",
    countryCode: "ng",
    affinities: ["african"],
    yelpTerms: ["nigerian", "west african"],
    ethnicities: ["nigerian", "west_african"],
  },
  senegal: {
    emoji: "🇸🇳",
    countryCode: "sn",
    affinities: ["african"],
    yelpTerms: ["senegalese", "west african"],
    ethnicities: ["senegalese", "west_african"],
  },
  somalia: {
    emoji: "🇸🇴",
    countryCode: "so",
    affinities: ["african"],
    yelpTerms: ["somali", "east african"],
    ethnicities: ["somali"],
  },
  "pan-africa": {
    emoji: "🌍",
    countryCode: null,
    affinities: ["african"],
    yelpTerms: ["african", "west african"],
    ethnicities: ["west_african", "ghanaian", "senegalese"],
  },
  afghanistan: {
    emoji: "🇦🇫",
    countryCode: "af",
    affinities: ["south-asian", "middle-eastern"],
    yelpTerms: ["afghan", "kabuli"],
    ethnicities: ["afghan"],
  },
  bangladesh: {
    emoji: "🇧🇩",
    countryCode: "bd",
    affinities: ["south-asian"],
    yelpTerms: ["bangladeshi", "bengali"],
    ethnicities: ["bangladeshi"],
  },
  cambodia: {
    emoji: "🇰🇭",
    countryCode: "kh",
    affinities: [],
    yelpTerms: ["cambodian", "khmer"],
    ethnicities: null,
  },
  china: {
    emoji: "🇨🇳",
    countryCode: "cn",
    affinities: ["chinese"],
    yelpTerms: ["chinese", "dim sum"],
    ethnicities: ["chinese", "taiwanese"],
  },
  hmong: {
    emoji: "🇱🇦",
    countryCode: "la",
    affinities: [],
    yelpTerms: ["hmong", "laotian"],
    ethnicities: null,
  },
  india: {
    emoji: "🇮🇳",
    countryCode: "in",
    affinities: ["south-asian"],
    yelpTerms: ["indian", "south indian"],
    ethnicities: ["indian"],
  },
  japan: {
    emoji: "🇯🇵",
    countryCode: "jp",
    affinities: [],
    yelpTerms: ["japanese", "ramen", "sushi"],
    ethnicities: ["japanese"],
  },
  korea: {
    emoji: "🇰🇷",
    countryCode: "kr",
    affinities: ["korean"],
    yelpTerms: ["korean", "korean bbq"],
    ethnicities: ["korean"],
  },
  laos: {
    emoji: "🇱🇦",
    countryCode: "la",
    affinities: [],
    yelpTerms: ["laotian"],
    ethnicities: null,
  },
  "myanmar (burma)": {
    emoji: "🇲🇲",
    countryCode: "mm",
    affinities: ["south-asian"],
    yelpTerms: ["burmese", "myanmar"],
    ethnicities: null,
  },
  pakistan: {
    emoji: "🇵🇰",
    countryCode: "pk",
    affinities: ["south-asian"],
    yelpTerms: ["pakistani"],
    ethnicities: ["pakistani"],
  },
  philippines: {
    emoji: "🇵🇭",
    countryCode: "ph",
    affinities: ["filipino"],
    yelpTerms: ["filipino", "lumpia"],
    ethnicities: ["filipino"],
  },
  "sri lanka": {
    emoji: "🇱🇰",
    countryCode: "lk",
    affinities: ["south-asian"],
    yelpTerms: ["sri lankan"],
    ethnicities: null,
  },
  thailand: {
    emoji: "🇹🇭",
    countryCode: "th",
    affinities: [],
    yelpTerms: ["thai", "pad thai"],
    ethnicities: ["thai"],
  },
  vietnam: {
    emoji: "🇻🇳",
    countryCode: "vn",
    affinities: [],
    yelpTerms: ["vietnamese", "pho", "banh mi"],
    ethnicities: ["vietnamese"],
  },
  "pan-asia": {
    emoji: "🌏",
    countryCode: null,
    affinities: ["chinese"],
    yelpTerms: ["asian"],
    ethnicities: ["chinese"],
  },
  australia: {
    emoji: "🇦🇺",
    countryCode: "au",
    affinities: ["european"],
    yelpTerms: null,
    ethnicities: null,
  },
  albania: {
    emoji: "🇦🇱",
    countryCode: "al",
    affinities: ["european"],
    yelpTerms: ["albanian"],
    ethnicities: ["albanian"],
  },
  basque: {
    emoji: "🇪🇸",
    countryCode: "es",
    affinities: ["european"],
    yelpTerms: ["basque", "spanish"],
    ethnicities: ["spanish"],
  },
  belarus: {
    emoji: "🇧🇾",
    countryCode: "by",
    affinities: ["european"],
    yelpTerms: ["belarusian", "eastern european"],
    ethnicities: ["russian"],
  },
  belgium: {
    emoji: "🇧🇪",
    countryCode: "be",
    affinities: ["european"],
    yelpTerms: ["belgian"],
    ethnicities: null,
  },
  bosnian: {
    emoji: "🇧🇦",
    countryCode: "ba",
    affinities: ["european"],
    yelpTerms: ["bosnian", "balkan"],
    ethnicities: null,
  },
  croatia: {
    emoji: "🇭🇷",
    countryCode: "hr",
    affinities: ["european"],
    yelpTerms: ["croatian"],
    ethnicities: null,
  },
  "eastern european jewish": {
    emoji: "🇮🇱",
    countryCode: "il",
    affinities: ["european", "middle-eastern"],
    yelpTerms: ["jewish", "kosher", "deli"],
    ethnicities: ["israeli"],
  },
  france: {
    emoji: "🇫🇷",
    countryCode: "fr",
    affinities: ["european"],
    yelpTerms: ["french"],
    ethnicities: ["french"],
  },
  germany: {
    emoji: "🇩🇪",
    countryCode: "de",
    affinities: ["european"],
    yelpTerms: ["german"],
    ethnicities: ["german"],
  },
  georgia: {
    emoji: "🇬🇪",
    countryCode: "ge",
    affinities: ["european", "middle-eastern"],
    yelpTerms: ["georgian"],
    ethnicities: null,
  },
  greece: {
    emoji: "🇬🇷",
    countryCode: "gr",
    affinities: ["european"],
    yelpTerms: ["greek"],
    ethnicities: ["greek"],
  },
  ireland: {
    emoji: "🇮🇪",
    countryCode: "ie",
    affinities: ["european"],
    yelpTerms: ["irish"],
    ethnicities: ["british"],
  },
  italy: {
    emoji: "🇮🇹",
    countryCode: "it",
    affinities: ["european"],
    yelpTerms: ["italian"],
    ethnicities: ["italian"],
  },
  luxembourg: {
    emoji: "🇱🇺",
    countryCode: "lu",
    affinities: ["european"],
    yelpTerms: null,
    ethnicities: null,
  },
  malta: {
    emoji: "🇲🇹",
    countryCode: "mt",
    affinities: ["european"],
    yelpTerms: ["maltese"],
    ethnicities: null,
  },
  poland: {
    emoji: "🇵🇱",
    countryCode: "pl",
    affinities: ["european"],
    yelpTerms: ["polish"],
    ethnicities: ["polish"],
  },
  portugal: {
    emoji: "🇵🇹",
    countryCode: "pt",
    affinities: ["european"],
    yelpTerms: ["portuguese"],
    ethnicities: ["portuguese"],
  },
  romania: {
    emoji: "🇷🇴",
    countryCode: "ro",
    affinities: ["european"],
    yelpTerms: ["romanian"],
    ethnicities: null,
  },
  russia: {
    emoji: "🇷🇺",
    countryCode: "ru",
    affinities: ["european"],
    yelpTerms: ["russian"],
    ethnicities: ["russian"],
  },
  scandinavia: {
    emoji: "🇸🇪",
    countryCode: "se",
    affinities: ["european"],
    yelpTerms: ["scandinavian"],
    ethnicities: null,
  },
  denmark: {
    emoji: "🇩🇰",
    countryCode: "dk",
    affinities: ["european"],
    yelpTerms: ["danish"],
    ethnicities: null,
  },
  finland: {
    emoji: "🇫🇮",
    countryCode: "fi",
    affinities: ["european"],
    yelpTerms: ["finnish"],
    ethnicities: null,
  },
  iceland: {
    emoji: "🇮🇸",
    countryCode: "is",
    affinities: ["european"],
    yelpTerms: null,
    ethnicities: null,
  },
  norway: {
    emoji: "🇳🇴",
    countryCode: "no",
    affinities: ["european"],
    yelpTerms: ["norwegian"],
    ethnicities: null,
  },
  sweden: {
    emoji: "🇸🇪",
    countryCode: "se",
    affinities: ["european"],
    yelpTerms: ["swedish"],
    ethnicities: null,
  },
  serbia: {
    emoji: "🇷🇸",
    countryCode: "rs",
    affinities: ["european"],
    yelpTerms: ["serbian", "balkan"],
    ethnicities: null,
  },
  slovenia: {
    emoji: "🇸🇮",
    countryCode: "si",
    affinities: ["european"],
    yelpTerms: ["slovenian"],
    ethnicities: null,
  },
  "united kingdom": {
    emoji: "🇬🇧",
    countryCode: "gb",
    affinities: ["european"],
    yelpTerms: ["british"],
    ethnicities: ["british"],
  },
  cornwall: {
    emoji: "🇬🇧",
    countryCode: "gb",
    affinities: ["european"],
    yelpTerms: null,
    ethnicities: ["british"],
  },
  wales: {
    emoji: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    countryCode: "gb",
    affinities: ["european"],
    yelpTerms: null,
    ethnicities: ["british"],
  },
  arabia: {
    emoji: "🇸🇦",
    countryCode: "sa",
    affinities: ["middle-eastern"],
    yelpTerms: ["middle eastern", "arabic", "shawarma"],
    ethnicities: ["middle_eastern", "lebanese", "yemeni"],
  },
  armenia: {
    emoji: "🇦🇲",
    countryCode: "am",
    affinities: ["middle-eastern"],
    yelpTerms: ["armenian", "middle eastern"],
    ethnicities: ["middle_eastern"],
  },
  assyrians: {
    emoji: "🇮🇶",
    countryCode: "iq",
    affinities: ["middle-eastern"],
    yelpTerms: ["assyrian", "middle eastern"],
    ethnicities: ["iraqi", "middle_eastern"],
  },
  kurds: {
    emoji: "🇮🇶",
    countryCode: "iq",
    affinities: ["middle-eastern"],
    yelpTerms: ["kurdish", "middle eastern"],
    ethnicities: ["middle_eastern"],
  },
  palestinian: {
    emoji: "🇵🇸",
    countryCode: "ps",
    affinities: ["middle-eastern"],
    yelpTerms: ["palestinian", "middle eastern"],
    ethnicities: ["palestinian", "middle_eastern"],
  },
  iran: {
    emoji: "🇮🇷",
    countryCode: "ir",
    affinities: ["middle-eastern"],
    yelpTerms: ["persian", "iranian"],
    ethnicities: ["iranian", "middle_eastern"],
  },
  yemen: {
    emoji: "🇾🇪",
    countryCode: "ye",
    affinities: ["middle-eastern"],
    yelpTerms: ["yemeni", "middle eastern"],
    ethnicities: ["yemeni", "middle_eastern"],
  },
  guatemala: {
    emoji: "🇬🇹",
    countryCode: "gt",
    affinities: ["latino"],
    yelpTerms: ["guatemalan", "central american"],
    ethnicities: ["salvadoran"],
  },
  "el salvador": {
    emoji: "🇸🇻",
    countryCode: "sv",
    affinities: ["latino"],
    yelpTerms: ["salvadoran", "pupusas"],
    ethnicities: ["salvadoran"],
  },
  mexico: {
    emoji: "🇲🇽",
    countryCode: "mx",
    affinities: ["latino"],
    yelpTerms: ["mexican", "tacos"],
    ethnicities: ["mexican"],
  },
  "west indies and caribbean": {
    emoji: "🇯🇲",
    countryCode: "jm",
    affinities: ["caribbean"],
    yelpTerms: ["caribbean", "jamaican", "jerk"],
    ethnicities: ["jamaican", "caribbean", "haitian", "guyanese"],
  },
  samoa: {
    emoji: "🇼🇸",
    countryCode: "ws",
    affinities: [],
    yelpTerms: ["samoan", "pacific islander"],
    ethnicities: ["hawaiian"],
  },
  tonga: {
    emoji: "🇹🇴",
    countryCode: "to",
    affinities: [],
    yelpTerms: ["tongan", "pacific islander"],
    ethnicities: null,
  },
  "marshall islands": {
    emoji: "🇲🇭",
    countryCode: "mh",
    affinities: [],
    yelpTerms: ["pacific islander"],
    ethnicities: null,
  },
  fiji: {
    emoji: "🇫🇯",
    countryCode: "fj",
    affinities: [],
    yelpTerms: ["fijian", "pacific islander"],
    ethnicities: null,
  },
  micronesia: {
    emoji: "🇫🇲",
    countryCode: "fm",
    affinities: [],
    yelpTerms: ["pacific islander"],
    ethnicities: null,
  },
  "guam and the northern mariana islands (chamorro and carolinians)": {
    emoji: "🇬🇺",
    countryCode: "gu",
    affinities: [],
    yelpTerms: ["pacific islander"],
    ethnicities: null,
  },
  "jews (of many nationalities)": {
    emoji: "🇮🇱",
    countryCode: "il",
    affinities: ["european", "middle-eastern"],
    yelpTerms: ["jewish", "kosher", "deli"],
    ethnicities: ["israeli"],
  },
  "native americans": {
    emoji: "🪶",
    countryCode: null,
    affinities: [],
    yelpTerms: null,
    ethnicities: null,
  },
};

/**
 * Collapse Wikipedia slug variants onto one canonical wiki id.
 * Prefer the Wikipedia row — do not fold into old curated short ids.
 */
const ID_ALIASES: Record<string, string> = {
  // Astoria appears under multiple ethnicity sections with different city strings.
  // Keep one geo id; product name is Little Egypt (see seed / DB override).
  "astoria-queens-new-york-city": "astoria-queens-new-york",
  "astoria-queens-new-york-city-new-york": "astoria-queens-new-york",
  // DC Chinatown / Little Ethiopia slug variants
  "chinatown-washington-dc": "chinatown-washington-d-c",
  "little-ethiopia-washington-d-c": "little-ethiopia-shaw-washington-d-c",
  // Keep stable short wiki aliases already in production
  "chinatown-manhattan-new-york-city-new-york": "chinatown-manhattan",
  "chinatown-flushing-queens-new-york-city-new-york": "chinatown-flushing",
  "chinatown-sunset-park-brooklyn-new-york-city-new-york":
    "chinatown-sunset-park",
  "koreatown-los-angeles-california": "koreatown-la",
  "little-ethiopia-los-angeles-california": "little-ethiopia-la",
  "little-tokyo-los-angeles-california": "little-tokyo-la",
  "thai-town-los-angeles-california": "thai-town-la",
  "little-india-hicksville-new-york": "little-india-hicksville",
  "hicksville-new-york": "little-india-hicksville",
  "little-senegal-new-york-city-new-york": "little-senegal",
  "little-africa-the-bronx-new-york-city-new-york": "little-africa-bronx",
  "little-africa-staten-island-new-york-city-new-york": "little-africa-si",
  "japantown-san-francisco-california": "japantown-sf",
  "chinatown-san-francisco-california": "chinatown-sf",
  // Little Saigon OC: prefer the broader Orange County wiki row
  "little-saigon-westminster-california":
    "little-saigon-orange-county-california",
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

function stripCite(text: string): string {
  return text
    .replace(/\\\[\d+\\\]/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBullet(line: string): string {
  let t = line.replace(/^\*\s+/, "").trim();
  t = stripCite(t);
  // Drop parenthetical asides for location identity
  t = t.replace(/\([^)]*\)/g, "").trim();
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function splitNameAndNote(raw: string): { place: string; note: string } {
  const cleaned = cleanBullet(raw);
  const parts = cleaned.split(/\s+[–—]\s+/);
  if (parts.length === 1) return { place: cleaned, note: "" };
  return { place: parts[0]!.trim(), note: parts.slice(1).join(" – ").trim() };
}

function detectCountry(place: string): "US" | "CA" | null {
  const lower = place.toLowerCase();
  for (const hint of SKIP_COUNTRY_HINTS) {
    if (hint.test(lower)) return null;
  }
  for (const p of Object.keys(CA_PROVINCES)) {
    if (new RegExp(`\\b${p}\\b`, "i").test(lower)) return "CA";
  }
  // Canadian cities without province sometimes
  if (/\b(toronto|montreal|vancouver|calgary|edmonton|ottawa|winnipeg|mississauga|markham|richmond hill|scarborough|brossard|windsor)\b/i.test(lower)) {
    return "CA";
  }
  for (const s of Object.keys(US_STATES)) {
    if (s.length < 4) continue;
    if (new RegExp(`\\b${s}\\b`, "i").test(lower)) return "US";
  }
  if (/\bnew york city\b|\bnyc\b/i.test(lower)) return "US";
  if (/,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i.test(place)) {
    return "US";
  }
  if (/,\s*(AB|BC|MB|NB|NL|NS|ON|PE|QC|SK)\b/i.test(place)) return "CA";
  return null;
}

function looksNamedEnclave(place: string): boolean {
  const p = place.toLowerCase();
  // Commas alone do NOT make a named enclave ("Astoria, Queens, New York").
  return /\b(chinatown|koreatown|japantown|little |cambodia town|thai town|filipinotown|greektown|germantown|india square|bangla|tehrangeles|olvera|calle |pilsen|mexicantown|banglatown|little saigon|corktown|frogtown|historic filipinotown|poletown)\b/i.test(
    p,
  );
}

function isVagueMetroOnly(place: string): boolean {
  const p = place.toLowerCase();
  if (/significantly decreased|about \d|%\s*of/i.test(p)) return true;
  if (/^parts of\b/i.test(p)) return true;
  if (/^the fox cities\b/i.test(p)) return true;
  if (/metropolitan area\b/i.test(p) && !/little |chinatown|koreatown/i.test(p)) {
    return true;
  }
  // Bare city lists without enclave name and without state often too vague
  const commas = place.split(",").map((s) => s.trim()).filter(Boolean);
  if (commas.length === 1 && !looksNamedEnclave(place)) return true;
  return false;
}

function parseCityNeighborhood(
  place: string,
  country: "US" | "CA",
): { neighborhood: string; city: string; geocodeQuery: string } {
  const parts = place.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { neighborhood: place, city: place, geocodeQuery: place };
  }

  let regionIdx = -1;
  let regionCode = "";
  for (let i = parts.length - 1; i >= 0; i--) {
    const raw = parts[i]!.trim();
    const low = raw.toLowerCase().replace(/\./g, "");
    if (country === "US") {
      if (US_STATES[low]) {
        regionIdx = i;
        regionCode = US_STATES[low]!;
        break;
      }
      if (/^[A-Z]{2}$/.test(raw) && Object.values(US_STATES).includes(raw)) {
        regionIdx = i;
        regionCode = raw;
        break;
      }
    }
    if (country === "CA") {
      if (CA_PROVINCES[low]) {
        regionIdx = i;
        regionCode = CA_PROVINCES[low]!;
        break;
      }
      if (/^[A-Z]{2}$/.test(raw) && Object.values(CA_PROVINCES).includes(raw)) {
        regionIdx = i;
        regionCode = raw;
        break;
      }
    }
  }

  const regionLabel =
    regionIdx >= 0
      ? parts[regionIdx]!
      : country === "US"
        ? "United States"
        : "Canada";
  const before = regionIdx >= 0 ? parts.slice(0, regionIdx) : parts;
  const enclaveName = before[0] ?? parts[0]!;
  const cityName =
    before.length >= 2 ? before[before.length - 1]! : before[0] ?? parts[0]!;

  const neighborhood =
    before.length >= 2
      ? `${before.slice(0, -1).join(", ")}, ${cityName}`
      : `${enclaveName}, ${cityName}`;

  const cityLabel = `${cityName}, ${regionLabel}`;
  const geocodeQuery = [
    ...before,
    regionCode || regionLabel,
    country === "US" ? "USA" : "Canada",
  ]
    .filter(Boolean)
    .join(", ");

  return {
    neighborhood: neighborhood.replace(/^,\s*/, "") || place,
    city: cityLabel,
    geocodeQuery,
  };
}

function makeId(place: string): string {
  const base = slugify(place);
  return ID_ALIASES[base] ?? base;
}

function normalizeAffinities(
  affinities: CultureFilterId[] | null | undefined,
): CultureFilterId[] {
  if (!affinities) return [];
  return affinities.filter(Boolean) as CultureFilterId[];
}

function main() {
  const md = fs.readFileSync(SOURCE, "utf8");
  const lines = md.split(/\r?\n/);

  let section: string | null = null;
  let inHistoric = false;
  const byId = new Map<string, ParsedEnclave>();
  const skipped: { raw: string; reason: string }[] = [];

  for (const line of lines) {
    if (/^## Historic\b/.test(line)) {
      inHistoric = true;
      continue;
    }
    if (/^## See also\b|^## References\b|^## External links\b/.test(line)) {
      break;
    }
    if (inHistoric) continue;

    const h3 = line.match(/^###\s+(.+)$/);
    const h4 = line.match(/^####\s+(.+)$/);
    if (h3 || h4) {
      section = (h3?.[1] ?? h4?.[1] ?? "").trim().toLowerCase();
      continue;
    }

    if (!/^\*\s+/.test(line)) continue;
    if (!section) continue;

    // Skip African Americans list pointer + Native Americans bare city lists
    if (section === "african americans" || section === "native americans") {
      skipped.push({ raw: line, reason: "section-excluded" });
      continue;
    }

    const { place, note } = splitNameAndNote(line);
    if (!place || place.length < 3) {
      skipped.push({ raw: line, reason: "empty" });
      continue;
    }

    if (isVagueMetroOnly(place)) {
      skipped.push({ raw: place, reason: "vague-metro" });
      continue;
    }

    const country = detectCountry(place + " " + note);
    if (!country) {
      skipped.push({ raw: place, reason: "non-us-ca-or-unknown" });
      continue;
    }

    if (!looksNamedEnclave(place) && place.split(",").length < 2) {
      skipped.push({ raw: place, reason: "unnamed" });
      continue;
    }

    const metaKey = section;
    const meta = ETHNICITY_META[metaKey] ?? {
      emoji: "🏳️",
      countryCode: null,
      affinities: [] as CultureFilterId[],
      yelpTerms: null,
      ethnicities: null,
    };

    const { neighborhood, city, geocodeQuery } = parseCityNeighborhood(
      place,
      country,
    );
    const id = makeId(place);
    const displayName = place.split(",")[0]!.trim() || place;
    const description = note
      ? `${displayName} — a ${section} cultural community in ${city}. ${note}`
      : `${displayName} — a ${section} cultural community in ${city}.`;

    const row: ParsedEnclave = {
      id,
      name: displayName.length > 60 ? place : `${displayName} in ${city.split(",")[0]}`,
      neighborhood,
      city,
      country,
      ethnicitySection: section,
      heroEmoji: meta.emoji,
      countryCode: meta.countryCode,
      affinities: normalizeAffinities(meta.affinities),
      yelpTerms: meta.yelpTerms,
      ethnicities: meta.ethnicities,
      raw: place,
      geocodeQuery,
    };

    // Prefer longer / more specific raw when colliding
    const existing = byId.get(id);
    if (!existing || place.length > existing.raw.length) {
      byId.set(id, row);
    }
  }

  // Attach description via recompute for export
  const enclaves = [...byId.values()].map((e) => ({
    ...e,
    description: `${e.name} — a ${e.ethnicitySection} cultural community in ${e.city}.`,
  }));

  enclaves.sort((a, b) => a.id.localeCompare(b.id));

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        source:
          "https://en.wikipedia.org/wiki/List_of_ethnic_enclaves_in_North_American_cities",
        generatedAt: new Date().toISOString(),
        count: enclaves.length,
        skipped: skipped.length,
        enclaves,
        skippedSamples: skipped.slice(0, 40),
      },
      null,
      2,
    ),
  );

  console.log(`Parsed ${enclaves.length} enclaves (skipped ${skipped.length})`);
  console.log(`Wrote ${OUT}`);
}

main();
