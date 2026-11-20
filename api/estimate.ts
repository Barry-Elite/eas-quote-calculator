import { estimate, type EstimateResult } from "../src/estimate.ts";
import { GST_NOTE, INDICATIVE_LABEL, PRICE_BASIS, SCOPE_NOTE } from "../src/copy.ts";
import { InputError, parseEstimateInputs } from "../src/validate.ts";

export type ApiRequest = {
  method?: string;
  body?: unknown;
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

class CardConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardConfigError";
  }
}

let cachedRaw: string | undefined;
let cachedCard: unknown;

export function resetRateCardCache(): void {
  cachedRaw = undefined;
  cachedCard = undefined;
}

function loadCard(): unknown {
  const raw = process.env.RATE_CARD_JSON;
  if (!raw || !raw.trim()) throw new CardConfigError("RATE_CARD_JSON is not set");
  if (raw === cachedRaw && cachedCard !== undefined) return cachedCard;
  try {
    cachedCard = JSON.parse(raw) as unknown;
  } catch {
    cachedRaw = undefined;
    cachedCard = undefined;
    throw new CardConfigError("RATE_CARD_JSON did not parse");
  }
  cachedRaw = raw;
  return cachedCard;
}

/** What the browser is allowed to see. No lines, rates, hours, tonnage, or margins. */
export function toClientPayload(result: EstimateResult) {
  return {
    low: result.low,
    high: result.high,
    heightUsedM: result.heightUsedM,
    label: INDICATIVE_LABEL,
    priceBasis: PRICE_BASIS,
    gstNote: GST_NOTE,
    scopeNote: SCOPE_NOTE,
  };
}

function readBody(body: unknown): unknown {
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return undefined;
    return JSON.parse(trimmed) as unknown;
  }
  if (body instanceof Uint8Array) {
    const text = new TextDecoder().decode(body).trim();
    if (!text) return undefined;
    return JSON.parse(text) as unknown;
  }
  return body;
}

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if ((req.method ?? "GET").toUpperCase() !== "POST") {
    res.status(405).json({ error: "Send the job details with POST." });
    return;
  }
  if (typeof req.body === "string" && req.body.length > 4000) {
    res.status(413).json({ error: "That request was too large." });
    return;
  }

  let body: unknown;
  try {
    body = readBody(req.body);
  } catch {
    res.status(400).json({ error: "Those details didn't come through. Check them and try again." });
    return;
  }

  try {
    const inputs = parseEstimateInputs(body);
    const result = estimate(loadCard(), inputs);
    res.status(200).json(toClientPayload(result));
  } catch (err) {
    if (err instanceof InputError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof Error) console.error(err.message);
    else console.error("estimate failed");
    res.status(500).json({
      error: "Pricing isn't available right now. Request a proper quote and we'll do it manually.",
    });
  }
}
