"use strict";
const { db, tx } = require("./db");
const { notify } = require("./notify");
const { route, bad, send, HttpError } = require("./http");
const { publicUser } = require("./users");

const REASONS = ["Unsafe driving", "Harassment or inappropriate behaviour", "Fake profile", "No-show", "Asked for extra money", "Other"];

route("POST", "/api/reports", ({ res, user, body }) => {
  const target = Number(body.target_id);
  if (!Number.isInteger(target) || target === user.id || !db.prepare("SELECT 1 FROM users WHERE id=?").get(target)) throw bad("Choose who you're reporting.");
  if (!REASONS.includes(body.reason)) throw bad("Pick a reason.");
  const today = db.prepare("SELECT COUNT(*) n FROM reports WHERE reporter_id=? AND created_at > ?").get(user.id, Date.now() - 86400000).n;
  if (today >= 5) throw new HttpError(429, "You've sent several reports today. The team is reviewing them.");
  const details = String(body.details || "").trim().slice(0, 600);
  tx(() => {
    db.prepare("INSERT INTO reports (reporter_id,target_id,reason,details,created_at) VALUES (?,?,?,?,?)").run(user.id, target, body.reason, details, Date.now());
    for (const a of db.prepare("SELECT id FROM users WHERE is_admin=1").all()) notify(a.id, "admin", "New safety report", body.reason, "/admin");
  });
  send(res, 201, { ok: true });
});

route("POST", "/api/blocks", ({ res, user, body }) => {
  const target = Number(body.user_id);
  if (!Number.isInteger(target) || target === user.id || !db.prepare("SELECT 1 FROM users WHERE id=?").get(target)) throw bad("Choose who to block.");
  tx(() => {
    db.prepare("INSERT OR IGNORE INTO blocks (blocker_id,blocked_id,created_at) VALUES (?,?,?)").run(user.id, target, Date.now());
    // Pending requests between the two end now. Seats already confirmed are left for the people involved to cancel.
    db.prepare(`UPDATE bookings SET status='cancelled', updated_at=? WHERE status='pending' AND
      ((rider_id=? AND trip_id IN (SELECT id FROM trips WHERE driver_id=?)) OR (rider_id=? AND trip_id IN (SELECT id FROM trips WHERE driver_id=?)))`).run(Date.now(), user.id, target, target, user.id);
  });
  send(res, 200, { ok: true });
});
route("POST", "/api/blocks/:id/remove", ({ res, user, params }) => {
  db.prepare("DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?").run(user.id, Number(params.id));
  send(res, 200, { ok: true });
});
route("GET", "/api/blocks", ({ res, user }) => {
  const rows = db.prepare("SELECT blocked_id FROM blocks WHERE blocker_id=? ORDER BY created_at DESC").all(user.id);
  send(res, 200, { blocked: rows.map((r) => publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(r.blocked_id))), reasons: REASONS });
});
route("GET", "/api/report-reasons", ({ res }) => send(res, 200, { reasons: REASONS }));
