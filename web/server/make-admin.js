"use strict";
// Usage: npm run make-admin -- you@christuniversity.in
const { db } = require("./db");
const email = String(process.argv[2] || "").toLowerCase();
if (!email) { console.error("Usage: npm run make-admin -- <email>"); process.exit(1); }
const r = db.prepare("UPDATE users SET is_admin=1 WHERE email=?").run(email);
console.log(r.changes ? `${email} is now an admin.` : `No account found for ${email}. Sign up first.`);
