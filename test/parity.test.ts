import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { estimate, type EstimateInputs, type EstimateResult, type ScaffoldSystem } from "../src/estimate.ts";

/**
 * Anchors below are outputs of the fake fixture, not real EAS prices.
 * They were checked against the internal engine before the expected file was written.
 */
const ANCHOR = {
  rawLow: 39197,
  rawMid: 43019,
  rawHigh: 58398,
  low: 39100,
  mid: 43019,
  high: 58400,
};

type Case = {
  height: number;
  perimeter: number;
  weeks: number;
  system: ScaffoldSystem;
  heightUsedM: number;
  rawLow: number;
  rawMid: number;
  rawHigh: number;
  low: number;
  mid: number;
  high: number;
};

type ExpectedFile = {
  rateCardSha256: string;
  grid: { heights: number[]; perimeters: number[]; weeks: number[]; systems: string[] };
  cases: Case[];
  exactRoundingCases: Case[];
};

const cardBytes = readFileSync(new URL("./fixtures/rate_card.fake.json", import.meta.url));
const card = JSON.parse(cardBytes.toString("utf8")) as {
  global: { sell_rounding: { value: string }; install_rate_per_m2: { value: number } };
  labour_rate_selector: { difficulty_tiers_per_m2: { value: number[] } };
};
const expected = JSON.parse(
  readFileSync(new URL("./fixtures/parity.expected.json", import.meta.url), "utf8"),
) as ExpectedFile;

function deepFreeze(value: unknown): void {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
}

function inputsOf(row: Case): EstimateInputs {
  return { heightM: row.height, perimeterM: row.perimeter, weeks: row.weeks, system: row.system };
}

function price(row: Case, source: unknown = card): EstimateResult {
  const copy = structuredClone(source);
  deepFreeze(copy);
  return estimate(copy, inputsOf(row));
}

function assertMoney(actual: number, wanted: number, label: string): void {
  if (Number.isInteger(wanted)) assert.equal(actual, wanted, label);
  else assert.ok(Math.abs(actual - wanted) < 0.02, `${label}: ${actual} vs ${wanted}`);
}

function assertCase(actual: EstimateResult, row: Case): void {
  const label = `${row.system} ${row.height}m x ${row.perimeter}lm x ${row.weeks}w`;
  assertMoney(actual.rawLow, row.rawLow, `${label} rawLow`);
  assertMoney(actual.rawMid, row.rawMid, `${label} rawMid`);
  assertMoney(actual.rawHigh, row.rawHigh, `${label} rawHigh`);
  assert.equal(actual.low, row.low, `${label} low`);
  assert.equal(actual.mid, row.mid, `${label} mid`);
  assert.equal(actual.high, row.high, `${label} high`);
  assert.equal(actual.heightUsedM, row.heightUsedM, `${label} height`);
  assert.equal(actual.low % 100, 0);
  assert.equal(actual.high % 100, 0);
  assert.ok(actual.low <= actual.high);
  assert.ok(actual.low <= actual.rawLow + 1);
  assert.ok(actual.high + 1e-6 >= actual.rawHigh);
  assert.ok(actual.heightUsedM + 1e-9 >= row.height);
  assert.equal(actual.heightUsedM * 2, Math.round(actual.heightUsedM * 2));
  const tiers = card.labour_rate_selector.difficulty_tiers_per_m2.value;
  const lowRate = Math.min(...tiers);
  const highRate = Math.max(...tiers);
  const midRate = card.global.install_rate_per_m2.value;
  if (lowRate <= midRate && midRate <= highRate) {
    assert.ok(actual.rawLow <= actual.rawMid + 0.02);
    assert.ok(actual.rawMid <= actual.rawHigh + 0.02);
  }
}

test("parity fixture is the output of this fake card", () => {
  const hash = createHash("sha256").update(cardBytes).digest("hex");
  assert.equal(hash, expected.rateCardSha256);
  assert.equal(card.global.sell_rounding.value, "whole_dollar_up");
  const { heights, perimeters, weeks, systems } = expected.grid;
  assert.equal(expected.cases.length, heights.length * perimeters.length * weeks.length * systems.length);
  assert.ok(expected.cases.length >= 300);
});

test("fake-fixture anchors match the hand-checked engine totals", () => {
  const result = price({
    height: 9,
    perimeter: 81,
    weeks: 1,
    system: "kwikstage",
    heightUsedM: 9,
    ...ANCHOR,
  });
  assert.equal(result.rawLow, ANCHOR.rawLow);
  assert.equal(result.rawMid, ANCHOR.rawMid);
  assert.equal(result.rawHigh, ANCHOR.rawHigh);
  assert.equal(result.low, ANCHOR.low);
  assert.equal(result.mid, ANCHOR.mid);
  assert.equal(result.high, ANCHOR.high);

  const light = price({
    height: 9,
    perimeter: 81,
    weeks: 1,
    system: "lightweight",
    heightUsedM: 9,
    rawLow: 0,
    rawMid: 46562,
    rawHigh: 0,
    low: 0,
    mid: 0,
    high: 0,
  });
  assert.equal(light.rawMid, 46562);

  const small = price({
    height: 0.4,
    perimeter: 6,
    weeks: 1,
    system: "kwikstage",
    heightUsedM: 0.5,
    rawLow: 0,
    rawMid: 8455,
    rawHigh: 0,
    low: 0,
    mid: 0,
    high: 0,
  });
  assert.equal(small.rawMid, 8455);
  assert.equal(small.heightUsedM, 0.5);
});

test("ported estimate matches the engine on the whole grid", () => {
  for (const row of expected.cases) assertCase(price(row), row);
});

test("exact sell rounding matches the engine cent for cent", () => {
  for (const row of expected.exactRoundingCases) {
    const copy = structuredClone(card);
    copy.global.sell_rounding.value = "exact";
    assertCase(price(row, copy), row);
  }
});

test("crossing the fall threshold and a half-metre step changes the fake-card price", () => {
  const at = expected.cases.find((row) => row.system === "kwikstage" && row.height === 5 && row.perimeter === 20 && row.weeks === 4);
  const over = expected.cases.find((row) => row.system === "kwikstage" && row.height === 5.01 && row.perimeter === 20 && row.weeks === 4);
  const nine = expected.cases.find((row) => row.system === "kwikstage" && row.height === 9 && row.perimeter === 81 && row.weeks === 1);
  const nineHalf = expected.cases.find((row) => row.system === "kwikstage" && row.height === 9.5 && row.perimeter === 81 && row.weeks === 1);
  assert.ok(at && over && nine && nineHalf);
  assert.notEqual(at.rawMid, over.rawMid);
  assert.equal(at.heightUsedM, 5);
  assert.equal(over.heightUsedM, 5.5);
  assert.notEqual(nine.rawMid, nineHalf.rawMid);
});
