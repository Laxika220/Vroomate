"use strict";
// After a completed trip, riders rate their driver and drivers rate their riders (1-5 stars, optional comment).
// Averages show on profiles and swipe cards so people can judge someone they've never met.
const { db } = require("./db");
const { route, bad, forbidden, notFound, conflict, send } = require("./http");

const WINDOW = 14 * 86400000;   // ratings stay open for two weeks after the trip

route("POST", "/api/ratings", ({ res, user, body }) => {
  const b = db.prepare("SELECT * FROM bookings WHERE id=?").get(Number(body.booking_id));
  if (!b) throw notFound("Trip not found");
  const t = db.prepare("SELECT * FROM trips WHERE id=?").get(b.trip_id);
  const ratee = Number(body.ratee_id);
  // Only the two sides of the booking can rate each other.
  const ok = (user.id === b.rider_id && ratee === t.driver_id) || (user.id === t.driver_id && ratee === b.rider_id);
  if (!ok) throw forbidden("You can only rate people you travelled with.");
  if (b.status !== "completed") throw conflict("You can rate once the trip is completed.");
  if (Date.now() - b.updated_at > WINDOW) throw conflict("Ratings close two weeks after the trip.");
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw bad("Pick 1 to 5 stars.");
  const comment = String(body.comment || "").trim().slice(0, 300);
  db.prepare(`INSERT INTO ratings (booking_id,rater_id,ratee_id,stars,comment,created_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(booking_id,rater_id,ratee_id) DO UPDATE SET stars=excluded.stars, comment=excluded.comment`).run(b.id, user.id, ratee, stars, comment, Date.now());
  send(res, 200, { ok: true });
});

/** Recent comments about someone, for their profile. */
route("GET", "/api/users/:id/ratings", ({ res, params }) => {
  const rows = db.prepare(`SELECT r.stars, r.comment, r.created_at, u.name FROM ratings r JOIN users u ON u.id=r.rater_id
    WHERE r.ratee_id=? AND r.comment != '' ORDER BY r.created_at DESC LIMIT 20`).all(Number(params.id));
  send(res, 200, { ratings: rows.map((r) => ({ stars: r.stars, comment: r.comment, created_at: r.created_at, by: r.name.split(" ")[0] })) });
});

/** True if `raterId` already rated `rateeId` for booking `bookingId`. */
const rated = (bookingId, raterId, rateeId) => !!db.prepare("SELECT 1 FROM ratings WHERE booking_id=? AND rater_id=? AND ratee_id=?").get(bookingId, raterId, rateeId);
const canRate = (b) => b.status === "completed" && Date.now() - b.updated_at <= WINDOW;

module.exports = { rated, canRate };
