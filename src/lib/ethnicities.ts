import type { YelpBusiness } from "./yelp";

/**
 * Map Yelp cuisine / category text → ethnicity slugs (max 2).
 * Flags are mapped on the client from these ids.
 */
const CATEGORY_ETHNICITY_RULES: { match: RegExp; id: string }[] = [
  { match: /\bkorean\b|k-?town/i, id: "korean" },
  { match: /\bjapanese\b|sushi|ramen|izakaya|udon/i, id: "japanese" },
  { match: /\btaiwanese\b|taiwan\b/i, id: "taiwanese" },
  {
    match:
      /\bcantonese\b|szechuan|sichuan|dim.?sum|shanghainese|hunan|fujian|chinese|chinatown/i,
    id: "chinese",
  },
  { match: /\bfilipino\b|pinoy\b/i, id: "filipino" },
  { match: /\bvietnamese\b|pho\b/i, id: "vietnamese" },
  { match: /\bthai\b/i, id: "thai" },
  { match: /\bindonesian\b/i, id: "indonesian" },
  { match: /\bmalaysian\b/i, id: "malaysian" },
  {
    match: /\bindian\b|south.?indian|north.?indian|chaat|tandoori/i,
    id: "indian",
  },
  { match: /\bpakistani\b|nihari|karahi/i, id: "pakistani" },
  { match: /\bbangladeshi\b|bengali\b/i, id: "bangladeshi" },
  { match: /\bnepalese\b|nepali\b|himalayan|tibetan|momo\b/i, id: "nepali" },
  { match: /\bafghani\b|afghan\b/i, id: "afghan" },
  { match: /\bmexican\b|tacos|taqueria|tex-mex/i, id: "mexican" },
  { match: /\bcolombian\b|arepas?\b|bandeja|empanadas?\b/i, id: "colombian" },
  { match: /\bdominican\b/i, id: "dominican" },
  {
    match:
      /\becuadorian\b|ecuador\b|ecuatorian|guayaquil|azogue|hornado|encebollado|brasas?\b|pollo a la brasa|perla del pacifico|hueca|picanteria|manabita|cuenca/i,
    id: "ecuadorian",
  },
  { match: /\bperuvian\b|ceviche/i, id: "peruvian" },
  { match: /\bvenezuelan\b/i, id: "venezuelan" },
  { match: /\bcuban\b/i, id: "cuban" },
  { match: /\bpuerto.?rican\b/i, id: "puerto_rican" },
  { match: /\bjamaican\b|jerk\b/i, id: "jamaican" },
  { match: /\bhaitian\b|griot\b/i, id: "haitian" },
  {
    match: /\btrinidad|\bindo-?caribbean|guyanese|roti\b|doubles\b/i,
    id: "guyanese",
  },
  { match: /\bcaribbean\b|west.?indian/i, id: "caribbean" },
  {
    match: /\bsenegalese\b|senegal\b|thieboudienne|thieb\b|yassa\b|dibi\b|savane/i,
    id: "senegalese",
  },
  { match: /\bghanaian\b|ghana\b|accra\b|jollof|banku\b/i, id: "ghanaian" },
  { match: /\bliberian\b/i, id: "liberian" },
  { match: /\bethiopian\b|eritrean\b/i, id: "ethiopian" },
  { match: /\bnigerian\b/i, id: "nigerian" },
  { match: /\bsomali\b/i, id: "somali" },
  { match: /\bwest.?african|\bafrican\b/i, id: "west_african" },
  { match: /\begyptian\b|koshari\b/i, id: "egyptian" },
  { match: /\blebanese\b/i, id: "lebanese" },
  { match: /\bsyrian\b/i, id: "syrian" },
  { match: /\bpalestinian\b|falafel|knafeh|shawarma/i, id: "palestinian" },
  {
    match:
      /\byemeni\b|\byemen\b|\baden\b|tihama|\bazal\b|sheeba|\bsheba\b|saltah|fahsa|fahsah|mandi\b|haneeth|bint.?al.?sahn|\bharaz\b|\bqahwah\b/i,
    id: "yemeni",
  },
  {
    // Obvious name / place / dish cues — Yelp often only tags these "Mediterranean".
    match:
      /\bchaldean\b|\bassyrian\b|\biraqi\b|\biraq\b|baghdad|babylon|babel\b|mosul|basra|nineveh|ninawa|erbil|kirkuk|najaf|karbala|mesopotam|tigris|euphrates|\bfurat\b|rafidain|rafidyn|sumerian|\bmasgouf\b|\bmasgoof\b|\bquzi\b|\bqoozi\b/i,
    id: "iraqi",
  },
  { match: /\bmoroccan\b/i, id: "moroccan" },
  { match: /\bturkish\b/i, id: "turkish" },
  { match: /\biranian\b|persian\b/i, id: "iranian" },
  { match: /\bisraeli\b/i, id: "israeli" },
  // Many Chaldean/Iraqi spots are Yelp-tagged "Mediterranean", not Iraqi.
  { match: /\bmiddle.?eastern|mediterranean|arab\b/i, id: "middle_eastern" },
  { match: /\balbanian\b/i, id: "albanian" },
  { match: /\bgreek\b/i, id: "greek" },
  { match: /\bitalian\b/i, id: "italian" },
  { match: /\bpizza\b|pasta\b/i, id: "italian" },
  { match: /\bpolish\b|pierogi|kielbasa/i, id: "polish" },
  { match: /\bukrainian\b/i, id: "ukrainian" },
  {
    match: /\brussian\b|georgian\b|uzbekistan|uzbek|central.?asian/i,
    id: "russian",
  },
  { match: /\bgerman\b/i, id: "german" },
  { match: /\bfrench\b/i, id: "french" },
  { match: /\bspanish\b/i, id: "spanish" },
  {
    match:
      /\bportuguese\b|bacalhau|pastelaria|pastel de nata|portugalia|madeira\b/i,
    id: "portuguese",
  },
  { match: /\bbrazilian\b|churrascaria|feijoada/i, id: "brazilian" },
  {
    match: /\bsalvadoran\b|el salvador|pupusas?\b|pupuseria/i,
    id: "salvadoran",
  },
  { match: /\bbritish\b|irish\b/i, id: "british" },
];

function haystackFromBusiness(business: YelpBusiness): string {
  const parts = [
    business.name,
    ...(business.categories ?? []).flatMap((c) => [c.alias, c.title]),
  ];
  return parts.filter(Boolean).join(" ");
}

/** Infer up to 2 ethnicity ids from free text (Yelp categories, POI category, name). */
export function ethnicitiesFromText(text: string): string[] {
  const ids: string[] = [];
  for (const rule of CATEGORY_ETHNICITY_RULES) {
    if (!rule.match.test(text)) continue;
    if (ids.includes(rule.id)) continue;
    ids.push(rule.id);
    if (ids.length >= 2) break;
  }
  return ids;
}

/** Infer up to 2 ethnicity ids for a restaurant from Yelp categories / name. */
export function ethnicitiesFromYelp(business: YelpBusiness): string[] {
  return ethnicitiesFromText(haystackFromBusiness(business));
}
