import { h, toast, empty, fmtWhen, mount } from "../ui.js";
import { get, post } from "../api.js";
import { registerView, state, backHead } from "../core.js";

registerView("admin", async () => {
  if (!state.me.is_admin) return empty("Admins only", "This page is for the people who review reports.");
  const { reports } = await get("/api/admin/queue");
  const reload = () => window.dispatchEvent(new Event("hashchange"));
  const resolve = (r, action) => async () => { try { await post(`/api/admin/reports/${r.id}`, { action }); toast(action === "dismiss" ? "Dismissed" : "Marked as handled"); reload(); } catch (x) { toast(x.message); } };
  const root = h("div", { class: "stack" }, backHead("#/profile", "Reports"));
  if (!reports.length) return mount(root, empty("No open reports", null));
  return mount(root, h("div", { class: "list" }, ...reports.map((r) => h("div", { class: "trip" },
    h("b", null, `${r.reporter_name} reported ${r.target_name}`), h("p", { class: "hint" }, `${r.reason} · ${fmtWhen(r.created_at)}`), r.details && h("p", null, r.details),
    h("div", { class: "row" }, h("button", { class: "btn small primary", onclick: resolve(r, "action") }, "Handled"), h("button", { class: "btn small", onclick: resolve(r, "dismiss") }, "Dismiss"))))));
});
