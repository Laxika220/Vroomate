import { h, icon, toast, sheet, avatar, fmtDay, fmtTime, inr, empty, mount, stars } from "../ui.js";
import { get, post } from "../api.js";
import { withVerifiedPhone } from "./verify.js";
import { state, registerView, nav, stopById, stopName, routeView } from "../core.js";

/* ---- filters, remembered between visits. Empty pickup/drop means "any stop". ---- */
const DAY = 86400000, IST = 330 * 60000;
const WHEN = [["any", "Any time"], ["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "This week"]];
const istDayStart = (ms) => Math.floor((ms + IST) / DAY) * DAY - IST;
function loadSearch() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem("vm_search") || "{}"); } catch { /* private mode */ }
  return { pickup: s.pickup || "", drop: s.drop || "", when: s.when || "any", mode: s.mode === "people" ? "people" : "rides", view: s.view === "list" ? "list" : "swipe", text: "" };
}
const saveSearch = ({ text, ...s }) => { try { localStorage.setItem("vm_search", JSON.stringify(s)); } catch { /* ignore */ } };
function searchQuery(s) {
  const q = new URLSearchParams(), now = Date.now(), today = istDayStart(now);
  if (s.pickup) q.set("pickup", s.pickup);
  if (s.drop) q.set("drop", s.drop);
  const win = { today: [now, today + DAY], tomorrow: [today + DAY, today + 2 * DAY], week: [now, now + 7 * DAY] }[s.when];
  if (win) { q.set("earliest", win[0]); q.set("latest", win[1]); }
  return q;
}
const arrival = (t, stop) => t.depart_at + Math.abs(stopById(stop).min - stopById(t.origin_stop).min) * 60000;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const stopWords = (id) => [stopById(id).name, stopById(id).short];
/** Everything the search box matches against: places, names, car, note. */
const haystack = (x) => (x.trip
  ? [...stopWords(x.pickup), ...stopWords(x.drop), ...stopWords(x.trip.origin_stop), ...stopWords(x.trip.dest_stop), x.driver.name, x.vehicle.model, x.vehicle.colour, x.trip.notes]
  : [...stopWords(x.request.origin_stop), ...stopWords(x.request.dest_stop), x.user.name, x.user.bio, x.request.note]).join(" ").toLowerCase();
const initials = (name) => { const p = name.trim().split(/\s+/); return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };
const photo = (u) => h("div", { class: "photo", style: u.photo ? { backgroundImage: `url("${u.photo}")` } : null }, !u.photo && h("span", null, initials(u.name)));

/* ---- Tinder-style cards: the person's photo fills the card, details sit on top of it ---- */
function rideCard(r) {
  const t = r.trip;
  return [photo(r.driver), h("div", { class: "shade" }), h("span", { class: "price-tag mono" }, inr(r.fare_per_seat)),
    h("div", { class: "info" },
      h("h2", null, r.driver.name.split(" ")[0], h("span", null, `${stars(r.driver)} · ${r.vehicle.colour} ${r.vehicle.model}`)),
      h("p", { class: "leg" }, `${stopName(r.pickup)} → ${stopName(r.drop)}`),
      h("p", null, `${fmtDay(r.pickup_eta)} · ${fmtTime(r.pickup_eta)} · ${plural(t.seats_available, "seat")} left${t.women_only ? " · Women only" : ""}`),
      t.notes && h("p", { class: "note" }, t.notes))];
}
function personCard(b) {
  const u = b.user, q = b.request;
  return [photo(u), h("div", { class: "shade" }),
    h("div", { class: "info" },
      h("h2", null, u.name.split(" ")[0], u.bio && h("span", null, u.bio)),
      h("p", { class: "leg" }, `${stopName(q.origin_stop)} → ${stopName(q.dest_stop)}`),
      h("p", null, `${fmtDay(q.earliest_at)} · ${fmtTime(q.earliest_at)} to ${fmtTime(q.latest_at)} · ${plural(q.seats, "seat")}`),
      q.note && h("p", { class: "note" }, q.note))];
}

/* ---- list rows, for people who'd rather search than swipe ---- */
function rideRow(r, onPick) {
  return h("button", { class: "ritem", onclick: onPick },
    h("div", { class: "when mono" }, h("b", null, fmtTime(r.pickup_eta)), h("span", null, fmtDay(r.pickup_eta))),
    h("div", { class: "t" }, h("b", null, `${stopName(r.pickup)} → ${stopName(r.drop)}`), h("span", null, `${r.driver.name} · ${stars(r.driver)} · ${r.vehicle.colour} ${r.vehicle.model} · ${r.trip.seats_available} left`)),
    h("b", { class: "mono" }, inr(r.fare_per_seat)));
}
function personRow(b, onConnect) {
  const q = b.request;
  return h("div", { class: "ritem" }, avatar(b.user),
    h("div", { class: "t" }, h("b", null, b.user.name), h("span", null, `${stopName(q.origin_stop)} → ${stopName(q.dest_stop)} · ${fmtDay(q.earliest_at)}, ${fmtTime(q.earliest_at)}`)),
    h("button", { class: "btn small primary", onclick: onConnect }, "Connect"));
}

registerView("home", async () => {
  const s = state.search = loadSearch();
  let results = [], timer;
  const text = h("input", { type: "search", placeholder: "Search places, drivers, cars", "aria-label": "Search", value: s.text, autocomplete: "off" });
  text.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { s.text = text.value.trim().toLowerCase(); if (s.text && s.view === "swipe") s.view = "list"; drawControls(); render(); }, 150);
  });
  const filterBtn = h("button", { class: "iconbtn", "aria-label": "Filters", onclick: () => filters(s, () => { saveSearch(s); drawControls(); load(); }) });
  const summary = h("div", { class: "row between hint" });
  const tabs = h("div", { class: "tabs grow", role: "group", "aria-label": "Show" });
  const views = h("div", { class: "seg", role: "group", "aria-label": "View" });
  const body = h("div", { class: "stack" });
  const unread = state.me.unread_notifications > 0;

  function drawControls() {
    const active = s.pickup || s.drop || s.when !== "any";
    filterBtn.replaceChildren(...[icon("sliders"), active ? h("span", { class: "dot" }) : null].filter(Boolean));
    summary.hidden = !active;
    summary.replaceChildren(h("span", null, [s.pickup || s.drop ? `${s.pickup ? stopName(s.pickup) : "Anywhere"} → ${s.drop ? stopName(s.drop) : "Anywhere"}` : "", s.when !== "any" ? WHEN.find((w) => w[0] === s.when)[1] : ""].filter(Boolean).join(" · ")),
      h("button", { class: "btn small ghost", onclick: () => { Object.assign(s, { pickup: "", drop: "", when: "any" }); saveSearch(s); drawControls(); load(); } }, "Clear"));
    tabs.replaceChildren(...[["rides", "Rides"], ["people", "Co-riders"]].map(([id, l]) => h("button", { "aria-pressed": String(s.mode === id), onclick: () => { s.mode = id; saveSearch(s); drawControls(); load(); } }, l)));
    views.replaceChildren(...[["swipe", "cards", "Swipe"], ["list", "list", "List"]].map(([id, ic, l]) => h("button", { "aria-pressed": String(s.view === id), "aria-label": l, title: l, onclick: () => { s.view = id; saveSearch(s); drawControls(); render(); } }, icon(ic))));
  }
  drawControls();
  const root = h("div", { class: "stack", style: { gap: "12px" } },
    h("div", { class: "topbar" }, h("span", { class: "wordmark" }, "Vroomate"),
      h("a", { class: "iconbtn", href: "#/notifications", "aria-label": unread ? "Notifications, unread" : "Notifications" }, icon("bell"), unread && h("span", { class: "dot" }))),
    h("div", { class: "row" }, h("label", { class: "searchbar grow" }, icon("search"), text), filterBtn),
    summary,
    h("div", { class: "row", style: { alignItems: "flex-end" } }, tabs, views),
    body);

  let token = 0;
  async function load() {
    const my = ++token;
    body.replaceChildren(h("div", { class: "skeleton", style: { minHeight: "360px" } }));
    try { const data = await get(`/api/discover/${s.mode === "rides" ? "rides" : "buddies"}?${searchQuery(s)}`); if (my !== token) return; results = data.results; }
    catch (e) { if (my === token) body.replaceChildren(empty("Couldn't load", e.message, h("button", { class: "btn primary", onclick: load }, "Try again"))); return; }
    render();
  }
  const shown = () => (s.text ? results.filter((x) => haystack(x).includes(s.text)) : results);
  const drop = (x) => { results = results.filter((y) => y !== x); };
  const render = () => (s.view === "list" ? renderList() : renderDeck());

  function noneLeft(seen) {
    if (s.text) return empty(`Nothing matches “${text.value.trim()}”`, "Try a place like Paud or Kothrud, a driver's name, or a car.", h("button", { class: "btn", onclick: () => { text.value = ""; s.text = ""; render(); } }, "Clear search"));
    const filtered = s.pickup || s.drop || s.when !== "any";
    const request = h("button", { class: "btn primary", onclick: () => nav("/offer/request") }, "Post a request");
    if (s.mode === "rides") return empty(seen ? "You've seen every ride" : "No rides yet",
      filtered ? "Nobody is driving this way at that time yet. Post a request and drivers going your way will be told." : "Nobody has offered a ride yet. Post a request, or offer one if you're driving.",
      request, h("button", { class: "btn", onclick: () => nav("/offer") }, "Offer a ride"));
    return empty(seen ? "That's everyone for now" : "No co-riders yet", "People who post a ride request show up here. Post yours so others going your way can find you.", request);
  }

  async function act(x, yes) {
    if (s.mode === "rides") {
      if (!yes) { post(`/api/discover/rides/${x.trip.id}/pass`).catch(() => {}); return true; }
      return requestSheet(x);
    }
    const r = await post("/api/swipes", { target_id: x.user.id, direction: yes ? "like" : "pass" });
    if (r.matched) matched(r); else if (yes) toast(`If ${x.user.name.split(" ")[0]} connects too, a chat opens`);
    return true;
  }

  function renderList() {
    state.fling = null;
    const items = shown();
    if (!items.length) return body.replaceChildren(noneLeft(false));
    body.replaceChildren(h("p", { class: "hint" }, s.mode === "rides" ? plural(items.length, "ride") : items.length === 1 ? "1 person" : `${items.length} people`),
      h("div", { class: "list" }, ...items.map((x) => s.mode === "rides"
        ? rideRow(x, async () => { if (await act(x, true)) { drop(x); renderList(); } })
        : personRow(x, async () => { try { await act(x, true); drop(x); renderList(); } catch (e) { toast(e.message); } }))));
  }

  function renderDeck() {
    const items = shown();
    if (!items.length) return body.replaceChildren(noneLeft(false));
    const rides = s.mode === "rides";
    const stage = h("div", { class: "deck", "aria-live": "polite" });
    const actions = h("div", { class: "swipe-actions" },
      h("button", { class: "round no", "aria-label": "Skip", onclick: () => fling("no") }, icon("x")),
      h("button", { class: "round yes", "aria-label": rides ? "Request seat" : "Connect", onclick: () => fling("yes") }, icon("check")));
    body.replaceChildren(stage, actions);
    let i = 0, busy = false;
    const draw = () => {
      if (i >= items.length) return body.replaceChildren(noneLeft(true));
      stage.replaceChildren();
      for (let k = Math.min(1, items.length - i - 1); k >= 0; k--) {
        const el = h("article", { class: "scard " + (k === 0 ? "top" : "b1"), "aria-hidden": k === 0 ? null : "true" },
          ...(rides ? rideCard : personCard)(items[i + k]),
          h("span", { class: "stamp yes" }, rides ? "REQUEST" : "CONNECT"), h("span", { class: "stamp no" }, "SKIP"));
        stage.append(el);
        if (k === 0) drag(el);
      }
    };
    function drag(el) {
      let sx = 0, sy = 0, dx = 0, on = false;
      const yes = el.querySelector(".stamp.yes"), no = el.querySelector(".stamp.no");
      el.addEventListener("pointerdown", (e) => { if (busy) return; on = true; sx = e.clientX; sy = e.clientY; dx = 0; el.style.transition = "none"; try { el.setPointerCapture(e.pointerId); } catch { /* ok */ } });
      el.addEventListener("pointermove", (e) => {
        if (!on) return; dx = e.clientX - sx;
        el.style.transform = `translate(${dx}px,${(e.clientY - sy) / 4}px) rotate(${dx / 14}deg)`;
        yes.style.opacity = Math.max(0, Math.min(1, dx / 80)); no.style.opacity = Math.max(0, Math.min(1, -dx / 80));
      });
      const end = () => { if (!on) return; on = false; el.style.transition = ""; if (Math.abs(dx) > 100) fling(dx > 0 ? "yes" : "no"); else { el.style.transform = ""; yes.style.opacity = no.style.opacity = 0; } };
      el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    }
    async function fling(dir) {
      if (busy || i >= items.length) return;
      busy = true;
      const x = items[i], el = stage.querySelector(".scard.top");
      const leave = () => new Promise((r) => {
        if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return r();
        el.style.transition = "transform .3s ease, opacity .3s"; el.querySelector(".stamp." + dir).style.opacity = 1;
        el.style.transform = `translateX(${dir === "yes" ? 600 : -600}px) rotate(${dir === "yes" ? 24 : -24}deg)`; el.style.opacity = "0"; setTimeout(r, 260);
      });
      const snapBack = () => { if (el) { el.style.transform = ""; el.querySelectorAll(".stamp").forEach((v) => (v.style.opacity = 0)); } };
      try {
        if (rides && dir === "yes") { snapBack(); if (!(await act(x, true))) { busy = false; return; } await leave(); }
        else { await leave(); await act(x, dir === "yes"); }
        drop(x); i++; busy = false; draw();
      } catch (e) { snapBack(); toast(e.message); busy = false; }
    }
    state.fling = fling;
    draw();
  }

  const kb = (e) => {
    if (!document.body.contains(root)) return document.removeEventListener("keydown", kb);
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || document.querySelector(".veil")) return;
    if (e.key === "ArrowRight") state.fling?.("yes"); if (e.key === "ArrowLeft") state.fling?.("no");
  };
  document.addEventListener("keydown", kb);
  load();
  return root;
});

function filters(s, done) {
  sheet((body, close) => {
    const sel = (id, label, v) => { const el = h("select", { id }, h("option", { value: "" }, "Anywhere"), state.cfg.stops.map((x) => h("option", { value: x.id }, x.short))); el.value = v; return el; };
    const from = sel("f_from", "From", s.pickup), to = sel("f_to", "To", s.drop);
    let when = s.when;
    const pills = h("div", { class: "pills" });
    const drawPills = () => pills.replaceChildren(...WHEN.map(([id, l]) => h("button", { class: "pill", "aria-pressed": String(when === id), onclick: () => { when = id; drawPills(); } }, l)));
    drawPills();
    const err = h("p", { class: "err", role: "alert", hidden: true });
    mount(body, h("h2", null, "Filters"),
      h("div", { class: "field" }, h("label", { for: "f_from" }, "From"), from),
      h("div", { class: "field" }, h("label", { for: "f_to" }, "To"), to),
      h("div", { class: "field" }, h("span", { class: "lbl" }, "When"), pills), err,
      h("button", { class: "btn primary block", onclick: () => {
        if (from.value && from.value === to.value) { err.textContent = "From and To must be different."; err.hidden = false; return; }
        Object.assign(s, { pickup: from.value, drop: to.value, when }); close(); done();
      } }, "Show results"));
  });
}

/** Resolves true once the seat request was sent, false if the rider backed out. */
function requestSheet(r) {
  return new Promise((resolve) => {
    let sent = false;
    const s = sheet((body, close) => {
      const t = r.trip;
      const seats = h("select", { id: "q_seats" }, Array.from({ length: t.seats_available }, (_, k) => h("option", { value: k + 1 }, plural(k + 1, "seat"))));
      const msg = h("input", { id: "q_msg", maxlength: 300, placeholder: "Where should they pick you up?" });
      const total = h("b", { class: "mono" });
      const upd = () => (total.textContent = inr(r.fare_per_seat * Number(seats.value)));
      seats.addEventListener("change", upd); upd();
      const err = h("p", { class: "err", role: "alert", hidden: true });
      const go = h("button", { class: "btn primary block", onclick: async () => {
        go.disabled = true; err.hidden = true;
        try { await withVerifiedPhone(() => post("/api/bookings", { trip_id: t.id, pickup_stop: r.pickup, drop_stop: r.drop, seats: Number(seats.value), message: msg.value })); sent = true; toast(`Request sent to ${r.driver.name.split(" ")[0]}`); close(); }
        catch (x) { if (!x.quiet) { err.textContent = x.message; err.hidden = false; } go.disabled = false; }
      } }, "Send request");
      mount(body, h("h2", null, "Request a seat"),
        routeView(r.pickup, r.drop, fmtTime(r.pickup_eta), fmtTime(arrival(t, r.drop))),
        h("div", { class: "row" }, avatar(r.driver, "sm"), h("p", { class: "hint grow" }, `${fmtDay(r.pickup_eta)} with ${r.driver.name} · ${r.vehicle.colour} ${r.vehicle.model}`)),
        t.notes && h("p", { class: "hint" }, t.notes),
        h("div", { class: "field" }, h("label", { for: "q_seats" }, "Seats"), seats),
        h("div", { class: "field" }, h("label", { for: "q_msg" }, "Message (optional)"), msg),
        h("div", { class: "row between" }, h("span", null, "Total, paid to the driver"), total),
        err, go, h("p", { class: "hint" }, "Your seat is booked once the driver accepts."));
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(s.body)) { obs.disconnect(); resolve(sent); } });
    obs.observe(document.body, { childList: true });
  });
}

function matched(r) {
  sheet((body, close) => {
    const first = r.user.name.split(" ")[0];
    mount(body, h("div", { class: "row" }, avatar(state.me), avatar(r.user)),
      h("h2", null, `You and ${first} can ride together`),
      h("p", { class: "muted" }, "You both want to travel the same way. Plan the trip in chat."),
      h("button", { class: "btn primary block", onclick: () => { close(); nav("/chat/" + r.conversation_id); } }, `Message ${first}`),
      h("button", { class: "btn ghost block", onclick: close }, "Keep looking"));
  });
}
