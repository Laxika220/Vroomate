import { h, icon, toast, istToMs, msToIst, inr } from "../ui.js";
import { get, post } from "../api.js";
import { state, registerView, nav, legKm } from "../core.js";
import { withVerifiedPhone } from "./verify.js";

/** From/To stop pickers joined by a line, with a swap button. */
function whereFields(o, d, onChange) {
  const sel = (label, v) => { const s = h("select", { "aria-label": label }, state.cfg.stops.map((x) => h("option", { value: x.id }, x.short))); s.value = v; s.addEventListener("change", onChange); return s; };
  const from = sel("From", o), to = sel("To", d);
  const swap = h("button", { type: "button", class: "swap", "aria-label": "Swap from and to", onclick: () => { [from.value, to.value] = [to.value, from.value]; onChange(); } }, icon("swap"));
  return { node: h("div", { class: "where" }, h("span", { class: "mk o" }), from, swap, h("span", { class: "sep" }), h("span", { class: "mk" }), to), from, to };
}
const field = (id, label, input, hint) => h("div", { class: "field" }, h("label", { for: id }, label), input, hint && h("p", { class: "hint" }, hint));
const soon = (mins) => msToIst(Math.ceil((Date.now() + mins * 60000) / 900000) * 900000);
const options = (n, word) => Array.from({ length: n }, (_, k) => h("option", { value: k + 1 }, `${k + 1} ${word}${k ? "s" : ""}`));

registerView("offer", async (arg) => {
  const mode = arg === "request" ? "request" : "offer";
  const tabs = h("div", { class: "tabs big" }, ...[["offer", "Offer a ride"], ["request", "Need a ride"]].map(([id, l]) =>
    h("button", { "aria-pressed": String(mode === id), onclick: () => nav(id === "offer" ? "/offer" : "/offer/request") }, l)));
  return h("div", { class: "stack", style: { gap: "18px" } }, tabs,
    mode === "offer" ? await offerForm() : requestForm());
});

async function offerForm() {
  const { vehicles } = await get("/api/vehicles").catch(() => ({ vehicles: [] }));
  const car = vehicles[0] || {};
  const preview = h("p", { class: "hint" });
  const where = whereFields("lavasa-campus", "pune-station", () => upd());
  const when = h("input", { id: "o_when", type: "datetime-local", value: soon(120), min: soon(15) });
  const seats = h("select", { id: "o_seats" }, options(6, "seat")); seats.value = "3";
  const price = h("input", { id: "o_price", type: "number", inputmode: "numeric", min: 0, step: 5 });
  const model = h("input", { id: "o_model", maxlength: 40, placeholder: "Maruti Swift", value: car.model || "" });
  const colour = h("input", { id: "o_colour", maxlength: 20, placeholder: "White", value: car.colour || "" });
  const plate = h("input", { id: "o_plate", maxlength: 14, placeholder: "MH12AB1234", autocapitalize: "characters", value: car.plate || "" });
  const notes = h("input", { id: "o_notes", maxlength: 160, placeholder: "Pickup at main gate, space for one bag" });
  const women = h("input", { id: "o_women", type: "checkbox" });
  const err = h("p", { class: "err", role: "alert", hidden: true });
  let suggested = 0;
  function upd() {
    const km = legKm(where.from.value, where.to.value);
    const wasSuggested = !price.value || Number(price.value) === suggested;
    suggested = Math.round((km * state.cfg.suggestedFarePerKmInr) / 5) * 5;
    if (wasSuggested) price.value = suggested || "";
    preview.textContent = km ? `${km} km. Suggested ${inr(suggested)}. People joining part-way pay less.` : "";
  }
  upd();
  const btn = h("button", { class: "btn primary block", onclick: async () => {
    err.hidden = true; btn.disabled = true;
    try {
      await withVerifiedPhone(() => post("/api/trips", { origin_stop: where.from.value, dest_stop: where.to.value, depart_at: istToMs(when.value), seats: Number(seats.value),
        price_per_seat: price.value, notes: notes.value, women_only: women.checked, vehicle: { model: model.value, colour: colour.value, plate: plate.value } }));
      toast("Your ride is live"); nav("/rides");
    } catch (x) { if (!x.quiet) { err.textContent = x.message; err.hidden = false; } btn.disabled = false; }
  } }, "Post ride");
  return h("div", { class: "stack", style: { gap: "16px" } },
    where.node,
    field("o_when", "Leaving at", when),
    h("div", { class: "two" }, field("o_seats", "Empty seats", seats), field("o_price", "Price per seat (₹)", price)),
    preview,
    h("h3", { style: { marginTop: "8px" } }, "Your car"),
    h("div", { class: "two" }, field("o_model", "Model", model), field("o_colour", "Colour", colour)),
    field("o_plate", "Number plate", plate, "Shown to passengers once you accept them."),
    field("o_notes", "Note (optional)", notes),
    state.me.gender === "f" && h("label", { class: "check", for: "o_women" }, women, h("span", null, "Women only")),
    err, btn);
}

function requestForm() {
  const where = whereFields("pune-station", "lavasa-campus", () => {});
  const day = h("input", { id: "r_day", type: "date", value: soon(180).slice(0, 10) });
  const from = h("input", { id: "r_from_t", type: "time", value: soon(180).slice(11, 16) });
  const to = h("input", { id: "r_to_t", type: "time", value: soon(300).slice(11, 16) });
  const seats = h("select", { id: "r_seats" }, options(4, "seat"));
  const note = h("input", { id: "r_note", maxlength: 160, placeholder: "Anything drivers should know" });
  const err = h("p", { class: "err", role: "alert", hidden: true });
  const btn = h("button", { class: "btn primary block", onclick: async () => {
    err.hidden = true; btn.disabled = true;
    try {
      const e = istToMs(`${day.value}T${from.value}`); let l = istToMs(`${day.value}T${to.value}`);
      if (l < e) l += 86400000;
      await post("/api/requests", { origin_stop: where.from.value, dest_stop: where.to.value, earliest_at: e, latest_at: l, seats: Number(seats.value), note: note.value });
      toast("Request posted"); nav("/rides/requests");
    } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  } }, "Post request");
  return h("div", { class: "stack", style: { gap: "16px" } },
    h("p", { class: "muted" }, "Drivers going your way get notified, and others on your route can find you under Co-riders."),
    where.node,
    field("r_day", "Date", day),
    h("div", { class: "two" }, field("r_from_t", "Earliest", from), field("r_to_t", "Latest", to)),
    field("r_seats", "Seats", seats),
    field("r_note", "Note (optional)", note),
    err, btn);
}
