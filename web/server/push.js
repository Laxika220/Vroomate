"use strict";
// Web Push (RFC 8030/8291/8292) with Node's crypto only: VAPID-signed requests and aes128gcm payload encryption.
// Turned on by VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (make a pair with `npm run vapid`).
// Every in-app notification is also pushed to the person's subscribed browsers.
const crypto = require("crypto");
const { db } = require("./db");
const { route, bad, send } = require("./http");
const { onNotify } = require("./notify");

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(String(s), "base64url");
const enabled = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

/** Fresh VAPID key pair as base64url strings: public is the 65-byte uncompressed point, private the 32-byte scalar. */
function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" }), priv = privateKey.export({ format: "jwk" });
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(pub.x), unb64u(pub.y)])), privateKey: priv.d };
}

function vapidHeader(endpoint) {
  const pub = unb64u(process.env.VAPID_PUBLIC_KEY);
  const key = crypto.createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", d: process.env.VAPID_PRIVATE_KEY, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || "mailto:admin@vroomate.invalid" }));
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${process.env.VAPID_PUBLIC_KEY}`;
}

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

/** Encrypt `payload` for one browser subscription (RFC 8291, single aes128gcm record). */
function encrypt(payload, p256dh, auth) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ct]);
}

async function pushTo(sub, data) {
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: { Authorization: vapidHeader(sub.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "high" },
    body: encrypt(JSON.stringify(data), sub.p256dh, sub.auth),
  });
  // 404/410: the browser dropped this subscription, so forget it.
  if (r.status === 404 || r.status === 410) db.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").run(sub.endpoint);
  else if (!r.ok) console.error("Push failed", r.status, await r.text().catch(() => ""));
  return r.status;
}

onNotify((userId, n) => {
  if (!enabled()) return;
  for (const sub of db.prepare("SELECT * FROM push_subscriptions WHERE user_id=?").all(userId))
    pushTo(sub, { title: n.title, body: n.body, link: n.link || "/home" }).catch((e) => console.error("Push failed", e.message));
});

route("POST", "/api/push/subscribe", ({ res, user, body }) => {
  const endpoint = String(body.endpoint || ""), keys = body.keys || {};
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) throw bad("Invalid push subscription.");
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(keys.p256dh || "") || !/^[A-Za-z0-9_-]{16,30}$/.test(keys.auth || "")) throw bad("Invalid push keys.");
  db.prepare(`INSERT INTO push_subscriptions (endpoint,user_id,p256dh,auth,created_at) VALUES (?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`).run(endpoint, user.id, keys.p256dh, keys.auth, Date.now());
  send(res, 200, { ok: true });
});

route("POST", "/api/push/unsubscribe", ({ res, user, body }) => {
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?").run(String(body.endpoint || ""), user.id);
  send(res, 200, { ok: true });
});

if (require.main === module) {
  const k = generateVapidKeys();
  console.log(`Add these to the server's environment:\n\nVAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:you@example.com`);
}
module.exports = { generateVapidKeys, encrypt, pushTo };
