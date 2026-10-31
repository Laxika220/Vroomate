import { h, icon, empty, ago } from "../ui.js";
import { get, post } from "../api.js";
import { state, registerView, nav, refreshMe } from "../core.js";

const ICON = { match: "heart", booking: "seat", group: "users", message: "chat", radar: "radar", verification: "shield", admin: "shield" };

registerView("notifications", async () => {
  const { notifications } = await get("/api/notifications");
  const unread = notifications.filter((n) => !n.read_at).length;
  const head = h("div", { class: "row between" },
    h("div", { class: "row" }, h("a", { class: "iconbtn", href: "#/profile", "aria-label": "Back" }, icon("back")), h("h1", { style: { fontSize: "26px" } }, "Notifications")),
    unread > 0 && h("button", { class: "btn small", onclick: async () => { await post("/api/notifications/read"); await refreshMe(); window.dispatchEvent(new Event("hashchange")); } }, "Mark read"));
  if (!notifications.length) return h("div", { class: "stack" }, head, empty("bell", "All quiet", "Match alerts, seat confirmations, messages and Ride Radar updates land here."));
  return h("div", { class: "stack" }, head, ...notifications.map((n) => h("button", { class: "item", style: { opacity: n.read_at ? 0.65 : 1, borderColor: n.read_at ? "var(--line)" : "var(--lav)" }, onclick: () => nav(n.link || "/discover") },
    h("span", { style: { width: "26px", color: "var(--lav)", flex: "none" } }, icon(ICON[n.kind] || "bell")),
    h("div", { class: "t" }, h("b", { style: { whiteSpace: "normal" } }, n.title), n.body && h("span", { style: { whiteSpace: "normal" } }, n.body)), h("span", { class: "hint" }, ago(n.created_at)))));
});
