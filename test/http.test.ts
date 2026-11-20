import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import handler, { resetRateCardCache, type ApiRequest, type ApiResponse } from "../api/estimate.ts";
import { estimate } from "../src/estimate.ts";
import { start } from "../scripts/server.ts";

const cardRaw = readFileSync(new URL("./fixtures/rate_card.fake.json", import.meta.url), "utf8");
const SECRET = /tonnage|margin|charge_out|line_items|difficulty|install_rate|1359|43\.171|0\.029|FAKE FIXTURE/i;

function call(method: string, body: unknown): { status: number; payload: Record<string, unknown> } {
  let status = 200;
  let payload: Record<string, unknown> = {};
  const req: ApiRequest = { method, body };
  const res: ApiResponse = {
    status(code) {
      status = code;
      return this;
    },
    json(data) {
      payload = data as Record<string, unknown>;
    },
  };
  handler(req, res);
  return { status, payload };
}

describe("estimate endpoint", { concurrency: 1 }, () => {
  const previous = process.env.RATE_CARD_JSON;

  before(() => {
    process.env.RATE_CARD_JSON = cardRaw;
    resetRateCardCache();
  });

  after(() => {
    if (previous === undefined) delete process.env.RATE_CARD_JSON;
    else process.env.RATE_CARD_JSON = previous;
    resetRateCardCache();
  });

  test("returns only the client fields for a priced job", () => {
    const { status, payload } = call("POST", { height: 9, perimeter: 81, weeks: 1, system: "kwikstage" });
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(payload).sort(), [
      "gstNote",
      "heightUsedM",
      "high",
      "label",
      "low",
      "priceBasis",
      "scopeNote",
    ]);
    assert.equal(payload.low, 39100);
    assert.equal(payload.high, 58400);
    assert.equal(payload.heightUsedM, 9);
    assert.equal(payload.priceBasis, "ex GST");
    assert.equal(payload.gstNote, "+ GST");
    assert.match(String(payload.label), /Indicative estimate only, not a quote/);
    assert.doesNotMatch(JSON.stringify(payload), SECRET);
  });

  test("rounds height before pricing and ignores storeys", () => {
    const rounded = call("POST", { height: 8.2, perimeter: 81, weeks: 1, system: "kwikstage", storeys: 6 });
    const direct = estimate(JSON.parse(cardRaw) as unknown, {
      heightM: 8.2,
      perimeterM: 81,
      weeks: 1,
      system: "kwikstage",
    });
    assert.equal(rounded.status, 200);
    assert.equal(rounded.payload.heightUsedM, 8.5);
    assert.equal(rounded.payload.low, direct.low);
    assert.equal(rounded.payload.high, direct.high);
    const asText = call("POST", JSON.stringify({ height: "9", perimeter: "81", weeks: "1", system: "kwikstage" }));
    const asNumber = call("POST", { height: 9, perimeter: 81, weeks: 1, system: "kwikstage" });
    assert.deepEqual(asText.payload, asNumber.payload);
  });

  test("rejects bad jobs without pricing them", () => {
    assert.equal(call("POST", { height: 9, perimeter: 81, weeks: 1, system: "other" }).status, 400);
    assert.match(String(call("POST", { height: 9, perimeter: 81, weeks: 1, system: "other" }).payload.error), /proper quote/);
    assert.equal(call("POST", { height: 9, perimeter: 81, weeks: 1, system: "layher" }).status, 400);
    assert.equal(call("POST", { height: -1, perimeter: 81, weeks: 1, system: "kwikstage" }).status, 400);
    assert.equal(call("POST", { height: 9, perimeter: 81, weeks: 4.5, system: "kwikstage" }).status, 400);
    assert.equal(call("GET", { height: 9, perimeter: 81, weeks: 1, system: "kwikstage" }).status, 405);
    assert.equal(call("POST", "{").status, 400);
    assert.equal(call("POST", "x".repeat(5000)).status, 413);
  });

  test("a missing or broken card is a generic error", () => {
    const saved = process.env.RATE_CARD_JSON;
    try {
      delete process.env.RATE_CARD_JSON;
      resetRateCardCache();
      const missing = call("POST", { height: 9, perimeter: 81, weeks: 1, system: "kwikstage" });
      assert.equal(missing.status, 500);
      assert.doesNotMatch(String(missing.payload.error), /RATE_CARD/);
      assert.match(String(missing.payload.error), /Request a proper quote/);

      process.env.RATE_CARD_JSON = "{";
      resetRateCardCache();
      const broken = call("POST", { height: 9, perimeter: 81, weeks: 1, system: "kwikstage" });
      assert.equal(broken.status, 500);
      const message = String(broken.payload.error);
      assert.doesNotMatch(message, /\{/);
      assert.doesNotMatch(message, /charge/);
    } finally {
      process.env.RATE_CARD_JSON = saved;
      resetRateCardCache();
    }
  });

  test("the local server serves the page and the same range", async () => {
    const server = await start(0);
    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const base = `http://127.0.0.1:${address.port}`;
      const page = await fetch(`${base}/`);
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.match(html, /Indicative scaffold estimate/);
      assert.match(html, /Something else/);
      assert.doesNotMatch(html, /\$\d/);

      const script = await (await fetch(`${base}/app.js`)).text();
      assert.equal(script, readFileSync(new URL("../public/app.js", import.meta.url), "utf8"));
      assert.doesNotMatch(script, SECRET);

      const priced = await fetch(`${base}/api/estimate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ height: 9, perimeter: 81, weeks: 1, system: "kwikstage" }),
      });
      const payload = (await priced.json()) as { low: number; high: number };
      assert.equal(priced.status, 200);
      assert.equal(payload.low, 39100);
      assert.equal(payload.high, 58400);

      const missing = await fetch(`${base}/secret.json`);
      assert.equal(missing.status, 404);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });
});
