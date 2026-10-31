import { h, icon, empty, fmtWhen, fmtTime, inr } from "../ui.js";
import { get } from "../api.js";
import { state, registerView, nav, stopName } from "../core.js";

registerView("radar", async () => {
  const r = await get("/api/radar");
  const head = h("div", { class: "row" }, h("a", { class: "iconbtn", href: "#/post", "aria-label": "Back" }, icon("back")), h("h1", { style: { fontSize: "26px" } }, "Ride Radar"));
  const blurb = h("p", { class: "muted" }, "Riders who need a trip nobody has published yet, grouped by route and time. Names stay private until someone requests a seat on your trip.");
  const demand = r.demand.length ? r.demand.map((d) => h("div", { class: "panel stack", style: { gap: "10px" } },
    h("div", { class: "row between" }, h("b", { style: { fontSize: "17px" } }, `${stopName(d.from)} to ${stopName(d.to)}`), h("span", { class: "tag warn" }, `${d.unserved} waiting`)),
    h("p", { class: "muted" }, `${fmtWhen(d.earliest_at)} to ${fmtTime(d.latest_at)} · ${d.km} km`),
    h("div", { class: "row wrap" }, h("span", { class: "tag" }, `${d.riders} rider${d.riders > 1 ? "s" : ""}`), h("span", { class: "tag" }, `${d.seats} seat${d.seats > 1 ? "s" : ""} wanted`), d.avg_max_fare && h("span", { class: "tag" }, `avg budget ${inr(d.avg_max_fare)}`)),
    state.me.driver && state.me.driver.status === "approved" ? h("a", { class: "btn primary small", href: "#/post/offer" }, "Publish a trip") : h("a", { class: "btn small", href: "#/drive" }, "Become a driver to serve this"))) : [empty("radar", "No unserved demand", "Every open ride request currently has a matching trip. New demand shows up here as riders post requests.")];
  const mine = r.mine.length ? [h("h2", null, "Your requests"), ...r.mine.map((m) => h("div", { class: "panel stack", style: { gap: "6px" } },
    h("b", null, `${stopName(m.origin_stop)} to ${stopName(m.dest_stop)}`), h("p", { class: "muted" }, `${fmtWhen(m.earliest_at)}`),
    h("p", null, m.drivers_available ? `${m.drivers_available} driver trip${m.drivers_available > 1 ? "s" : ""} can take you. ` : "No drivers yet. ", `${m.others} other traveller${m.others === 1 ? "" : "s"} want a similar trip.`),
    m.drivers_available > 0 && h("button", { class: "btn small primary", onclick: () => nav("/discover") }, "See drivers")))] : [];
  return h("div", { class: "stack", style: { gap: "14px" } }, head, blurb, h("div", { class: "radar", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("b")),
    h("p", { class: "hint", style: { textAlign: "center" } }, `Drivers are alerted when ${r.threshold}+ riders need the same trip.`), ...demand, ...mine);
});
