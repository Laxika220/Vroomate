"use strict";
const { db } = require("./db");

/** Insert an in-app notification. Safe to call inside a transaction. */
function notify(userId, kind, title, body = "", link = "") {
  db.prepare("INSERT INTO notifications (user_id,kind,title,body,link,created_at) VALUES (?,?,?,?,?,?)").run(userId, kind, title, body, link, Date.now());
}
module.exports = { notify };
