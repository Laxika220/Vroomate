"use strict";
// Background tidying, run every 10 minutes while the server is up:
//  - trips still "open" 6 hours after departure are completed (confirmed seats) and unanswered requests cancelled,
//    so riders can rate and the deck stays clean even if a driver forgets to tap "Mark complete";
//  - ride requests whose time window has passed are expired;
//  - expired sessions, reset links, phone codes and share links are deleted;
//  - with VROOMATE_BACKUP=1, a backup is taken once a day.
const { db, tx } = require("./db");
const { notify } = require("./notify");

const HOUR = 3600000;
let lastBackup = 0;

function tidy(now = Date.now()) {
  tx(() => {
    const stale = db.prepare("SELECT id FROM trips WHERE status='open' AND depart_at < ?").all(now - 6 * HOUR);
    for (const t of stale) {
      const riders = db.prepare("SELECT rider_id FROM bookings WHERE trip_id=? AND status='confirmed'").all(t.id);
      db.prepare("UPDATE trips SET status='completed' WHERE id=?").run(t.id);
      db.prepare("UPDATE bookings SET status='completed', updated_at=? WHERE trip_id=? AND status='confirmed'").run(now, t.id);
      db.prepare("UPDATE bookings SET status='cancelled', updated_at=? WHERE trip_id=? AND status='pending'").run(now, t.id);
      for (const r of riders) notify(r.rider_id, "rate", "How was your trip?", "Rate your driver so others know who to ride with.", "/rides/past");
    }
    db.prepare("UPDATE ride_requests SET status='expired' WHERE status='open' AND latest_at < ?").run(now);
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now);
    db.prepare("DELETE FROM password_resets WHERE expires_at < ?").run(now);
    db.prepare("DELETE FROM phone_codes WHERE expires_at < ?").run(now - HOUR);
    db.prepare("DELETE FROM trip_shares WHERE expires_at < ?").run(now - 7 * 24 * HOUR);
  });
  if (process.env.VROOMATE_BACKUP === "1" && now - lastBackup > 24 * HOUR) {
    lastBackup = now;
    try { console.log("Backup written to " + require("./backup").backup()); } catch (e) { console.error("Backup failed", e); }
  }
}

if (process.env.NODE_ENV !== "test") {
  setTimeout(() => tidy(), 5000).unref();
  setInterval(() => { try { tidy(); } catch (e) { console.error("Housekeeping failed", e); } }, 10 * 60000).unref();
}
module.exports = { tidy };
