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
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M6 15.5V11a3 3 0 0 1 3-3h6.5"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.6 3.7-5.5 7.5-5.5s6.7 1.9 7.5 5.5"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  car: '<path d="M4 15l1.6-5a2 2 0 0 1 1.9-1.4h9a2 2 0 0 1 1.9 1.4L20 15"/><rect x="3" y="15" width="18" height="4" rx="1.5"/><circle cx="7.5" cy="17" r=".6"/><circle cx="16.5" cy="17" r=".6"/>',
  shield: '<path d="M12 3l7 3v5.5c0 4.3-3 7.6-7 9.5-4-1.9-7-5.2-7-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  seat: '<path d="M8 4h4a2 2 0 0 1 2 2v6h3l2 5H9a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2z"/>',
  chat: '<path d="M5 6h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/>',
  users: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6S13.9 16 14.5 19"/><circle cx="17" cy="9.5" r="2.5"/><path d="M16.5 14.6c2.2.1 3.6 1.5 4 3.9"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/>',
  flag: '<path d="M6 21V4M6 5h11l-2 4 2 4H6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-6-5.6-6-10.2a6 6 0 0 1 12 0C18 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>',
};
export function icon(name) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICONS[name] || "";   // static strings above only
  return s;
}

const hue = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
export function avatar(u, size) {
  const name = (u && u.name) || "?";
  const parts = name.trim().split(/\s+/);
  const ini = ((parts[0][0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  const hh = hue(name + (u && u.id));
  const el = h("div", { class: "av" + (size ? " " + size : ""), role: "img", "aria-label": name,
    style: { background: u && u.photo ? `center/cover url("${u.photo}")` : `linear-gradient(135deg,hsl(${hh} 60% 52%),hsl(${(hh + 50) % 360} 55% 38%))` } },
    u && u.photo ? "" : ini);
  return el;
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
  const body = h("div", { class: "sheet", role: "dialog", "aria-modal": "true" }, h("div", { class: "grab" }));
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
export function empty(iconName, title, text, action) {
  return h("div", { class: "empty" }, icon(iconName), h("h3", null, title), text && h("p", null, text), action);
}
export function skeletons(n = 2) { return Array.from({ length: n }, () => h("div", { class: "skeleton" })); }
