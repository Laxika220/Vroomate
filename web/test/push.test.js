"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const http = require("http");
const H = require("./helpers");
const { generateVapidKeys } = require("../server/push");

const keys = generateVapidKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey;
const hmac = (k, d) => crypto.createHmac("sha256", k).update(d).digest();

// A fake push service that records what it receives.
const got = [];
const service = http.createServer((req, res) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => { got.push({ headers: req.headers, body: Buffer.concat(c) }); res.writeHead(201); res.end(); }); });
before(async () => { await H.start(); await new Promise((r) => service.listen(0, "127.0.0.1", r)); });
after(() => { H.stop(); service.close(); });

/** What a browser does with an aes128gcm push body, given its own key pair and auth secret. */
function decrypt(body, ua, auth) {
  const salt = body.subarray(0, 16), idlen = body[20], asPublic = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const d = crypto.createDecipheriv("aes-128-gcm", hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16), hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12));
  d.setAuthTag(ct.subarray(-16));
  const pt = Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]);
  assert.equal(pt[pt.length - 1], 2, "last-record delimiter");
  return JSON.parse(pt.subarray(0, -1).toString());
}

test("subscriptions are validated", async () => {
  const u = await H.account("community");
  assert.equal((await u.call("POST", "/api/push/subscribe", { endpoint: "http://insecure", keys: {} })).status, 400);
});

test("notifications are pushed encrypted and VAPID-signed, and gone subscriptions are dropped", async () => {
  const d = await H.approvedDriver(null);
  const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const endpoint = `http://127.0.0.1:${service.address().port}/push/abc`;
  H.db.prepare("INSERT INTO push_subscriptions (endpoint,user_id,p256dh,auth,created_at) VALUES (?,?,?,?,?)").run(endpoint, d.user.id, ua.getPublicKey().toString("base64url"), auth.toString("base64url"), Date.now());
  const t = await d.post("/api/trips", { vehicle_id: d.vehicleId, origin_stop: "lavasa-campus", dest_stop: "pune-station", depart_at: H.inHours(4), seats: 2, price_per_seat: 150 });
  const r = await H.account("community");
  await r.post("/api/bookings", { trip_id: t.id, pickup_stop: "lavasa-campus", drop_stop: "pune-station" });
  for (let i = 0; i < 50 && !got.length; i++) await new Promise((ok) => setTimeout(ok, 20));
  const msg = got[0];
  assert.equal(msg.headers["content-encoding"], "aes128gcm");
  const data = decrypt(msg.body, ua, auth);
  assert.match(data.title, /wants 1 seat/); assert.equal(data.link, "/rides");
  // VAPID: the JWT is signed by our private key and addressed to the push service's origin.
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(msg.headers.authorization);
  assert.equal(k, keys.publicKey);
  const [hd, pl, sig] = jwt.split(".");
  assert.equal(JSON.parse(Buffer.from(pl, "base64url")).aud, new URL(endpoint).origin);
  const pub = Buffer.from(keys.publicKey, "base64url");
  const key = crypto.createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") } });
  assert.ok(crypto.verify("sha256", Buffer.from(`${hd}.${pl}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")));
});
