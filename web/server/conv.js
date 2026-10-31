"use strict";
const { db } = require("./db");

/** Get or create the conversation for (kind, refId) and make sure userIds are members. Safe inside a transaction. */
function ensureConversation(kind, refId, userIds) {
  let c = db.prepare("SELECT id FROM conversations WHERE kind=? AND ref_id=?").get(kind, refId);
  if (!c) {
    const info = db.prepare("INSERT INTO conversations (kind,ref_id,created_at) VALUES (?,?,?)").run(kind, refId, Date.now());
    c = { id: Number(info.lastInsertRowid) };
  }
  for (const u of userIds) db.prepare("INSERT OR IGNORE INTO conversation_members (conversation_id,user_id) VALUES (?,?)").run(c.id, u);
  return c.id;
}
module.exports = { ensureConversation };
