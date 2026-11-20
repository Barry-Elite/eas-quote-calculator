/** Stable dollar text for the CLI. The page has its own copy so the engine is not shipped to the browser. */
export function formatDollars(amount: number): string {
  const negative = amount < 0;
  const whole = Math.abs(Math.round(amount));
  const body = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${body}`;
}

export function formatMeasure(amount: number): string {
  const rounded = Math.round(amount * 1000) / 1000;
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}
