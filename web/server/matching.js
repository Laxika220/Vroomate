"use strict";
const { db, tx } = require("./db");
const cfg = require("./config");
const { notify } = require("./notify");
const { ensureConversation } = require("./conv");
const { route, bad, notFound, conflict, send } = require("./http");
const { publicUser, isBlocked } = require("./users");

const DAY = 86400000;

/** Parse the rider's search. Pickup and drop are optional: leaving one out means "any stop on the route". */
function parseNeed(q) {
  const pickup = cfg.stop(q.pickup) ? q.pickup : null;
  const drop = cfg.stop(q.drop) ? q.drop : null;
  const earliest = Number(q.earliest) || Date.now();
  const latest = Number(q.latest) || earliest + 60 * DAY;
  return { pickup, drop, earliest, latest, seats: Math.min(8, Math.max(1, Number(q.seats) || 1)) };
}
/** Fill an open-ended search with the trip's own ends, so every trip that passes the chosen stops qualifies. */
const legFor = (trip, need) => ({ ...need, pickup: need.pickup || trip.origin_stop, drop: need.drop || trip.dest_stop });

/**
 * Ride feasibility. A trip serves a rider only if:
 *  - it is open, in the future, and has enough free seats;
 *  - it runs in the same direction as the rider's leg;
 *  - BOTH pickup and drop lie on the driver's path (no detours are invented);
 *  - the driver reaches the pickup stop inside the rider's time window (plus slack).
 * Returns null when infeasible, else the pickup ETA and fare.
 */
function feasible(trip, need) {
  if (trip.status !== "open" || trip.depart_at <= Date.now() || trip.seats_available < need.seats) return null;
  const dir = cfg.direction(need.pickup, need.drop);
  if (dir === 0 || dir !== cfg.direction(trip.origin_stop, trip.dest_stop)) return null;
  if (!cfg.onSegment(trip.origin_stop, trip.dest_stop, need.pickup) || !cfg.onSegment(trip.origin_stop, trip.dest_stop, need.drop)) return null;
  const eta = trip.depart_at + cfg.travelMinutes(trip.origin_stop, need.pickup) * 60000;
  if (eta < need.earliest - cfg.slackMs || eta > need.latest + cfg.slackMs) return null;
  const legKm = cfg.distanceKm(need.pickup, need.drop);
  return { eta, legKm, fare_per_seat: Math.round(trip.fare_per_km_seat * legKm) };
}

function genderOk(me, driver, trip) {
  if (trip.women_only && me.gender !== "f") return false;
  if (me.women_only && driver.gender !== "f") return false;
  return true;
}

route("GET", "/api/discover/rides", ({ res, user, query }) => {
  const need = parseNeed(query);
  const rows = db.prepare(`SELECT t.* FROM trips t
    WHERE t.status='open' AND t.depart_at > ? AND t.driver_id != ?
      AND t.id NOT IN (SELECT trip_id FROM trip_passes WHERE user_id=?)
      AND t.id NOT IN (SELECT trip_id FROM bookings WHERE rider_id=? AND status IN ('pending','confirmed'))
    ORDER BY t.depart_at LIMIT 300`).all(Date.now(), user.id, user.id, user.id);
  const out = [];
  for (const t of rows) {
    const leg = legFor(t, need);
    const f = feasible(t, leg); if (!f) continue;
    const d = db.prepare("SELECT * FROM users WHERE id=?").get(t.driver_id);
    if (isBlocked(user.id, d.id) || !genderOk(user, d, t)) continue;
    const v = db.prepare("SELECT kind,model,colour,seats FROM vehicles WHERE id=?").get(t.vehicle_id);
    out.push({ trip: { id: t.id, origin_stop: t.origin_stop, dest_stop: t.dest_stop, depart_at: t.depart_at, seats_available: t.seats_available, seats_total: t.seats_total, notes: t.notes, women_only: !!t.women_only, fare_per_km_seat: t.fare_per_km_seat },
      driver: publicUser(d), vehicle: v, pickup: leg.pickup, drop: leg.drop, pickup_eta: f.eta, leg_km: f.legKm, fare_per_seat: f.fare_per_seat });
  }
  send(res, 200, { need, results: out.slice(0, 60) });
});

route("POST", "/api/discover/rides/:id/pass", ({ res, user, params }) => {
  db.prepare("INSERT OR IGNORE INTO trip_passes (user_id,trip_id) VALUES (?,?)").run(user.id, Number(params.id));
  send(res, 200, { ok: true });
});

/* ---------- co-riders: people with an open ride request ---------- */

/** Two travellers are compatible if they go the same way, their legs overlap, and their time windows overlap (with slack). */
function legsCompatible(a, b) {
  const da = cfg.direction(a.pickup, a.drop), db_ = cfg.direction(b.pickup, b.drop);
  if (!da || da !== db_) return null;
  const lo = Math.max(Math.min(cfg.stop(a.pickup).km, cfg.stop(a.drop).km), Math.min(cfg.stop(b.pickup).km, cfg.stop(b.drop).km));
  const hi = Math.min(Math.max(cfg.stop(a.pickup).km, cfg.stop(a.drop).km), Math.max(cfg.stop(b.pickup).km, cfg.stop(b.drop).km));
  const shared = hi - lo; if (shared <= 0) return null;
  if (a.earliest > b.latest + cfg.slackMs || b.earliest > a.latest + cfg.slackMs) return null;
  const spanA = cfg.distanceKm(a.pickup, a.drop) || 1;
  return { shared, share: Math.min(1, shared / spanA) };
}

route("GET", "/api/discover/buddies", ({ res, user, query }) => {
  const need = parseNeed(query);
  const cands = db.prepare(`SELECT r.* FROM ride_requests r JOIN users u ON u.id=r.rider_id
    WHERE r.status='open' AND r.latest_at > ? AND r.rider_id != ? AND u.discoverable=1
      AND r.rider_id NOT IN (SELECT target_id FROM swipes WHERE swiper_id=?)
      AND r.rider_id NOT IN (SELECT CASE WHEN user_a=? THEN user_b ELSE user_a END FROM matches WHERE user_a=? OR user_b=?)
    ORDER BY r.earliest_at LIMIT 300`).all(Date.now(), user.id, user.id, user.id, user.id, user.id);
  const seen = new Set(), out = [];
  for (const r of cands) {
    if (seen.has(r.rider_id)) continue;
    const c = legsCompatible(legFor({ origin_stop: r.origin_stop, dest_stop: r.dest_stop }, need), { pickup: r.origin_stop, drop: r.dest_stop, earliest: r.earliest_at, latest: r.latest_at });
    if (!c) continue;
    const u = db.prepare("SELECT * FROM users WHERE id=?").get(r.rider_id);
    if (isBlocked(user.id, u.id)) continue;
    if (user.women_only && u.gender !== "f") continue;
    if (u.women_only && user.gender !== "f") continue;
    seen.add(r.rider_id);
    out.push({ user: publicUser(u), request: { id: r.id, origin_stop: r.origin_stop, dest_stop: r.dest_stop, earliest_at: r.earliest_at, latest_at: r.latest_at, seats: r.seats, note: r.note }, shared_km: c.shared });
  }
  send(res, 200, { need, results: out.slice(0, 60) });
});

route("POST", "/api/swipes", ({ res, user, body }) => {
  const target = Number(body.target_id), dir = body.direction === "like" ? "like" : body.direction === "pass" ? "pass" : null;
  if (!dir || !Number.isInteger(target) || target === user.id) throw bad("Invalid swipe.");
  const t = db.prepare("SELECT * FROM users WHERE id=?").get(target);
  if (!t || isBlocked(user.id, target)) throw notFound("Profile not found");
  const result = tx(() => {
    db.prepare("INSERT INTO swipes (swiper_id,target_id,direction,created_at) VALUES (?,?,?,?) ON CONFLICT(swiper_id,target_id) DO UPDATE SET direction=excluded.direction, created_at=excluded.created_at").run(user.id, target, dir, Date.now());
    if (dir !== "like") return { matched: false };
    const back = db.prepare("SELECT 1 FROM swipes WHERE swiper_id=? AND target_id=? AND direction='like'").get(target, user.id);
    if (!back) return { matched: false };
    const [a, b] = user.id < target ? [user.id, target] : [target, user.id];
    const exists = db.prepare("SELECT id FROM matches WHERE user_a=? AND user_b=?").get(a, b);
    if (exists) return { matched: true, match_id: exists.id };
    const info = db.prepare("INSERT INTO matches (user_a,user_b,created_at) VALUES (?,?,?)").run(a, b, Date.now());
    const id = Number(info.lastInsertRowid);
    const conv = ensureConversation("match", id, [a, b]);
    notify(target, "match", `You can ride with ${user.name.split(" ")[0]}`, "You both want to travel together. Plan the trip in chat.", "/chat/" + conv);
    return { matched: true, match_id: id, conversation_id: conv };
  });
  send(res, 200, { ...result, user: result.matched ? publicUser(t) : undefined });
});

route("GET", "/api/matches", ({ res, user }) => {
  const rows = db.prepare("SELECT * FROM matches WHERE user_a=? OR user_b=? ORDER BY created_at DESC").all(user.id, user.id);
  const out = [];
  for (const m of rows) {
    const other = db.prepare("SELECT * FROM users WHERE id=?").get(m.user_a === user.id ? m.user_b : m.user_a);
    if (!other || isBlocked(user.id, other.id)) continue;
    const conv = db.prepare("SELECT id FROM conversations WHERE kind='match' AND ref_id=?").get(m.id);
    const last = conv ? db.prepare("SELECT body, created_at, sender_id FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1").get(conv.id) : null;
    const unread = conv ? db.prepare(`SELECT COUNT(*) n FROM messages WHERE conversation_id=? AND sender_id!=? AND id > (SELECT last_read_id FROM conversation_members WHERE conversation_id=? AND user_id=?)`).get(conv.id, user.id, conv.id, user.id).n : 0;
    out.push({ id: m.id, created_at: m.created_at, user: publicUser(other), conversation_id: conv ? conv.id : null, last_message: last, unread });
  }
  send(res, 200, { matches: out });
});

module.exports = { feasible, parseNeed, legsCompatible, genderOk };
