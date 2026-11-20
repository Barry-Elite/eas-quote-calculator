import type { EstimateInputs, ScaffoldSystem } from "./estimate.ts";

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

/**
 * NEEDS BARRY'S SIGN-OFF. Sanity caps so a typo cannot be priced.
 * They are not rate-card rules.
 */
export const INPUT_LIMITS = {
  heightM: { exclusiveMin: 0, max: 400 },
  perimeterM: { exclusiveMin: 0, max: 5000 },
  weeks: { min: 1, max: 104 },
  decimalPlaces: 3,
} as const;

const HEIGHT_RE = /^\d{1,6}(\.\d{1,3})?$/;
const PERIMETER_RE = /^\d{1,6}(\.\d{1,3})?$/;
const WEEKS_RE = /^\d{1,3}$/;

export function parseEstimateInputs(body: unknown): EstimateInputs {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new InputError("Enter the building height, perimeter, hire weeks, and scaffold system.");
  }
  const record = body as Record<string, unknown>;
  const heightM = readMeasure(
    record.height,
    "Building height needs to be a number of metres.",
    "Building height needs a dot for decimals, not a comma.",
    HEIGHT_RE,
    INPUT_LIMITS.heightM.max,
    "Building height needs to be greater than 0 and at most 400 metres.",
  );
  const perimeterM = readMeasure(
    record.perimeter,
    "Perimeter needs to be a number of lineal metres.",
    "Perimeter needs a dot for decimals, not a comma.",
    PERIMETER_RE,
    INPUT_LIMITS.perimeterM.max,
    "Perimeter needs to be greater than 0 and at most 5,000 lineal metres.",
  );
  const weeks = readWeeks(record.weeks);
  const system = readSystem(record.system);
  return { heightM, perimeterM, weeks, system };
}

function readMeasure(
  value: unknown,
  numberMessage: string,
  commaMessage: string,
  pattern: RegExp,
  max: number,
  rangeMessage: string,
): number {
  const numeric = readNumeric(value, numberMessage, commaMessage, pattern);
  if (numeric <= 0 || numeric > max) throw new InputError(rangeMessage);
  return numeric;
}

function readWeeks(value: unknown): number {
  const numeric = readNumeric(
    value,
    "Hire duration needs to be a whole number of weeks from 1 to 104.",
    "Hire duration needs to be a whole number of weeks from 1 to 104.",
    WEEKS_RE,
  );
  if (!Number.isInteger(numeric) || numeric < INPUT_LIMITS.weeks.min || numeric > INPUT_LIMITS.weeks.max) {
    throw new InputError("Hire duration needs to be a whole number of weeks from 1 to 104.");
  }
  return numeric;
}

function readNumeric(
  value: unknown,
  numberMessage: string,
  commaMessage: string,
  pattern: RegExp,
): number {
  if (typeof value === "string") {
    if (value.includes(",")) throw new InputError(commaMessage);
    const trimmed = value.trim();
    if (!pattern.test(trimmed)) throw new InputError(numberMessage);
    return Number(trimmed);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new InputError(numberMessage);
    const text = Object.is(value, -0) ? "-0" : String(value);
    if (text.includes("e") || text.includes("E") || !pattern.test(text)) {
      throw new InputError(numberMessage);
    }
    return value;
  }
  throw new InputError(numberMessage);
}

function readSystem(value: unknown): ScaffoldSystem {
  if (typeof value !== "string" || value.trim() === "") {
    throw new InputError("Choose Kwikstage or Lightweight.");
  }
  const system = value.trim().toLowerCase();
  if (system === "other" || system === "something else" || system === "not sure" || system === "something else / not sure") {
    throw new InputError("We can't price that system automatically. Request a proper quote.");
  }
  if (system === "kwikstage" || system === "lightweight") return system;
  throw new InputError("Choose Kwikstage or Lightweight.");
}
