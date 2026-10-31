import { h, icon, toast } from "./ui.js";
import { get } from "./api.js";
import { state, views, nav, refreshMe } from "./core.js";
import "./views/auth.js";
import "./views/profile.js";
const optional = ["discover", "matches", "post", "rides", "chat", "admin", "radar"];
for (const v of optional) { try { await import(`./views/${v}.js`); } catch (e) { if (!/Failed to fetch|Cannot find|error loading|404/i.test(String(e.message))) console.error(v, e); } }

const root = document.getElementById("app");
const screen = h("main", { id: "screen" });
const tabbar = h("div", { class: "tabbar", hidden: true });
root.append(screen, tabbar);

const TABS = [
  ["discover", "Discover", "compass"], ["matches", "Matches", "heart"], ["post", "Post", "plus"],
  ["rides", "My Rides", "route"], ["profile", "Profile", "user"],
];
function drawTabs(active) {
  tabbar.replaceChildren(h("nav", { "aria-label": "Main" }, TABS.map(([id, label, ic]) => {
    const isPost = id === "post";
    const badge = id === "matches" && state.badges.matches > 0 ? h("span", { class: "dot" }, state.badges.matches) : null;
    return h("a", { href: "#/" + id, class: "tab" + (isPost ? " post" : ""), "aria-current": active === id ? "page" : null, "aria-label": label },
      isPost ? h("span", { class: "fab" }, icon(ic)) : icon(ic), h("span", null, label), badge);
  })));
}

let renderToken = 0;
async function route() {
  const token = ++renderToken;
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  let name = parts[0] || "discover";
  const arg = parts[1];
  let flow = null;
  if (!state.me) flow = "welcome";
  else if (!state.me.email_verified && (state.me.role === "student" || state.me.role === "faculty")) flow = "verify";
  else if (!state.me.home_stop && !sessionStorage.getItem("vm_skip_setup")) flow = "setup";
  if (flow) name = flow;
  const view = views[name] || views.notfound;
  screen.replaceChildren(h("div", { class: "skeleton", style: { minHeight: "50vh" } }));
  let out;
  try { out = await view(arg, { go: nav }); }
  catch (e) {
    if (e.status === 401) { state.me = null; return route(); }
    out = { node: h("div", { class: "empty" }, h("h3", null, "That didn't load"), h("p", null, e.message || "Try again."), h("button", { class: "btn primary", onclick: route }, "Retry")) };
  }
  if (token !== renderToken) return;
  const node = out.node || out;
  const bare = !!out.bare || !!flow;
  screen.className = bare ? "bare" : "";
  screen.replaceChildren(...(Array.isArray(node) ? node : [node]));
  window.scrollTo(0, 0);
  tabbar.hidden = bare;
  if (!bare) drawTabs(name === "chat" ? "matches" : name);
  document.title = "Vroomate";
}

views.notfound = async () => h("div", { class: "empty" }, h("h3", null, "Page not found"), h("a", { class: "btn primary", href: "#/discover" }, "Go to Discover"));

window.addEventListener("hashchange", route);
window.addEventListener("vm:session", async () => { await refreshMe(); route(); });

(async () => {
  try { state.cfg = await get("/api/config"); } catch { /* shown by auth view */ }
  await refreshMe();
  route();
  setInterval(async () => {
    if (!state.me || document.hidden) return;
    try { const r = await get("/api/badges"); state.badges = r; if (!tabbar.hidden) drawTabs((location.hash.split("/")[1] || "discover")); } catch { /* ignore */ }
  }, 20000);
})();
