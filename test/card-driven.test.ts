import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { estimate, type EstimateInputs } from "../src/estimate.ts";

type Card = {
  meta: { gst_rate: number };
  global: {
    install_rate_per_m2: { value: number };
    transport_per_leg_sell: { value: number };
    fall_threshold_m?: number;
    minimum_job_m2: { value: number };
    sell_rounding: { value: string };
  };
  board_configurations: { "3+2": { tonnage_factor_t_per_m2: { value: number } } };
  measurement_rules: {
    stairs: {
      construction_stair_lineal_add_m: { value: number };
      stretcher_stair_lineal_add_m: { value: number };
    };
    loading_bays: { lineal_add_per_bay_m: { value: number } };
  };
  labour_rate_selector: {
    difficulty_tiers_per_m2: { value: number[]; default: number };
    internal_options_per_m2: { value: number[] };
  };
  consumables: { mesh_sell_per_m2: { value: number } };
  hop_up_adjustment: { rate_per_lineal_m_sell: { value: number } };
  drafting: { max_hours_per_scaffold: { value: number } };
  rpeq: { certification_fee: { value: number } };
  scaffold_inspection: { cycle_days: { value: number }; monthly_tag_sell: { value: number } };
  types: {
    kwikstage: {
      install_rate_per_m2: { value: number };
      hire_rate_per_t_per_week: { value: number };
      tonnage_factor_t_per_m2: { value: number };
    };
    lightweight: { min_weekly_hire: { value: number } };
  };
};

const card = JSON.parse(readFileSync(new URL("./fixtures/rate_card.fake.json", import.meta.url), "utf8")) as Card;

const job: EstimateInputs = { heightM: 9, perimeterM: 81, weeks: 4, system: "kwikstage" };
const small: EstimateInputs = { heightM: 0.4, perimeterM: 6, weeks: 1, system: "kwikstage" };
const big: EstimateInputs = { heightM: 12.2, perimeterM: 140, weeks: 1, system: "kwikstage" };

function run(source: Card, inputs: EstimateInputs = job) {
  return estimate(structuredClone(source), inputs);
}

test("construction stair lineal add moves the price; stretcher stairs do not", () => {
  const base = run(card).rawMid;
  const none = structuredClone(card);
  none.measurement_rules.stairs.construction_stair_lineal_add_m.value = 0;
  assert.ok(run(none).rawMid < base);

  const stretcher = structuredClone(card);
  stretcher.measurement_rules.stairs.stretcher_stair_lineal_add_m.value = 100;
  assert.equal(run(stretcher).rawMid, base);
});

test("mesh, hop-ups, loading bays, GST, and the per-type install rate are not priced", () => {
  const base = run(card);
  const changed = structuredClone(card);
  changed.consumables.mesh_sell_per_m2.value = 500;
  changed.hop_up_adjustment.rate_per_lineal_m_sell.value = 500;
  changed.measurement_rules.loading_bays.lineal_add_per_bay_m.value = 100;
  changed.meta.gst_rate = 0.5;
  changed.types.kwikstage.install_rate_per_m2.value = 99;
  changed.types.kwikstage.tonnage_factor_t_per_m2.value = 0.5;
  changed.labour_rate_selector.difficulty_tiers_per_m2.default = 1;
  changed.labour_rate_selector.internal_options_per_m2.value = [];
  assert.deepEqual(run(changed), base);
});

test("transport, board tonnage, and the m2 floor are read from the card", () => {
  const dearer = structuredClone(card);
  dearer.global.transport_per_leg_sell.value += 100;
  assert.ok(run(dearer).rawMid > run(card).rawMid);

  const heavier = structuredClone(card);
  heavier.board_configurations["3+2"].tonnage_factor_t_per_m2.value = 0.05;
  assert.notEqual(run(heavier).rawMid, run(card).rawMid);

  const noFloor = structuredClone(card);
  noFloor.global.minimum_job_m2.value = 1;
  assert.ok(run(noFloor, small).rawMid < run(card, small).rawMid);
});

test("difficulty tiers set the range and the global install rate sets only the mid", () => {
  const base = run(card);
  const rate = structuredClone(card);
  rate.global.install_rate_per_m2.value = 50;
  const moved = run(rate);
  assert.notEqual(moved.rawMid, base.rawMid);
  assert.equal(moved.rawLow, base.rawLow);
  assert.equal(moved.rawHigh, base.rawHigh);

  const tiers = structuredClone(card);
  tiers.labour_rate_selector.difficulty_tiers_per_m2.value = [10, 20];
  const widened = run(tiers);
  assert.notEqual(widened.rawLow, base.rawLow);
  assert.notEqual(widened.rawHigh, base.rawHigh);
  assert.equal(widened.rawMid, base.rawMid);

  const reversed = structuredClone(card);
  reversed.labour_rate_selector.difficulty_tiers_per_m2.value = [
    ...card.labour_rate_selector.difficulty_tiers_per_m2.value,
  ].reverse();
  assert.deepEqual(run(reversed), base);
});

test("RPEQ follows the card fall threshold, and the 4 m fallback only when the field is missing", () => {
  const fee = card.rpeq.certification_fee.value;
  const tall = run(card, { heightM: 9, perimeterM: 20, weeks: 1, system: "kwikstage" });
  const noFee = structuredClone(card);
  noFee.global.fall_threshold_m = 1000;
  assert.equal(tall.rawMid - run(noFee, { heightM: 9, perimeterM: 20, weeks: 1, system: "kwikstage" }).rawMid, fee);

  const omitted = structuredClone(card);
  delete omitted.global.fall_threshold_m;
  const inputs: EstimateInputs = { heightM: 4.5, perimeterM: 20, weeks: 1, system: "kwikstage" };
  assert.equal(run(omitted, inputs).rawMid - run(card, inputs).rawMid, fee);
});

test("hire, inspection, drafting cap, and sell rounding are read from the card", () => {
  const light = structuredClone(card);
  light.types.lightweight.min_weekly_hire.value = 1_000_000;
  const lightJob: EstimateInputs = { heightM: 9, perimeterM: 81, weeks: 1, system: "lightweight" };
  assert.ok(run(light, lightJob).rawMid > run(card, lightJob).rawMid);
  assert.equal(run(light).rawMid, run(card).rawMid);

  const hire = structuredClone(card);
  hire.types.kwikstage.hire_rate_per_t_per_week.value = 80;
  assert.ok(run(hire).rawMid > run(card).rawMid);
  assert.equal(run(hire, lightJob).rawMid, run(card, lightJob).rawMid);

  const tag = structuredClone(card);
  tag.scaffold_inspection.monthly_tag_sell.value += 80;
  assert.ok(run(tag).rawMid > run(card).rawMid);
  assert.equal(run(tag, { ...job, weeks: 1 }).rawMid, run(card, { ...job, weeks: 1 }).rawMid);

  const cycle = structuredClone(card);
  cycle.scaffold_inspection.cycle_days.value = 7;
  assert.ok(run(cycle).rawMid > run(card).rawMid);
  assert.equal(run(cycle, { ...job, weeks: 1 }).rawMid, run(card, { ...job, weeks: 1 }).rawMid);

  const cap = structuredClone(card);
  cap.drafting.max_hours_per_scaffold.value = 100;
  assert.ok(run(cap, big).rawMid > run(card, big).rawMid);

  const exact = structuredClone(card);
  exact.global.sell_rounding.value = "exact";
  assert.notEqual(run(exact, { heightM: 9, perimeterM: 81, weeks: 1, system: "kwikstage" }).rawMid, run(card, { heightM: 9, perimeterM: 81, weeks: 1, system: "kwikstage" }).rawMid);

  assert.notEqual(run(card).rawMid, run(card, lightJob).rawMid);
});
