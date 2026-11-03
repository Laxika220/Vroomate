import { h, icon, avatar, empty, ago } from "../ui.js";
import { get } from "../api.js";
import { state, registerView, nav } from "../core.js";

const KIND = { match: "Co-rider", booking: "Ride", group: "Group" };

registerView("inbox", async () => {
  const { conversations } = await get("/api/conversations");
  const title = h("h1", null, "Inbox");
  if (!conversations.length) return h("div", { class: "stack" }, title,
    empty("No messages yet", "Chats open when you request a seat, someone requests yours, or you connect with a co-rider.", h("a", { class: "btn primary", href: "#/home" }, "Find a ride")));
  return h("div", { class: "stack", style: { gap: "4px" } }, title, h("div", { class: "list" }, ...conversations.map((c) => {
    const last = c.last_message;
    const preview = last ? (last.sender_id === state.me.id ? "You: " : "") + last.body : `${KIND[c.kind]} · say hello`;
    return h("button", { class: "item", onclick: () => nav("/chat/" + c.id) },
      c.person ? avatar(c.person) : h("span", { class: "av" }, icon("chat")),
      h("div", { class: "t" }, h("b", null, c.title), h("span", null, preview)),
      c.unread > 0 ? h("span", { class: "count" }, c.unread) : h("span", { class: "hint" }, ago(c.at)));
  })));
});
