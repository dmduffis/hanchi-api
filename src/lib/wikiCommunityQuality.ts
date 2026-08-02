/**
 * Shared quality gates for Wikipedia-imported communities.
 * Reject city-level blobs, malformed names, and obvious junk rows.
 */

const JUNK =
  /citation needed|etimated|\bestimated\b|\\-|see also|distribution of|united states, united states|canada, canada|\bmuch of\b|other parts of|and other areas|has the largest|especially in|formerly known|facing quebec|_citation|000 yemenis|"|\bin\s+in\b|growing mexican|colombian and ecuadorean/i;

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
  if (c.id.length > 70) return true;
  if (isXinXName(c.name, c.neighborhood ?? "")) return true;
  if (isGenericMetroBlob(c.name)) return true;
  if (JUNK.test(c.name) || JUNK.test(c.id)) return true;
  if (c.neighborhood && JUNK.test(c.neighborhood)) return true;
  if (c.city && JUNK.test(c.city)) return true;
  return false;
}
