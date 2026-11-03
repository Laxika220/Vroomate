"use strict";
const crypto = require("crypto");
const { db } = require("./db");
const { HttpError } = require("./http");

const SESSION_MS = 30 * 24 * 3600 * 1000;
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return "s1$" + salt.toString("hex") + "$" + key.toString("hex");
}
function checkPassword(pw, stored) {
  const [v, saltHex, keyHex] = String(stored).split("$");
  if (v !== "s1") return false;
  const key = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(keyHex, "hex");
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)").run(sha(token), userId, Date.now() + SESSION_MS);
  return token;
}
function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.suspended_at IS NULL`).get(sha(token), Date.now());
  return row || null;
}
function destroySession(token) { if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token)); }
function cookie(token, maxAgeSec) {
  return `vm_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}` + (process.env.VROOMATE_SECURE_COOKIE === "1" ? "; Secure" : "");
}

/* Naive in-memory throttle: 8 failed logins per 10 min per key. */
const fails = new Map();
function throttled(key) { const f = fails.get(key); return !!f && f.n >= 8 && Date.now() - f.t < 600000; }
function noteFail(key) { const f = fails.get(key); if (!f || Date.now() - f.t > 600000) fails.set(key, { n: 1, t: Date.now() }); else f.n++; }
function clearFails(key) { fails.delete(key); }

module.exports = { hashPassword, checkPassword, createSession, userFromToken, destroySession, cookie, throttled, noteFail, clearFails };
