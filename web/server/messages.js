"use strict";
const { db, tx } = require("./db");
const { notify } = require("./notify");
const { route, bad, forbidden, notFound, send, HttpError } = require("./http");
const { publicUser, isBlocked } = require("./users");

const sent = new Map();   // userId -> timestamps, for a simple 30 messages / minute limit
function rateOk(uid) {
  const now = Date.now(), arr = (sent.get(uid) || []).filter((t) => now - t < 60000);
  if (arr.length >= 30) return false;
  arr.push(now); sent.set(uid, arr); return true;
}

function memberOf(convId, uid) {
  return db.prepare("SELECT * FROM conversation_members WHERE conversation_id=? AND user_id=?").get(convId, uid);
}
function otherMembers(convId, uid) {
  return db.prepare("SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id!=?").all(convId, uid).map((r) => r.user_id);
}
function title(conv, uid) {
  if (conv.kind === "group") return (db.prepare("SELECT name FROM groups WHERE id=?").get(conv.ref_id) || {}).name || "Group";
  const names = otherMembers(conv.id, uid).map((id) => db.prepare("SELECT name FROM users WHERE id=?").get(id).name.split(" ")[0]);
  return names.join(", ");
}
function checkAccess(conv, uid) {
  if (!conv || !memberOf(conv.id, uid)) throw notFound("Conversation not found");
  if (conv.kind !== "group") for (const o of otherMembers(conv.id, uid)) if (isBlocked(uid, o)) throw forbidden("You can't message this person.");
}

route("GET", "/api/conversations", ({ res, user }) => {
  const rows = db.prepare(`SELECT c.*, cm.last_read_id FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=?`).all(user.id);
  const out = [];
  for (const c of rows) {
    const others = otherMembers(c.id, user.id);
    if (c.kind !== "group" && others.some((o) => isBlocked(user.id, o))) continue;
    const last = db.prepare("SELECT body, sender_id, created_at FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1").get(c.id) || null;
    const unread = db.prepare("SELECT COUNT(*) n FROM messages WHERE conversation_id=? AND sender_id!=? AND id>?").get(c.id, user.id, c.last_read_id).n;
    const first = others.length ? db.prepare("SELECT * FROM users WHERE id=?").get(others[0]) : null;
    out.push({ id: c.id, kind: c.kind, title: title(c, user.id), person: first ? publicUser(first) : null, last_message: last, unread, at: last ? last.created_at : c.created_at });
  }
  out.sort((a, b) => b.at - a.at);
  send(res, 200, { conversations: out.slice(0, 100) });
});

route("GET", "/api/conversations/:id", ({ res, user, params, query }) => {
  const conv = db.prepare("SELECT * FROM conversations WHERE id=?").get(Number(params.id));
  checkAccess(conv, user.id);
  const after = Number(query.after) || 0;
  const msgs = db.prepare("SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id=? AND id>? ORDER BY id DESC LIMIT 200").all(conv.id, after).reverse();
  if (msgs.length) db.prepare("UPDATE conversation_members SET last_read_id=MAX(last_read_id,?) WHERE conversation_id=? AND user_id=?").run(msgs[msgs.length - 1].id, conv.id, user.id);
  const members = db.prepare("SELECT user_id FROM conversation_members WHERE conversation_id=?").all(conv.id).map((r) => publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(r.user_id)));
  send(res, 200, { conversation: { id: conv.id, kind: conv.kind, title: title(conv, user.id), members }, messages: msgs });
});

route("POST", "/api/conversations/:id/messages", ({ res, user, params, body }) => {
  const conv = db.prepare("SELECT * FROM conversations WHERE id=?").get(Number(params.id));
  checkAccess(conv, user.id);
  const text = String(body.body || "").trim();
  if (!text) throw bad("Write a message first.");
  if (text.length > 1000) throw bad("Messages can be up to 1000 characters.");
  if (!rateOk(user.id)) throw new HttpError(429, "You're sending messages too fast. Wait a moment.");
  const id = tx(() => {
    const info = db.prepare("INSERT INTO messages (conversation_id,sender_id,body,created_at) VALUES (?,?,?,?)").run(conv.id, user.id, text, Date.now());
    const mid = Number(info.lastInsertRowid);
    db.prepare("UPDATE conversation_members SET last_read_id=? WHERE conversation_id=? AND user_id=?").run(mid, conv.id, user.id);
    const link = "/chat/" + conv.id;
    for (const o of otherMembers(conv.id, user.id)) {
      if (conv.kind !== "group" && isBlocked(user.id, o)) continue;
      const dup = db.prepare("SELECT 1 FROM notifications WHERE user_id=? AND kind='message' AND link=? AND read_at IS NULL").get(o, link);
      if (!dup) notify(o, "message", `New message from ${user.name.split(" ")[0]}`, text.slice(0, 80), link);
    }
    return mid;
  });
  send(res, 201, { id });
});

route("GET", "/api/badges", ({ res, user }) => {
  const unread = db.prepare(`SELECT COUNT(*) n FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=?
    WHERE m.sender_id!=? AND m.id > cm.last_read_id`).get(user.id, user.id).n;
  const notifications = db.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL").get(user.id).n;
  const pendingForMe = db.prepare(`SELECT COUNT(*) n FROM bookings b JOIN trips t ON t.id=b.trip_id WHERE t.driver_id=? AND b.status='pending' AND t.status='open'`).get(user.id).n;
  send(res, 200, { matches: unread, notifications, rides: pendingForMe });
});

route("GET", "/api/notifications", ({ res, user }) => {
  send(res, 200, { notifications: db.prepare("SELECT id,kind,title,body,link,read_at,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 60").all(user.id) });
});
route("POST", "/api/notifications/read", ({ res, user }) => {
  db.prepare("UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL").run(Date.now(), user.id);
  send(res, 200, { ok: true });
});
