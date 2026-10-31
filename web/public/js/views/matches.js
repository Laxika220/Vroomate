import { h, icon, toast, sheet, avatar, empty, ago, skeletons } from "../ui.js";
import { get, post } from "../api.js";
import { state, registerView, nav } from "../core.js";

registerView("matches", async () => {
  const [m, g] = await Promise.all([get("/api/matches"), get("/api/groups/mine")]);
  const reload = () => window.dispatchEvent(new Event("hashchange"));
  const root = h("div", { class: "stack", style: { gap: "16px" } }, h("h1", { style: { fontSize: "28px" } }, "Matches"));

  const invites = g.groups.filter((x) => x.my_status === "invited");
  if (invites.length) {
    root.append(h("h2", null, "Group invites"), ...invites.map((x) => h("div", { class: "panel stack" },
      h("b", null, x.name), h("p", { class: "hint" }, `Invited by ${x.members.find((y) => y.user.id === x.owner_id).user.name}. ${x.members.filter((y) => y.status === "joined").length} joined so far.`),
      h("div", { class: "row" },
        h("button", { class: "btn primary small grow", onclick: async () => { await post(`/api/groups/${x.id}/respond`, { accept: true }); toast("You're in"); reload(); } }, "Join"),
        h("button", { class: "btn small grow", onclick: async () => { await post(`/api/groups/${x.id}/respond`, { accept: false }); reload(); } }, "Decline")))));
  }

  const joined = g.groups.filter((x) => x.my_status === "joined");
  if (joined.length) {
    root.append(h("div", { class: "row between" }, h("h2", null, "Travel groups")), ...joined.map((x) => h("div", { class: "panel stack" },
      h("div", { class: "row between" }, h("b", null, x.name), h("span", { class: "tag" }, `${x.members.filter((y) => y.status === "joined").length} joined`)),
      h("div", { class: "row wrap" }, ...x.members.map((y) => h("span", { style: { opacity: y.status === "joined" ? 1 : 0.4 }, title: y.user.name + (y.status === "invited" ? " (invited)" : "") }, avatar(y.user, "sm")))),
      h("div", { class: "row" },
        x.conversation_id && h("button", { class: "btn small grow", onclick: () => nav("/chat/" + x.conversation_id) }, "Group chat"),
        h("button", { class: "btn small primary grow", onclick: () => nav("/discover") }, "Find a ride for us"),
        h("button", { class: "btn small danger", onclick: async () => { try { await post(`/api/groups/${x.id}/leave`); reload(); } catch (e) { toast(e.message); } } }, x.owner_id === state.me.id ? "Disband" : "Leave")))));
  }

  root.append(h("div", { class: "row between" }, h("h2", null, "Travel buddies"),
    m.matches.length >= 1 && h("button", { class: "btn small", onclick: () => newGroup(m.matches, reload) }, icon("users"), "New group")));
  if (!m.matches.length) {
    root.append(empty("heart", "No matches yet", "Swipe on travel buddies in Discover. When you both like each other, you can chat and plan the journey together.", h("button", { class: "btn primary", onclick: () => nav("/discover") }, "Find travel buddies")));
  } else {
    root.append(...m.matches.map((x) => h("button", { class: "item", onclick: () => nav("/chat/" + x.conversation_id) }, avatar(x.user),
      h("div", { class: "t" }, h("b", null, x.user.name), h("span", null, x.last_message ? (x.last_message.sender_id === state.me.id ? "You: " : "") + x.last_message.body : "New match. Say hello.")),
      x.unread > 0 ? h("span", { class: "unread" }, x.unread) : h("span", { class: "hint" }, ago(x.last_message ? x.last_message.created_at : x.created_at)))));
  }
  return root;
});

function newGroup(matches, done) {
  sheet((body, close) => {
    const picked = new Set();
    const name = h("input", { id: "g_name", maxlength: 40, placeholder: "e.g. Friday Pune crew" });
    const list = h("div", { class: "stack" });
    const draw = () => list.replaceChildren(...matches.map((x) => h("button", { type: "button", class: "item", "aria-pressed": String(picked.has(x.user.id)), style: { borderColor: picked.has(x.user.id) ? "var(--lav)" : "var(--line)" },
      onclick: () => { if (picked.has(x.user.id)) picked.delete(x.user.id); else if (picked.size < 7) picked.add(x.user.id); draw(); } },
      avatar(x.user, "sm"), h("div", { class: "t" }, h("b", null, x.user.name)), picked.has(x.user.id) && h("span", { style: { width: "22px", color: "var(--good)" } }, icon("check")))));
    draw();
    const err = h("p", { class: "err", role: "alert", hidden: true });
    const go = h("button", { class: "btn primary block", onclick: async () => {
      go.disabled = true; err.hidden = true;
      try { await post("/api/groups", { name: name.value, invite: [...picked] }); toast("Invites sent"); close(); done(); }
      catch (e) { err.textContent = e.message; err.hidden = false; go.disabled = false; }
    } }, "Create group");
    body.append(h("h2", null, "New travel group"), h("p", { class: "muted" }, "Invite people you've matched with. Once they join, you can request seats together on one trip."),
      h("div", { class: "field" }, h("label", { for: "g_name" }, "Group name"), name), h("span", { class: "lbl hint" }, "Invite from your matches"), list, err, go);
  });
}
