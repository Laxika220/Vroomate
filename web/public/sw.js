// Service worker: keeps the app shell available offline and shows push notifications.
// Network first for the app's own files, so a deploy reaches people on their next load; the cache is only a fallback.
const CACHE = "vroomate-v1";
const SHELL = ["/", "/styles.css", "/js/app.js", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname === "/healthz") return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === "navigate" ? caches.match("/") : Response.error()))));
});

self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: "Vroomate", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Vroomate", { body: d.body || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { link: d.link || "/home" } }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = "/#" + (e.notification.data && e.notification.data.link || "/home");
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => new URL(c.url).origin === location.origin);
    if (open) { open.navigate(target); return open.focus(); }
    return self.clients.openWindow(target);
  }));
});
