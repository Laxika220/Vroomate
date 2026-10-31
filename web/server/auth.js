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
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha(token), Date.now());
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

function newCode(userId) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  db.prepare("INSERT OR REPLACE INTO email_codes (user_id, code_hash, expires_at, attempts) VALUES (?,?,?,0)").run(userId, sha(code), Date.now() + 15 * 60000);
  return code;
}
function checkCode(userId, code) {
  const row = db.prepare("SELECT * FROM email_codes WHERE user_id = ?").get(userId);
  if (!row || row.expires_at < Date.now()) throw new HttpError(400, "That code has expired. Request a new one.");
  if (row.attempts >= 5) throw new HttpError(429, "Too many wrong codes. Request a new one.");
  if (sha(String(code).trim()) !== row.code_hash) {
    db.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ?").run(userId);
    throw new HttpError(400, "That code is not right.");
  }
  db.prepare("DELETE FROM email_codes WHERE user_id = ?").run(userId);
}

module.exports = { hashPassword, checkPassword, createSession, userFromToken, destroySession, cookie, throttled, noteFail, clearFails, newCode, checkCode };
