import { h, icon, toast, avatar, empty } from "../ui.js";
import { get, post } from "../api.js";
import { registerView, nav } from "../core.js";

registerView("report", async (id) => {
  const [{ user }, { reasons }] = await Promise.all([get(`/api/users/${id}`), get("/api/report-reasons")]);
  let reason = "";
  const chips = h("div", { class: "chips" });
  const draw = () => chips.replaceChildren(...reasons.map((r) => h("button", { type: "button", class: "chip", "aria-pressed": String(reason === r), onclick: () => { reason = r; draw(); } }, r)));
  draw();
  const details = h("textarea", { id: "r_det", maxlength: 600, placeholder: "What happened? Include the trip and time if you can." });
  const err = h("p", { class: "err", role: "alert", hidden: true });
  const send = h("button", { class: "btn primary block", onclick: async () => {
    if (!reason) { err.textContent = "Pick a reason."; err.hidden = false; return; }
    send.disabled = true;
    try { await post("/api/reports", { target_id: Number(id), reason, details: details.value }); toast("Report sent to the Vroomate team"); history.back(); }
    catch (x) { err.textContent = x.message; err.hidden = false; send.disabled = false; }
  } }, "Send report");
  const block = h("button", { class: "btn danger block", onclick: async () => {
    try { await post("/api/blocks", { user_id: Number(id) }); toast(`${user.name.split(" ")[0]} is blocked`); nav("/matches"); } catch (x) { toast(x.message); }
  } }, `Block ${user.name.split(" ")[0]}`);
  return h("div", { class: "stack", style: { gap: "16px" } },
    h("div", { class: "row" }, h("button", { class: "iconbtn", "aria-label": "Back", onclick: () => history.back() }, icon("back")), h("h1", { style: { fontSize: "26px" } }, "Report or block")),
    h("div", { class: "item" }, avatar(user), h("div", { class: "t" }, h("b", null, user.name), h("span", null, user.verified ? "CHRIST verified" : user.role))),
    h("p", { class: "muted" }, "Reports go to the Vroomate team. The other person is not told who reported them."),
    h("div", { class: "field" }, h("span", { class: "lbl" }, "Reason"), chips),
    h("div", { class: "field" }, h("label", { for: "r_det" }, "Details"), details), err, send,
    h("hr", { class: "hr" }),
    h("p", { class: "muted" }, "Blocking hides you from each other, ends pending requests and stops messages."), block);
});

registerView("blocked", async () => {
  const { blocked } = await get("/api/blocks");
  const head = h("div", { class: "row" }, h("a", { class: "iconbtn", href: "#/profile", "aria-label": "Back" }, icon("back")), h("h1", { style: { fontSize: "26px" } }, "Blocked people"));
  if (!blocked.length) return h("div", { class: "stack" }, head, empty("shield", "Nobody blocked", "People you block can't see your cards, message you or request your seats."));
  return h("div", { class: "stack" }, head, ...blocked.map((u) => h("div", { class: "item" }, avatar(u, "sm"), h("div", { class: "t" }, h("b", null, u.name)),
    h("button", { class: "btn small", onclick: async () => { await post(`/api/blocks/${u.id}/remove`); toast("Unblocked"); window.dispatchEvent(new Event("hashchange")); } }, "Unblock"))));
});
