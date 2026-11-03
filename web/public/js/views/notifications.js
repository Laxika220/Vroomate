import { h, empty, ago } from "../ui.js";
import { get, post } from "../api.js";
import { registerView, nav, refreshMe, backHead } from "../core.js";

registerView("notifications", async () => {
  const { notifications } = await get("/api/notifications");
  const unread = notifications.filter((n) => !n.read_at).length;
  const head = backHead("#/home", "Notifications", unread > 0 && h("button", { class: "btn small", onclick: async () => { await post("/api/notifications/read"); await refreshMe(); window.dispatchEvent(new Event("hashchange")); } }, "Mark all read"));
  if (!notifications.length) return h("div", { class: "stack" }, head, empty("Nothing yet", "Seat requests, confirmations and messages show up here."));
  return h("div", { class: "stack" }, head, h("div", { class: "list" }, ...notifications.map((n) => h("button", { class: "item", onclick: () => nav(n.link || "/home") },
    h("div", { class: "t" }, h("b", { style: { whiteSpace: "normal", fontWeight: n.read_at ? 400 : 600 } }, n.title), n.body && h("span", { style: { whiteSpace: "normal" } }, n.body)),
    h("span", { class: "hint" }, ago(n.created_at))))));
});
