"use strict";
const fs = require("fs");
const path = require("path");

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const bad = (m, c) => new HttpError(400, m, c);
const forbidden = (m) => new HttpError(403, m || "Not allowed");
const notFound = (m) => new HttpError(404, m || "Not found");
const conflict = (m, c) => new HttpError(409, m, c);

const routes = [];
function route(method, pattern, opts, handler) {
  if (typeof opts === "function") { handler = opts; opts = {}; }
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:([a-z]+)/gi, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
  routes.push({ method, re, keys, auth: opts.auth !== false, admin: !!opts.admin, handler });
}

function readBody(req, limit = 3_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, "Request too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(bad("Body must be valid JSON")); }
    });
    req.on("error", reject);
  });
}

function parseCookies(h) {
  const out = {};
  String(h || "").split(";").forEach((p) => {
    const i = p.indexOf("="); if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(body);
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".json": "application/json", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

function serveFile(res, root, rel, cache) {
  const full = path.resolve(root, "." + path.posix.normalize("/" + rel));
  if (!full.startsWith(path.resolve(root) + path.sep) && full !== path.resolve(root)) return false;
  let st; try { st = fs.statSync(full); } catch { return false; }
  if (!st.isFile()) return false;
  res.writeHead(200, { "Content-Type": MIME[path.extname(full).toLowerCase()] || "application/octet-stream",
    "Content-Length": st.size, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
  fs.createReadStream(full).pipe(res);
  return true;
}

/** The caller's IP. Behind a reverse proxy (TRUST_PROXY=1) it's the first X-Forwarded-For entry. */
function clientIp(req) {
  if (process.env.TRUST_PROXY === "1" && req.headers["x-forwarded-for"]) return String(req.headers["x-forwarded-for"]).split(",")[0].trim();
  return req.socket.remoteAddress || "";
}

/** Fixed-window counter per key: true once `limit` hits land inside `windowMs`. */
function limiter(limit, windowMs) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.t > windowMs) hits.delete(k); }, windowMs).unref();
  return (key) => {
    const now = Date.now(), h = hits.get(key);
    if (!h || now - h.t > windowMs) { hits.set(key, { t: now, n: 1 }); return false; }
    return ++h.n > limit;
  };
}

module.exports = { clientIp, limiter, HttpError, bad, forbidden, notFound, conflict, route, routes, readBody, parseCookies, send, serveFile };
