"use strict";
const { db } = require("./db");
const { sendEmail } = require("./outbox");

// Kinds that matter enough to reach people outside the app: seat requests, confirmations and cancellations.
const EMAIL_KINDS = new Set(["booking"]);
const listeners = [];

/** Insert an in-app notification, then fan out to email and push once the surrounding transaction has committed. */
function notify(userId, kind, title, body = "", link = "") {
  db.prepare("INSERT INTO notifications (user_id,kind,title,body,link,created_at) VALUES (?,?,?,?,?,?)").run(userId, kind, title, body, link, Date.now());
  setImmediate(() => {
    const u = db.prepare("SELECT email, name, email_notifications, deleted_at FROM users WHERE id=?").get(userId);
    if (!u || u.deleted_at) return;
    if (EMAIL_KINDS.has(kind) && u.email_notifications) {
      const url = process.env.APP_URL ? `\n\nOpen Vroomate: ${process.env.APP_URL}/#${link || "/home"}` : "";
      sendEmail(u.email, title, `${body}${url}\n\nTurn these emails off under Account > Notification settings.`);
    }
    for (const fn of listeners) fn(userId, { kind, title, body, link });
  });
}
/** Other channels (web push) subscribe here. */
const onNotify = (fn) => listeners.push(fn);
module.exports = { notify, onNotify };
