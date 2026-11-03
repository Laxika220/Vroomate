import { h, icon } from "./ui.js";
import { get } from "./api.js";
import { state, views, nav, refreshMe } from "./core.js";
import "./views/auth.js";
import "./views/home.js";
import "./views/offer.js";
import "./views/rides.js";
import "./views/inbox.js";
import "./views/chat.js";
import "./views/profile.js";
import "./views/notifications.js";
import "./views/safety.js";
import "./views/admin.js";
import "./views/legal.js";
import "./views/safety-tools.js";

const root = document.getElementById("app");
const screen = h("main", { id: "screen" });
const tabbar = h("div", { class: "tabbar", hidden: true });
root.append(screen, tabbar);

const TABS = [["home", "Home", "home"], ["offer", "Offer", "plus"], ["rides", "Trips", "route"], ["inbox", "Inbox", "chat"], ["profile", "Account", "user"]];
// Older links (notifications, bookmarks) point at screens that were merged.
// Screens anyone can open without an account: legal pages, password reset links and shared trip links.
const PUBLIC = new Set(["welcome", "terms", "privacy", "reset", "share"]);
const ALIAS = { discover: "home", radar: "home", matches: "inbox", post: "offer", drive: "offer" };

function drawTabs(active) {
  const dot = { inbox: state.badges.matches > 0, rides: state.badges.rides > 0 };
  tabbar.replaceChildren(h("nav", { "aria-label": "Main" }, TABS.map(([id, label, ic]) =>
    h("a", { href: "#/" + id, class: "tab", "aria-current": active === id ? "page" : null }, icon(ic), h("span", null, label), dot[id] && h("span", { class: "dot", "aria-label": "new" })))));
}

let renderToken = 0;
async function route() {
  const token = ++renderToken;
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  let name = ALIAS[parts[0]] || parts[0] || "home";
  const arg = parts[1];
  if (!state.me && !PUBLIC.has(name)) name = "welcome";
  const view = views[name] || views.notfound;
  screen.replaceChildren(h("div", { class: "skeleton", style: { minHeight: "40vh" } }));
  let out;
  try { out = await view(arg, { go: nav }); }
  catch (e) {
    if (e.status === 401) { state.me = null; return route(); }
    out = h("div", { class: "empty" }, h("h3", null, "Couldn't load this"), h("p", null, e.message || "Try again."), h("button", { class: "btn primary", onclick: route }, "Retry"));
  }
  if (token !== renderToken) return;
  const node = out.node || out;
  const bare = !!out.bare;
  screen.className = bare ? "bare" : "";
  screen.replaceChildren(...(Array.isArray(node) ? node : [node]));
  window.scrollTo(0, 0);
  tabbar.hidden = bare;
  if (!bare) drawTabs(name === "chat" ? "inbox" : name);
}

views.notfound = async () => h("div", { class: "empty" }, h("h3", null, "Page not found"), h("a", { class: "btn primary", href: "#/home" }, "Go home"));

window.addEventListener("hashchange", route);
window.addEventListener("vm:session", async () => { await refreshMe(); route(); });

(async () => {
  try { state.cfg = await get("/api/config"); } catch { /* shown by auth view */ }
  await refreshMe();
  route();
  setInterval(async () => {
    if (!state.me || document.hidden) return;
    try { state.badges = await get("/api/badges"); if (!tabbar.hidden) drawTabs(tabbar.querySelector("[aria-current]")?.getAttribute("href").slice(2)); } catch { /* ignore */ }
  }, 20000);
})();
