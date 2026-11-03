import { h, toast, empty, fmtWhen, mount } from "../ui.js";
import { get, post } from "../api.js";
import { registerView, state, backHead } from "../core.js";

registerView("admin", async () => {
  if (!state.me.is_admin) return empty("Admins only", "This page is for the people who review reports.");
  const { reports } = await get("/api/admin/queue");
  const reload = () => window.dispatchEvent(new Event("hashchange"));
  const resolve = (r, action) => async () => { try { await post(`/api/admin/reports/${r.id}`, { action }); toast(action === "dismiss" ? "Dismissed" : "Marked as handled"); reload(); } catch (x) { toast(x.message); } };
  const suspend = (r) => async () => {
    const on = !r.target_suspended;
    if (on && !confirm(`Suspend ${r.target_name}? They are logged out, their rides are cancelled and passengers told.`)) return;
    try { await post(`/api/admin/users/${r.target_id}/suspend`, { suspend: on }); toast(on ? "Suspended" : "Unsuspended"); reload(); } catch (x) { toast(x.message); }
  };
  const root = h("div", { class: "stack" }, backHead("#/profile", "Reports"));
  if (!reports.length) return mount(root, empty("No open reports", null));
  return mount(root, h("div", { class: "list" }, ...reports.map((r) => h("div", { class: "trip" },
    h("b", null, `${r.reporter_name} reported ${r.target_name}`), h("p", { class: "hint" }, `${r.reason} · ${fmtWhen(r.created_at)}`), r.details && h("p", null, r.details),
    r.target_reports > 1 && h("p", { class: "hint" }, `${r.target_reports} reports about this person in total`),
    h("div", { class: "row wrap" }, h("button", { class: "btn small primary", onclick: resolve(r, "action") }, "Handled"), h("button", { class: "btn small", onclick: resolve(r, "dismiss") }, "Dismiss"),
      h("button", { class: "btn small danger", onclick: suspend(r) }, r.target_suspended ? "Unsuspend" : "Suspend " + r.target_name.split(" ")[0]))))));
});
