/** Shared allowlists for onboarding / user prefs. */

import {
  WORLD_COUNTRY_IDS,
  getWorldCountry,
} from "./worldCountries";

export const USER_INTENTS = [
  "explore",
  "home",
  "learn",
  "bite",
] as const;

export type UserIntent = (typeof USER_INTENTS)[number];

export function isUserIntent(value: unknown): value is UserIntent {
  return (
    typeof value === "string" &&
    (USER_INTENTS as readonly string[]).includes(value)
  );
}

/** Normalize to 0–4 unique intent slugs. */
export function normalizeIntents(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (!isUserIntent(item)) return null;
    if (!out.includes(item)) out.push(item);
  }
  if (out.length > USER_INTENTS.length) return null;
  return out;
}

/**
 * Legacy ethnicity slugs → ISO country codes.
 * Older clients / seed data may still send these.
 */
export const ETHNICITY_TO_COUNTRY: Record<string, string> = {
  korean: "kr",
  japanese: "jp",
  chinese: "cn",
  taiwanese: "tw",
  filipino: "ph",
  vietnamese: "vn",
  thai: "th",
  indonesian: "id",
  malaysian: "my",
  indian: "in",
  pakistani: "pk",
  bangladeshi: "bd",
  nepali: "np",
  afghan: "af",
  mexican: "mx",
  colombian: "co",
  dominican: "do",
  ecuadorian: "ec",
  peruvian: "pe",
  venezuelan: "ve",
  cuban: "cu",
  puerto_rican: "pr",
  jamaican: "jm",
  haitian: "ht",
  guyanese: "gy",
  senegalese: "sn",
  ghanaian: "gh",
  ethiopian: "et",
  nigerian: "ng",
  egyptian: "eg",
  lebanese: "lb",
  syrian: "sy",
  palestinian: "ps",
  yemeni: "ye",
  iraqi: "iq",
  moroccan: "ma",
  turkish: "tr",
  iranian: "ir",
  israeli: "il",
  albanian: "al",
  greek: "gr",
  italian: "it",
  polish: "pl",
  ukrainian: "ua",
  russian: "ru",
  portuguese: "pt",
  salvadoran: "sv",
  brazilian: "br",
  british: "gb",
  french: "fr",
  german: "de",
  spanish: "es",
};

const COUNTRY_SET = new Set(WORLD_COUNTRY_IDS);

export function isCultureSlug(value: string): boolean {
  const slug = value.trim().toLowerCase();
  if (COUNTRY_SET.has(slug)) return true;
  const mapped = ETHNICITY_TO_COUNTRY[slug];
  return !!mapped && COUNTRY_SET.has(mapped);
}

/** Normalize to ISO country codes (0–2). */
export function normalizeCultures(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const slug = item.trim().toLowerCase();
    const iso = COUNTRY_SET.has(slug)
      ? slug
      : ETHNICITY_TO_COUNTRY[slug];
    if (!iso || !COUNTRY_SET.has(iso)) return null;
    if (!getWorldCountry(iso)) return null;
    if (!out.includes(iso)) out.push(iso);
  }
  if (out.length > 2) return null;
  return out;
}
