"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { db } = require("./db");
const cfg = require("./config");
const A = require("./auth");
const { route, bad, notFound, send, HttpError } = require("./http");

const UPLOADS = process.env.VROOMATE_UPLOADS || path.join(__dirname, "..", "data", "uploads");
const DEV_CODES = process.env.NODE_ENV !== "production" && process.env.VROOMATE_DEV_CODES !== "0";
const ROLES = ["student", "faculty", "driver", "community"];

const str = (v, max, field) => {
  const s = String(v == null ? "" : v).trim();
  if (s.length > max) throw bad(`${field} is too long (max ${max} characters).`);
  return s;
};

function isBlocked(a, b) {
  return !!db.prepare("SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").get(a, b, b, a);
}

/** Fields safe to show other people. Never email, phone or password. */
function publicUser(u) {
  const drv = u.role === "driver" ? db.prepare("SELECT status FROM drivers WHERE user_id=?").get(u.id) : null;
  return {
    id: u.id, name: u.name, role: u.role, gender: u.gender, bio: u.bio, course: u.course,
    interests: JSON.parse(u.interests || "[]"), home_stop: u.home_stop,
    photo: u.photo ? `/uploads/${u.photo}` : null,
    verified: !!u.email_verified && (u.role === "student" || u.role === "faculty"),
    driver_approved: drv ? drv.status === "approved" : false,
  };
}
function selfUser(u) {
  const drv = db.prepare("SELECT status, review_note FROM drivers WHERE user_id=?").get(u.id);
  return {
    ...publicUser(u), email: u.email, phone: u.phone, women_only: !!u.women_only, discoverable: !!u.discoverable,
    is_admin: !!u.is_admin, email_verified: !!u.email_verified,
    driver: drv ? { status: drv.status, note: drv.review_note } : null,
    unread_notifications: db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL").get(u.id).n,
  };
}

function setSession(res, token) { res.setHeader("Set-Cookie", A.cookie(token, 30 * 24 * 3600)); }

route("GET", "/api/config", { auth: false }, ({ res }) => send(res, 200, cfg.publicConfig()));

route("POST", "/api/auth/signup", { auth: false }, ({ res, body }) => {
  const email = str(body.email, 120, "Email").toLowerCase();
  const name = str(body.name, 60, "Name");
  const role = String(body.role || "");
  const password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("Enter a valid email address.");
  if (name.length < 2) throw bad("Enter your name.");
  if (!ROLES.includes(role)) throw bad("Choose an account type.");
  if (password.length < 8) throw bad("Password needs at least 8 characters.");
  const domain = email.split("@")[1];
  const college = cfg.allowedDomains.some((d) => domain === d || domain.endsWith("." + d));
  if ((role === "student" || role === "faculty") && !college)
    throw bad(`Students and faculty sign up with their CHRIST email (ending in ${cfg.allowedDomains[0]}).`);
  if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) throw new HttpError(409, "That email already has an account. Log in instead.");
  const gender = ["f", "m", "x"].includes(body.gender) ? body.gender : "x";
  const info = db.prepare("INSERT INTO users (email,password_hash,name,role,gender,created_at) VALUES (?,?,?,?,?,?)")
    .run(email, A.hashPassword(password), name, role, gender, Date.now());
  const id = Number(info.lastInsertRowid);
  let devCode;
  if (college) {
    const code = A.newCode(id);
    console.log(`[verify] code for ${email}: ${code}`);   // no mail provider configured: see README
    if (DEV_CODES) devCode = code;
  }
  setSession(res, A.createSession(id));
  send(res, 201, { user: selfUser(db.prepare("SELECT * FROM users WHERE id=?").get(id)), needs_verification: college, dev_code: devCode });
});

route("POST", "/api/auth/login", { auth: false }, ({ req, res, body }) => {
  const email = String(body.email || "").trim().toLowerCase();
  const key = (req.socket.remoteAddress || "") + "|" + email;
  if (A.throttled(key)) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!u || !A.checkPassword(String(body.password || ""), u.password_hash)) { A.noteFail(key); throw new HttpError(401, "Email or password is wrong."); }
  A.clearFails(key);
  setSession(res, A.createSession(u.id));
  send(res, 200, { user: selfUser(u) });
});

route("POST", "/api/auth/logout", { auth: false }, ({ res, token }) => {
  A.destroySession(token);
  res.setHeader("Set-Cookie", A.cookie("", 0));
  send(res, 200, { ok: true });
});

route("POST", "/api/auth/resend", ({ res, user }) => {
  if (user.email_verified) throw bad("Your email is already verified.");
  if (!(user.role === "student" || user.role === "faculty")) throw bad("Only CHRIST accounts need email verification.");
  const code = A.newCode(user.id);
  console.log(`[verify] code for ${user.email}: ${code}`);
  send(res, 200, { ok: true, dev_code: DEV_CODES ? code : undefined });
});

route("POST", "/api/auth/verify", ({ res, user, body }) => {
  if (user.email_verified) return send(res, 200, { user: selfUser(user) });
  A.checkCode(user.id, body.code);
  db.prepare("UPDATE users SET email_verified=1 WHERE id=?").run(user.id);
  send(res, 200, { user: selfUser(db.prepare("SELECT * FROM users WHERE id=?").get(user.id)) });
});

route("GET", "/api/me", ({ res, user }) => send(res, 200, { user: selfUser(user) }));

route("PUT", "/api/me", ({ res, user, body }) => {
  const stopIds = cfg.stops.map((s) => s.id);
  const interests = (Array.isArray(body.interests) ? body.interests : []).filter((i) => cfg.cfg.interests.includes(i)).slice(0, 6);
  if (body.home_stop && !stopIds.includes(body.home_stop)) throw bad("Pick a stop from the list.");
  const phone = str(body.phone, 20, "Phone");
  if (phone && !/^[0-9+\-\s]{7,20}$/.test(phone)) throw bad("Phone number looks wrong.");
  const name = str(body.name ?? user.name, 60, "Name");
  if (name.length < 2) throw bad("Enter your name.");
  db.prepare(`UPDATE users SET name=?, bio=?, interests=?, home_stop=?, gender=?, course=?, women_only=?, discoverable=?, phone=? WHERE id=?`)
    .run(name, str(body.bio, 160, "Bio"), JSON.stringify(interests), body.home_stop || null,
      ["f", "m", "x"].includes(body.gender) ? body.gender : user.gender, str(body.course, 40, "Course"),
      body.women_only ? 1 : 0, body.discoverable === false ? 0 : 1, phone || null, user.id);
  send(res, 200, { user: selfUser(db.prepare("SELECT * FROM users WHERE id=?").get(user.id)) });
});

const MAGIC = [[Buffer.from([0xff, 0xd8, 0xff]), "jpg"], [Buffer.from([0x89, 0x50, 0x4e, 0x47]), "png"], [Buffer.from("RIFF"), "webp"]];
route("POST", "/api/me/photo", ({ res, user, body }) => {
  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.data || ""));
  if (!m) throw bad("Upload a JPG, PNG or WebP photo.");
  const buf = Buffer.from(m[1], "base64");
  if (buf.length > 1_500_000) throw bad("Photo is too large. Use one under 1.5 MB.");
  const ext = (MAGIC.find(([sig]) => buf.subarray(0, sig.length).equals(sig)) || [])[1];
  if (!ext) throw bad("That file is not a real image.");
  fs.mkdirSync(UPLOADS, { recursive: true });
  const file = `u${user.id}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS, file), buf);
  if (user.photo) fs.rm(path.join(UPLOADS, user.photo), () => {});
  db.prepare("UPDATE users SET photo=? WHERE id=?").run(file, user.id);
  send(res, 200, { user: selfUser(db.prepare("SELECT * FROM users WHERE id=?").get(user.id)) });
});

route("GET", "/api/users/:id", ({ res, user, params }) => {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(Number(params.id));
  if (!u || isBlocked(user.id, u.id)) throw notFound("Profile not found");
  send(res, 200, { user: publicUser(u) });
});

module.exports = { publicUser, selfUser, isBlocked, UPLOADS };
