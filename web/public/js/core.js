import { get } from "./api.js";

export const state = { me: null, cfg: null, badges: { matches: 0 } };
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
