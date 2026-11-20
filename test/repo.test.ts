import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { GST_NOTE, INDICATIVE_LABEL, PRICE_BASIS, SCOPE_NOTE } from "../src/copy.ts";

const rootUrl = new URL("..", import.meta.url);
const root = fileURLToPath(rootUrl);

function read(path: string): string {
  return readFileSync(new URL(path, rootUrl), "utf8");
}

function ignored(path: string): boolean {
  return spawnSync("git", ["check-ignore", "-q", "--", path], { cwd: root }).status === 0;
}

test("the real card and the Python engine are not part of the repo", () => {
  assert.equal(ignored("rate_card.local.json"), true);
  assert.equal(ignored("quote_calc.py"), true);
  assert.equal(ignored("test/fixtures/rate_card.fake.json"), false);
  assert.equal(existsSync(new URL("quote_calc.py", rootUrl)), false);
  assert.equal(existsSync(new URL("uploads", rootUrl)), false);
  const fake = read("test/fixtures/rate_card.fake.json");
  assert.match(fake, /FAKE FIXTURE/);
  assert.match(fake, /randomised/);
});

test("the page and the README carry Barry's placeholder copy", () => {
  const readme = read("README.md");
  const js = read("public/app.js");
  const html = read("public/index.html");
  const css = read("public/styles.css");
  for (const text of [INDICATIVE_LABEL, SCOPE_NOTE, GST_NOTE, PRICE_BASIS, "NEEDS BARRY'S SIGN-OFF"]) {
    assert.ok(readme.includes(text), text);
  }
  const unpriced = "We can only put an indicative range on Kwikstage and Lightweight. For another system, or if you're not sure, request a proper quote.";
  assert.ok(js.includes(unpriced));
  assert.ok(readme.includes(unpriced));
  assert.ok(js.includes(INDICATIVE_LABEL) === false);
  const fetches = [...js.matchAll(/fetch\(\s*["'`]([^"'`]+)["'`]/g)].map((match) => match[1]);
  assert.deepEqual(fetches, ["/api/estimate"]);
  for (const banned of ["localStorage", "sessionStorage", "indexedDB", "sendBeacon", "XMLHttpRequest", "document.cookie"]) {
    assert.equal(js.includes(banned), false, banned);
  }
  const plug = js.indexOf("function deliverQuoteRequest");
  assert.ok(plug > 0);
  assert.ok(js.slice(0, plug).includes("NEEDS BARRY'S SIGN-OFF"));
  assert.equal(js.slice(plug, js.indexOf("const state")).includes("fetch"), false);
  assert.match(html, /Something else \/ not sure/);
  for (const secret of ["1359", "43.171", "difficulty_tiers", "charge_out", "FAKE FIXTURE", "0.029"]) {
    assert.equal(`${html}\n${css}\n${js}`.includes(secret), false, secret);
  }
});
