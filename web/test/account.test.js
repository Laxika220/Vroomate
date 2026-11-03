"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");
const { sent } = require("../server/outbox");

before(() => H.start());
after(() => H.stop());

const lastEmailTo = (to) => [...sent].reverse().find((m) => m.kind === "email" && m.to === to);

test("signup needs the terms accepted", async () => {
  const c = new H.Client();
  const r = await c.call("POST", "/api/auth/signup", { email: "noterms@example.com", password: "password123", name: "No Terms" });
  assert.equal(r.status, 400);
});

test("forgot password emails a one-time link that resets the password and logs out other devices", async () => {
  const u = await H.account("community");
  const other = new H.Client(); await other.post("/api/auth/login", { email: u.user.email, password: "password123" });
  const anon = new H.Client();
  await anon.post("/api/auth/forgot", { email: u.user.email });
  assert.equal((await anon.call("POST", "/api/auth/forgot", { email: "nobody@example.com" })).status, 200, "unknown emails get the same answer");
  const token = /#\/reset\/([0-9a-f]{64})/.exec(lastEmailTo(u.user.email).text)[1];
  assert.equal((await anon.call("POST", "/api/auth/reset", { token, password: "short" })).status, 400);
  await anon.post("/api/auth/reset", { token, password: "newpassword1" });
  assert.equal((await anon.get("/api/me")).user.id, u.user.id, "logged in after reset");
  assert.equal((await anon.call("POST", "/api/auth/reset", { token, password: "another123" })).status, 400, "link works once");
  assert.equal((await other.call("GET", "/api/me")).status, 401, "other devices logged out");
  assert.equal((await new H.Client().call("POST", "/api/auth/login", { email: u.user.email, password: "newpassword1" })).status, 200);
});

test("offering or requesting a seat needs a verified phone; a code verifies it and changing the number unverifies it", async () => {
  const u = await H.account("community", { unverified: true });
  const ride = { origin_stop: "lavasa-campus", dest_stop: "pune-station", depart_at: H.inHours(3), seats: 2, price_per_seat: 150, vehicle: { model: "Swift", colour: "Red", plate: "MH12QQ1111" } };
  const r = await u.call("POST", "/api/trips", ride);
  assert.equal(r.status, 403); assert.equal(r.data.code, "phone_unverified");
  assert.equal((await u.call("POST", "/api/me/phone/send")).status, 400, "needs a number first");
  await u.ok("PUT", "/api/me", { ...u.user, phone: "9876500000" });
  const { dev_code } = await u.post("/api/me/phone/send");
  assert.match(dev_code, /^\d{6}$/);
  assert.equal((await u.call("POST", "/api/me/phone/verify", { code: "000000" === dev_code ? "111111" : "000000" })).status, 400);
  assert.equal((await u.post("/api/me/phone/verify", { code: dev_code })).user.phone_verified, true);
  await u.post("/api/trips", ride);
  const me = (await u.get("/api/me")).user;
  assert.equal((await u.ok("PUT", "/api/me", { ...me, phone: "9876511111" })).user.phone_verified, false);
});

test("a seat request emails the driver unless they turned emails off", async () => {
  const d = await H.approvedDriver(null);
  const t = await d.post("/api/trips", { vehicle_id: d.vehicleId, origin_stop: "lavasa-campus", dest_stop: "pune-station", depart_at: H.inHours(5), seats: 3, price_per_seat: 150 });
  const r = await H.account("community");
  await r.post("/api/bookings", { trip_id: t.id, pickup_stop: "lavasa-campus", drop_stop: "pune-station" });
  await new Promise((ok) => setTimeout(ok, 20));
  assert.match(lastEmailTo(d.user.email).text, /Lavasa Campus to Pune Station/);
  await d.ok("PUT", "/api/me/settings", { email_notifications: false });
  const r2 = await H.account("community");
  const before = sent.length;
  await r2.post("/api/bookings", { trip_id: t.id, pickup_stop: "lavasa-campus", drop_stop: "pune-station" });
  await new Promise((ok) => setTimeout(ok, 20));
  assert.ok(!sent.slice(before).some((m) => m.to === d.user.email));
});

test("you can download your data and delete your account", async () => {
  const u = await H.account("community");
  const exp = await u.get("/api/me/export");
  assert.equal(exp.profile.email, u.user.email); assert.ok(!("password_hash" in exp.profile));
  assert.equal((await u.call("POST", "/api/me/delete", { password: "wrong" })).status, 400);
  await u.post("/api/me/delete", { password: "password123" });
  assert.equal((await u.call("GET", "/api/me")).status, 401);
  assert.equal((await new H.Client().call("POST", "/api/auth/login", { email: u.user.email, password: "password123" })).status, 401);
  const row = H.db.prepare("SELECT name, phone FROM users WHERE id=?").get(u.user.id);
  assert.equal(row.name, "Deleted user"); assert.equal(row.phone, null);
});
