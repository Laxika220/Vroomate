"use strict";
// A rider's open request is "fulfilled" once a driver confirms them on a trip that covers it.
// Fulfilled requests drop out of everyone's Co-riders deck; if that seat is later cancelled, they come back.
const { db } = require("./db");
const cfg = require("./config");

/** Requests of `userId` going the same way as booking `b`, whose time window contains the pickup time. */
function covered(userId, b, t, status) {
  const eta = t.depart_at + cfg.travelMinutes(t.origin_stop, b.pickup_stop) * 60000;
  const dir = cfg.direction(b.pickup_stop, b.drop_stop);
  return db.prepare("SELECT * FROM ride_requests WHERE rider_id=? AND status=?").all(userId, status)
    .filter((r) => cfg.direction(r.origin_stop, r.dest_stop) === dir && eta >= r.earliest_at - cfg.slackMs && eta <= r.latest_at + cfg.slackMs);
}

/** Everyone who travels on a booking: the rider, plus joined members for a group booking. */
const travellers = (b) => (b.group_id ? db.prepare("SELECT user_id FROM group_members WHERE group_id=? AND status='joined'").all(b.group_id).map((r) => r.user_id) : [b.rider_id]);

function fulfilRequests(b, t) {
  for (const w of travellers(b)) for (const r of covered(w, b, t, "open")) db.prepare("UPDATE ride_requests SET status='fulfilled' WHERE id=?").run(r.id);
}

/** Put requests back in the deck when a confirmed seat goes away, unless another confirmed seat still covers them. */
function reopenRequests(b, t) {
  for (const w of travellers(b)) for (const r of covered(w, b, t, "fulfilled")) {
    if (r.latest_at <= Date.now()) continue;
    const still = db.prepare(`SELECT b.*, t.depart_at, t.origin_stop AS t_origin FROM bookings b JOIN trips t ON t.id=b.trip_id
      WHERE b.status='confirmed' AND b.id != ? AND t.status='open' AND (b.rider_id=? OR b.group_id IN (SELECT group_id FROM group_members WHERE user_id=? AND status='joined'))`).all(b.id, w, w)
      .some((o) => covered(w, o, { depart_at: o.depart_at, origin_stop: o.t_origin }, "fulfilled").some((x) => x.id === r.id));
    if (!still) db.prepare("UPDATE ride_requests SET status='open' WHERE id=?").run(r.id);
  }
}

module.exports = { fulfilRequests, reopenRequests };
