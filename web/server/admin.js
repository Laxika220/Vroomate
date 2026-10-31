"use strict";
const { db, tx } = require("./db");
const { notify } = require("./notify");
const { route, bad, notFound, send } = require("./http");
const { publicUser } = require("./users");

route("GET", "/api/admin/queue", { admin: true }, ({ res }) => {
  const drivers = db.prepare("SELECT d.*, u.name, u.email, u.role FROM drivers d JOIN users u ON u.id=d.user_id WHERE d.status='pending' ORDER BY d.submitted_at").all();
  const vehicles = db.prepare("SELECT v.*, u.name AS owner_name FROM vehicles v JOIN users u ON u.id=v.owner_id WHERE v.status='pending' ORDER BY v.created_at").all();
  const reports = db.prepare(`SELECT r.*, a.name AS reporter_name, b.name AS target_name FROM reports r JOIN users a ON a.id=r.reporter_id JOIN users b ON b.id=r.target_id WHERE r.status='open' ORDER BY r.created_at`).all();
  send(res, 200, { drivers, vehicles, reports });
});

function decide(table, idField) {
  return ({ res, params, body }) => {
    const decision = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : null;
    if (!decision) throw bad("Decision must be approve or reject.");
    const note = String(body.note || "").trim().slice(0, 200);
    if (decision === "rejected" && !note) throw bad("Add a short reason so the driver knows what to fix.");
    const row = db.prepare(`SELECT * FROM ${table} WHERE ${idField}=? AND status='pending'`).get(Number(params.id));
    if (!row) throw notFound("Nothing pending with that id");
    const owner = table === "drivers" ? row.user_id : row.owner_id;
    tx(() => {
      if (table === "drivers") db.prepare("UPDATE drivers SET status=?, review_note=?, reviewed_at=? WHERE user_id=?").run(decision, note, Date.now(), row.user_id);
      else db.prepare("UPDATE vehicles SET status=?, review_note=? WHERE id=?").run(decision, note, row.id);
      notify(owner, "verification", table === "drivers" ? `Driver verification ${decision}` : `Vehicle ${row.model} ${decision}`, note, "/drive");
    });
    send(res, 200, { ok: true });
  };
}
route("POST", "/api/admin/drivers/:id", { admin: true }, decide("drivers", "user_id"));
route("POST", "/api/admin/vehicles/:id", { admin: true }, decide("vehicles", "id"));

route("POST", "/api/admin/reports/:id", { admin: true }, ({ res, params, body }) => {
  const status = body.action === "dismiss" ? "dismissed" : body.action === "action" ? "actioned" : null;
  if (!status) throw bad("Action must be dismiss or action.");
  const r = db.prepare("UPDATE reports SET status=? WHERE id=? AND status='open'").run(status, Number(params.id));
  if (!r.changes) throw notFound("Open report not found");
  send(res, 200, { ok: true });
});
