import { h, icon, toast, avatar, ago, mount } from "../ui.js";
import { get, post } from "../api.js";
import { state, registerView, nav } from "../core.js";

registerView("chat", async (id) => {
  const first = await get(`/api/conversations/${id}`);
  const conv = first.conversation;
  const others = conv.members.filter((m) => m.id !== state.me.id);
  const list = h("div", { class: "msgs", "aria-live": "polite", "aria-label": "Messages" });
  let lastId = 0;
  const byId = Object.fromEntries(conv.members.map((m) => [m.id, m]));

  const add = (msgs) => {
    if (!msgs.length) return;
    const stick = list.scrollHeight - list.scrollTop - list.clientHeight < 90;
    for (const m of msgs) {
      if (m.id <= lastId) continue; lastId = m.id;
      const mine = m.sender_id === state.me.id;
      mount(list, h("div", { class: "bubble" + (mine ? " me" : "") },
        !mine && conv.kind === "group" && h("span", { class: "who" }, (byId[m.sender_id] || { name: "Someone" }).name.split(" ")[0]),
        m.body, h("small", null, ago(m.created_at))));
    }
    if (stick) requestAnimationFrame(() => (list.scrollTop = list.scrollHeight));
  };
  if (!first.messages.length) mount(list, h("p", { class: "hint", id: "nomsg", style: { textAlign: "center", marginTop: "30px" } }, "No messages yet. Say hello and agree a pickup spot."));
  add(first.messages);

  const input = h("input", { id: "c_in", maxlength: 1000, autocomplete: "off", placeholder: "Message", "aria-label": "Message" });
  const form = h("form", { class: "composer", onsubmit: async (e) => {
    e.preventDefault();
    const body = input.value.trim(); if (!body) return;
    input.value = "";
    try { await post(`/api/conversations/${id}/messages`, { body }); document.getElementById("nomsg")?.remove(); await poll(); }
    catch (x) { input.value = body; toast(x.message); }
  } }, input, h("button", { class: "iconbtn", type: "submit", "aria-label": "Send", style: { width: "50px", height: "50px", background: "var(--lav)", color: "var(--lav-ink)", border: 0 } }, icon("send")));

  async function poll() {
    if (!document.body.contains(list)) return clearInterval(timer);
    try { const r = await get(`/api/conversations/${id}?after=${lastId}`); document.getElementById("nomsg")?.remove(); add(r.messages); } catch { /* transient */ }
  }
  const timer = setInterval(poll, 3500);

  const head = h("div", { class: "row" },
    h("a", { class: "iconbtn", href: "#/matches", "aria-label": "Back" }, icon("back")),
    conv.kind === "group" ? h("span", { class: "iconbtn", style: { width: "44px", height: "44px" } }, icon("users")) : avatar(others[0], "sm"),
    h("div", { class: "grow" }, h("b", null, conv.title), h("p", { class: "hint" }, conv.kind === "group" ? `${conv.members.length} people` : conv.kind === "booking" ? "About your ride" : "Travel match")),
    others.length === 1 && h("button", { class: "iconbtn", "aria-label": "Report or block", onclick: () => nav("/report/" + others[0].id) }, icon("flag")));
  setTimeout(() => (list.scrollTop = list.scrollHeight), 0);
  return h("div", { class: "stack", style: { gap: "10px", flex: "1" } }, head,
    h("p", { class: "hint", style: { textAlign: "center" } }, "Meet in a public place and share your trip with a friend."), list, form);
});
