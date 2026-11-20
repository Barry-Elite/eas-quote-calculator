/**
 * Client indicative range for Elite Access Solutions.
 *
 * This is the sell total of the internal calculate_quote engine for Barry's
 * client defaults, with two deliberate differences:
 *
 * 1. Install and dismantle sell = ceiled budget hours × the card's charge-out
 *    rate. The engine instead splits area × install rate across those lines.
 *    Hours are still the engine's: ceil each side of that same hour pool.
 * 2. Low uses the minimum difficulty tier per m² and high uses the maximum.
 *    Displayed low/high are then ceiled to a whole dollar and rounded outward
 *    to the nearest $100. Mid (CLI only) is the card's default install rate,
 *    ceiled to a whole dollar.
 *
 * Every dollar, factor, and threshold is read from the card. The browser never
 * loads this module.
 */

export type ScaffoldSystem = "kwikstage" | "lightweight";

export type EstimateInputs = {
  heightM: number;
  perimeterM: number;
  weeks: number;
  system: ScaffoldSystem;
};

export type EstimateResult = {
  /** Ceiled whole dollars, then floored to a multiple of $100. */
  low: number;
  /** Default install rate, ceiled to a whole dollar. Not shown in the browser. */
  mid: number;
  /** Ceiled whole dollars, then ceiled to a multiple of $100. */
  high: number;
  rawLow: number;
  rawMid: number;
  rawHigh: number;
  heightUsedM: number;
};

/** Barry's client defaults. Not rates. */
const CLIENT_CONFIG = "3+2";
const CLIENT_CONSTRUCTION_STAIRS = 1;
const CLIENT_SCAFFOLDS = 1;

/**
 * Same cutoff calculate_quote uses before it treats a truck remainder as empty.
 * Not a sell rate.
 */
const TRUCK_REMAINDER_EPSILON = 1e-9;

/** calculate_quote's own fallbacks, used only when the card omits the field. */
const FALL_THRESHOLD_IF_CARD_OMITS_M = 4;
const INSPECTION_CYCLE_IF_CARD_OMITS_DAYS = 28;
const HIRE_BASIS_IF_CARD_OMITS = "m2";
const MIN_WEEKLY_IF_CARD_OMITS = 0;
const INSTALL_SPLIT_IF_CARD_OMITS = 2;
const DISMANTLE_SPLIT_IF_CARD_OMITS = 1;
const SELL_ROUNDING_IF_CARD_OMITS = "exact";

/**
 * CPython round-half-even on the exact float value. A multiply-then-round
 * port does not match the engine near halfway amounts (hire in particular).
 */
export function pythonRound(value: number, ndigits: number): number {
  if (!Number.isFinite(value)) throw new Error("Cannot round a non-finite number");
  if (!Number.isInteger(ndigits) || ndigits < 0 || ndigits > 12) {
    throw new Error("Cannot round to that many decimal places");
  }
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  if (abs === 0) return 0;

  const buf = new ArrayBuffer(8);
  new Float64Array(buf)[0] = abs;
  const bits = new BigUint64Array(buf)[0];
  const expBits = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & ((1n << 52n) - 1n);
  if (expBits === 0x7ff) throw new Error("Cannot round a non-finite number");

  let mantissa: bigint;
  let exp2: number;
  if (expBits === 0) {
    mantissa = frac;
    exp2 = -1022 - 52;
  } else {
    mantissa = frac | (1n << 52n);
    exp2 = expBits - 1023 - 52;
  }

  const pow5 = 5n ** BigInt(ndigits);
  const shift = BigInt(exp2 + ndigits);
  let numerator: bigint;
  let denominator: bigint;
  if (shift >= 0n) {
    numerator = mantissa * pow5 * (2n ** shift);
    denominator = 1n;
  } else {
    numerator = mantissa * pow5;
    denominator = 2n ** -shift;
  }

  const quot = numerator / denominator;
  const rem = numerator % denominator;
  const twice = rem * 2n;
  let rounded = quot;
  if (twice > denominator || (twice === denominator && quot % 2n === 1n)) rounded += 1n;

  const scale = 10n ** BigInt(ndigits);
  const intPart = rounded / scale;
  const fracPart = rounded % scale;
  const digits = fracPart.toString().padStart(ndigits, "0");
  const text = `${sign < 0 ? "-" : ""}${intPart.toString()}${ndigits > 0 ? `.${digits}` : ""}`;
  return Number(text);
}

/** calculate_quote's `_up`: ceil after rounding to 6 decimals, with a dust nudge. */
export function wholeDollarUp(value: number): number {
  return Math.ceil(pythonRound(value, 6) - 1e-9);
}

/**
 * Building height is rounded up to the next 0.5 m before it is priced.
 * The card's height-convention sentence is redacted on the fixture, so this
 * follows Barry's instruction for the client page.
 */
export function roundHeightUpToHalfMetre(heightM: number): number {
  const ceiled = Math.ceil(pythonRound(heightM * 2, 6) - 1e-9);
  return ceiled / 2;
}

/**
 * NEEDS BARRY'S SIGN-OFF — reading of "ceiled whole dollars, rounded outward
 * to the nearest $100".
 *
 * Low drops to the hundred at or below the ceiled dollar (a figure already on
 * a hundred stays). High rises to the hundred at or above it. Mid, for the
 * offline check, is only ceiled to the dollar so a real card can be checked
 * more tightly than the public range.
 */
export function displayDollars(amount: number, edge: "low" | "mid" | "high"): number {
  const whole = wholeDollarUp(pythonRound(amount, 2));
  if (edge === "mid") return whole;
  // Integer remainder, not whole/100. Binary division is not exact for every hundred.
  const rounded = Math.round(whole);
  const lower = rounded - (rounded % 100);
  if (edge === "low") return lower;
  return lower === rounded ? rounded : lower + 100;
}

export function estimate(card: unknown, inputs: EstimateInputs): EstimateResult {
  if (card === null || typeof card !== "object") throw new Error("Rate card is not an object");
  if (inputs.system !== "kwikstage" && inputs.system !== "lightweight") {
    throw new Error(`Unknown scaffold type '${inputs.system}'.`);
  }
  if (!Number.isFinite(inputs.heightM) || inputs.heightM <= 0) {
    throw new Error("Height must be greater than 0");
  }
  if (!Number.isFinite(inputs.perimeterM) || inputs.perimeterM <= 0) {
    throw new Error("Perimeter must be greater than 0");
  }
  if (!Number.isFinite(inputs.weeks) || inputs.weeks <= 0) {
    throw new Error("Weeks must be greater than 0");
  }

  const heightUsedM = roundHeightUpToHalfMetre(inputs.heightM);
  const priced: EstimateInputs = { ...inputs, heightM: heightUsedM };
  const { low: lowRate, high: highRate } = difficultyBounds(card);
  const midRate = num(card, ["global", "install_rate_per_m2"]);

  const rawLow = sellTotal(card, priced, lowRate);
  const rawHigh = sellTotal(card, priced, highRate);
  const rawMid = sellTotal(card, priced, midRate);

  return {
    low: displayDollars(rawLow, "low"),
    mid: displayDollars(rawMid, "mid"),
    high: displayDollars(rawHigh, "high"),
    rawLow,
    rawMid,
    rawHigh,
    heightUsedM,
  };
}

/**
 * One calculate_quote sell total at a chosen install rate.
 * Difficulty-tier rates are used even when they are not in
 * internal_options_per_m2. That list only guards the internal selector.
 */
function sellTotal(card: unknown, inputs: EstimateInputs, installRate: number): number {
  const factor = num(card, ["board_configurations", CLIENT_CONFIG, "tonnage_factor_t_per_m2"]);
  const stairAdd = num(card, ["measurement_rules", "stairs", "construction_stair_lineal_add_m"]);
  const height = inputs.heightM;
  const linealTotal = inputs.perimeterM + CLIENT_CONSTRUCTION_STAIRS * stairAdd;
  const areaReal = linealTotal * height;

  const minM2 = num(card, ["global", "minimum_job_m2"]);
  const areaPriced = Math.max(areaReal, minM2);
  const floorApplied = areaPriced > areaReal;
  const tonnageReal = areaReal * factor;
  const tonnage = floorApplied ? areaPriced * factor : tonnageReal;

  const planLoad = num(card, ["global", "truck_nominal_capacity_t"]);
  if (!(planLoad > 0)) throw new Error("Rate card truck capacity must be greater than zero");
  const easThreshold = num(card, ["global", "eas_truck_threshold_t"]);
  let fullTrucks = Math.floor(tonnage / planLoad);
  const remainder = tonnage - fullTrucks * planLoad;
  let easTruck = false;
  if (remainder > TRUCK_REMAINDER_EPSILON) {
    if (remainder <= easThreshold) easTruck = true;
    else fullTrucks += 1;
  }
  const fullLegs = fullTrucks * 2;
  const easLegs = easTruck ? 2 : 0;
  const trucksTotal = fullTrucks + (easTruck ? 1 : 0);

  const chargeOut = num(card, ["labour", "charge_out_rate_per_hour"]);
  if (!(chargeOut > 0)) throw new Error("Rate card charge-out rate must be greater than zero");
  const { install: installParts, dismantle: dismantleParts } = labourSplit(card);
  const split = installParts + dismantleParts;
  if (!(split > 0)) throw new Error("Rate card labour split must be greater than zero");

  const budgetHours = (areaPriced * installRate) / chargeOut;
  const installHours = Math.ceil(budgetHours * (installParts / split));
  const dismantleHours = Math.ceil(budgetHours * (dismantleParts / split));
  // Barry: sell the ceiled hours, not the area × rate split.
  const sellInstall = installHours * chargeOut;
  const sellDismantle = dismantleHours * chargeOut;

  const yardHours = num(card, ["labour", "yard_pick_hours_per_truck"]) * trucksTotal;

  let draftingHours =
    num(card, ["drafting", "minimum_hours"]) +
    num(card, ["drafting", "additional_hours_per_500m2"]) * Math.floor(areaReal / 500);
  const capNode = dig(card, ["drafting", "max_hours_per_scaffold"]);
  if (capNode !== undefined) {
    const cap = asFiniteNumber(unwrap(capNode), "drafting.max_hours_per_scaffold") * Math.max(CLIENT_SCAFFOLDS, 1);
    if (draftingHours > cap) draftingHours = cap;
  }
  const draftingRate = num(card, ["drafting", "rate_per_hour"]);

  const fall = numOr(card, ["global", "fall_threshold_m"], FALL_THRESHOLD_IF_CARD_OMITS_M);
  const rpeq = height > fall;
  const rpeqFee = rpeq ? num(card, ["rpeq", "certification_fee"]) : 0;

  const spec = dig(card, ["types", inputs.system]);
  if (spec === undefined || spec === null || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error(`Unknown scaffold type '${inputs.system}'.`);
  }
  const hireBasis = String(valueOr(spec, ["hire_basis"], HIRE_BASIS_IF_CARD_OMITS));
  const minWeekly = numOr(spec, ["min_weekly_hire"], MIN_WEEKLY_IF_CARD_OMITS);
  const pricedTonnage = areaPriced * factor;
  let weekly =
    hireBasis === "tonnage"
      ? Math.max(pricedTonnage * num(spec, ["hire_rate_per_t_per_week"]), minWeekly)
      : Math.max(areaPriced * num(spec, ["hire_rate_per_m2_per_week"]), minWeekly);

  const whole = valueOr(card, ["global", "sell_rounding"], SELL_ROUNDING_IF_CARD_OMITS) === "whole_dollar_up";
  if (whole) weekly = wholeDollarUp(weekly);
  const hireTotal = weekly * inputs.weeks;

  const cycle = numOr(card, ["scaffold_inspection", "cycle_days"], INSPECTION_CYCLE_IF_CARD_OMITS_DAYS);
  if (!(cycle > 0)) throw new Error("Rate card inspection cycle must be greater than zero");
  const inspectionQty = Math.max(0, Math.ceil((inputs.weeks * 7) / cycle) - 1);

  const amounts: number[] = [];
  const add = (amount: number) => {
    amounts.push(whole ? wholeDollarUp(amount) : pythonRound(amount, 2));
  };

  const transportSell = num(card, ["global", "transport_per_leg_sell"]);
  const easSell = num(card, ["global", "eas_truck_per_leg_sell"]);
  if (fullTrucks > 0) add(fullLegs * transportSell);
  if (easTruck) add(easLegs * easSell);
  add(sellInstall);
  add(sellDismantle);
  add(yardHours * chargeOut);
  add(draftingHours * draftingRate);
  if (rpeq) add(rpeqFee);
  if (inspectionQty > 0) add(inspectionQty * num(card, ["scaffold_inspection", "monthly_tag_sell"]));
  add(hireTotal);

  let total = 0;
  for (const amount of amounts) total += amount;
  return pythonRound(total, 2);
}

function difficultyBounds(card: unknown): { low: number; high: number } {
  const tiers = unwrap(dig(card, ["labour_rate_selector", "difficulty_tiers_per_m2"]));
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error("Rate card is missing labour_rate_selector.difficulty_tiers_per_m2");
  }
  const rates = tiers.map((tier, index) => asFiniteNumber(tier, `difficulty_tiers_per_m2[${index}]`));
  return { low: Math.min(...rates), high: Math.max(...rates) };
}

function labourSplit(card: unknown): { install: number; dismantle: number } {
  const node = dig(card, ["labour", "install_dismantle_split"]);
  if (node === undefined || node === null) {
    return { install: INSTALL_SPLIT_IF_CARD_OMITS, dismantle: DISMANTLE_SPLIT_IF_CARD_OMITS };
  }
  if (typeof node !== "object" || Array.isArray(node)) {
    throw new Error("Rate card field labour.install_dismantle_split is not usable");
  }
  const record = node as Record<string, unknown>;
  return {
    install: asFiniteNumber(
      record.install_parts === undefined ? INSTALL_SPLIT_IF_CARD_OMITS : record.install_parts,
      "labour.install_dismantle_split.install_parts",
    ),
    dismantle: asFiniteNumber(
      record.dismantle_parts === undefined ? DISMANTLE_SPLIT_IF_CARD_OMITS : record.dismantle_parts,
      "labour.install_dismantle_split.dismantle_parts",
    ),
  };
}

function dig(root: unknown, path: readonly string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, key)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function unwrap(node: unknown): unknown {
  if (node !== null && typeof node === "object" && !Array.isArray(node) && "value" in node) {
    return (node as { value: unknown }).value;
  }
  return node;
}

function asFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Rate card field ${name} is not a number`);
  }
  return value;
}

function num(root: unknown, path: readonly string[]): number {
  const node = dig(root, path);
  if (node === undefined) throw new Error(`Rate card is missing ${path.join(".")}`);
  return asFiniteNumber(unwrap(node), path.join("."));
}

function numOr(root: unknown, path: readonly string[], fallback: number): number {
  const node = dig(root, path);
  if (node === undefined) return fallback;
  return asFiniteNumber(unwrap(node), path.join("."));
}

function valueOr(root: unknown, path: readonly string[], fallback: unknown): unknown {
  const node = dig(root, path);
  if (node === undefined) return fallback;
  return unwrap(node);
}
