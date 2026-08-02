/**
 * Shared quality gates for Wikipedia-imported communities.
 * Reject city-level blobs, malformed names, and obvious junk rows.
 */

const JUNK =
  /citation needed|etimated|\bestimated\b|\\-|see also|distribution of|united states, united states|canada, canada|\bmuch of\b|other parts of|and other areas|has the largest|especially in|formerly known|facing quebec|_citation|000 yemenis|"|\bin\s+in\b|growing mexican|colombian and ecuadorean/i;

/** Wiki rows superseded by curated enclaves — never re-import. */
const SUPERSEDED_WIKI_IDS = new Set([
  "greenpoint-new-york-city", // → little-poland (Greenpoint, Brooklyn)
]);

/**
 * Auto-generated wiki import blurbs that just restate the title:
 * "Excelsior District in San Francisco — a yemen cultural community in …"
 */
export function isBoilerplateWikiDescription(description: string): boolean {
  // No \b before the dash — space+em-dash is not a word boundary in JS.
  return /[—–-]\s*a\s+.+\s+cultural community in\b/i.test(description.trim());
}

/** Chinatown / Little X / Koreatown — real enclave brands. */
export function isBrandedEnclaveName(name: string): boolean {
  return /\b(little\s|chinatown|koreatown|japantown|greektown|banglatown|thai town|filipinotown|india square|mexicantown|tehrangeles|poletown|corktown)\b/i.test(
    name,
  );
}

/**
 * Weak wiki titles that aren't enclave brands:
 * "Bangladesh Street in New York City", "Hicksville in New York –".
 */
export function isWeakPlaceInCityName(name: string): boolean {
  if (isBrandedEnclaveName(name)) return false;
  const m = name.match(/^(.+?)\s+in\s+(.+)$/i);
  if (!m) return false;
  const left = m[1].trim();
  const right = m[2].trim();
  // Street-level fragments imported as if they were enclaves.
  if (/\b(street|boulevard|parkway|avenue|road|hwy|highway)\b/i.test(left)) {
    return true;
  }
  // Bare town dumped into a metro label ("Hicksville in New York –").
  if (/[–—-]/.test(right) || /^(new york|new york city)\b/i.test(right)) {
    return true;
  }
  return false;
}

/** "Anaheim in Anaheim" / repeated neighborhood,city pairs. */
export function isXinXName(name: string, neighborhood = ""): boolean {
  const m = name.match(/^(.+?)\s+in\s+(.+)$/i);
  if (m) {
    const a = m[1].trim().toLowerCase();
    const b = m[2].trim().toLowerCase();
    if (a === b) return true;
    if (/\bin\b/i.test(m[1]) || b.includes(` in ${a}`)) return true;
  }
  const parts = neighborhood
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length >= 2 && parts[0] === parts[1]) return true;
  return false;
}

/**
 * City/metro blobs that aren't neighborhoods:
 * "Boston in Boston", "Atlanta in Georgia area", "Houston in Texas".
 */
export function isGenericMetroBlob(name: string): boolean {
  const m = name.match(/^(.+?)\s+in\s+(.+)$/i);
  if (!m) return false;
  const left = m[1].trim();
  const right = m[2].trim();
  const l = left.toLowerCase();
  const r = right.toLowerCase();
  if (l === r) return true;
  if (
    /\barea$/i.test(right) ||
    /^(area|metro(?:\s+area)?|suburbs?)$/i.test(right)
  ) {
    return true;
  }
  if (r === l || r.startsWith(`${l} `) || r.startsWith(`${l},`)) return true;
  return false;
}

export function isJunkWikiCommunity(c: {
  id: string;
  name: string;
  neighborhood?: string;
  city?: string;
}): boolean {
  if (SUPERSEDED_WIKI_IDS.has(c.id)) return true;
  if (c.id.length > 70 && !isBrandedEnclaveName(c.name)) return true;
  // Redundant "...-new-york-city-new-york" slugs — keep branded Little/Chinatown rows.
  if (
    /-new-york-city-new-york$/i.test(c.id) &&
    !isBrandedEnclaveName(c.name)
  ) {
    return true;
  }
  if (isXinXName(c.name, c.neighborhood ?? "")) return true;
  if (isGenericMetroBlob(c.name)) return true;
  if (isWeakPlaceInCityName(c.name)) return true;
  if (JUNK.test(c.name) || JUNK.test(c.id)) return true;
  if (c.neighborhood && JUNK.test(c.neighborhood)) return true;
  if (c.city && JUNK.test(c.city)) return true;
  return false;
}
