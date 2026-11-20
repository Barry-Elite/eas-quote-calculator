import assert from "node:assert/strict";
import { test } from "node:test";
import { InputError, parseEstimateInputs } from "../src/validate.ts";

function accept(body: unknown) {
  return parseEstimateInputs(body);
}

function reject(body: unknown): string {
  assert.throws(() => parseEstimateInputs(body), InputError);
  try {
    parseEstimateInputs(body);
  } catch (err) {
    assert.ok(err instanceof InputError);
    return err.message;
  }
  throw new Error("unreachable");
}

test("accepts the client job and ignores storeys", () => {
  assert.deepEqual(accept({ height: 8.2, perimeter: 81, weeks: 4, system: "kwikstage", storeys: 3 }), {
    heightM: 8.2,
    perimeterM: 81,
    weeks: 4,
    system: "kwikstage",
  });
  assert.deepEqual(accept({ height: "8.20", perimeter: "81", weeks: "4", system: " Lightweight " }), {
    heightM: 8.2,
    perimeterM: 81,
    weeks: 4,
    system: "lightweight",
  });
});

test("rejects systems the card cannot auto-price", () => {
  assert.match(reject({ height: 9, perimeter: 20, weeks: 1, system: "other" }), /Request a proper quote/);
  assert.match(reject({ height: 9, perimeter: 20, weeks: 1, system: "not sure" }), /Request a proper quote/);
  assert.match(reject({ height: 9, perimeter: 20, weeks: 1, system: "layher" }), /Choose Kwikstage or Lightweight/);
  assert.match(reject({ height: 9, perimeter: 20, weeks: 1, system: "" }), /Choose Kwikstage or Lightweight/);
});

test("rejects out of range, commas, and non-integers for weeks", () => {
  assert.match(reject({ height: 0, perimeter: 20, weeks: 1, system: "kwikstage" }), /greater than 0 and at most 400/);
  assert.match(reject({ height: 400.001, perimeter: 20, weeks: 1, system: "kwikstage" }), /at most 400/);
  assert.match(reject({ height: 9, perimeter: 0, weeks: 1, system: "kwikstage" }), /5,000/);
  assert.match(reject({ height: 9, perimeter: 5000.001, weeks: 1, system: "kwikstage" }), /5,000/);
  assert.match(reject({ height: "8,2", perimeter: 20, weeks: 1, system: "kwikstage" }), /comma/);
  assert.match(reject({ height: "1e2", perimeter: 20, weeks: 1, system: "kwikstage" }), /number of metres/);
  assert.match(reject({ height: 9, perimeter: 20, weeks: 4.5, system: "kwikstage" }), /whole number of weeks/);
  assert.match(reject({ height: 9, perimeter: 20, weeks: 0, system: "kwikstage" }), /1 to 104/);
  assert.match(reject({ height: 9, perimeter: 20, weeks: 105, system: "kwikstage" }), /1 to 104/);
  assert.equal(accept({ height: 400, perimeter: 5000, weeks: 104, system: "kwikstage" }).weeks, 104);
});

test("rejects a body that is not a job", () => {
  assert.throws(() => parseEstimateInputs(null), InputError);
  assert.throws(() => parseEstimateInputs([]), InputError);
  assert.throws(() => parseEstimateInputs("9"), InputError);
});
