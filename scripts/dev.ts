import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { start } from "./server.ts";

function parseOrDie(raw: string): void {
  try {
    JSON.parse(raw);
  } catch {
    console.error("Rate card JSON could not be parsed. The contents were not printed.");
    process.exit(1);
  }
}

function warnIfFake(raw: string, label: string): void {
  if (raw.includes("FAKE FIXTURE")) {
    console.warn(`WARNING: ${label} is marked FAKE FIXTURE. Do not treat these prices as real.`);
  }
}

function loadCardIntoEnv(): void {
  if (process.env.RATE_CARD_JSON?.trim()) {
    parseOrDie(process.env.RATE_CARD_JSON);
    warnIfFake(process.env.RATE_CARD_JSON, "RATE_CARD_JSON");
    console.log(`Using RATE_CARD_JSON (${process.env.RATE_CARD_JSON.length} bytes). Contents not printed.`);
    return;
  }

  const requested = process.env.RATE_CARD_FILE
    ? resolve(process.env.RATE_CARD_FILE)
    : resolve("rate_card.local.json");
  let source = requested;
  let usingFake = false;
  if (!existsSync(source)) {
    source = resolve("test/fixtures/rate_card.fake.json");
    usingFake = true;
  }
  if (!existsSync(source)) {
    console.error("No rate card. Set RATE_CARD_JSON or add rate_card.local.json.");
    process.exit(1);
  }

  const raw = readFileSync(source, "utf8");
  parseOrDie(raw);
  process.env.RATE_CARD_JSON = raw;
  console.log(`Loaded rate card from ${source} (${raw.length} bytes). Contents not printed.`);
  if (usingFake) {
    console.warn("No rate_card.local.json found. Using the committed FAKE fixture. Prices are not real.");
    console.warn("For a real card: copy it to rate_card.local.json (gitignored) and restart.");
  } else {
    warnIfFake(raw, source);
  }
}

loadCardIntoEnv();

const port = Number(process.env.PORT ?? 3000);
try {
  const server = await start(port);
  const address = server.address();
  const actual = typeof address === "object" && address ? address.port : port;
  console.log(`Indicative estimate: http://127.0.0.1:${actual}`);
} catch (err) {
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  if (code === "EADDRINUSE") console.error(`Port ${port} is already in use.`);
  else console.error(err instanceof Error ? err.message : "Could not start.");
  process.exit(1);
}
