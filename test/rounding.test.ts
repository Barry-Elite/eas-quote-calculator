import assert from "node:assert/strict";
import { test } from "node:test";
import { displayDollars, pythonRound, roundHeightUpToHalfMetre, wholeDollarUp } from "../src/estimate.ts";

test("pythonRound matches CPython half-even on the exact float", () => {
  assert.equal(pythonRound(2.675, 2), 2.67);
  assert.equal(pythonRound(1.25, 1), 1.2);
  assert.equal(pythonRound(1.35, 1), 1.4);
  // 765 × 5.883 sits just under the halfway cent. A scale-then-round port goes the other way.
  assert.equal(pythonRound(765 * 5.883, 2), 4500.49);
  assert.equal(pythonRound(0, 2), 0);
});

test("whole-dollar-up uses the engine's six-decimal nudge", () => {
  assert.equal(wholeDollarUp(765 * 5.883), 4501);
  assert.equal(wholeDollarUp(957.748635), 958);
  assert.equal(wholeDollarUp(100), 100);
  // Dust that disappears at 6 decimals stays put. Dust that survives those decimals ticks up.
  assert.equal(wholeDollarUp(100.0000004), 100);
  assert.equal(wholeDollarUp(100.000001), 101);
});

test("height rounds up to the next 0.5 m and stays on a 0.5 boundary", () => {
  const cases: Array<[number, number]> = [
    [0.1, 0.5],
    [0.5, 0.5],
    [1, 1],
    [1.01, 1.5],
    [2.5, 2.5],
    [5, 5],
    [5.01, 5.5],
    [8.2, 8.5],
    [9.5, 9.5],
    [12, 12],
    [12.2, 12.5],
    [12.25, 12.5],
  ];
  for (const [input, expected] of cases) {
    assert.equal(roundHeightUpToHalfMetre(input), expected, String(input));
  }
});

test("display dollars ceil to a whole dollar, then outward to $100", () => {
  assert.equal(displayDollars(12340, "low"), 12300);
  assert.equal(displayDollars(12340, "high"), 12400);
  assert.equal(displayDollars(12340, "mid"), 12340);
  assert.equal(displayDollars(12000, "low"), 12000);
  assert.equal(displayDollars(12000, "high"), 12000);
  assert.equal(displayDollars(100.2, "low"), 100);
  assert.equal(displayDollars(100.2, "high"), 200);
  assert.equal(displayDollars(100.2, "mid"), 101);
  assert.equal(displayDollars(250, "low"), 200);
  assert.equal(displayDollars(250, "high"), 300);
  assert.equal(displayDollars(300, "low"), 300);
  assert.equal(displayDollars(300, "high"), 300);
  assert.equal(displayDollars(99, "low"), 0);
  assert.equal(displayDollars(99, "high"), 100);
  assert.equal(displayDollars(99, "mid"), 99);
  assert.equal(displayDollars(43018.75, "mid"), 43019);
});
