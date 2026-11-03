"use strict";
// Trip sharing for safety: a rider with a confirmed seat makes a private link that shows who is driving,
// the car and plate, the route and timing. Anyone with the link can open it, until 12 hours after departure.
const crypto = require("crypto");
const { db } = require("./db");
const cfg = require("./config");
const { route, forbidden, notFound, conflict, send } = require("./http");

const stopLabel = (id) => (cfg.stop(id) ? cfg.stop(id).short : id);

route("POST", "/api/bookings/:id/share", ({ req, res, user, params }) => {
  const b = db.prepare("SELECT * FROM bookings WHERE id=?").get(Number(params.id));
  if (!b || b.rider_id !== user.id) throw notFound("Booking not found");
  if (b.status !== "confirmed") throw conflict("You can share a trip once your seat is confirmed.");
  const t = db.prepare("SELECT * FROM trips WHERE id=?").get(b.trip_id);
  const expires = t.depart_at + 12 * 3600000;
  if (expires < Date.now()) throw conflict("This trip has ended.");
  let row = db.prepare("SELECT token FROM trip_shares WHERE booking_id=? AND user_id=? AND expires_at > ?").get(b.id, user.id, Date.now());
  if (!row) {
    row = { token: crypto.randomBytes(18).toString("base64url") };
    db.prepare("INSERT INTO trip_shares (token,booking_id,user_id,expires_at) VALUES (?,?,?,?)").run(row.token, b.id, user.id, expires);
  }
  const base = process.env.APP_URL || `${process.env.VROOMATE_SECURE_COOKIE === "1" ? "https" : "http"}://${req.headers.host}`;
  send(res, 200, { url: `${base}/#/share/${row.token}` });
});

route("GET", "/api/share/:token", { auth: false }, ({ res, params }) => {
  const s = db.prepare("SELECT * FROM trip_shares WHERE token=?").get(params.token);
  if (!s || s.expires_at < Date.now()) throw notFound("This link has expired.");
  const b = db.prepare("SELECT * FROM bookings WHERE id=?").get(s.booking_id);
  const t = db.prepare("SELECT * FROM trips WHERE id=?").get(b.trip_id);
  const d = db.prepare("SELECT name, photo, phone FROM users WHERE id=?").get(t.driver_id);
  const r = db.prepare("SELECT name FROM users WHERE id=?").get(b.rider_id);
  const v = db.prepare("SELECT model, colour, plate FROM vehicles WHERE id=?").get(t.vehicle_id);
  if (!["confirmed", "completed", "cancelled"].includes(b.status)) throw forbidden("This trip isn't shared.");
  const eta = t.depart_at + cfg.travelMinutes(t.origin_stop, b.pickup_stop) * 60000;
  send(res, 200, {
    rider: r.name.split(" ")[0],
    driver: { name: d.name, photo: d.photo ? `/uploads/${d.photo}` : null, phone: b.status === "confirmed" ? d.phone : null },
    vehicle: v,
    pickup: stopLabel(b.pickup_stop), drop: stopLabel(b.drop_stop),
    pickup_at: eta, drop_at: t.depart_at + cfg.travelMinutes(t.origin_stop, b.drop_stop) * 60000,
    status: b.status === "cancelled" || t.status === "cancelled" ? "cancelled" : b.status === "completed" || t.status === "completed" ? "completed" : "confirmed",
  });
});
