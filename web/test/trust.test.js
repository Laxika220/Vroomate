"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");
const { tidy } = require("../server/housekeeping");

before(() => H.start());
after(() => H.stop());

/** A driver, a rider with a confirmed seat, and the trip (departing in `hours`). */
async function confirmedTrip(hours = 3) {
  const d = await H.approvedDriver(null);
  const t = await d.post("/api/trips", { vehicle_id: d.vehicleId, origin_stop: "lavasa-campus", dest_stop: "pune-station", depart_at: H.inHours(hours), seats: 3, price_per_seat: 150 });
  const r = await H.account("community");
  const b = await r.post("/api/bookings", { trip_id: t.id, pickup_stop: "lavasa-campus", drop_stop: "pune-station" });
  await d.post(`/api/bookings/${b.id}/respond`, { decision: "accept" });
  return { d, r, t, b };
}

test("ratings open after the trip, only between people who travelled together, and show as an average", async () => {
  const { d, r, t, b } = await confirmedTrip();
  const stranger = await H.account("community");
  assert.equal((await r.call("POST", "/api/ratings", { booking_id: b.id, ratee_id: d.user.id, stars: 5 })).status, 409, "not before the trip");
  H.db.prepare("UPDATE trips SET depart_at=? WHERE id=?").run(Date.now() - 7 * 3600000, t.id);
  tidy();
  assert.equal(H.db.prepare("SELECT status FROM bookings WHERE id=?").get(b.id).status, "completed", "housekeeping completes forgotten trips");
  const mine = (await r.get("/api/bookings/mine")).bookings.find((x) => x.id === b.id);
  assert.equal(mine.can_rate, true); assert.equal(mine.rated, false);
  assert.equal((await stranger.call("POST", "/api/ratings", { booking_id: b.id, ratee_id: d.user.id, stars: 1 })).status, 403);
  assert.equal((await r.call("POST", "/api/ratings", { booking_id: b.id, ratee_id: d.user.id, stars: 9 })).status, 400);
  await r.post("/api/ratings", { booking_id: b.id, ratee_id: d.user.id, stars: 4, comment: "On time, careful driver" });
  await d.post("/api/ratings", { booking_id: b.id, ratee_id: r.user.id, stars: 5 });
  const prof = (await stranger.get(`/api/users/${d.user.id}`)).user;
  assert.equal(prof.rating, 4); assert.equal(prof.rating_count, 1);
  assert.equal((await stranger.get(`/api/users/${d.user.id}/ratings`)).ratings[0].comment, "On time, careful driver");
  assert.equal((await r.get("/api/bookings/mine")).bookings.find((x) => x.id === b.id).rated, true);
});

test("a confirmed rider can share a trip link that anyone can open, showing the driver, car and plate", async () => {
  const { d, r, b } = await confirmedTrip();
  const { url } = await r.post(`/api/bookings/${b.id}/share`);
  const token = url.split("/share/")[1];
  const pub = await new H.Client().get("/api/share/" + token);
  assert.equal(pub.driver.name, d.user.name); assert.match(pub.vehicle.plate, /^MH12AB/); assert.equal(pub.status, "confirmed");
  assert.equal((await d.call("POST", `/api/bookings/${b.id}/share`)).status, 404, "only the rider shares their seat");
  assert.equal((await new H.Client().call("GET", "/api/share/nottherealtoken")).status, 404);
});

test("housekeeping expires old requests", async () => {
  const u = await H.account("community");
  const { id } = await u.post("/api/requests", { origin_stop: "lavasa-campus", dest_stop: "pune-station", earliest_at: H.inHours(1), latest_at: H.inHours(2), seats: 1 });
  tidy(Date.now() + 3 * 3600000);
  assert.equal(H.db.prepare("SELECT status FROM ride_requests WHERE id=?").get(id).status, "expired");
});
