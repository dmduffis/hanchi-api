/**
 * Emit mobile + API metadata maps from parsed Wikipedia enclaves.
 *
 * Writes:
 *  - sinta-mobile/src/data/generated/wikipediaCommunityMeta.ts
 *  - sinta-api/src/data/wikipediaYelpMeta.ts
 *
 * Usage: npx tsx scripts/generate-wikipedia-meta.ts
 */
import fs from "node:fs";
import path from "node:path";

const PARSED = path.join(__dirname, "data", "wikipedia-enclaves-parsed.json");
const MOBILE_OUT = path.resolve(
  __dirname,
  "../../sinta-mobile/src/data/generated/wikipediaCommunityMeta.ts",
);
const API_OUT = path.resolve(__dirname, "../src/data/wikipediaYelpMeta.ts");

type Parsed = {
  id: string;
  heroEmoji: string;
  countryCode: string | null;
  affinities: string[];
  yelpTerms: string[] | null;
  ethnicities: string[] | null;
};

function main() {
  const payload = JSON.parse(fs.readFileSync(PARSED, "utf8")) as {
    enclaves: Parsed[];
  };

  const flags: Record<string, string> = {};
  const codes: Record<string, string> = {};
  const affinities: Record<string, string[]> = {};
  const yelpTerms: Record<string, string[]> = {};
  const ethnicities: Record<string, string[]> = {};

  for (const e of payload.enclaves) {
    flags[e.id] = e.heroEmoji;
    if (e.countryCode) codes[e.id] = e.countryCode;
    if (e.affinities?.length) affinities[e.id] = e.affinities;
    if (e.yelpTerms?.length) yelpTerms[e.id] = e.yelpTerms;
    if (e.ethnicities?.length) ethnicities[e.id] = e.ethnicities;
  }

  fs.mkdirSync(path.dirname(MOBILE_OUT), { recursive: true });
  fs.mkdirSync(path.dirname(API_OUT), { recursive: true });

  const mobile = `/* eslint-disable */
/** Auto-generated from Wikipedia enclaves import — do not edit by hand. */
export const WIKI_COMMUNITY_FLAGS: Record<string, string> = ${JSON.stringify(flags, null, 2)};

export const WIKI_COMMUNITY_COUNTRY_CODES: Record<string, string> = ${JSON.stringify(codes, null, 2)};

export const WIKI_COMMUNITY_AFFINITIES: Record<string, string[]> = ${JSON.stringify(affinities, null, 2)};
`;

  const api = `/* eslint-disable */
/** Auto-generated from Wikipedia enclaves import — do not edit by hand. */
export const WIKI_COMMUNITY_SEARCH_TERMS: Record<string, string[]> = ${JSON.stringify(yelpTerms, null, 2)};

export const WIKI_COMMUNITY_ETHNICITIES: Record<string, string[]> = ${JSON.stringify(ethnicities, null, 2)};
`;

  fs.writeFileSync(MOBILE_OUT, mobile);
  fs.writeFileSync(API_OUT, api);
  console.log(`Wrote ${MOBILE_OUT}`);
  console.log(`Wrote ${API_OUT}`);
  console.log(
    `flags=${Object.keys(flags).length} codes=${Object.keys(codes).length} affinities=${Object.keys(affinities).length}`,
  );
}

main();
