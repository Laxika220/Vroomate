"use strict";
// Usage: npm run backup
// Writes a consistent copy of the database (safe while the server runs) and of the uploaded photos
// to VROOMATE_BACKUP_DIR (default data/backups), keeping the newest VROOMATE_BACKUP_KEEP (default 14).
const fs = require("fs");
const path = require("path");
const { db, dbPath } = require("./db");
const { UPLOADS } = require("./users");

const DIR = process.env.VROOMATE_BACKUP_DIR || path.join(path.dirname(dbPath), "backups");
const KEEP = Number(process.env.VROOMATE_BACKUP_KEEP || 14);

function backup() {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const dest = path.join(DIR, `vroomate-${stamp}`);
  fs.mkdirSync(dest, { recursive: true });
  db.exec(`VACUUM INTO '${path.join(dest, "vroomate.db").replace(/'/g, "''")}'`);
  if (fs.existsSync(UPLOADS)) fs.cpSync(UPLOADS, path.join(dest, "uploads"), { recursive: true });
  const old = fs.readdirSync(DIR).filter((f) => f.startsWith("vroomate-")).sort().slice(0, -KEEP);
  for (const f of old) fs.rmSync(path.join(DIR, f), { recursive: true, force: true });
  return dest;
}

if (require.main === module) console.log("Backed up to " + backup());
module.exports = { backup };
