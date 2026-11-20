// Client page for the indicative estimate.
// Prices come only from POST /api/estimate. This file must not contain rates.
// Quote details stay in this page's memory until deliverQuoteRequest is replaced.

// ===========================================================================
// PLUG-IN POINT — quote request delivery
// NEEDS BARRY'S SIGN-OFF before this is pointed at email, a CRM, or anything else.
// v1 keeps the request in page memory only: no network call, no storage, no analytics.
// Replace the body of deliverQuoteRequest when a destination exists.
// ===========================================================================
function deliverQuoteRequest(details) {
  return {
    name: details.name,
    phone: details.phone,
    email: details.email,
    jobAddress: details.jobAddress,
  };
}

const state = {
  job: null,
  estimate: null,
  unpriced: false,
  loading: false,
  quoteOpen: false,
  showThanks: false,
  // Last submitted details. Kept when a new estimate is run; the thank-you hides.
  quoteRequest: null,
};

let requestId = 0;

const out = document.querySelector("#out");
const jobForm = document.querySelector("#job-form");

jobForm.addEventListener("submit", onJobSubmit);
for (const input of jobForm.querySelectorAll('input[name="system"]')) {
  input.addEventListener("change", syncButton);
}
syncButton();

function syncButton() {
  const button = document.querySelector("#show-estimate");
  if (button.disabled) return;
  button.textContent = selectedSystem() === "other" ? "Continue" : "Show indicative estimate";
}

function selectedSystem() {
  const picked = document.querySelector('input[name="system"]:checked');
  return picked ? picked.value : "kwikstage";
}

function setBusy(busy) {
  const button = document.querySelector("#show-estimate");
  button.disabled = busy;
  button.setAttribute("aria-busy", busy ? "true" : "false");
  if (busy) button.textContent = "Working out the range…";
  else syncButton();
}

async function onJobSubmit(event) {
  event.preventDefault();
  clearJobErrors();
  if (selectedSystem() === "other") {
    requestId += 1;
    setBusy(false);
    state.loading = false;
    state.job = null;
    state.estimate = null;
    state.unpriced = true;
    state.quoteOpen = false;
    state.showThanks = false;
    render();
    return;
  }

  const job = readJob();
  if (job.errors) {
    showJobErrors(job.errors);
    requestId += 1;
    setBusy(false);
    state.loading = false;
    state.estimate = null;
    state.unpriced = false;
    state.quoteOpen = false;
    state.showThanks = false;
    render();
    return;
  }

  const id = ++requestId;
  state.loading = true;
  state.estimate = null;
  state.unpriced = false;
  state.quoteOpen = false;
  state.showThanks = false;
  render();
  setBusy(true);
  try {
    const response = await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        height: job.height,
        perimeter: job.perimeter,
        weeks: job.weeks,
        system: job.system,
      }),
    });
    if (id !== requestId) return;
    const data = await response.json().catch(() => null);
    state.loading = false;
    if (!response.ok) {
      const message = data && typeof data.error === "string" ? data.error.slice(0, 300) : "We couldn't price that. Check the details and try again.";
      showJobBanner(message);
      render();
      return;
    }
    if (!isPayload(data)) {
      showJobBanner("We couldn't read a price range just now. Request a proper quote instead.");
      render();
      return;
    }
    state.job = job;
    state.estimate = data;
    render();
  } catch {
    if (id !== requestId) return;
    state.loading = false;
    showJobBanner("We couldn't reach the estimator. Check your connection and try again.");
    render();
  } finally {
    if (id === requestId) setBusy(false);
  }
}

function readJob() {
  const errors = {};
  const height = readMeasure(
    document.querySelector("#height"),
    "Enter the building height in metres.",
    "Enter the building height as a number of metres, like 8 or 8.5.",
  );
  const perimeter = readMeasure(
    document.querySelector("#perimeter"),
    "Enter the perimeter in lineal metres.",
    "Enter the perimeter as a number of lineal metres.",
  );
  const weeks = readWeeks(document.querySelector("#weeks"));
  if (height.error) errors.height = height.error;
  if (perimeter.error) errors.perimeter = perimeter.error;
  if (weeks.error) errors.weeks = weeks.error;
  if (Object.keys(errors).length) return { errors };
  return { height: height.value, perimeter: perimeter.value, weeks: weeks.value, system: selectedSystem() };
}

function readMeasure(input, emptyMessage, numberMessage) {
  const raw = input.value.trim();
  if (!raw) return { error: emptyMessage };
  if (raw.includes(",")) return { error: "Use a dot for decimals, not a comma." };
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(raw)) return { error: numberMessage };
  return { value: Number(raw) };
}

function readWeeks(input) {
  const raw = input.value.trim();
  if (!raw) return { error: "Enter the hire duration in weeks." };
  if (!/^\d{1,3}$/.test(raw)) return { error: "Enter the hire duration as a whole number of weeks." };
  return { value: Number(raw) };
}

function showJobErrors(errors) {
  for (const [key, message] of Object.entries(errors)) {
    const input = document.querySelector(`#${key}`);
    const slot = document.querySelector(`#${key}-error`);
    if (input) input.setAttribute("aria-invalid", "true");
    if (slot) {
      slot.hidden = false;
      slot.textContent = message;
    }
  }
}

function clearJobErrors() {
  for (const id of ["height", "perimeter", "weeks"]) {
    const input = document.querySelector(`#${id}`);
    const slot = document.querySelector(`#${id}-error`);
    if (input) input.removeAttribute("aria-invalid");
    if (slot) {
      slot.hidden = true;
      slot.textContent = "";
    }
  }
  const banner = document.querySelector("#job-error");
  banner.hidden = true;
  banner.textContent = "";
}

function showJobBanner(message) {
  const banner = document.querySelector("#job-error");
  banner.hidden = false;
  banner.textContent = message;
}

function isPayload(data) {
  if (!data || typeof data !== "object") return false;
  if (!Number.isFinite(data.low) || !Number.isFinite(data.high) || !Number.isFinite(data.heightUsedM)) return false;
  if (typeof data.label !== "string" || data.label.trim() === "") return false;
  if (typeof data.priceBasis !== "string" || data.priceBasis.trim() === "") return false;
  if (typeof data.gstNote !== "string" || data.gstNote.trim() === "") return false;
  if (typeof data.scopeNote !== "string") return false;
  return true;
}

function render() {
  out.replaceChildren();
  if (state.loading) {
    out.append(el("p", "loading", "Working out the range…"));
    return;
  }
  if (state.estimate && state.job) out.append(pricedBlock(state.estimate, state.job));
  else if (state.unpriced) out.append(unpricedBlock());
  if (state.quoteOpen && !state.showThanks) out.append(quoteFormBlock());
  if (state.showThanks && state.quoteRequest) out.append(thanksBlock(state.quoteRequest));
  if (out.childElementCount) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    out.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }
}

function pricedBlock(data, job) {
  const card = el("section", "result");
  card.append(el("h2", null, "Indicative estimate"));
  const price = el("p", "price");
  if (data.low === data.high) price.append(el("span", "amount", formatDollars(data.low)));
  else price.append(el("span", "amount", formatDollars(data.low)), el("span", "to", "to"), el("span", "amount", formatDollars(data.high)));
  card.append(price);
  const basis = el("p", "basis");
  basis.append(el("span", null, data.priceBasis), el("span", "gst", data.gstNote));
  card.append(basis, el("p", "meta", summaryLine(data, job)));
  if (data.scopeNote.trim()) card.append(el("p", "scope", data.scopeNote));
  card.append(el("p", "disclaimer", data.label));
  if (!state.quoteOpen && !state.showThanks) card.append(requestButton());
  return card;
}

function summaryLine(data, job) {
  const used = data.heightUsedM;
  const height = Math.abs(job.height - used) > 1e-6
    ? `${formatMeasure(used)} m building height (entered ${formatMeasure(job.height)} m, rounded up to the nearest 0.5 m)`
    : `${formatMeasure(used)} m building height`;
  const weeks = `${job.weeks} ${job.weeks === 1 ? "week" : "weeks"}`;
  const system = job.system === "lightweight" ? "Lightweight" : "Kwikstage";
  return `${height} · ${formatMeasure(job.perimeter)} lineal metres · ${weeks} · ${system}`;
}

function unpricedBlock() {
  const card = el("section", "unpriced");
  card.append(el("h2", null, "We'll price this one properly"));
  card.append(el("p", null, "We can only put an indicative range on Kwikstage and Lightweight. For another system, or if you're not sure, request a proper quote."));
  if (!state.quoteOpen && !state.showThanks) card.append(requestButton());
  return card;
}

function requestButton() {
  const button = el("button", null, "Request a proper quote");
  button.type = "button";
  button.id = "request-quote";
  button.addEventListener("click", () => {
    state.quoteOpen = true;
    state.showThanks = false;
    render();
    const first = document.querySelector("#contact-name");
    if (first) first.focus();
  });
  return button;
}

function quoteFormBlock() {
  const card = el("form", "quote");
  card.id = "quote-form";
  card.noValidate = true;
  card.addEventListener("submit", onQuoteSubmit);
  card.append(el("h2", null, "Request a proper quote"));
  card.append(el("p", null, state.estimate
    ? "This follows the indicative range above. It is not a confirmed quote."
    : "No price has been calculated for this one."));
  card.append(el("p", null, "Name, phone, email, and the job address. That's all this form asks for."));
  card.append(contactField("contact-name", "Name", "text", "name"));
  card.append(contactField("contact-phone", "Phone", "tel", "tel"));
  card.append(contactField("contact-email", "Email", "email", "email"));
  card.append(contactField("contact-address", "Job address", "textarea", "street-address"));
  const banner = el("p", "form-error");
  banner.id = "contact-error";
  banner.hidden = true;
  banner.setAttribute("role", "alert");
  const submit = el("button", null, "Submit details");
  submit.type = "submit";
  submit.id = "contact-submit";
  card.append(banner, submit, el("p", "note", "Details stay on this page. They are not sent yet."));
  return card;
}

function contactField(id, label, kind, autocomplete) {
  const wrap = el("div", "field");
  const lab = el("label", null, label);
  lab.htmlFor = id;
  const input = kind === "textarea" ? el("textarea") : el("input");
  if (kind === "textarea") input.rows = 3;
  else input.type = kind;
  input.id = id;
  input.name = id;
  input.autocomplete = autocomplete;
  input.maxLength = id === "contact-address" ? 400 : id === "contact-name" ? 120 : id === "contact-email" ? 160 : 40;
  const error = el("p", "field-error");
  error.id = `${id}-error`;
  error.hidden = true;
  wrap.append(lab, input, error);
  return wrap;
}

function onQuoteSubmit(event) {
  event.preventDefault();
  const name = valueOf("contact-name");
  const phone = valueOf("contact-phone");
  const email = valueOf("contact-email");
  const jobAddress = valueOf("contact-address");
  const errors = {};
  if (name.trim().length < 2) errors["contact-name"] = "Enter your name.";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) errors["contact-phone"] = "Enter a phone number we can call.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors["contact-email"] = "Enter a valid email address.";
  if (jobAddress.trim().length < 5) errors["contact-address"] = "Enter the job address.";
  for (const id of ["contact-name", "contact-phone", "contact-email", "contact-address"]) {
    const input = document.querySelector(`#${id}`);
    const slot = document.querySelector(`#${id}-error`);
    const message = errors[id];
    if (input) {
      if (message) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
    if (slot) {
      slot.hidden = !message;
      slot.textContent = message || "";
    }
  }
  if (Object.keys(errors).length) return;
  state.quoteRequest = deliverQuoteRequest({
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    jobAddress: jobAddress.trim(),
  });
  state.quoteOpen = false;
  state.showThanks = true;
  render();
}

function valueOf(id) {
  const node = document.querySelector(`#${id}`);
  return node ? node.value : "";
}

function thanksBlock(details) {
  const card = el("section", "thanks");
  card.id = "thanks";
  card.append(el("h2", null, "Thank you"));
  card.append(el("p", null, "Your details are held on this page only. Nothing has been sent."));
  const list = el("dl", "details");
  for (const [label, value] of [
    ["Name", details.name],
    ["Phone", details.phone],
    ["Email", details.email],
    ["Job address", details.jobAddress],
  ]) {
    const row = el("div");
    row.append(el("dt", null, label), el("dd", null, value));
    list.append(row);
  }
  card.append(list);
  return card;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDollars(amount) {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  const body = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${body}`;
}

function formatMeasure(amount) {
  const rounded = Math.round(amount * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
