"use strict";
const http = require("http");
const path = require("path");
const A = require("./auth");
const H = require("./http");
const { db } = require("./db");
const { UPLOADS } = require("./users");
for (const m of ["trips", "matching", "bookings", "messages", "safety", "admin", "radar", "account", "ratings", "share", "push", "housekeeping"]) {
  try { require("./" + m); } catch (e) { if (e.code !== "MODULE_NOT_FOUND" || !String(e.message).includes(`'./${m}'`)) throw e; }
}

const PUBLIC = path.join(__dirname, "..", "public");
const SECURE = process.env.VROOMATE_SECURE_COOKIE === "1";
const apiLimited = H.limiter(Number(process.env.API_RATE_LIMIT || 300), 60000);   // requests per IP per minute

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  ...(SECURE ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
};

/** Reject state-changing requests that a browser sent from another site. SameSite=Lax cookies already stop most; this is the backstop. */
function crossSite(req) {
  if (req.headers["sec-fetch-site"] === "cross-site") return true;
  const origin = req.headers.origin;
  if (!origin || origin === "null") return false;
  try { return new URL(origin).host !== req.headers.host; } catch { return true; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  try {
    if (url.pathname === "/healthz") {
      db.prepare("SELECT 1").get();
      return H.send(res, 200, { ok: true });
    }
    if (url.pathname.startsWith("/api/")) {
      if (apiLimited(H.clientIp(req))) throw new H.HttpError(429, "Too many requests. Slow down and try again in a minute.");
      if (req.method !== "GET" && crossSite(req)) throw H.forbidden("Cross-site request refused.");
      const r = H.routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!r) {
        if (H.routes.some((x) => x.re.test(url.pathname))) throw new H.HttpError(405, "Method not allowed");
        throw H.notFound("No such endpoint");
      }
      const m = r.re.exec(url.pathname);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const token = H.parseCookies(req.headers.cookie).vm_session;
      let body = {};
      if (req.method !== "GET") {
        if (!String(req.headers["content-type"] || "").startsWith("application/json") && Number(req.headers["content-length"] || 0) > 0)
          throw new H.HttpError(415, "Send JSON");
        body = await H.readBody(req);
      }
      const user = A.userFromToken(token);
      if (r.auth && !user) throw new H.HttpError(401, "Please log in");
      if (r.admin && !(user && user.is_admin)) throw H.forbidden("Admins only");
      return await r.handler({ req, res, params, query: Object.fromEntries(url.searchParams), body, user, token });
    }
    if (url.pathname.startsWith("/uploads/")) {
      if (H.serveFile(res, UPLOADS, url.pathname.slice(9), "public, max-age=31536000, immutable")) return;
      throw H.notFound();
    }
    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (H.serveFile(res, PUBLIC, rel, "no-cache")) return;
    if (!path.extname(rel) && H.serveFile(res, PUBLIC, "index.html", "no-cache")) return;   // SPA fallback
    throw H.notFound();
  } catch (e) {
    if (res.headersSent) return res.end();
    const status = e.status || 500;
    if (status === 500) console.error(e);
    H.send(res, status, { error: status === 500 ? "Something went wrong on our side." : e.message, code: e.code });
  }
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () => console.log(`Vroomate running at http://localhost:${port}`));
  // Platforms stop containers with SIGTERM: finish in-flight requests, then close the database cleanly.
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => {
    server.close(() => { db.close(); process.exit(0); });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
module.exports = { server };
