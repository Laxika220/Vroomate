"use strict";
const { db, tx } = require("./db");
const cfg = require("./config");
const { notify } = require("./notify");
const { route, bad, forbidden, notFound, conflict, send } = require("./http");
const { publicUser } = require("./users");
const { reopenRequests } = require("./fulfil");

const int = (v, lo, hi, field) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw bad(`${field} must be a whole number from ${lo} to ${hi}.`);
  return n;
};
const validStop = (id, field) => { if (!cfg.stop(id)) throw bad(`Choose a valid ${field}.`); return id; };

/* ---------- vehicles: anyone can offer a ride, no approval step ---------- */
route("GET", "/api/vehicles", ({ res, user }) => {
  send(res, 200, { vehicles: db.prepare("SELECT id, kind, model, colour, plate, seats FROM vehicles WHERE owner_id=? ORDER BY id DESC").all(user.id) });
});

/** Find the caller's vehicle by plate (updating its details) or add it. */
function saveVehicle(user, v, minSeats) {
  const model = String(v.model || "").trim().slice(0, 40), colour = String(v.colour || "").trim().slice(0, 20);
  const plate = String(v.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (model.length < 2) throw bad("Add your car's model, for example Maruti Swift.");
  if (colour.length < 2) throw bad("Add your car's colour.");
  if (!/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(plate)) throw bad("Enter the number plate, for example MH12AB1234.");
  const kind = ["car", "suv", "van", "bike"].includes(v.kind) ? v.kind : "car";
  const seats = Math.max(minSeats, kind === "bike" ? 1 : 4);
  const cur = db.prepare("SELECT * FROM vehicles WHERE plate=?").get(plate);
  if (cur && cur.owner_id !== user.id) throw conflict("That number plate is already registered by someone else.");
  if (cur) {
    db.prepare("UPDATE vehicles SET kind=?, model=?, colour=?, seats=MAX(seats,?), status='approved' WHERE id=?").run(kind, model, colour, seats, cur.id);
    return db.prepare("SELECT * FROM vehicles WHERE id=?").get(cur.id);
  }
  const info = db.prepare("INSERT INTO vehicles (owner_id,kind,model,colour,plate,seats,status,created_at) VALUES (?,?,?,?,?,?,'approved',?)").run(user.id, kind, model, colour, plate, seats, Date.now());
  return db.prepare("SELECT * FROM vehicles WHERE id=?").get(Number(info.lastInsertRowid));
}

route("POST", "/api/vehicles", ({ res, user, body }) => {
  send(res, 201, { id: saveVehicle(user, body, int(body.seats || 1, 1, 8, "Seats")).id });
});

/* ---------- trips ---------- */
route("POST", "/api/trips", ({ res, user, body }) => {
  const o = validStop(body.origin_stop, "start"), d = validStop(body.dest_stop, "destination");
  if (o === d) throw bad("Start and destination must be different.");
  const departAt = Number(body.depart_at);
  if (!Number.isFinite(departAt) || departAt < Date.now() + 10 * 60000) throw bad("Pick a departure time at least 10 minutes from now.");
  if (departAt > Date.now() + 60 * 86400000) throw bad("Rides can be posted up to 60 days ahead.");
  const seats = int(body.seats, 1, 8, "Seats");
  const womenOnly = body.women_only ? 1 : 0;
  if (womenOnly && user.gender !== "f") throw forbidden("Only women can post women-only rides.");
  const v = body.vehicle ? saveVehicle(user, body.vehicle, seats) : db.prepare("SELECT * FROM vehicles WHERE id=? AND owner_id=?").get(Number(body.vehicle_id), user.id);
  if (!v) throw bad("Add the car you're driving.");
  if (seats > v.seats) throw bad(`Your ${v.model} has ${v.seats} passenger seat${v.seats > 1 ? "s" : ""}.`);
  // Price is entered per seat for the whole route; stored per km so riders joining part-way pay for their distance.
  const km = cfg.distanceKm(o, d), maxPerKm = cfg.cfg.maxFarePerKmInr;
  let perKm = Number(body.fare_per_km_seat);
  if (body.price_per_seat != null) {
    if (body.price_per_seat === "") throw bad("Set a price per seat. ₹0 is fine if it's free.");
    const price = Number(body.price_per_seat);
    if (!(price >= 0 && price <= Math.floor(km * maxPerKm))) throw bad(`Price per seat must be between ₹0 and ₹${Math.floor(km * maxPerKm)} for this route.`);
    perKm = Math.round((price / km) * 100) / 100;
  }
  if (!(perKm >= 0 && perKm <= maxPerKm)) throw bad(`Fare per km must be between 0 and ${maxPerKm} rupees.`);
  const dup = db.prepare("SELECT 1 FROM trips WHERE driver_id=? AND status='open' AND ABS(depart_at-?)<1800000").get(user.id, departAt);
  if (dup) throw conflict("You already have a ride within 30 minutes of that time.");
  const info = db.prepare(`INSERT INTO trips (driver_id,vehicle_id,origin_stop,dest_stop,depart_at,seats_total,seats_available,fare_per_km_seat,notes,women_only,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(user.id, v.id, o, d, departAt, seats, seats, perKm, String(body.notes || "").trim().slice(0, 160), womenOnly, Date.now());
  const id = Number(info.lastInsertRowid);
  try { require("./radar").onTripPublished(id); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") console.error(e); }
  send(res, 201, { id });
});

function tripRow(t) {
  const v = db.prepare("SELECT kind,model,colour,plate,seats FROM vehicles WHERE id=?").get(t.vehicle_id);
  return { ...t, women_only: !!t.women_only, vehicle: v };
}

route("GET", "/api/trips/mine", ({ res, user }) => {
  const rows = db.prepare("SELECT * FROM trips WHERE driver_id=? ORDER BY depart_at DESC LIMIT 60").all(user.id);
  const out = rows.map((t) => {
    const bookings = db.prepare("SELECT id,rider_id,group_id,seats,pickup_stop,drop_stop,fare_total,status FROM bookings WHERE trip_id=? AND status IN ('pending','confirmed') ORDER BY id").all(t.id)
      .map((b) => ({ ...b, rider: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(b.rider_id)) }));
    return { ...tripRow(t), bookings };
  });
  send(res, 200, { trips: out });
});

route("POST", "/api/trips/:id/cancel", ({ res, user, params }) => {
  const t = db.prepare("SELECT * FROM trips WHERE id=? AND driver_id=?").get(Number(params.id), user.id);
  if (!t) throw notFound("Trip not found");
  tx(() => {
    if (t.status !== "open") throw conflict("This trip is already " + t.status + ".");
    db.prepare("UPDATE trips SET status='cancelled' WHERE id=?").run(t.id);
    const affected = db.prepare("SELECT id,rider_id FROM bookings WHERE trip_id=? AND status IN ('pending','confirmed')").all(t.id);
    const confirmed = db.prepare("SELECT * FROM bookings WHERE trip_id=? AND status='confirmed'").all(t.id);
    db.prepare("UPDATE bookings SET status='cancelled', updated_at=? WHERE trip_id=? AND status IN ('pending','confirmed')").run(Date.now(), t.id);
    for (const b of confirmed) reopenRequests(b, t);
    for (const b of affected) notify(b.rider_id, "booking", "Trip cancelled", `${user.name} cancelled the ${cfg.stop(t.origin_stop).short} to ${cfg.stop(t.dest_stop).short} trip.`, "/rides");
  });
  send(res, 200, { ok: true });
});

route("POST", "/api/trips/:id/complete", ({ res, user, params }) => {
  const t = db.prepare("SELECT * FROM trips WHERE id=? AND driver_id=?").get(Number(params.id), user.id);
  if (!t) throw notFound("Trip not found");
  if (t.status !== "open") throw conflict("This trip is already " + t.status + ".");
  if (t.depart_at > Date.now() + 15 * 60000) throw conflict("You can mark a trip complete once it has departed.");
  tx(() => {
    db.prepare("UPDATE trips SET status='completed' WHERE id=?").run(t.id);
    db.prepare("UPDATE bookings SET status='completed', updated_at=? WHERE trip_id=? AND status='confirmed'").run(Date.now(), t.id);
    db.prepare("UPDATE bookings SET status='cancelled', updated_at=? WHERE trip_id=? AND status='pending'").run(Date.now(), t.id);
  });
  send(res, 200, { ok: true });
});

/* ---------- ride requests (what a rider needs; feeds Ride Radar and buddy matching) ---------- */
route("POST", "/api/requests", ({ res, user, body }) => {
  const o = validStop(body.origin_stop, "start"), d = validStop(body.dest_stop, "destination");
  if (o === d) throw bad("Start and destination must be different.");
  const e = Number(body.earliest_at), l = Number(body.latest_at);
  if (!Number.isFinite(e) || !Number.isFinite(l)) throw bad("Pick when you want to leave.");
  if (l < e) throw bad("Latest departure must be after the earliest.");
  if (l < Date.now() + 5 * 60000) throw bad("That time has already passed.");
  if (l - e > 12 * 3600000) throw bad("Keep your departure window within 12 hours.");
  if (e > Date.now() + 60 * 86400000) throw bad("Requests can be up to 60 days ahead.");
  const seats = int(body.seats || 1, 1, 8, "Seats");
  const maxFare = body.max_fare === "" || body.max_fare == null ? null : int(body.max_fare, 0, 5000, "Max fare");
  if (db.prepare("SELECT COUNT(*) n FROM ride_requests WHERE rider_id=? AND status='open'").get(user.id).n >= 10) throw conflict("You have 10 open requests. Cancel one first.");
  const info = db.prepare(`INSERT INTO ride_requests (rider_id,origin_stop,dest_stop,earliest_at,latest_at,seats,max_fare,note,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(user.id, o, d, e, l, seats, maxFare, String(body.note || "").trim().slice(0, 160), Date.now());
  const id = Number(info.lastInsertRowid);
  try { require("./radar").onRequestPosted(id); } catch (err) { if (err.code !== "MODULE_NOT_FOUND") console.error(err); }
  send(res, 201, { id });
});

route("GET", "/api/requests/mine", ({ res, user }) => {
  send(res, 200, { requests: db.prepare("SELECT * FROM ride_requests WHERE rider_id=? AND status IN ('open') ORDER BY earliest_at").all(user.id) });
});

route("POST", "/api/requests/:id/cancel", ({ res, user, params }) => {
  const r = db.prepare("UPDATE ride_requests SET status='cancelled' WHERE id=? AND rider_id=? AND status='open'").run(Number(params.id), user.id);
  if (!r.changes) throw notFound("Open request not found");
  send(res, 200, { ok: true });
});

module.exports = { tripRow };
