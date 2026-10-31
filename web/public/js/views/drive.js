import { h, icon, toast, empty, sheet } from "../ui.js";
import { get, post } from "../api.js";
import { state, registerView, nav, refreshMe } from "../core.js";

const STATUS = { pending: ["warn", "Under review"], approved: ["good", "Approved"], rejected: ["bad", "Needs changes"] };
const tag = (s) => h("span", { class: "tag " + STATUS[s][0] }, STATUS[s][1]);

registerView("drive", async () => {
  const info = await get("/api/driver");
  const d = info.driver;
  const node = h("div", { class: "stack", style: { gap: "16px" } },
    h("div", { class: "row" }, h("a", { class: "iconbtn", href: "#/profile", "aria-label": "Back" }, icon("back")), h("h1", { style: { fontSize: "26px" } }, "Driver verification")));

  if (!d || d.status === "rejected") {
    const lic = h("input", { id: "d_lic", placeholder: "e.g. MH1420190001234", maxlength: 20, autocomplete: "off" });
    const note = h("textarea", { id: "d_note", maxlength: 300, placeholder: "Optional: how long you've driven, usual route, anything the team should know" });
    const err = h("p", { class: "err", role: "alert", hidden: true });
    const btn = h("button", { class: "btn primary block", onclick: async () => {
      err.hidden = true; btn.disabled = true;
      try { await post("/api/driver", { licence_no: lic.value, id_note: note.value }); await refreshMe(); toast("Submitted for review"); nav("/drive"); }
      catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    } }, d ? "Resubmit" : "Submit for review");
    node.append(
      d && d.review_note && h("div", { class: "panel" }, h("p", { class: "err" }, "Reviewer note"), h("p", null, d.review_note)),
      h("p", { class: "muted" }, "The Vroomate team checks your licence and approves each vehicle before you can publish trips. Your licence number is only visible to reviewers."),
      h("div", { class: "field" }, h("label", { for: "d_lic" }, "Driving licence number"), lic),
      h("div", { class: "field" }, h("label", { for: "d_note" }, "About you as a driver"), note), err, btn);
    return node;
  }
  node.append(h("div", { class: "panel row between" }, h("div", null, h("b", null, "Driver status"), h("p", { class: "hint" }, d.status === "approved" ? "You can publish trips with approved vehicles." : "We'll notify you when the review is done.")), tag(d.status)));

  node.append(h("div", { class: "row between" }, h("h2", null, "Your vehicles"), h("button", { class: "btn small primary", onclick: () => addVehicle(node) }, "Add vehicle")));
  node.append(...(info.vehicles.length ? info.vehicles.map((v) => h("div", { class: "panel row" },
    h("span", { style: { width: "28px", color: "var(--lav)" } }, icon("car")),
    h("div", { class: "grow" }, h("b", null, `${v.model} · ${v.colour}`), h("p", { class: "hint mono" }, `${v.plate} · ${v.seats} passenger seat${v.seats > 1 ? "s" : ""}`), v.review_note && h("p", { class: "err" }, v.review_note)), tag(v.status)))
    : [empty("car", "No vehicles yet", "Add the car or bike you'll drive. It's approved once the team checks the registration.")]));
  return node;
});

function addVehicle() {
  sheet((body, close) => {
    const f = {
      kind: h("select", { id: "v_kind" }, ["car", "suv", "van", "bike"].map((k) => h("option", { value: k }, k.toUpperCase()))),
      model: h("input", { id: "v_model", placeholder: "e.g. Maruti Swift", maxlength: 40 }),
      colour: h("input", { id: "v_colour", placeholder: "e.g. White", maxlength: 20 }),
      plate: h("input", { id: "v_plate", placeholder: "MH12AB1234", maxlength: 14, autocapitalize: "characters" }),
      seats: h("input", { id: "v_seats", type: "number", min: 1, max: 8, value: 3 }),
    };
    f.kind.addEventListener("change", () => { f.seats.max = f.kind.value === "bike" ? 1 : 8; if (f.kind.value === "bike") f.seats.value = 1; });
    const err = h("p", { class: "err", role: "alert", hidden: true });
    const save = h("button", { class: "btn primary block", onclick: async () => {
      save.disabled = true; err.hidden = true;
      try { await post("/api/vehicles", { kind: f.kind.value, model: f.model.value, colour: f.colour.value, plate: f.plate.value, seats: Number(f.seats.value) }); toast("Vehicle submitted"); close(); nav("/drive"); window.dispatchEvent(new Event("hashchange")); }
      catch (x) { err.textContent = x.message; err.hidden = false; save.disabled = false; }
    } }, "Submit vehicle");
    body.append(h("h2", null, "Add vehicle"),
      h("div", { class: "field" }, h("label", { for: "v_kind" }, "Type"), f.kind),
      h("div", { class: "two" }, h("div", { class: "field" }, h("label", { for: "v_model" }, "Model"), f.model), h("div", { class: "field" }, h("label", { for: "v_colour" }, "Colour"), f.colour)),
      h("div", { class: "two" }, h("div", { class: "field" }, h("label", { for: "v_plate" }, "Registration no."), f.plate), h("div", { class: "field" }, h("label", { for: "v_seats" }, "Passenger seats"), f.seats)),
      err, save);
  });
}
