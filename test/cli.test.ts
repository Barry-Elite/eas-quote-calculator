import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function run(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/estimate-cli.ts", ...args], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });
}

test("prints low, mid, and high for the fake fixture", () => {
  const result = run([
    "--card",
    "test/fixtures/rate_card.fake.json",
    "--height",
    "9",
    "--perimeter",
    "81",
    "--weeks",
    "1",
    "--system",
    "kwikstage",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Indicative estimate only, not a quote/);
  assert.match(result.stdout, /ex GST\. \+ GST/);
  assert.match(result.stdout, /height_m: 9/);
  assert.match(result.stdout, /low: \$39,100/);
  assert.match(result.stdout, /mid: \$43,019/);
  assert.match(result.stdout, /high: \$58,400/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /charge_out|tonnage|hours|1359|43\.171/);
});

test("refuses a bad duration and a missing card", () => {
  const weeks = run([
    "--card",
    "test/fixtures/rate_card.fake.json",
    "--height",
    "9",
    "--perimeter",
    "81",
    "--weeks",
    "4.5",
    "--system",
    "kwikstage",
  ]);
  assert.notEqual(weeks.status, 0);
  assert.match(weeks.stderr, /whole number of weeks/);

  const missing = run(["--height", "9", "--perimeter", "81", "--weeks", "1", "--system", "kwikstage"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /--card/);
});
