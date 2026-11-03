"use strict";
// Boots the real server on a random port with a throwaway database and gives tests a cookie-aware client.
const os = require("os");
const path = require("path");
const fs = require("fs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vroomate-test-"));
process.env.VROOMATE_DB = path.join(dir, "test.db");
process.env.VROOMATE_UPLOADS = path.join(dir, "uploads");
process.env.NODE_ENV = "test";

const { server } = require("../server/index.js");
const { db } = require("../server/db");

let base;
async function start() {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}
function stop() { server.close(); server.closeAllConnections && server.closeAllConnections(); }

class Client {
  constructor() { this.cookie = ""; this.user = null; }
  async call(method, url, body) {
    const res = await fetch(base + url, { method, headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: method === "GET" ? undefined : JSON.stringify(body || {}) });
    const sc = res.headers.get("set-cookie"); if (sc) this.cookie = sc.split(";")[0];
    let data = {}; try { data = await res.json(); } catch { /* empty */ }
    return { status: res.status, data };
  }
  async ok(method, url, body) {
    const r = await this.call(method, url, body);
    if (r.status >= 300) throw new Error(`${method} ${url} -> ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  }
  get(u) { return this.ok("GET", u); }
  post(u, b) { return this.ok("POST", u, b); }
}

let n = 0;
/** Create an account. Anyone can sign up with any email; no verification step. */
async function account(role, extra = {}) {
  const email = `user${++n}@example.com`;
  const c = new Client();
  await c.post("/api/auth/signup", { email, password: "password123", accept_terms: true, name: extra.name || `${role[0].toUpperCase() + role.slice(1)} ${n}`, gender: extra.gender || "x" });
  if (!extra.unverified) db.prepare("UPDATE users SET phone='9800000000', phone_verified=1 WHERE email=?").run(email);
  c.user = (await c.get("/api/me")).user;
  if (extra.home_stop) await c.ok("PUT", "/api/me", { ...c.user, home_stop: extra.home_stop });
  return c;
}
const makeAdmin = (c) => db.prepare("UPDATE users SET is_admin=1 WHERE id=?").run(c.user.id);

/** Someone who offers rides, with one car. No approval is needed. */
async function approvedDriver(_admin, extra = {}) {
  const d = await account("driver", extra);
  const v = await d.post("/api/vehicles", { kind: "car", model: "Maruti Swift", colour: "White", plate: `MH12AB${String(1000 + n).slice(-4)}`, seats: extra.seats || 4 });
  d.vehicleId = v.id;
  return d;
}
const inHours = (h) => Date.now() + h * 3600000;
module.exports = { start, stop, Client, account, makeAdmin, approvedDriver, inHours, db };
