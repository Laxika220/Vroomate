"use strict";
const { db, tx } = require("./db");
const cfg = require("./config");
const { notify } = require("./notify");
const { ensureConversation } = require("./conv");
const { feasible, genderOk } = require("./matching");
const { route, bad, forbidden, notFound, conflict, send } = require("./http");
const { publicUser, isBlocked } = require("./users");
const { fulfilRequests, reopenRequests } = require("./fulfil");

const stopLabel = (id) => (cfg.stop(id) ? cfg.stop(id).short : id);
const legText = (t) => `${stopLabel(t.origin_stop)} to ${stopLabel(t.dest_stop)}`;
const joinedMembers = (gid) => db.prepare("SELECT user_id FROM group_members WHERE group_id=? AND status='joined'").all(gid).map((r) => r.user_id);
/** Everyone who travels on a booking: the rider, plus joined group members for a group booking. */
const travellers = (b) => (b.group_id ? joinedMembers(b.group_id) : [b.rider_id]);

/**
 * Request seats. Nothing is reserved yet: seats only come off the trip when the DRIVER accepts
 * (see /respond), inside a transaction, so two simultaneous accepts can never overbook.
 */
route("POST", "/api/bookings", ({ res, user, body }) => {
  const tripId = Number(body.trip_id);
  const out = tx(() => {
    const t = db.prepare("SELECT * FROM trips WHERE id=?").get(tripId);
    if (!t || t.status !== "open" || t.depart_at <= Date.now()) throw conflict("That trip is no longer open.");
    if (t.driver_id === user.id) throw bad("You can't book your own trip.");
    const driver = db.prepare("SELECT * FROM users WHERE id=?").get(t.driver_id);
    if (isBlocked(user.id, driver.id)) throw notFound("Trip not found");
    if (!genderOk(user, driver, t)) throw forbidden("This trip isn't available to your account's women-only settings.");
    let seats = Number(body.seats) || 1, groupId = null;
    if (body.group_id) {
      const g = db.prepare("SELECT * FROM groups WHERE id=?").get(Number(body.group_id));
      if (!g || g.owner_id !== user.id) throw forbidden("Only the group owner can book for the group.");
      const members = joinedMembers(g.id);
      if (members.length < 2) throw bad("A group needs at least two people who have joined.");
      for (const m of members) if (isBlocked(driver.id, m)) throw forbidden("A member of this group can't travel with this driver.");
      seats = members.length; groupId = g.id;
    }
    if (!Number.isInteger(seats) || seats < 1 || seats > 8) throw bad("Seats must be between 1 and 8.");
    const need = { pickup: body.pickup_stop, drop: body.drop_stop, seats, earliest: 0, latest: Number.MAX_SAFE_INTEGER / 4 };
    if (!cfg.stop(need.pickup) || !cfg.stop(need.drop)) throw bad("Choose your pickup and drop-off stops.");
    if (t.seats_available < seats) throw conflict(t.seats_available ? `Only ${t.seats_available} seat${t.seats_available > 1 ? "s" : ""} left on this trip.` : "This trip is full.");
    const f = feasible({ ...t, seats_available: t.seats_available }, { ...need, earliest: t.depart_at - 86400000 * 2, latest: t.depart_at + 86400000 * 2 });
    if (!f) throw bad("This driver doesn't pass through those stops in that direction.");
    if (db.prepare("SELECT 1 FROM bookings WHERE trip_id=? AND rider_id=? AND status IN ('pending','confirmed')").get(t.id, user.id)) throw conflict("You already have a request on this trip.");
    const fare = Math.round(t.fare_per_km_seat * cfg.distanceKm(need.pickup, need.drop) * seats);
    const now = Date.now();
    const info = db.prepare(`INSERT INTO bookings (trip_id,rider_id,group_id,seats,pickup_stop,drop_stop,fare_total,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending',?,?)`)
      .run(t.id, user.id, groupId, seats, need.pickup, need.drop, fare, now, now);
    const id = Number(info.lastInsertRowid);
    const conv = ensureConversation("booking", id, [driver.id, ...travellers({ rider_id: user.id, group_id: groupId })]);
    const msg = String(body.message || "").trim().slice(0, 300);
    if (msg) db.prepare("INSERT INTO messages (conversation_id,sender_id,body,created_at) VALUES (?,?,?,?)").run(conv, user.id, msg, now);
    notify(driver.id, "booking", `${groupId ? "Group of " + seats : user.name} wants ${seats} seat${seats > 1 ? "s" : ""}`, `${legText({ origin_stop: need.pickup, dest_stop: need.drop })} on your ${legText(t)} trip`, "/rides");
    return { id, fare_total: fare, seats };
  });
  send(res, 201, out);
});

route("POST", "/api/bookings/:id/respond", ({ res, user, params, body }) => {
  const accept = body.decision === "accept";
  if (!accept && body.decision !== "reject") throw bad("Decision must be accept or reject.");
  tx(() => {
    const b = db.prepare("SELECT * FROM bookings WHERE id=?").get(Number(params.id));
    if (!b) throw notFound("Request not found");
    const t = db.prepare("SELECT * FROM trips WHERE id=?").get(b.trip_id);
    if (t.driver_id !== user.id) throw forbidden("Only the driver can answer this request.");
    if (b.status !== "pending") throw conflict("This request was already " + b.status + ".");
    const who = travellers(b);
    if (!accept) {
      db.prepare("UPDATE bookings SET status='rejected', updated_at=? WHERE id=?").run(Date.now(), b.id);
      for (const w of who) notify(w, "booking", "Seat request declined", `${user.name} can't take you on the ${legText(t)} trip.`, "/rides");
      return;
    }
    if (t.status !== "open" || t.depart_at <= Date.now()) throw conflict("This trip is no longer open.");
    // Guarded decrement: succeeds only if enough seats remain right now. The whole block runs under BEGIN IMMEDIATE,
    // and the table CHECK (seats_available >= 0) is a last line of defence against overbooking.
    const r = db.prepare("UPDATE trips SET seats_available = seats_available - ? WHERE id=? AND status='open' AND seats_available >= ?").run(b.seats, t.id, b.seats);
    if (r.changes !== 1) throw conflict("Not enough seats left for this request. Decline it or ask the rider to change seats.");
    db.prepare("UPDATE bookings SET status='confirmed', updated_at=? WHERE id=?").run(Date.now(), b.id);
    fulfilRequests(b, t);
    for (const w of who) notify(w, "booking", "Seat confirmed", `${user.name} confirmed your seat on the ${legText(t)} trip.`, "/rides");
  });
  send(res, 200, { ok: true });
});

route("POST", "/api/bookings/:id/cancel", ({ res, user, params }) => {
  tx(() => {
    const b = db.prepare("SELECT * FROM bookings WHERE id=?").get(Number(params.id));
    if (!b) throw notFound("Booking not found");
    const t = db.prepare("SELECT * FROM trips WHERE id=?").get(b.trip_id);
    const byDriver = t.driver_id === user.id, byRider = b.rider_id === user.id;
    if (!byDriver && !byRider) throw forbidden("Not your booking.");
    if (!["pending", "confirmed"].includes(b.status)) throw conflict("This booking is already " + b.status + ".");
    if (t.depart_at <= Date.now() && b.status === "confirmed") throw conflict("The trip has already departed.");
    db.prepare("UPDATE bookings SET status='cancelled', updated_at=? WHERE id=?").run(Date.now(), b.id);
    if (b.status === "confirmed") {
      db.prepare("UPDATE trips SET seats_available = seats_available + ? WHERE id=?").run(b.seats, t.id);
      reopenRequests(b, t);
    }
    if (byDriver) for (const w of travellers(b)) notify(w, "booking", "Booking cancelled by driver", `${user.name} cancelled your seat on the ${legText(t)} trip.`, "/rides");
    else notify(t.driver_id, "booking", "Rider cancelled", `${user.name} cancelled ${b.seats} seat${b.seats > 1 ? "s" : ""}.`, "/rides");
  });
  send(res, 200, { ok: true });
});

route("GET", "/api/bookings/mine", ({ res, user }) => {
  const rows = db.prepare(`SELECT b.* FROM bookings b WHERE b.rider_id=? OR b.group_id IN (SELECT group_id FROM group_members WHERE user_id=? AND status='joined') ORDER BY b.created_at DESC LIMIT 100`).all(user.id, user.id);
  const out = rows.map((b) => {
    const t = db.prepare("SELECT * FROM trips WHERE id=?").get(b.trip_id);
    const d = db.prepare("SELECT * FROM users WHERE id=?").get(t.driver_id);
    const v = db.prepare("SELECT kind,model,colour,plate,seats FROM vehicles WHERE id=?").get(t.vehicle_id);
    const confirmed = b.status === "confirmed" || b.status === "completed";
    const conv = db.prepare("SELECT id FROM conversations WHERE kind='booking' AND ref_id=?").get(b.id);
    return {
      id: b.id, status: b.status, seats: b.seats, pickup_stop: b.pickup_stop, drop_stop: b.drop_stop, fare_total: b.fare_total, group_id: b.group_id, created_at: b.created_at,
      trip: { id: t.id, origin_stop: t.origin_stop, dest_stop: t.dest_stop, depart_at: t.depart_at, status: t.status, notes: t.notes },
      pickup_eta: t.depart_at + cfg.travelMinutes(t.origin_stop, b.pickup_stop) * 60000,
      driver: publicUser(d), driver_phone: confirmed ? d.phone : null,
      vehicle: v ? { ...v, plate: confirmed ? v.plate : undefined } : null,
      companions: b.group_id ? joinedMembers(b.group_id).filter((x) => x !== user.id).map((x) => publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(x))) : [],
      conversation_id: conv ? conv.id : null,
    };
  });
  send(res, 200, { bookings: out });
});

/* ---------- travel groups ---------- */
const isMatched = (a, b) => { const [x, y] = a < b ? [a, b] : [b, a]; return !!db.prepare("SELECT 1 FROM matches WHERE user_a=? AND user_b=?").get(x, y); };

route("POST", "/api/groups", ({ res, user, body }) => {
  const name = String(body.name || "").trim().slice(0, 40);
  if (name.length < 2) throw bad("Name your group.");
  const invite = [...new Set((Array.isArray(body.invite) ? body.invite : []).map(Number))].filter((x) => Number.isInteger(x) && x !== user.id).slice(0, 7);
  if (!invite.length) throw bad("Invite at least one match.");
  for (const id of invite) if (!isMatched(user.id, id)) throw forbidden("You can only invite people you've matched with.");
  const id = tx(() => {
    const info = db.prepare("INSERT INTO groups (name,owner_id,created_at) VALUES (?,?,?)").run(name, user.id, Date.now());
    const gid = Number(info.lastInsertRowid);
    db.prepare("INSERT INTO group_members (group_id,user_id,status) VALUES (?,?,'joined')").run(gid, user.id);
    for (const u of invite) { db.prepare("INSERT INTO group_members (group_id,user_id,status) VALUES (?,?,'invited')").run(gid, u); notify(u, "group", `${user.name} invited you to "${name}"`, "Travel together and book seats as a group.", "/rides"); }
    ensureConversation("group", gid, [user.id]);
    return gid;
  });
  send(res, 201, { id });
});

route("GET", "/api/groups/mine", ({ res, user }) => {
  const gs = db.prepare(`SELECT g.*, gm.status AS my_status FROM groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=? ORDER BY g.created_at DESC`).all(user.id);
  const out = gs.map((g) => {
    const members = db.prepare("SELECT user_id, status FROM group_members WHERE group_id=?").all(g.id).map((m) => ({ status: m.status, user: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(m.user_id)) }));
    const conv = db.prepare("SELECT id FROM conversations WHERE kind='group' AND ref_id=?").get(g.id);
    return { id: g.id, name: g.name, owner_id: g.owner_id, my_status: g.my_status, members, conversation_id: conv ? conv.id : null };
  });
  send(res, 200, { groups: out });
});

route("POST", "/api/groups/:id/respond", ({ res, user, params, body }) => {
  const gid = Number(params.id);
  tx(() => {
    const m = db.prepare("SELECT * FROM group_members WHERE group_id=? AND user_id=?").get(gid, user.id);
    if (!m || m.status !== "invited") throw notFound("No pending invite");
    const g = db.prepare("SELECT * FROM groups WHERE id=?").get(gid);
    if (!body.accept) { db.prepare("DELETE FROM group_members WHERE group_id=? AND user_id=?").run(gid, user.id); return; }
    if (joinedMembers(gid).length >= 8) throw conflict("This group is full.");
    db.prepare("UPDATE group_members SET status='joined' WHERE group_id=? AND user_id=?").run(gid, user.id);
    ensureConversation("group", gid, [user.id]);
    notify(g.owner_id, "group", `${user.name} joined "${g.name}"`, "", "/rides");
  });
  send(res, 200, { ok: true });
});

route("POST", "/api/groups/:id/invite", ({ res, user, params, body }) => {
  const gid = Number(params.id), target = Number(body.user_id);
  tx(() => {
    const g = db.prepare("SELECT * FROM groups WHERE id=? AND owner_id=?").get(gid, user.id);
    if (!g) throw forbidden("Only the group owner can invite.");
    if (!isMatched(user.id, target)) throw forbidden("You can only invite people you've matched with.");
    if (db.prepare("SELECT COUNT(*) n FROM group_members WHERE group_id=?").get(gid).n >= 8) throw conflict("This group is full.");
    if (db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").get(gid, target)) throw conflict("Already in this group.");
    db.prepare("INSERT INTO group_members (group_id,user_id,status) VALUES (?,?,'invited')").run(gid, target);
    notify(target, "group", `${user.name} invited you to "${g.name}"`, "", "/rides");
  });
  send(res, 200, { ok: true });
});

route("POST", "/api/groups/:id/leave", ({ res, user, params }) => {
  const gid = Number(params.id);
  tx(() => {
    const g = db.prepare("SELECT * FROM groups WHERE id=?").get(gid);
    if (!g || !db.prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?").get(gid, user.id)) throw notFound("Group not found");
    if (db.prepare("SELECT 1 FROM bookings WHERE group_id=? AND status IN ('pending','confirmed')").get(gid)) throw conflict("Cancel the group's active bookings before leaving.");
    if (g.owner_id === user.id) { db.prepare("DELETE FROM groups WHERE id=?").run(gid); db.prepare("DELETE FROM conversations WHERE kind='group' AND ref_id=?").run(gid); }
    else db.prepare("DELETE FROM group_members WHERE group_id=? AND user_id=?").run(gid, user.id);
  });
  send(res, 200, { ok: true });
});

module.exports = { travellers };
