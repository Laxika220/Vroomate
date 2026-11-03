"use strict";
const { db, tx } = require("./db");
const { route, bad, notFound, conflict, send } = require("./http");
const { notify } = require("./notify");

route("GET", "/api/admin/queue", { admin: true }, ({ res }) => {
  const reports = db.prepare(`SELECT r.*, a.name AS reporter_name, b.name AS target_name, b.suspended_at AS target_suspended,
    (SELECT COUNT(*) FROM reports x WHERE x.target_id=r.target_id) AS target_reports FROM reports r JOIN users a ON a.id=r.reporter_id JOIN users b ON b.id=r.target_id WHERE r.status='open' ORDER BY r.created_at`).all();
  send(res, 200, { reports });
});

route("POST", "/api/admin/reports/:id", { admin: true }, ({ res, params, body }) => {
  const status = body.action === "dismiss" ? "dismissed" : body.action === "action" ? "actioned" : null;
  if (!status) throw bad("Action must be dismiss or action.");
  const r = db.prepare("UPDATE reports SET status=? WHERE id=? AND status='open'").run(status, Number(params.id));
  if (!r.changes) throw notFound("Open report not found");
  send(res, 200, { ok: true });
});

/**
 * Suspend: the person is logged out everywhere, can't log in, and disappears from decks. Their open rides
 * are cancelled and passengers told, and their seat requests are withdrawn. Unsuspend restores login only.
 */
route("POST", "/api/admin/users/:id/suspend", { admin: true }, ({ res, user, params, body }) => {
  const id = Number(params.id), on = body.suspend !== false;
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  if (!u) throw notFound("User not found");
  if (u.id === user.id) throw conflict("You can't suspend yourself.");
  tx(() => {
    if (!on) return db.prepare("UPDATE users SET suspended_at=NULL WHERE id=?").run(id);
    const now = Date.now();
    db.prepare("UPDATE users SET suspended_at=? WHERE id=?").run(now, id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    for (const t of db.prepare("SELECT * FROM trips WHERE driver_id=? AND status='open'").all(id)) {
      db.prepare("UPDATE trips SET status='cancelled' WHERE id=?").run(t.id);
      for (const b of db.prepare("SELECT * FROM bookings WHERE trip_id=? AND status IN ('pending','confirmed')").all(t.id)) {
        db.prepare("UPDATE bookings SET status='cancelled', updated_at=? WHERE id=?").run(now, b.id);
        notify(b.rider_id, "booking", "Ride cancelled", "A ride you booked was cancelled by Vroomate. Please find another ride.", "/home");
      }
    }
    for (const b of db.prepare("SELECT * FROM bookings WHERE rider_id=? AND status IN ('pending','confirmed')").all(id)) {
      if (b.status === "confirmed") db.prepare("UPDATE trips SET seats_available = seats_available + ? WHERE id=?").run(b.seats, b.trip_id);
      db.prepare("UPDATE bookings SET status='cancelled', updated_at=? WHERE id=?").run(now, b.id);
    }
    db.prepare("UPDATE ride_requests SET status='cancelled' WHERE rider_id=? AND status IN ('open','fulfilled')").run(id);
    db.prepare("UPDATE users SET discoverable=0 WHERE id=?").run(id);
  });
  send(res, 200, { ok: true });
});
