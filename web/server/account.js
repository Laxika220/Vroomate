"use strict";
// Account security and lifecycle: password reset and change, phone verification, notification settings,
// downloading your data, and deleting your account.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { db, tx } = require("./db");
const A = require("./auth");
const { route, bad, send, HttpError, clientIp, limiter } = require("./http");
const { selfUser, UPLOADS } = require("./users");
const { sendEmail, sendSms, showDevCodes, smsReady, PROD } = require("./outbox");

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const me = (id) => selfUser(db.prepare("SELECT * FROM users WHERE id=?").get(id));
const appUrl = (req) => process.env.APP_URL || `${process.env.VROOMATE_SECURE_COOKIE === "1" ? "https" : "http"}://${req.headers.host}`;
const resetLimited = limiter(5, 3600000);    // reset emails per IP per hour
const smsLimited = limiter(5, 86400000);     // codes per account per day

/* ---------- password ---------- */

route("POST", "/api/auth/forgot", { auth: false }, ({ req, res, body }) => {
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("Enter the email you signed up with.");
  if (resetLimited(clientIp(req))) throw new HttpError(429, "Too many reset requests. Try again later.");
  const u = db.prepare("SELECT * FROM users WHERE email=? AND deleted_at IS NULL").get(email);
  // Same answer whether or not the account exists, so this can't be used to discover who has signed up.
  if (u) {
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("DELETE FROM password_resets WHERE user_id=?").run(u.id);
    db.prepare("INSERT INTO password_resets (token_hash,user_id,expires_at) VALUES (?,?,?)").run(sha(token), u.id, Date.now() + 3600000);
    sendEmail(u.email, "Reset your Vroomate password",
      `Hi ${u.name.split(" ")[0]},\n\nOpen this link within an hour to choose a new password:\n${appUrl(req)}/#/reset/${token}\n\nIf you didn't ask for this, ignore this email. Your password stays the same.`);
  }
  send(res, 200, { ok: true });
});

route("POST", "/api/auth/reset", { auth: false }, ({ res, body }) => {
  const password = String(body.password || "");
  if (password.length < 8) throw bad("Password needs at least 8 characters.");
  const row = db.prepare("SELECT * FROM password_resets WHERE token_hash=? AND expires_at > ?").get(sha(body.token || ""), Date.now());
  if (!row) throw bad("This reset link has expired or was already used. Ask for a new one.");
  tx(() => {
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(A.hashPassword(password), row.user_id);
    db.prepare("DELETE FROM password_resets WHERE user_id=?").run(row.user_id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(row.user_id);   // log out every other device
  });
  res.setHeader("Set-Cookie", A.cookie(A.createSession(row.user_id), 30 * 24 * 3600));
  send(res, 200, { user: me(row.user_id) });
});

route("POST", "/api/me/password", ({ res, user, body, token }) => {
  if (!A.checkPassword(String(body.current || ""), user.password_hash)) throw bad("Your current password is wrong.");
  const password = String(body.password || "");
  if (password.length < 8) throw bad("New password needs at least 8 characters.");
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(A.hashPassword(password), user.id);
  db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash != ?").run(user.id, sha(token));
  send(res, 200, { ok: true });
});

/* ---------- phone verification ---------- */

route("POST", "/api/me/phone/send", async ({ res, user }) => {
  if (!user.phone) throw bad("Add your phone number first.");
  if (PROD && !smsReady()) throw new HttpError(503, "Text messages aren't set up on this server yet. Ask the Vroomate team.");
  const prev = db.prepare("SELECT sent_at FROM phone_codes WHERE user_id=?").get(user.id);
  if (prev && Date.now() - prev.sent_at < 45000) throw new HttpError(429, "Wait a few seconds before asking for another code.");
  if (smsLimited(String(user.id))) throw new HttpError(429, "Too many codes today. Try again tomorrow.");
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  db.prepare("INSERT OR REPLACE INTO phone_codes (user_id,phone,code_hash,expires_at,attempts,sent_at) VALUES (?,?,?,?,0,?)")
    .run(user.id, user.phone, sha(code), Date.now() + 10 * 60000, Date.now());
  try { await sendSms(user.phone, `${code} is your Vroomate code. It expires in 10 minutes.`); }
  catch { throw new HttpError(502, "We couldn't send the text. Check the number and try again."); }
  send(res, 200, { ok: true, ...(showDevCodes() ? { dev_code: code } : {}) });
});

route("POST", "/api/me/phone/verify", ({ res, user, body }) => {
  const row = db.prepare("SELECT * FROM phone_codes WHERE user_id=?").get(user.id);
  if (!row || row.expires_at < Date.now() || row.phone !== user.phone) throw bad("That code has expired. Send a new one.");
  if (row.attempts >= 5) throw bad("Too many wrong codes. Send a new one.");
  if (sha(String(body.code || "").trim()) !== row.code_hash) {
    db.prepare("UPDATE phone_codes SET attempts=attempts+1 WHERE user_id=?").run(user.id);
    throw bad("That code is wrong.");
  }
  db.prepare("UPDATE users SET phone_verified=1 WHERE id=?").run(user.id);
  db.prepare("DELETE FROM phone_codes WHERE user_id=?").run(user.id);
  send(res, 200, { user: me(user.id) });
});

/* ---------- settings ---------- */

route("PUT", "/api/me/settings", ({ res, user, body }) => {
  const ename = String(body.emergency_name ?? user.emergency_name ?? "").trim().slice(0, 60);
  const ephone = String(body.emergency_phone ?? user.emergency_phone ?? "").trim();
  if (ephone && !/^[0-9+\-\s]{7,20}$/.test(ephone)) throw bad("Emergency contact's phone looks wrong.");
  db.prepare("UPDATE users SET email_notifications=?, emergency_name=?, emergency_phone=? WHERE id=?")
    .run(body.email_notifications === undefined ? user.email_notifications : body.email_notifications ? 1 : 0, ename || null, ephone || null, user.id);
  send(res, 200, { user: me(user.id) });
});

/* ---------- your data ---------- */

route("GET", "/api/me/export", ({ res, user }) => {
  const q = (sql, ...a) => db.prepare(sql).all(...a);
  const { password_hash, ...profile } = user;   // eslint-disable-line no-unused-vars
  const data = {
    exported_at: new Date().toISOString(),
    profile,
    vehicles: q("SELECT model,colour,plate,seats,created_at FROM vehicles WHERE owner_id=?", user.id),
    trips_driven: q("SELECT id,origin_stop,dest_stop,depart_at,seats_total,status,notes FROM trips WHERE driver_id=?", user.id),
    bookings: q("SELECT id,trip_id,seats,pickup_stop,drop_stop,fare_total,status,created_at FROM bookings WHERE rider_id=?", user.id),
    ride_requests: q("SELECT origin_stop,dest_stop,earliest_at,latest_at,seats,note,status FROM ride_requests WHERE rider_id=?", user.id),
    messages_sent: q("SELECT conversation_id,body,created_at FROM messages WHERE sender_id=?", user.id),
    reports_made: q("SELECT target_id,reason,details,created_at FROM reports WHERE reporter_id=?", user.id),
  };
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="vroomate-my-data.json"', "Cache-Control": "no-store" });
  res.end(JSON.stringify(data, null, 2));
});

/**
 * Delete the account. Rows other people still need (their trip history, chats, reports) keep a
 * placeholder "Deleted user"; everything that identifies the person is wiped.
 */
route("POST", "/api/me/delete", ({ res, user, body }) => {
  if (!A.checkPassword(String(body.password || ""), user.password_hash)) throw bad("Password is wrong.");
  const now = Date.now();
  tx(() => {
    const live = db.prepare("SELECT id FROM trips WHERE driver_id=? AND status='open'").all(user.id);
    if (live.length) throw new HttpError(409, "Cancel the rides you're driving first, so your passengers are told.");
    const seats = db.prepare("SELECT b.*, t.depart_at FROM bookings b JOIN trips t ON t.id=b.trip_id WHERE b.rider_id=? AND b.status IN ('pending','confirmed')").all(user.id);
    for (const b of seats) {
      if (b.status === "confirmed") db.prepare("UPDATE trips SET seats_available = seats_available + ? WHERE id=?").run(b.seats, b.trip_id);
      db.prepare("UPDATE bookings SET status='cancelled', updated_at=? WHERE id=?").run(now, b.id);
    }
    db.prepare("UPDATE ride_requests SET status='cancelled' WHERE rider_id=? AND status IN ('open','fulfilled')").run(user.id);
    for (const t of ["sessions", "password_resets", "phone_codes", "notifications", "swipes", "trip_passes"]) db.prepare(`DELETE FROM ${t} WHERE ${t === "swipes" ? "swiper_id" : "user_id"}=?`).run(user.id);
    db.prepare("DELETE FROM swipes WHERE target_id=?").run(user.id);
    db.prepare("DELETE FROM matches WHERE user_a=? OR user_b=?").run(user.id, user.id);
    try { db.prepare("DELETE FROM push_subscriptions WHERE user_id=?").run(user.id); } catch { /* push not set up */ }
    db.prepare(`UPDATE users SET email=?, password_hash='!', name='Deleted user', bio='', phone=NULL, phone_verified=0, photo=NULL, home_stop=NULL,
      emergency_name=NULL, emergency_phone=NULL, discoverable=0, email_notifications=0, deleted_at=? WHERE id=?`).run(`deleted-${user.id}-${now}@deleted.invalid`, now, user.id);
  });
  if (user.photo) fs.rm(path.join(UPLOADS, user.photo), () => {});
  res.setHeader("Set-Cookie", A.cookie("", 0));
  send(res, 200, { ok: true });
});

module.exports = { PROD };
