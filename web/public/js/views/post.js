import { h, icon, toast, istToMs, msToIst, inr, mount } from "../ui.js";
import { get, post } from "../api.js";
import { state, registerView, nav, legKm } from "../core.js";

function stopSelect(id, value) {
  const s = h("select", { id }, state.cfg.stops.map((x) => h("option", { value: x.id }, x.name)));
  s.value = value; return s;
}
/** Start/destination pair with a swap button. */
function legFields(prefix, o, d) {
  const from = stopSelect(prefix + "_from", o), to = stopSelect(prefix + "_to", d);
  const swap = h("button", { type: "button", class: "iconbtn", "aria-label": "Swap start and destination", style: { alignSelf: "flex-end", flex: "none" },
    onclick: () => { const t = from.value; from.value = to.value; to.value = t; from.dispatchEvent(new Event("change")); } }, icon("route"));
  const node = h("div", { class: "stack" },
    h("div", { class: "field" }, h("label", { for: prefix + "_from" }, "From"), from),
    h("div", { class: "row" }, h("div", { class: "grow", style: { height: "1px", background: "var(--line)" } }), swap, h("div", { class: "grow", style: { height: "1px", background: "var(--line)" } })),
    h("div", { class: "field" }, h("label", { for: prefix + "_to" }, "To"), to));
  return { node, from, to };
}
const soon = (mins) => msToIst(Math.ceil((Date.now() + mins * 60000) / 900000) * 900000);

registerView("post", async (arg) => {
  const mode = arg === "request" ? "request" : "offer";
  const wrap = h("div", { class: "stack", style: { gap: "16px" } });
  const seg = h("div", { class: "two" },
    ...[["offer", "Offer a ride", "car"], ["request", "Request a ride", "users"]].map(([id, label, ic]) =>
      h("button", { class: "chip" + (mode === id ? " on" : ""), "aria-pressed": String(mode === id), style: { justifyContent: "center", minHeight: "48px" }, onclick: () => nav("/post/" + id) }, icon(ic), label)));
  [...seg.querySelectorAll("svg")].forEach((s) => { s.style.width = "20px"; s.style.height = "20px"; });
  mount(wrap, h("div", { class: "row between" }, h("h1", { style: { fontSize: "28px" } }, "Post"), h("a", { class: "btn small", href: "#/radar" }, icon("radar"), "Ride Radar")), seg);
  mount(wrap, mode === "offer" ? await offerForm() : requestForm());
  return wrap;
});

async function offerForm() {
  const me = state.me;
  const info = await get("/api/driver");
  if (!info.driver || info.driver.status !== "approved") {
    const st = info.driver && info.driver.status;
    return h("div", { class: "empty" }, icon("shield"),
      h("h3", null, st === "pending" ? "Your verification is being reviewed" : st === "rejected" ? "Verification needs changes" : "Verify to offer rides"),
      h("p", null, st === "pending" ? "You can publish trips as soon as the Vroomate team approves your licence and vehicle." : st === "rejected" ? (info.driver.review_note || "Open driver verification to resubmit.") : "Riders trust approved drivers. Submit your licence and vehicle once; it takes two minutes."),
      h("a", { class: "btn primary", href: "#/drive" }, st === "pending" ? "View status" : "Start verification"));
  }
  const okVehicles = info.vehicles.filter((v) => v.status === "approved");
  if (!okVehicles.length) return h("div", { class: "empty" }, icon("car"), h("h3", null, "Add an approved vehicle"), h("p", null, "Your licence is approved. Add a vehicle and wait for approval to publish trips."), h("a", { class: "btn primary", href: "#/drive" }, "Add a vehicle"));

  const leg = legFields("o", "lavasa-campus", "pune-station");
  const veh = h("select", { id: "o_veh" }, okVehicles.map((v) => h("option", { value: v.id }, `${v.model} · ${v.plate} · ${v.seats} seats`)));
  const when = h("input", { id: "o_when", type: "datetime-local", value: soon(120), min: soon(15) });
  const seats = h("input", { id: "o_seats", type: "number", min: 1, max: 8, value: Math.min(3, okVehicles[0].seats) });
  const rate = h("input", { id: "o_rate", type: "number", min: 0, max: state.cfg.maxFarePerKmInr, step: "0.5", value: state.cfg.suggestedFarePerKmInr });
  const notes = h("input", { id: "o_notes", maxlength: 160, placeholder: "Pickup spot, luggage, music, AC" });
  const women = h("input", { id: "o_women", type: "checkbox" });
  const preview = h("p", { class: "hint" });
  const err = h("p", { class: "err", role: "alert", hidden: true });
  const upd = () => {
    const km = legKm(leg.from.value, leg.to.value);
    const v = okVehicles.find((x) => x.id == veh.value); seats.max = v ? v.seats : 8;
    preview.textContent = `${km} km. A rider travelling the whole way pays about ${inr(km * Number(rate.value || 0))} per seat. Riders joining part-way pay for their distance only.`;
  };
  [leg.from, leg.to, veh, rate].forEach((e) => e.addEventListener("input", upd)); upd();
  const btn = h("button", { class: "btn primary block", onclick: async () => {
    err.hidden = true; btn.disabled = true;
    try {
      await post("/api/trips", { vehicle_id: Number(veh.value), origin_stop: leg.from.value, dest_stop: leg.to.value, depart_at: istToMs(when.value), seats: Number(seats.value), fare_per_km_seat: Number(rate.value), notes: notes.value, women_only: women.checked });
      toast("Trip published. Riders can find it now."); nav("/rides");
    } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  } }, "Publish trip");
  return h("div", { class: "stack" },
    leg.node,
    h("div", { class: "field" }, h("label", { for: "o_veh" }, "Vehicle"), veh),
    h("div", { class: "field" }, h("label", { for: "o_when" }, "Departs (IST)"), when),
    h("div", { class: "two" },
      h("div", { class: "field" }, h("label", { for: "o_seats" }, "Seats offered"), seats),
      h("div", { class: "field" }, h("label", { for: "o_rate" }, "Fare per km (₹)"), rate)),
    preview,
    h("div", { class: "field" }, h("label", { for: "o_notes" }, "Notes"), notes),
    me.gender === "f" && h("label", { class: "check", for: "o_women" }, women, h("span", null, "Women-only trip")),
    err, btn);
}

function requestForm() {
  const leg = legFields("r", "pune-station", "lavasa-campus");
  const day = h("input", { id: "r_day", type: "date", value: soon(180).slice(0, 10) });
  const from = h("input", { id: "r_from_t", type: "time", value: soon(180).slice(11, 16) });
  const to = h("input", { id: "r_to_t", type: "time", value: soon(300).slice(11, 16) });
  const seats = h("input", { id: "r_seats", type: "number", min: 1, max: 8, value: 1 });
  const fare = h("input", { id: "r_fare", type: "number", min: 0, step: 10, placeholder: "Optional" });
  const note = h("input", { id: "r_note", maxlength: 160, placeholder: "Anything drivers should know" });
  const err = h("p", { class: "err", role: "alert", hidden: true });
  const btn = h("button", { class: "btn primary block", onclick: async () => {
    err.hidden = true; btn.disabled = true;
    try {
      const e = istToMs(`${day.value}T${from.value}`); let l = istToMs(`${day.value}T${to.value}`);
      if (l < e) l += 86400000;
      await post("/api/requests", { origin_stop: leg.from.value, dest_stop: leg.to.value, earliest_at: e, latest_at: l, seats: Number(seats.value), max_fare: fare.value, note: note.value });
      toast("Request posted. We'll tell you when a matching trip appears."); nav("/rides");
    } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  } }, "Post request");
  return h("div", { class: "stack" },
    h("p", { class: "muted" }, "Tell drivers and other travellers when you need to go. Your request appears in Ride Radar, and you can match with people on the same route."),
    leg.node,
    h("div", { class: "field" }, h("label", { for: "r_day" }, "Day"), day),
    h("div", { class: "two" },
      h("div", { class: "field" }, h("label", { for: "r_from_t" }, "Leave after"), from),
      h("div", { class: "field" }, h("label", { for: "r_to_t" }, "Leave before"), to)),
    h("div", { class: "two" },
      h("div", { class: "field" }, h("label", { for: "r_seats" }, "Seats needed"), seats),
      h("div", { class: "field" }, h("label", { for: "r_fare" }, "Max fare ₹"), fare)),
    h("div", { class: "field" }, h("label", { for: "r_note" }, "Note"), note),
    err, btn);
}
