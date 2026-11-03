"use strict";
const { db } = require("./db");
const cfg = require("./config");
const { notify } = require("./notify");
const { feasible, legsCompatible, genderOk } = require("./matching");
const { route, send } = require("./http");
const { isBlocked } = require("./users");

const ALERT_THRESHOLD = Number(process.env.RADAR_THRESHOLD || 3);   // riders needed before drivers are alerted
const stopLabel = (id) => cfg.stop(id).short;
const asNeed = (r) => ({ pickup: r.origin_stop, drop: r.dest_stop, earliest: r.earliest_at, latest: r.latest_at, seats: r.seats });

function openRequests() {
  return db.prepare("SELECT * FROM ride_requests WHERE status='open' AND latest_at > ? ORDER BY earliest_at").all(Date.now());
}
function openTrips() {
  return db.prepare("SELECT * FROM trips WHERE status='open' AND depart_at > ?").all(Date.now());
}

/** Is any open trip able to carry this request right now? */
function served(r, trips) {
  return trips.some((t) => {
    if (t.driver_id === r.rider_id) return false;
    return !!feasible(t, asNeed(r));
  });
}

/**
 * Greedy demand clusters. Requests join a cluster when they head the same way, their legs overlap and their time
 * windows overlap. A cluster reports the span one driver would need to cover to serve everyone.
 * Rider identities are never included, only counts.
 */
function clusters(requests) {
  const out = [];
  for (const r of requests) {
    const need = asNeed(r);
    let hit = null;
    for (const c of out) {
      const ok = legsCompatible(c.anchor, need);
      if (ok && !c.riders.has(r.rider_id)) { hit = c; break; }
    }
    if (!hit) { hit = { anchor: need, riders: new Set(), seats: 0, from: r.origin_stop, to: r.dest_stop, earliest: r.earliest_at, latest: r.latest_at, ids: [], fares: [] }; out.push(hit); }
    hit.riders.add(r.rider_id); hit.seats += r.seats; hit.ids.push(r.id);
    const dir = cfg.direction(hit.from, hit.to);
    if ((cfg.stop(r.origin_stop).km - cfg.stop(hit.from).km) * dir < 0) hit.from = r.origin_stop;      // widen span backwards
    if ((cfg.stop(r.dest_stop).km - cfg.stop(hit.to).km) * dir > 0) hit.to = r.dest_stop;               // and forwards
    hit.earliest = Math.max(hit.earliest, r.earliest_at); hit.latest = Math.min(hit.latest, r.latest_at);
    if (hit.latest < hit.earliest) { hit.latest = hit.earliest; }
    if (r.max_fare) hit.fares.push(r.max_fare);
  }
  return out;
}

const signature = (c) => `${c.from}>${c.to}@${new Date(c.earliest + 330 * 60000).toISOString().slice(0, 13)}`;   // per IST hour

route("GET", "/api/radar", ({ res, user }) => {
  const reqs = openRequests().filter((r) => r.rider_id !== user.id);
  const trips = openTrips();
  const demand = clusters(reqs).map((c) => ({
    from: c.from, to: c.to, earliest_at: c.earliest, latest_at: c.latest,
    riders: c.riders.size, seats: c.seats,
    unserved: c.ids.filter((id) => !served(reqs.find((r) => r.id === id), trips)).length,
    avg_max_fare: c.fares.length ? Math.round(c.fares.reduce((a, b) => a + b, 0) / c.fares.length) : null,
    km: cfg.distanceKm(c.from, c.to),
  })).filter((d) => d.unserved > 0).sort((a, b) => b.unserved - a.unserved || a.earliest_at - b.earliest_at).slice(0, 20);
  // For the rider: how many others want a similar trip as each of my open requests
  const mine = db.prepare("SELECT * FROM ride_requests WHERE rider_id=? AND status='open' AND latest_at > ?").all(user.id, Date.now()).map((r) => ({
    id: r.id, origin_stop: r.origin_stop, dest_stop: r.dest_stop, earliest_at: r.earliest_at, latest_at: r.latest_at,
    others: new Set(reqs.filter((o) => legsCompatible(asNeed(r), asNeed(o))).map((o) => o.rider_id)).size,
    drivers_available: trips.filter((t) => t.driver_id !== user.id && feasible(t, asNeed(r))).length,
  }));
  send(res, 200, { demand, mine, threshold: ALERT_THRESHOLD });
});

/** A trip was published: tell riders whose open request it can serve. */
function onTripPublished(tripId) {
  const t = db.prepare("SELECT * FROM trips WHERE id=?").get(tripId);
  const driver = db.prepare("SELECT * FROM users WHERE id=?").get(t.driver_id);
  const notified = new Set();
  for (const r of openRequests()) {
    if (r.rider_id === t.driver_id || notified.has(r.rider_id)) continue;
    const f = feasible(t, asNeed(r)); if (!f) continue;
    const rider = db.prepare("SELECT * FROM users WHERE id=?").get(r.rider_id);
    if (isBlocked(rider.id, driver.id) || !genderOk(rider, driver, t)) continue;
    notified.add(r.rider_id);
    notify(r.rider_id, "radar", "A trip matches your request", `${stopLabel(t.origin_stop)} to ${stopLabel(t.dest_stop)}, ${t.seats_available} seat${t.seats_available > 1 ? "s" : ""} left. Open Home to request one.`, "/home");
  }
}

/** A request was posted: if enough unserved riders now share a trip, alert recent drivers once per cluster and hour. */
function onRequestPosted(reqId) {
  const r = db.prepare("SELECT * FROM ride_requests WHERE id=?").get(reqId);
  const trips = openTrips();
  const reqs = openRequests().filter((x) => !served(x, trips));
  const c = clusters(reqs).find((cl) => cl.ids.includes(r.id));
  if (!c || c.riders.size < ALERT_THRESHOLD) return;
  const sig = signature(c);
  if (db.prepare("SELECT 1 FROM radar_alerts WHERE sig=?").get(sig)) return;
  db.prepare("INSERT INTO radar_alerts (sig,created_at) VALUES (?,?)").run(sig, Date.now());
  const driversToTell = db.prepare("SELECT DISTINCT driver_id FROM trips WHERE created_at > ?").all(Date.now() - 60 * 86400000);
  for (const d of driversToTell) {
    if (c.riders.has(d.driver_id)) continue;
    notify(d.driver_id, "radar", `${c.riders.size} riders need ${stopLabel(c.from)} to ${stopLabel(c.to)}`, `${c.seats} seat${c.seats > 1 ? "s" : ""} wanted around the same time. Offer a ride to fill them.`, "/offer");
  }
}

module.exports = { onTripPublished, onRequestPosted, clusters };
