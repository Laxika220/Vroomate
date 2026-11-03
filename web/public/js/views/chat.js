import { h, icon, toast, avatar, ago, mount } from "../ui.js";
import { get, post } from "../api.js";
import { state, registerView, nav } from "../core.js";

const SUB = { group: null, booking: "About your ride", match: "Co-rider" };

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
  if (!first.messages.length) mount(list, h("p", { class: "hint", id: "nomsg", style: { textAlign: "center", marginTop: "30px" } }, "Agree on a pickup spot and time."));
  add(first.messages);

  const input = h("input", { id: "c_in", maxlength: 1000, autocomplete: "off", placeholder: "Message", "aria-label": "Message" });
  const form = h("form", { class: "composer", onsubmit: async (e) => {
    e.preventDefault();
    const body = input.value.trim(); if (!body) return;
    input.value = "";
    try { await post(`/api/conversations/${id}/messages`, { body }); document.getElementById("nomsg")?.remove(); await poll(); }
    catch (x) { input.value = body; toast(x.message); }
  } }, input, h("button", { type: "submit", "aria-label": "Send" }, icon("send")));

  async function poll() {
    if (!document.body.contains(list)) return clearInterval(timer);
    try { const r = await get(`/api/conversations/${id}?after=${lastId}`); document.getElementById("nomsg")?.remove(); add(r.messages); } catch { /* transient */ }
  }
  const timer = setInterval(poll, 3500);

  const head = h("div", { class: "row" },
    h("a", { class: "iconbtn", href: "#/inbox", "aria-label": "Back" }, icon("back")),
    others[0] && avatar(others[0], "sm"),
    h("div", { class: "grow" }, h("b", null, conv.title), h("p", { class: "hint" }, SUB[conv.kind] || `${conv.members.length} people`)),
    others.length === 1 && h("button", { class: "iconbtn", "aria-label": "Report or block", onclick: () => nav("/report/" + others[0].id) }, icon("flag")));
  setTimeout(() => (list.scrollTop = list.scrollHeight), 0);
  return h("div", { class: "stack", style: { gap: "10px", flex: "1" } }, head, list, form);
});
