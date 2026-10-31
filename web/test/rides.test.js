"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");

let admin;
before(async () => { await H.start(); admin = await H.account("student"); H.makeAdmin(admin); });
after(() => H.stop());

const publish = (d, o = {}) => d.post("/api/trips", { vehicle_id: d.vehicleId, origin_stop: "lavasa-campus", dest_stop: "pune-station", depart_at: H.inHours(3), seats: 3, fare_per_km_seat: 2.5, ...o });
const find = (rider, q) => rider.get("/api/discover/rides?" + new URLSearchParams(q).toString());

test("unapproved drivers cannot publish trips", async () => {
  const d = await H.account("driver");
  const r = await d.call("POST", "/api/trips", { vehicle_id: 1, origin_stop: "lavasa-campus", dest_stop: "pune-station", depart_at: H.inHours(3), seats: 1, fare_per_km_seat: 2 });
  assert.equal(r.status, 403);
});

test("pending vehicle blocks publishing; approved vehicle allows it", async () => {
  const d = await H.account("driver");
  await d.post("/api/driver", { licence_no: "MH1420190009999" });
  await admin.post(`/api/admin/drivers/${d.user.id}`, { decision: "approve" });
  const v = await d.post("/api/vehicles", { kind: "car", model: "Hyundai i20", colour: "Red", plate: "MH14XY4321", seats: 4 });
  const r = await d.call("POST", "/api/trips", { vehicle_id: v.id, origin_stop: "lavasa-campus", dest_stop: "pune-station", depart_at: H.inHours(3), seats: 2, fare_per_km_seat: 2 });
  assert.equal(r.status, 403);
  await admin.post(`/api/admin/vehicles/${v.id}`, { decision: "approve" });
  const ok = await d.call("POST", "/api/trips", { vehicle_id: v.id, origin_stop: "lavasa-campus", dest_stop: "pune-station", depart_at: H.inHours(3), seats: 2, fare_per_km_seat: 2 });
  assert.equal(ok.status, 201);
});

test("only feasible routes are recommended (direction, segment and pickup time)", async () => {
  const d = await H.approvedDriver(admin);
  await publish(d, { dest_stop: "kothrud", depart_at: H.inHours(4) });          // Lavasa -> Kothrud
  const rider = await H.account("student", { home_stop: "paud" });
  const win = { earliest: H.inHours(0), latest: H.inHours(12) };
  const has = async (pickup, drop) => (await find(rider, { pickup, drop, ...win })).results.some((r) => r.driver.id === d.user.id);
  assert.equal(await has("paud", "kothrud"), true, "Paud to Kothrud is on the driver's path");
  assert.equal(await has("dasve", "pirangut"), true, "mid-route to mid-route is on the path");
  assert.equal(await has("kothrud", "paud"), false, "opposite direction must be excluded");
  assert.equal(await has("paud", "shivajinagar"), false, "drop beyond the driver's destination must be excluded");
  assert.equal(await has("paud", "pune-station"), false, "both Pune-bound but destination is past the driver's end");
  // time: driver reaches Paud 65 min after departure (~5h05m from now). A window that closes before that excludes it.
  const early = await find(rider, { pickup: "paud", drop: "kothrud", earliest: H.inHours(0), latest: H.inHours(2) });
  assert.equal(early.results.some((r) => r.driver.id === d.user.id), false, "driver passes the pickup too late for this window");
});

test("a request does not take a seat; the driver's accept does, and fare uses distance travelled", async () => {
  const d = await H.approvedDriver(admin);
  const t = await publish(d, { seats: 3 });
  const rider = await H.account("student");
  const b = await rider.post("/api/bookings", { trip_id: t.id, pickup_stop: "paud", drop_stop: "kothrud", seats: 2 });
  assert.equal(b.fare_total, Math.round(2.5 * 21 * 2));            // km 36 -> 57 = 21km, 2 seats
  let mine = (await d.get("/api/trips/mine")).trips.find((x) => x.id === t.id);
  assert.equal(mine.seats_available, 3, "pending request must not reserve seats");
  await d.post(`/api/bookings/${b.id}/respond`, { decision: "accept" });
  mine = (await d.get("/api/trips/mine")).trips.find((x) => x.id === t.id);
  assert.equal(mine.seats_available, 1);
  const again = await rider.call("POST", "/api/bookings", { trip_id: t.id, pickup_stop: "paud", drop_stop: "kothrud", seats: 1 });
  assert.equal(again.status, 409, "duplicate active request is refused");
});

test("rejecting a request frees nothing and leaves seats untouched", async () => {
  const d = await H.approvedDriver(admin);
  const t = await publish(d, { seats: 2 });
  const rider = await H.account("student");
  const b = await rider.post("/api/bookings", { trip_id: t.id, pickup_stop: "lavasa-campus", drop_stop: "pune-station", seats: 1 });
  await d.post(`/api/bookings/${b.id}/respond`, { decision: "reject" });
  const mine = (await d.get("/api/trips/mine")).trips.find((x) => x.id === t.id);
  assert.equal(mine.seats_available, 2);
  const list = (await rider.get("/api/bookings/mine")).bookings.find((x) => x.id === b.id);
  assert.equal(list.status, "rejected");
});

test("concurrent accepts can never overbook a trip", async () => {
  const d = await H.approvedDriver(admin);
  const t = await publish(d, { seats: 1 });
  const riders = await Promise.all([H.account("student"), H.account("student"), H.account("student")]);
  const bookings = [];
  for (const r of riders) bookings.push(await r.post("/api/bookings", { trip_id: t.id, pickup_stop: "lavasa-campus", drop_stop: "pune-station", seats: 1 }));
  const results = await Promise.all(bookings.map((b) => d.call("POST", `/api/bookings/${b.id}/respond`, { decision: "accept" })));
  assert.equal(results.filter((r) => r.status === 200).length, 1, "exactly one accept wins");
  assert.equal(results.filter((r) => r.status === 409).length, 2, "the others are told the seats are gone");
  const row = H.db.prepare("SELECT seats_available FROM trips WHERE id=?").get(t.id);
  assert.equal(row.seats_available, 0);
  assert.equal(H.db.prepare("SELECT COUNT(*) n FROM bookings WHERE trip_id=? AND status='confirmed'").get(t.id).n, 1);
});

test("cancelling a confirmed booking returns the seats; a full trip disappears from Discover", async () => {
  const d = await H.approvedDriver(admin);
  const t = await publish(d, { seats: 1 });
  const rider = await H.account("student"), other = await H.account("student");
  const b = await rider.post("/api/bookings", { trip_id: t.id, pickup_stop: "lavasa-campus", drop_stop: "pune-station", seats: 1 });
  await d.post(`/api/bookings/${b.id}/respond`, { decision: "accept" });
  const q = { pickup: "lavasa-campus", drop: "pune-station", earliest: H.inHours(0), latest: H.inHours(12) };
  assert.equal((await find(other, q)).results.some((r) => r.trip.id === t.id), false, "full trip hidden");
  await rider.post(`/api/bookings/${b.id}/cancel`);
  assert.equal(H.db.prepare("SELECT seats_available FROM trips WHERE id=?").get(t.id).seats_available, 1);
  assert.equal((await find(other, q)).results.some((r) => r.trip.id === t.id), true, "seat is bookable again");
});

test("group booking takes one seat per joined member and needs a real group", async () => {
  const d = await H.approvedDriver(admin);
  const t = await publish(d, { seats: 3 });
  const [a, b, c] = [await H.account("student", { interests: ["Music"] }), await H.account("student", { interests: ["Music"] }), await H.account("student", { interests: ["Music"] })];
  // make matches a-b and a-c through mutual likes
  for (const other of [b, c]) { await a.post("/api/swipes", { target_id: other.user.id, direction: "like" }); const r = await other.post("/api/swipes", { target_id: a.user.id, direction: "like" }); assert.equal(r.matched, true); }
  const g = await a.post("/api/groups", { name: "Weekend crew", invite: [b.user.id, c.user.id] });
  const early = await a.call("POST", "/api/bookings", { trip_id: t.id, group_id: g.id, pickup_stop: "lavasa-campus", drop_stop: "pune-station" });
  assert.equal(early.status, 400, "nobody has joined yet");
  await b.post(`/api/groups/${g.id}/respond`, { accept: true });
  await c.post(`/api/groups/${g.id}/respond`, { accept: true });
  const stranger = await H.account("student");
  assert.equal((await stranger.call("POST", "/api/groups", { name: "Crew", invite: [a.user.id] })).status, 403, "can't invite people you haven't matched with");
  const bk = await a.post("/api/bookings", { trip_id: t.id, group_id: g.id, pickup_stop: "lavasa-campus", drop_stop: "pune-station" });
  assert.equal(bk.seats, 3);
  await d.post(`/api/bookings/${bk.id}/respond`, { decision: "accept" });
  assert.equal(H.db.prepare("SELECT seats_available FROM trips WHERE id=?").get(t.id).seats_available, 0);
  const seenByB = (await b.get("/api/bookings/mine")).bookings.find((x) => x.id === bk.id);
  assert.ok(seenByB && seenByB.status === "confirmed", "group members see the booking");
});

test("a driver cancelling a trip cancels every booking on it", async () => {
  const d = await H.approvedDriver(admin);
  const t = await publish(d, { seats: 2 });
  const rider = await H.account("student");
  const b = await rider.post("/api/bookings", { trip_id: t.id, pickup_stop: "lavasa-campus", drop_stop: "pune-station", seats: 1 });
  await d.post(`/api/bookings/${b.id}/respond`, { decision: "accept" });
  await d.post(`/api/trips/${t.id}/cancel`);
  const mine = (await rider.get("/api/bookings/mine")).bookings.find((x) => x.id === b.id);
  assert.equal(mine.status, "cancelled");
});

test("plates and contact details stay private until a booking is confirmed", async () => {
  const d = await H.approvedDriver(admin);
  await d.ok("PUT", "/api/me", { ...d.user, phone: "+91 98765 43210" });
  const t = await publish(d, { seats: 2 });
  const rider = await H.account("student");
  const b = await rider.post("/api/bookings", { trip_id: t.id, pickup_stop: "lavasa-campus", drop_stop: "pune-station", seats: 1 });
  let row = (await rider.get("/api/bookings/mine")).bookings.find((x) => x.id === b.id);
  assert.equal(row.driver_phone, null); assert.equal(row.vehicle.plate, undefined);
  await d.post(`/api/bookings/${b.id}/respond`, { decision: "accept" });
  row = (await rider.get("/api/bookings/mine")).bookings.find((x) => x.id === b.id);
  assert.equal(row.driver_phone, "+91 98765 43210"); assert.match(row.vehicle.plate, /^MH12AB/);
});
