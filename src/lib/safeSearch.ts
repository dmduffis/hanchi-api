export type SafeSearchLikelihood =
  | "UNKNOWN"
  | "VERY_UNLIKELY"
  | "UNLIKELY"
  | "POSSIBLE"
  | "LIKELY"
  | "VERY_LIKELY";

export type SafeSearchLabels = {
  adult: SafeSearchLikelihood;
  spoof: SafeSearchLikelihood;
  medical: SafeSearchLikelihood;
  violence: SafeSearchLikelihood;
  racy: SafeSearchLikelihood;
};

export type SafeSearchResult = {
  ok: boolean;
  reason?: string;
  labels: SafeSearchLabels | null;
  raw?: unknown;
};

const RANK: Record<SafeSearchLikelihood, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 1,
  UNLIKELY: 2,
  POSSIBLE: 3,
  LIKELY: 4,
  VERY_LIKELY: 5,
};

function parseThreshold(): SafeSearchLikelihood {
  const raw = (process.env.SAFESEARCH_THRESHOLD ?? "LIKELY").toUpperCase();
  if (raw in RANK) return raw as SafeSearchLikelihood;
  return "LIKELY";
}

function asLikelihood(value: unknown): SafeSearchLikelihood {
  if (typeof value === "string" && value in RANK) {
    return value as SafeSearchLikelihood;
  }
  return "UNKNOWN";
}

/**
 * Google Cloud Vision SafeSearch via REST + API key.
 * Fail-closed when credentials missing or Vision errors (unless ALLOW_UNMODERATED_MEDIA=1 for local only).
 */
export async function moderateImageBytes(
  bytes: Buffer,
): Promise<SafeSearchResult> {
  const allowOpen = process.env.ALLOW_UNMODERATED_MEDIA === "1";
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim();

  if (!apiKey) {
    if (allowOpen) {
      return {
        ok: true,
        labels: null,
        reason: "moderation_skipped_dev",
      };
    }
    return {
      ok: false,
      reason: "moderation_unavailable",
      labels: null,
    };
  }

  const threshold = parseThreshold();
  const body = {
    requests: [
      {
        image: { content: bytes.toString("base64") },
        features: [{ type: "SAFE_SEARCH_DETECTION" }],
      },
    ],
  };

  let response: Response;
  try {
    response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  } catch {
    return { ok: false, reason: "moderation_unavailable", labels: null };
  }

  if (!response.ok) {
    return { ok: false, reason: "moderation_unavailable", labels: null };
  }

  const json = (await response.json()) as {
    responses?: Array<{
      error?: { message?: string };
      safeSearchAnnotation?: Record<string, string>;
    }>;
  };

  const first = json.responses?.[0];
  if (!first || first.error) {
    return { ok: false, reason: "moderation_unavailable", labels: null };
  }

  const ann = first.safeSearchAnnotation ?? {};
  const labels: SafeSearchLabels = {
    adult: asLikelihood(ann.adult),
    spoof: asLikelihood(ann.spoof),
    medical: asLikelihood(ann.medical),
    violence: asLikelihood(ann.violence),
    racy: asLikelihood(ann.racy),
  };

  const min = RANK[threshold];
  const blocked: Array<keyof SafeSearchLabels> = [
    "adult",
    "violence",
    "racy",
  ];
  for (const key of blocked) {
    if (RANK[labels[key]] >= min) {
      return {
        ok: false,
        reason: "content_rejected",
        labels,
        raw: ann,
      };
    }
  }

  return { ok: true, labels, raw: ann };
}
