import { h, icon, toast, empty, fmtWhen, mount } from "../ui.js";
import { get, post } from "../api.js";
import { registerView, state } from "../core.js";

registerView("admin", async () => {
  if (!state.me.is_admin) return empty("shield", "Admins only", "This page is for the Vroomate review team.");
  const q = await get("/api/admin/queue");
  const root = h("div", { class: "stack", style: { gap: "16px" } }, h("div", { class: "row" }, h("a", { class: "iconbtn", href: "#/profile", "aria-label": "Back" }, icon("back")), h("h1", { style: { fontSize: "26px" } }, "Review queue")));
  const reload = () => window.dispatchEvent(new Event("hashchange"));
  const decideRow = (label, lines, url) => {
    const note = h("input", { "aria-label": "Reason (required to reject)", placeholder: "Reason (required to reject)", maxlength: 200 });
    const go = (decision) => async () => { try { await post(url, { decision, note: note.value }); toast(decision === "approve" ? "Approved" : "Rejected"); reload(); } catch (x) { toast(x.message); } };
    return h("div", { class: "panel stack" }, h("b", null, label), ...lines.map((l) => h("p", { class: "hint" }, l)), h("div", { class: "field" }, note),
      h("div", { class: "row" }, h("button", { class: "btn primary small grow", onclick: go("approve") }, "Approve"), h("button", { class: "btn danger small grow", onclick: go("reject") }, "Reject")));
  };
  mount(root, h("h2", null, `Drivers (${q.drivers.length})`), ...(q.drivers.length ? q.drivers.map((d) => decideRow(`${d.name} (${d.role})`, [`${d.email}`, `Licence: ${d.licence_no}`, d.id_note || "No note"], `/api/admin/drivers/${d.user_id}`)) : [h("p", { class: "hint" }, "No drivers waiting.")]));
  mount(root, h("h2", null, `Vehicles (${q.vehicles.length})`), ...(q.vehicles.length ? q.vehicles.map((v) => decideRow(`${v.model}, ${v.colour} (${v.kind})`, [`Reg: ${v.plate}`, `${v.seats} seats, owner ${v.owner_name}`], `/api/admin/vehicles/${v.id}`)) : [h("p", { class: "hint" }, "No vehicles waiting.")]));
  mount(root, h("h2", null, `Reports (${q.reports.length})`), ...(q.reports.length ? q.reports.map((r) => h("div", { class: "panel stack" },
    h("b", null, `${r.reporter_name} reported ${r.target_name}`), h("p", { class: "hint" }, `${r.reason} · ${fmtWhen(r.created_at)}`), r.details && h("p", null, r.details),
    h("div", { class: "row" },
      h("button", { class: "btn small grow", onclick: async () => { await post(`/api/admin/reports/${r.id}`, { action: "dismiss" }); reload(); } }, "Dismiss"),
      h("button", { class: "btn small primary grow", onclick: async () => { await post(`/api/admin/reports/${r.id}`, { action: "action" }); reload(); } }, "Mark actioned")))) : [h("p", { class: "hint" }, "No open reports.")]));
  return root;
});
