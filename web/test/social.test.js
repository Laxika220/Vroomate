"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");

let admin;
before(async () => { await H.start(); admin = await H.account("student"); H.makeAdmin(admin); });
after(() => H.stop());

const request = (c, o = {}) => c.post("/api/requests", { origin_stop: "pune-station", dest_stop: "lavasa-campus", earliest_at: H.inHours(5), latest_at: H.inHours(7), seats: 1, ...o });
const buddies = (c, q = {}) => c.get("/api/discover/buddies?" + new URLSearchParams({ pickup: "pune-station", drop: "lavasa-campus", earliest: H.inHours(0), latest: H.inHours(24), ...q }));

test("buddy discovery only shows travellers whose route and time overlap", async () => {
  const me = await H.account("student");
  const match = await H.account("student");
  const wrongWay = await H.account("student");
  const wrongTime = await H.account("student");
  const noRequest = await H.account("student");
  await request(me);
  await request(match, { origin_stop: "kothrud" });                                               // overlaps my leg
  await request(wrongWay, { origin_stop: "lavasa-campus", dest_stop: "pune-station" });            // opposite way
  await request(wrongTime, { earliest_at: H.inHours(60), latest_at: H.inHours(62) });             // days later
  const ids = (await buddies(me)).results.map((r) => r.user.id);
  assert.ok(ids.includes(match.user.id));
  assert.ok(!ids.includes(wrongWay.user.id), "opposite direction excluded");
  assert.ok(!ids.includes(wrongTime.user.id), "non-overlapping time excluded");
  assert.ok(!ids.includes(noRequest.user.id), "people without a request aren't shown");
  const card = (await buddies(me)).results.find((r) => r.user.id === match.user.id);
  assert.equal(card.shared_km, 57, "Kothrud to Lavasa is shared");
  assert.equal(card.user.email, undefined, "email is never exposed");
});

test("a match needs two likes, and opens a private chat that only they can read", async () => {
  const a = await H.account("student"), b = await H.account("student"), outsider = await H.account("student");
  const one = await a.post("/api/swipes", { target_id: b.user.id, direction: "like" });
  assert.equal(one.matched, false);
  assert.equal((await a.get("/api/matches")).matches.length, 0);
  const two = await b.post("/api/swipes", { target_id: a.user.id, direction: "like" });
  assert.equal(two.matched, true);
  const conv = two.conversation_id;
  await a.post(`/api/conversations/${conv}/messages`, { body: "Hi! Friday 7am from Kothrud?" });
  const seen = await b.get(`/api/conversations/${conv}`);
  assert.equal(seen.messages[0].body, "Hi! Friday 7am from Kothrud?");
  assert.equal((await outsider.call("GET", `/api/conversations/${conv}`)).status, 404);
  assert.equal((await outsider.call("POST", `/api/conversations/${conv}/messages`, { body: "hi" })).status, 404);
  assert.ok((await b.get("/api/badges")).matches === 0, "reading clears unread");
});

test("a pass never matches, and passed people don't reappear", async () => {
  const a = await H.account("student"), b = await H.account("student");
  await request(a); await request(b);
  await a.post("/api/swipes", { target_id: b.user.id, direction: "pass" });
  await b.post("/api/swipes", { target_id: a.user.id, direction: "like" });
  assert.equal((await b.get("/api/matches")).matches.length, 0);
  assert.ok(!(await buddies(a)).results.some((r) => r.user.id === b.user.id));
});

test("blocking hides people everywhere and stops messages", async () => {
  const a = await H.account("student"), b = await H.account("student");
  await request(a); await request(b);
  await a.post("/api/swipes", { target_id: b.user.id, direction: "like" });
  const m = await b.post("/api/swipes", { target_id: a.user.id, direction: "like" });
  await a.post("/api/blocks", { user_id: b.user.id });
  assert.equal((await b.call("POST", `/api/conversations/${m.conversation_id}/messages`, { body: "hello?" })).status, 403);
  assert.equal((await a.get("/api/matches")).matches.length, 0);
  assert.ok(!(await buddies(b)).results.some((r) => r.user.id === a.user.id));
  assert.equal((await b.call("GET", `/api/users/${a.user.id}`)).status, 404);
  await a.post(`/api/blocks/${b.user.id}/remove`);
  assert.equal((await b.call("POST", `/api/conversations/${m.conversation_id}/messages`, { body: "hello again" })).status, 201);
});

test("reports reach the admin queue and can be resolved", async () => {
  const a = await H.account("student"), b = await H.account("student");
  assert.equal((await a.call("POST", "/api/reports", { target_id: b.user.id, reason: "made up" })).status, 400);
  await a.post("/api/reports", { target_id: b.user.id, reason: "No-show", details: "Did not turn up at Paud" });
  const q = await admin.get("/api/admin/queue");
  const rep = q.reports.find((r) => r.target_id === b.user.id);
  assert.ok(rep); assert.equal(rep.details, "Did not turn up at Paud");
  assert.equal((await a.call("GET", "/api/admin/queue")).status, 403, "non-admins can't read reports");
  await admin.post(`/api/admin/reports/${rep.id}`, { action: "action" });
  assert.ok(!(await admin.get("/api/admin/queue")).reports.some((r) => r.id === rep.id));
});

test("women-only settings are respected in both directions", async () => {
  const d = await H.approvedDriver(admin, { gender: "f" });
  const t = await d.post("/api/trips", { vehicle_id: d.vehicleId, origin_stop: "lavasa-campus", dest_stop: "pune-station", depart_at: H.inHours(3), seats: 2, fare_per_km_seat: 2, women_only: true });
  const man = await H.account("student", { gender: "m" }), woman = await H.account("student", { gender: "f" });
  const q = "?" + new URLSearchParams({ pickup: "lavasa-campus", drop: "pune-station", earliest: H.inHours(0), latest: H.inHours(12) });
  assert.ok(!(await man.get("/api/discover/rides" + q)).results.some((r) => r.trip.id === t.id));
  assert.ok((await woman.get("/api/discover/rides" + q)).results.some((r) => r.trip.id === t.id));
  assert.equal((await man.call("POST", "/api/bookings", { trip_id: t.id, pickup_stop: "lavasa-campus", drop_stop: "pune-station", seats: 1 })).status, 403);
  const man2 = await H.account("student", { gender: "m" });
  assert.equal((await man2.call("POST", "/api/trips", { vehicle_id: 1, origin_stop: "lavasa-campus", dest_stop: "pune-station", depart_at: H.inHours(3), seats: 1, fare_per_km_seat: 2, women_only: true })).status, 403);
});

test("Ride Radar: demand without drivers alerts recent drivers once; a published trip alerts the riders", async () => {
  const d = await H.approvedDriver(admin);
  await d.post("/api/trips", { vehicle_id: d.vehicleId, origin_stop: "lavasa-campus", dest_stop: "pune-station", depart_at: H.inHours(50), seats: 1, fare_per_km_seat: 2 });   // has offered a ride before
  const riders = [await H.account("student"), await H.account("student"), await H.account("student")];
  const win = { earliest_at: H.inHours(30), latest_at: H.inHours(32) };
  for (const r of riders) await request(r, win);
  const alerts = H.db.prepare("SELECT * FROM notifications WHERE user_id=? AND kind='radar'").all(d.user.id);
  assert.equal(alerts.length, 1, "driver alerted exactly once for the cluster");
  const radar = await d.get("/api/radar");
  const mine = (x) => x.earliest_at >= win.earliest_at - 3600000 && x.earliest_at <= win.latest_at;   // this test's own cluster
  const cluster = radar.demand.find(mine);
  assert.equal(cluster.riders, 3);
  assert.equal(cluster.unserved, 3);
  assert.equal(JSON.stringify(radar).includes("Student"), false, "rider identities are never shown on the radar");
  await d.post("/api/trips", { vehicle_id: d.vehicleId, origin_stop: "pune-station", dest_stop: "lavasa-campus", depart_at: H.inHours(30), seats: 3, fare_per_km_seat: 2 });
  for (const r of riders) assert.equal(H.db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND kind='radar'").get(r.user.id).n, 1, "each rider told a matching trip exists");
  assert.equal((await d.get("/api/radar")).demand.some(mine), false, "demand is served now");
});
