import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GST_NOTE, INDICATIVE_LABEL, PRICE_BASIS } from "../src/copy.ts";
import { estimate } from "../src/estimate.ts";
import { formatDollars, formatMeasure } from "../src/format.ts";
import { InputError, parseEstimateInputs } from "../src/validate.ts";

const usage = `Usage:
  npm run estimate -- --card path.json --height 9 --perimeter 81 --weeks 1 --system kwikstage

Prints an indicative ex GST range for one job.
low / high are the difficulty-tier runs, ceiled and rounded outward to $100.
mid is the card's default install rate, ceiled to the dollar.
Nothing is sent anywhere. The rate card is not printed.`;

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) return undefined;
  return value;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(usage);
  process.exit(0);
}

const cardPath = flag("card");
if (!cardPath) {
  console.error(usage);
  console.error("Pass --card with the rate card JSON path.");
  process.exit(1);
}

let raw: string;
try {
  raw = readFileSync(resolve(cardPath), "utf8");
} catch {
  console.error(`Could not read the rate card at ${cardPath}`);
  process.exit(1);
}

let card: unknown;
try {
  card = JSON.parse(raw) as unknown;
} catch {
  console.error("Rate card JSON could not be parsed. The contents were not printed.");
  process.exit(1);
}

let inputs;
try {
  inputs = parseEstimateInputs({
    height: flag("height"),
    perimeter: flag("perimeter"),
    weeks: flag("weeks"),
    system: flag("system"),
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : "Check the inputs.");
  process.exit(1);
}

try {
  const result = estimate(card, inputs);
  console.log(INDICATIVE_LABEL);
  console.log(`${PRICE_BASIS}. ${GST_NOTE}`);
  console.log(`height_m: ${formatMeasure(result.heightUsedM)}`);
  console.log(`low: ${formatDollars(result.low)}`);
  console.log(`mid: ${formatDollars(result.mid)}`);
  console.log(`high: ${formatDollars(result.high)}`);
} catch (err) {
  if (err instanceof InputError) console.error(err.message);
  else console.error(err instanceof Error ? err.message : "Could not price that.");
  process.exit(1);
}
