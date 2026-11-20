# Indicative scaffold estimate

Client-facing page for Elite Access Solutions, a scaffolding company on the Gold Coast. One mobile-first page. No login, no database, no analytics.

A client enters building height, perimeter, and hire duration, then chooses Kwikstage (the default), Lightweight, or something else. Kwikstage and Lightweight return an indicative price range. Something else returns no price. A short form collects a name, phone, email, and job address for a proper quote. In this version that form keeps the details in the page and shows a thank-you. It does not send them anywhere.

Number of storeys is not an input. The rate card does not price it.

## NEEDS BARRY'S SIGN-OFF

These are placeholders. They are not approved client copy.

The priced result uses this sentence, in the API response and on the page:

> Indicative estimate only, not a quote. Based on the details entered and valid for 30 days. Final price confirmed after a site assessment.

Prices are **ex GST**. The page shows **+ GST**. The card's `gst_rate` is not applied. That is a decision for Barry.

The priced result also says:

> Assumes one construction stair, and doesn't include mesh, hop-ups, loading bays, or returns.

Something else / not sure says:

> We can only put an indicative range on Kwikstage and Lightweight. For another system, or if you're not sure, request a proper quote.

Input limits are sanity caps, not rate-card rules. Height must be greater than 0 and at most 400 metres. Perimeter must be greater than 0 and at most 5,000 lineal metres. Hire duration is a whole number of weeks from 1 to 104. Height and perimeter allow at most 3 decimal places. Comma decimals are rejected.

Displayed dollars are ceiled to a whole dollar, then rounded outward to the nearest $100. A hypothetical raw figure of $12,340 (not a card rate) displays as low $12,300 and high $12,400. The offline mid stays $12,340: ceiled to the dollar, not snapped to $100. The browser does not receive mid. A raw total under $100 can display a low of $0.

Quote requests are not delivered. `deliverQuoteRequest` in `public/app.js` is the only place a destination should be plugged in later. It currently returns the four fields and must not fetch or store them. The thank-you says the details are held on this page only.

Do not put this page in front of clients until that function sends the request somewhere Barry has approved, and until the disclaimer, the ex GST treatment, the scope sentence, the input limits, and the $100 rounding have been signed off.

## Run it locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:3000

With no card of your own, the dev server loads `test/fixtures/rate_card.fake.json` and prints a warning. That file is a fake fixture: the real schema, randomised numbers. Those prices are not EAS prices.

### A real card

The real rate card is confidential. Do not commit it, and do not paste it into the page.

```bash
cp /path/to/the/real/card.json rate_card.local.json
npm run dev
```

`rate_card.local.json` is gitignored. You can also pass the JSON in the environment:

```bash
RATE_CARD_JSON="$(cat /path/to/the/real/card.json)" npm run dev
```

`/api/estimate` reads `RATE_CARD_JSON` only. The dev script fills that variable from the file before it listens. A missing or unreadable card is a generic error. The card is not echoed to the browser or the log.

### Check a card offline

```bash
npm run estimate -- --card path.json --height 9 --perimeter 81 --weeks 1 --system kwikstage
```

Prints the indicative label, `ex GST. + GST`, the height used, and low / mid / high. Mid is the default install-rate run so a real card can be checked more tightly than the public range. It is not shown on the page. The card itself is not printed.

The same command against the committed fake fixture:

```bash
npm run estimate -- --card test/fixtures/rate_card.fake.json --height 9 --perimeter 81 --weeks 1 --system kwikstage
```

## How a price is built

`estimate(card, inputs)` in `src/estimate.ts` is the sell total of the internal `calculate_quote` engine for these client defaults:

- board config `3+2`
- scaffold type as chosen
- lineal metres equal to the perimeter entered
- height rounded UP to the nearest 0.5 m before pricing
- weeks as entered
- one construction stair
- RPEQ when that rounded height is above the card's fall threshold (the engine's 4 m fallback applies only when the card omits the field)
- no mesh, hop-ups, deck modifications, mobilisation, loading bays, or returns
- one scaffold
- every other engine argument at its default

Two differences, both Barry's calls:

1. Labour sell, for the install line and the dismantle line, is the ceiled budget hours times the card's charge-out rate per hour. Hours are still computed the way the engine computes them. The engine's own sell splits area times the install rate across those two lines.
2. Low uses the minimum of `labour_rate_selector.difficulty_tiers_per_m2`. High uses the maximum. Both are read from the card and applied even when that rate is not in `internal_options_per_m2`. The public figures are then ceiled to a whole dollar and rounded outward to the nearest $100.

The offline mid run uses `global.install_rate_per_m2`. It does not use the difficulty tier object's `default`, and it does not use the per-type `install_rate_per_m2`. The engine ignores that per-type rate on this path. Flagged for Barry.

No rate, margin, or formula constant is hardcoded. Every number comes from the card or from the engine's own logic, including its fallbacks when a field is missing. GST is not added.

The browser posts height, perimeter, weeks, and system to `POST /api/estimate`. The response is `{ low, high, heightUsedM, label, priceBasis, gstNote, scopeNote }`. It has no line items, rates, tonnage, hours, or margins.

## What is not priced

Left out because the page does not ask for them, or because the engine does not apply them on this path:

- Storeys. An extra `storeys` field on the request is ignored.
- Systems other than Kwikstage and Lightweight, including Layher and the card's phase-3 types. The card cannot auto-price those. The page shows no price.
- Stretcher stairs
- Returns, loading bays, hop-ups, mesh, ply, and encapsulation
- Deck modifications
- Mobilisation
- Nearmap markup
- Board widths and configs other than `3+2`
- More than one scaffold
- A hire split across parties
- Level-by-level hour splits
- Out of hours and overtime
- A labour rate other than the low tier, the card default, and the high tier
- A GST amount
- Cost, margin, crew size, and productivity

The inspection quantity uses the card's `scaffold_inspection.cycle_days`. On the fake fixture that is 18 days. The 30-day sentence on the page is how long the indicative estimate is presented as valid. It is not the inspection cycle.

The card's height-convention sentence is redacted on the fake fixture. Rounding up to 0.5 m is the rule for this page.

Drafting hours are `minimum_hours` plus `additional_hours_per_500m2` for each 500 m² of real area, capped by `max_hours_per_scaffold` when that field exists. The cap and the per-500 m² hours are whatever the card says.

If the card's default install rate sits outside the difficulty tiers, mid can fall outside low and high. It is not clamped. The page only shows low and high.

## Rate card

Rates must not reach the browser, and the real card must not be committed.

`.gitignore` ignores `rate_card*.json` except `test/fixtures/rate_card.fake.json`. That fixture keeps its `FAKE FIXTURE` banner. Do not replace it with a real card.

The internal Python engine is not in this repo. Do not add `quote_calc.py`.

There is no hosting config and no domain. This project is not deployed. `npm run dev` is a local stand-in that serves the page and `POST /api/estimate` on `127.0.0.1`.

## Tests

```bash
npm test
npm run typecheck
```

`test/parity.test.ts` checks the port against `test/fixtures/parity.expected.json`. That file was generated by running the internal engine on the fake card for a grid of heights (including under and over the fall threshold, and under the m² floor), perimeters, weeks 1 / 4 / 5 / 10 / 26, and both systems, then applying the two adjustments above. The expected values are committed. The engine is not.

## Assumptions

- One construction stair, config `3+2`, and one scaffold are the client defaults.
- Height is rounded once, before pricing and before the fall-threshold check. The comparison is a strict greater-than.
- Labour hours follow the engine, including a 2/1 install/dismantle split when the card omits the split. The sell amount then uses those ceiled hours times the charge-out rate.
- Difficulty-tier rates are priced even when they are absent from `internal_options_per_m2`. That list only restricts the internal selector.
- Display rounding ceils to a whole dollar first, using the engine's whole-dollar-up after a half-even cent round. Low then moves down to a $100 boundary and stays put when it is already on one. High moves up, and stays put when it is already on one. Mid is not snapped to $100 and is not sent to the browser.
- A total under $100 can show a low of $0.
- Prices stay ex GST, with a "+ GST" note, until Barry decides otherwise.
- The input caps above are sanity limits, not card rules.
- The quote form does not ask for the measurements again. Those stay in separate page state. Running the estimator again hides the thank-you. The last submitted details stay in memory.
- Something else does not show the 30-day sentence, because there is no price.
- `npm run dev` may fall back to the fake fixture and will say so. `/api/estimate` will not. It only reads `RATE_CARD_JSON`.
- Nothing in the quote form is sent, stored, or analysed. The thank-you does not claim the request was delivered.
