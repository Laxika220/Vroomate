import { h, icon, toast, avatar, empty } from "../ui.js";
import { get, post } from "../api.js";
import { registerView, nav, backHead } from "../core.js";

registerView("report", async (id) => {
  const [{ user }, { reasons }] = await Promise.all([get(`/api/users/${id}`), get("/api/report-reasons")]);
  const first = user.name.split(" ")[0];
  const reason = h("select", { id: "r_reason" }, h("option", { value: "" }, "Choose a reason"), reasons.map((r) => h("option", { value: r }, r)));
  const details = h("textarea", { id: "r_det", maxlength: 600, placeholder: "What happened? Include the date and route if you can." });
  const err = h("p", { class: "err", role: "alert", hidden: true });
  const send = h("button", { class: "btn primary block", onclick: async () => {
    if (!reason.value) { err.textContent = "Choose a reason."; err.hidden = false; return; }
    send.disabled = true;
    try { await post("/api/reports", { target_id: Number(id), reason: reason.value, details: details.value }); toast("Report sent"); history.back(); }
    catch (x) { err.textContent = x.message; err.hidden = false; send.disabled = false; }
  } }, "Send report");
  const block = h("button", { class: "btn danger block", onclick: async () => {
    try { await post("/api/blocks", { user_id: Number(id) }); toast(`${first} is blocked`); nav("/inbox"); } catch (x) { toast(x.message); }
  } }, `Block ${first}`);
  return h("div", { class: "stack", style: { gap: "16px" } },
    h("div", { class: "row" }, h("button", { class: "iconbtn", "aria-label": "Back", onclick: () => history.back() }, icon("back")), h("h1", { style: { fontSize: "22px" } }, "Report or block")),
    h("div", { class: "row" }, avatar(user), h("b", null, user.name)),
    h("p", { class: "muted" }, `${first} won't be told who reported them.`),
    h("div", { class: "field" }, h("label", { for: "r_reason" }, "Reason"), reason),
    h("div", { class: "field" }, h("label", { for: "r_det" }, "Details"), details), err, send,
    h("p", { class: "muted", style: { marginTop: "12px" } }, "Blocking hides you from each other, cancels pending requests and stops messages."), block);
});

registerView("blocked", async () => {
  const { blocked } = await get("/api/blocks");
  const head = backHead("#/profile", "Blocked people");
  if (!blocked.length) return h("div", { class: "stack" }, head, empty("Nobody blocked", "People you block can't see your rides or message you."));
  return h("div", { class: "stack" }, head, h("div", { class: "list" }, ...blocked.map((u) => h("div", { class: "item" }, avatar(u, "sm"), h("div", { class: "t" }, h("b", null, u.name)),
    h("button", { class: "btn small", onclick: async () => { await post(`/api/blocks/${u.id}/remove`); toast("Unblocked"); window.dispatchEvent(new Event("hashchange")); } }, "Unblock")))));
});
