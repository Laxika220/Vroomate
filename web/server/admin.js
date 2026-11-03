"use strict";
const { db } = require("./db");
const { route, bad, notFound, send } = require("./http");

route("GET", "/api/admin/queue", { admin: true }, ({ res }) => {
  const reports = db.prepare(`SELECT r.*, a.name AS reporter_name, b.name AS target_name FROM reports r JOIN users a ON a.id=r.reporter_id JOIN users b ON b.id=r.target_id WHERE r.status='open' ORDER BY r.created_at`).all();
  send(res, 200, { reports });
});

route("POST", "/api/admin/reports/:id", { admin: true }, ({ res, params, body }) => {
  const status = body.action === "dismiss" ? "dismissed" : body.action === "action" ? "actioned" : null;
  if (!status) throw bad("Action must be dismiss or action.");
  const r = db.prepare("UPDATE reports SET status=? WHERE id=? AND status='open'").run(status, Number(params.id));
  if (!r.changes) throw notFound("Open report not found");
  send(res, 200, { ok: true });
});
