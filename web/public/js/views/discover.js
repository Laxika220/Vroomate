import { h, icon, toast, sheet, avatar, fmtWhen, fmtTime, inr, empty, skeletons, mount } from "../ui.js";
import { get, post } from "../api.js";
import { state, registerView, nav, stopName, legKm } from "../core.js";

/* ---- the traveller's current "need": remembered between visits ---- */
const WINDOWS = [["24h", "Next 24 hours", 24], ["3d", "Next 3 days", 72], ["7d", "Next 7 days", 168]];
function loadNeed() {
  let n = {};
  try { n = JSON.parse(localStorage.getItem("vm_need") || "{}"); } catch { /* private mode */ }
  const home = state.me.home_stop && state.cfg.stops.some((s) => s.id === state.me.home_stop) ? state.me.home_stop : "lavasa-campus";
  return { pickup: n.pickup || home, drop: n.drop || (home === "lavasa-campus" ? "pune-station" : "lavasa-campus"), win: n.win || "3d", seats: n.seats || 1, mode: n.mode || "rides" };
}
const saveNeed = (n) => { try { localStorage.setItem("vm_need", JSON.stringify(n)); } catch { /* ignore */ } };
const needQuery = (n) => { const hrs = WINDOWS.find((w) => w[0] === n.win)[2], now = Date.now(); return new URLSearchParams({ pickup: n.pickup, drop: n.drop, earliest: now, latest: now + hrs * 3600000, seats: n.seats }); };

function hero(u) {
  const hue = [...(u.name + u.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 0);
  const bg = u.photo ? `center/cover url("${u.photo}")` : `linear-gradient(160deg,hsl(${hue} 55% 42%),hsl(${(hue + 60) % 360} 50% 22%))`;
  const parts = u.name.split(/\s+/);
  return [h("div", { class: "hero", style: { background: bg } }), !u.photo && h("div", { class: "initials", "aria-hidden": "true" }, (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase())];
}
const fact = (ic, text) => h("span", { class: "fact" }, icon(ic), text);
const leg = (a, b, aSub, bSub) => h("div", { class: "legline" },
  h("div", { class: "st" }, h("b", null, stopName(a)), aSub && h("small", { class: "mono" }, aSub)), h("div", { class: "track" }),
  h("div", { class: "st r" }, h("b", null, stopName(b)), bSub && h("small", { class: "mono" }, bSub)));

function rideCard(r) {
  const t = r.trip, d = r.driver;
  return { key: "t" + t.id, node: [...hero(d), h("div", { class: "shade" }), h("span", { class: "score" }, `${r.score}% route fit`),
    h("div", { class: "body" },
      h("div", { class: "row between" }, h("h2", null, d.name), h("span", { class: "tag good" }, "Approved driver")),
      h("div", { class: "row wrap" }, d.verified && h("span", { class: "tag good" }, "CHRIST verified"), t.women_only && h("span", { class: "tag" }, "Women-only"), h("span", { class: "tag" }, `${r.vehicle.colour} ${r.vehicle.model}`)),
      leg(t.origin_stop, t.dest_stop, fmtTime(t.depart_at), null),
      h("p", { class: "muted", style: { fontSize: "13px" } }, `Your leg: ${stopName(state.need.pickup)} to ${stopName(state.need.drop)} · ${r.leg_km} km`),
      h("div", { class: "facts" }, fact("clock", `${fmtWhen(t.depart_at)}`), fact("pin", `Pickup ~${fmtTime(r.pickup_eta)}`), fact("seat", `${t.seats_available} left`), fact("check", `${inr(r.fare_per_seat)} / seat`)),
      t.notes && h("p", { class: "muted", style: { fontSize: "13px" } }, `"${t.notes}"`))] };
}
function buddyCard(b) {
  const u = b.user, q = b.request;
  return { key: "u" + u.id, node: [...hero(u), h("div", { class: "shade" }), h("span", { class: "score" }, `${b.score}% travel match`),
    h("div", { class: "body" },
      h("div", { class: "row between" }, h("h2", null, u.name), h("span", { class: "tag" }, u.role === "faculty" ? "Faculty" : u.role === "student" ? "Student" : "Community")),
      h("div", { class: "row wrap" }, u.verified && h("span", { class: "tag good" }, "CHRIST verified"), u.course && h("span", { class: "tag" }, u.course)),
      leg(q.origin_stop, q.dest_stop, null, null),
      h("div", { class: "facts" }, fact("clock", `${fmtWhen(q.earliest_at)} to ${fmtTime(q.latest_at)}`), fact("route", `${Math.round(b.shared_km)} km shared`)),
      u.bio && h("p", { style: { fontSize: "14px" } }, u.bio),
      h("div", { class: "chips" }, ...u.interests.map((i) => h("span", { class: "tag " + (b.shared_interests.includes(i) ? "good" : "") }, i))))] };
}

registerView("discover", async () => {
  const need = state.need = loadNeed();
  const root = h("div", { class: "stack", style: { gap: "14px" } });
  const mode = () => state.need.mode;
  const seg = h("div", { class: "seg2 grow", role: "group", "aria-label": "Discover mode" });
  const top = h("div", { class: "row" }, seg,
    h("a", { class: "iconbtn", href: "#/notifications", "aria-label": "Notifications", style: { width: "50px", height: "50px", flex: "none" } }, icon("bell"), state.me.unread_notifications > 0 && h("span", { class: "dot" }, state.me.unread_notifications)));
  const needBtn = h("button", { class: "needbar", onclick: () => editNeed(() => load()) });
  const deck = h("div", { class: "stack", style: { gap: "14px" } });
  mount(root, top, needBtn, deck);

  const drawChrome = () => {
    seg.replaceChildren(...[["rides", "Find a Ride"], ["buddies", "Travel Buddies"]].map(([id, l]) => h("button", { "aria-pressed": String(mode() === id), onclick: () => { state.need.mode = id; saveNeed(state.need); drawChrome(); load(); } }, l)));
    const n = state.need;
    needBtn.replaceChildren(icon("route"), h("span", { class: "grow" }, h("b", { style: { display: "block", lineHeight: 1.2 } }, `${stopName(n.pickup)} to ${stopName(n.drop)}`), h("span", { class: "hint" }, `${WINDOWS.find((w) => w[0] === n.win)[1]} · ${n.seats} seat${n.seats > 1 ? "s" : ""}`)), h("span", { class: "hint" }, "Edit"));
  };
  let token = 0;
  async function load() {
    const my = ++token;
    drawChrome();
    deck.replaceChildren(...skeletons(1), h("div", { class: "skeleton", style: { minHeight: "60px" } }));
    let data;
    try { data = await get(`/api/discover/${mode() === "rides" ? "rides" : "buddies"}?${needQuery(state.need)}`); }
    catch (e) { if (my === token) deck.replaceChildren(empty("route", "Couldn't load", e.message, h("button", { class: "btn primary", onclick: load }, "Try again"))); return; }
    if (my !== token) return;
    const cards = data.results.map(mode() === "rides" ? rideCard : buddyCard);
    cards.forEach((c, i) => { c.data = data.results[i]; });
    renderDeck(cards);
  }

  function renderDeck(cards) {
    if (!cards.length) {
      deck.replaceChildren(mode() === "rides" ? ridesEmpty() : buddiesEmpty());
      return;
    }
    const stage = h("div", { class: "deck", "aria-live": "polite" });
    const actions = h("div", { class: "swipe-actions" },
      h("button", { class: "round no", "aria-label": "Pass", onclick: () => fling("no") }, icon("x")),
      h("button", { class: "round yes", "aria-label": mode() === "rides" ? "Request a seat" : "Like", onclick: () => fling("yes") }, icon(mode() === "rides" ? "seat" : "heart")));
    deck.replaceChildren(stage, actions);
    let i = 0, busy = false;
    const draw = () => {
      stage.replaceChildren();
      if (i >= cards.length) { deck.replaceChildren(mode() === "rides" ? ridesEmpty(true) : buddiesEmpty(true)); return; }
      for (let k = Math.min(2, cards.length - i - 1); k >= 0; k--) {
        const c = cards[i + k];
        const el = h("article", { class: "scard " + (k === 0 ? "top" : "b" + k), "aria-label": k === 0 ? "Current card" : null, "aria-hidden": k === 0 ? null : "true" },
          h("span", { class: "stamp yes" }, mode() === "rides" ? "REQUEST" : "LIKE"), h("span", { class: "stamp no" }, "PASS"), ...c.node);
        stage.append(el);
        if (k === 0) drag(el);
      }
    };
    function drag(el) {
      let sx = 0, dx = 0, on = false;
      const yes = el.querySelector(".stamp.yes"), no = el.querySelector(".stamp.no");
      el.addEventListener("pointerdown", (e) => { if (busy) return; on = true; sx = e.clientX; dx = 0; el.style.transition = "none"; try { el.setPointerCapture(e.pointerId); } catch { /* ok */ } });
      el.addEventListener("pointermove", (e) => { if (!on) return; dx = e.clientX - sx; el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`; yes.style.opacity = Math.max(0, Math.min(1, dx / 90)); no.style.opacity = Math.max(0, Math.min(1, -dx / 90)); });
      const end = () => { if (!on) return; on = false; el.style.transition = ""; if (Math.abs(dx) > 100) fling(dx > 0 ? "yes" : "no"); else { el.style.transform = ""; yes.style.opacity = no.style.opacity = 0; } };
      el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    }
    async function fling(dir) {
      if (busy || i >= cards.length) return;
      busy = true;
      const c = cards[i], el = stage.querySelector(".scard.top");
      const leave = () => new Promise((r) => { if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return r(); el.style.transition = "transform .3s ease, opacity .3s"; el.style.transform = `translateX(${dir === "yes" ? 560 : -560}px) rotate(${dir === "yes" ? 16 : -16}deg)`; el.style.opacity = "0"; setTimeout(r, 280); });
      const snapBack = () => { if (el) { el.style.transition = ""; el.style.transform = ""; el.style.opacity = ""; el.querySelectorAll(".stamp").forEach((s) => (s.style.opacity = 0)); } };
      try {
        if (mode() === "rides") {
          if (dir === "no") { await leave(); post(`/api/discover/rides/${c.data.trip.id}/pass`).catch(() => {}); }
          else { snapBack(); const sent = await requestSheet(c.data); if (!sent) { busy = false; return; } await leave(); }
        } else {
          await leave();
          const r = await post("/api/swipes", { target_id: c.data.user.id, direction: dir === "yes" ? "like" : "pass" });
          if (r.matched) matchPop(r);
        }
        i++; busy = false; draw();
      } catch (e) { snapBack(); toast(e.message); busy = false; }
    }
    state.fling = fling;
    draw();
  }
  const kb = (e) => { if (!document.body.contains(root)) return document.removeEventListener("keydown", kb); if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || document.querySelector(".veil")) return; if (e.key === "ArrowRight") state.fling && state.fling("yes"); if (e.key === "ArrowLeft") state.fling && state.fling("no"); };
  document.addEventListener("keydown", kb);

  function ridesEmpty(seen) {
    return h("div", { class: "stack" },
      h("div", { class: "radar", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("b")),
      empty("car", seen ? "You've seen every driver on this route" : "No drivers on this route yet", "Post a ride request. Drivers see demand in Ride Radar, and we notify you the moment a matching trip is published.",
        h("div", { class: "stack", style: { width: "100%" } }, h("button", { class: "btn primary block", onclick: () => nav("/post/request") }, "Post a ride request"), h("button", { class: "btn block", onclick: () => { state.need.mode = "buddies"; saveNeed(state.need); load(); } }, "Find travel buddies instead"))));
  }
  function buddiesEmpty(seen) {
    return empty("users", seen ? "That's everyone for now" : "No travel buddies on your route yet", "People appear here when they post a ride request that overlaps yours. Post yours so they can find you too.",
      h("button", { class: "btn primary block", onclick: () => nav("/post/request") }, "Post a ride request"));
  }
  load();
  return root;
});

function editNeed(done) {
  sheet((body, close) => {
    const n = { ...state.need };
    const sel = (id, v) => { const s = h("select", { id }, state.cfg.stops.map((x) => h("option", { value: x.id }, x.name))); s.value = v; return s; };
    const from = sel("n_from", n.pickup), to = sel("n_to", n.drop);
    const win = h("select", { id: "n_win" }, WINDOWS.map((w) => h("option", { value: w[0] }, w[1]))); win.value = n.win;
    const seats = h("input", { id: "n_seats", type: "number", min: 1, max: 8, value: n.seats });
    const err = h("p", { class: "err", role: "alert", hidden: true });
    mount(body, h("h2", null, "Where are you going?"),
      h("div", { class: "field" }, h("label", { for: "n_from" }, "Pickup stop"), from),
      h("div", { class: "field" }, h("label", { for: "n_to" }, "Drop-off stop"), to),
      h("div", { class: "two" }, h("div", { class: "field" }, h("label", { for: "n_win" }, "When"), win), h("div", { class: "field" }, h("label", { for: "n_seats" }, "Seats"), seats)),
      err, h("button", { class: "btn primary block", onclick: () => {
        if (from.value === to.value) { err.textContent = "Pickup and drop-off must be different."; err.hidden = false; return; }
        Object.assign(state.need, { pickup: from.value, drop: to.value, win: win.value, seats: Math.max(1, Math.min(8, Number(seats.value) || 1)) });
        saveNeed(state.need); close(); done();
      } }, "Show rides"));
  });
}

/** Resolves true once the seat request was sent, false if the rider backed out. */
async function requestSheet(r) {
  const groups = await get("/api/groups/mine").then((x) => x.groups.filter((g) => g.my_status === "joined" && g.owner_id === state.me.id && g.members.filter((m) => m.status === "joined").length >= 2)).catch(() => []);
  return new Promise((resolve) => {
    let sent = false;
    const s = sheet((body, close) => {
      const t = r.trip, n = state.need;
      const msg = h("input", { id: "q_msg", maxlength: 300, placeholder: "Say hi and mention your pickup spot" });
      const seats = h("input", { id: "q_seats", type: "number", min: 1, max: t.seats_available, value: Math.min(n.seats, t.seats_available) });
      const err = h("p", { class: "err", role: "alert", hidden: true });
      const cost = h("p", { class: "hint mono" });
      const who = h("select", { id: "q_who" }, h("option", { value: "" }, "Just me"), groups.map((g) => h("option", { value: g.id }, `Group: ${g.name} (${g.members.filter((m) => m.status === "joined").length})`)));
      const groupSize = () => { const g = groups.find((x) => String(x.id) === who.value); return g ? g.members.filter((m) => m.status === "joined").length : 0; };
      const upd = () => { if (who.value) { seats.value = groupSize(); seats.disabled = true; } else seats.disabled = false; cost.textContent = `Estimated fare ${inr(r.fare_per_seat * (Number(seats.value) || 1))}, paid to the driver directly.`; };
      who.addEventListener("change", upd); seats.addEventListener("input", upd); upd();
      const go = h("button", { class: "btn primary block", onclick: async () => {
        go.disabled = true; err.hidden = true;
        try { await post("/api/bookings", { trip_id: t.id, pickup_stop: n.pickup, drop_stop: n.drop, seats: Number(seats.value), group_id: who.value ? Number(who.value) : undefined, message: msg.value }); sent = true; toast("Request sent. You're booked only when the driver confirms."); close(); }
        catch (x) { err.textContent = x.message; err.hidden = false; go.disabled = false; }
      } }, "Send seat request");
      mount(body, h("h2", null, `Ride with ${r.driver.name.split(" ")[0]}`),
        h("div", { class: "panel stack", style: { gap: "6px" } }, h("b", null, `${stopName(n.pickup)} to ${stopName(n.drop)}`), h("p", { class: "muted" }, `Driver reaches ${stopName(n.pickup)} around ${fmtTime(r.pickup_eta)}. ${fmtWhen(t.depart_at)} departure from ${stopName(t.origin_stop)}.`)),
        groups.length > 0 && h("div", { class: "field" }, h("label", { for: "q_who" }, "Booking for"), who),
        h("div", { class: "field" }, h("label", { for: "q_seats" }, `Seats (${t.seats_available} available)`), seats), cost,
        h("div", { class: "field" }, h("label", { for: "q_msg" }, "Message to the driver"), msg), err, go,
        h("p", { class: "hint" }, "A request is not a booking. Seats are reserved only after the driver accepts."));
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(s.body)) { obs.disconnect(); resolve(sent); } });
    obs.observe(document.body, { childList: true });
  });
}

function matchPop(r) {
  sheet((body, close) => {
    body.classList.add("match-pop");
    mount(body, h("div", { class: "pair" }, avatar(state.me), avatar(r.user)), h("h2", null, "It's a match"),
      h("p", { class: "muted" }, `You and ${r.user.name.split(" ")[0]} could travel together. A match is a hello, not a booking.`),
      h("button", { class: "btn primary block", onclick: () => { close(); nav("/chat/" + r.conversation_id); } }, "Say hello"),
      h("button", { class: "btn ghost block", onclick: close }, "Keep swiping"));
  });
}
