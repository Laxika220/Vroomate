"use strict";
const http = require("http");
const path = require("path");
const A = require("./auth");
const H = require("./http");
const { UPLOADS } = require("./users");
for (const m of ["trips", "matching", "bookings", "social", "messages", "safety", "admin"]) {
  try { require("./" + m); } catch (e) { if (e.code !== "MODULE_NOT_FOUND" || !String(e.message).includes(`'./${m}'`)) throw e; }
}

const PUBLIC = path.join(__dirname, "..", "public");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/api/")) {
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
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => console.log(`Vroomate running at http://localhost:${port}`));
}
module.exports = { server };
