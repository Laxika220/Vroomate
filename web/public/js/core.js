import { get } from "./api.js";
import { h, icon } from "./ui.js";

export const state = { me: null, cfg: null, badges: { matches: 0, rides: 0 } };
export const views = {};                 // name -> async (arg, opts) => Node | {node, bare}
export const registerView = (name, fn) => { views[name] = fn; };

export const nav = (path) => { if (location.hash === "#" + path) window.dispatchEvent(new Event("hashchange")); else location.hash = "#" + path; };

export async function refreshMe() {
  try { state.me = (await get("/api/me")).user; } catch { state.me = null; }
  return state.me;
}

export const stopById = (id) => (state.cfg ? state.cfg.stops.find((s) => s.id === id) : null);
export const stopName = (id) => (stopById(id) ? stopById(id).short : id);
export const stopOptions = () => state.cfg.stops.map((s) => ({ value: s.id, label: s.name }));

/** Estimated fare for a leg: per-km rate x km x seats, rounded to nearest rupee. */
export function legKm(a, b) { const x = stopById(a), y = stopById(b); return x && y ? Math.abs(x.km - y.km) : 0; }

/** Two stops joined by a line, with optional times on the right. */
export function routeView(a, b, aSub, bSub) {
  return h("div", { class: "route" },
    h("span", { class: "mk o" }), h("b", null, stopName(a)), h("small", { class: "mono" }, aSub || ""),
    h("span", { class: "ln" }), h("span"), h("span"),
    h("span", { class: "mk" }), h("b", null, stopName(b)), h("small", { class: "mono" }, bSub || ""));
}
/** Screen title with a back button. */
export const backHead = (href, title, extra) => h("div", { class: "row" },
  h("a", { class: "iconbtn", href, "aria-label": "Back" }, icon("back")), h("h1", { class: "grow", style: { fontSize: "22px" } }, title), extra);
