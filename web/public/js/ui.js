// Small DOM + UI helpers. All text goes through textContent, never innerHTML, so user input cannot inject markup.
/** Append children, skipping null/undefined/false (the native append() would print them as text). */
export function mount(el, ...kids) {
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(add);
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value") el.value = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  return mount(el, ...kids);
}

const ICONS = {
  home: '<path d="M4 11l8-7 8 7v9h-5v-6h-6v6H4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M6 15.5V11a3 3 0 0 1 3-3h6.5"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.6 3.7-5.5 7.5-5.5s6.7 1.9 7.5 5.5"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>',
  chat: '<path d="M5 6h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/>',
  swap: '<path d="M8 4v16M8 4L4.5 7.5M8 4l3.5 3.5M16 20V4M16 20l-3.5-3.5M16 20l3.5-3.5"/>',
  flag: '<path d="M6 21V4M6 5h11l-2 4 2 4H6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  shield: '<path d="M12 3l7 3v5.5c0 4.3-3 7.6-7 9.5-4-1.9-7-5.2-7-9.5V6z"/>',
  block: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  cards: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M3 7v10M21 7v10"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z"/>',
  alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/>',
};
/** "4.8 ★ (12)" for someone with ratings, "New" for someone without. */
export const stars = (u) => (u && u.rating_count ? `${u.rating.toFixed(1)} ★ (${u.rating_count})` : "New");
export function icon(name) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICONS[name] || "";   // static strings above only
  return s;
}

export function avatar(u, size) {
  const name = (u && u.name) || "?";
  const parts = name.trim().split(/\s+/);
  const ini = ((parts[0][0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  return h("div", { class: "av" + (size ? " " + size : ""), role: "img", "aria-label": name,
    style: u && u.photo ? { backgroundImage: `url("${u.photo}")` } : null }, u && u.photo ? "" : ini);
}

let toastTimer;
export function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = h("div", { id: "toast", role: "status" }); document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

/** Bottom sheet. Returns {close, body}. */
export function sheet(build) {
  const prev = document.activeElement;
  const body = h("div", { class: "sheet", role: "dialog", "aria-modal": "true" });
  const veil = h("div", { class: "veil", onclick: (e) => { if (e.target === veil) close(); } }, body);
  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() { veil.remove(); document.removeEventListener("keydown", onKey); if (prev && prev.focus) prev.focus(); }
  document.addEventListener("keydown", onKey);
  document.body.append(veil);
  build(body, close);
  const first = body.querySelector("input,select,textarea,button"); if (first) first.focus();
  return { close, body };
}

const IST = "Asia/Kolkata";
export const fmtWhen = (ms) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(ms).replace(/\s?(am|pm)/i, (m) => m.toLowerCase());
export const fmtTime = (ms) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true }).format(ms).replace(/\s?(am|pm)/i, (m) => m.toLowerCase());
export const fmtDay = (ms) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" }).format(ms);
/** <input type=datetime-local> value is wall-clock IST for everyone, whatever their device timezone. */
export const istToMs = (v) => { const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(v || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 330 * 60000 : NaN; };
export const msToIst = (ms) => new Date(ms + 330 * 60000).toISOString().slice(0, 16);
export const inr = (n) => "₹" + Math.round(n);
export function ago(ms) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "now"; if (s < 3600) return Math.round(s / 60) + "m"; if (s < 86400) return Math.round(s / 3600) + "h";
  return Math.round(s / 86400) + "d";
}
export function empty(title, text, ...actions) {
  return h("div", { class: "empty" }, h("h3", null, title), text && h("p", null, text), actions.length > 0 && h("div", { class: "row wrap" }, actions));
}
export function skeletons(n = 2) { return Array.from({ length: n }, () => h("div", { class: "skeleton" })); }
