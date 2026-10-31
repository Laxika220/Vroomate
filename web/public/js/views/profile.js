import { h, icon, toast, avatar, sheet } from "../ui.js";
import { post, put } from "../api.js";
import { state, registerView, nav } from "../core.js";
import { pickPhoto } from "./auth.js";

const ROLE_LABEL = { student: "Student", faculty: "Faculty", driver: "Driver", community: "Community" };

export function badges(u) {
  return [
    u.verified && h("span", { class: "tag good" }, "CHRIST verified"),
    u.role === "driver" && (u.driver_approved ? h("span", { class: "tag good" }, "Approved driver") : h("span", { class: "tag warn" }, "Driver pending")),
    !u.verified && u.role !== "driver" && h("span", { class: "tag" }, ROLE_LABEL[u.role]),
  ].filter(Boolean);
}

registerView("profile", async () => {
  const me = state.me;
  const head = h("div", { class: "stack", style: { alignItems: "center", textAlign: "center", gap: "10px" } });
  const drawHead = () => {
    const u = state.me;
    head.replaceChildren(
      h("button", { "aria-label": "Change photo", style: { position: "relative" }, onclick: () => pickPhoto(() => drawHead()) },
        avatar(u, "lg"), h("span", { class: "iconbtn", style: { position: "absolute", right: "-6px", bottom: "-6px", width: "34px", height: "34px" } }, icon("camera"))),
      h("h2", null, u.name),
      h("div", { class: "row wrap", style: { justifyContent: "center" } }, ...badges(u)),
      u.bio && h("p", { class: "muted" }, u.bio));
  };
  drawHead();

  const rows = [];
  rows.push(row("Edit profile", "Photo, bio, interests, home stop", "user", () => editSheet(drawHead)));
  if (me.role === "driver") rows.push(row("Driver verification and vehicles", me.driver ? `Status: ${me.driver.status}` : "Not submitted yet", "car", () => nav("/drive")));
  if (me.role !== "driver") rows.push(row("Become a driver", "Offer seats on your own trips", "car", () => nav("/drive")));
  rows.push(row("Notifications", me.unread_notifications ? `${me.unread_notifications} unread` : "You're all caught up", "bell", () => nav("/notifications")));
  rows.push(row("Blocked people", "Manage who you've blocked", "flag", () => nav("/blocked")));
  if (me.is_admin) rows.push(row("Admin: approvals and reports", "Review drivers, vehicles and reports", "shield", () => nav("/admin")));

  return [
    h("div", { class: "topbar" }, h("h1", { style: { fontSize: "28px" } }, "Profile")),
    head,
    h("div", { class: "stack" }, rows),
    h("p", { class: "hint", style: { textAlign: "center" } }, `Signed in as ${me.email}`),
    h("button", { class: "btn danger block", onclick: async () => { await post("/api/auth/logout"); sessionStorage.removeItem("vm_skip_setup"); location.hash = ""; window.dispatchEvent(new Event("vm:session")); } }, "Log out"),
  ];
});

function row(title, sub, ic, onclick) {
  return h("button", { class: "panel row", style: { textAlign: "left", padding: "14px 16px" }, onclick },
    h("span", { style: { color: "var(--lav)", width: "26px", height: "26px", flex: "none" } }, icon(ic)),
    h("span", { class: "grow" }, h("b", { style: { display: "block" } }, title), h("span", { class: "hint" }, sub)),
    h("span", { class: "muted", style: { transform: "rotate(180deg)", width: "20px" } }, icon("back")));
}

function editSheet(onSaved) {
  sheet((body, close) => {
    const u = state.me;
    let picked = new Set(u.interests || []);
    const f = {
      name: h("input", { id: "e_name", value: u.name, maxlength: 60 }),
      bio: h("textarea", { id: "e_bio", maxlength: 160, placeholder: "Early riser, loves podcasts, no loud music." }, u.bio),
      course: h("input", { id: "e_course", value: u.course, maxlength: 40 }),
      stop: h("select", { id: "e_stop" }, h("option", { value: "" }, "Not set"), state.cfg.stops.map((s) => h("option", { value: s.id }, s.name))),
      phone: h("input", { id: "e_phone", value: u.phone || "", inputmode: "tel", placeholder: "Optional" }),
      women: h("input", { id: "e_women", type: "checkbox" }),
      disc: h("input", { id: "e_disc", type: "checkbox" }),
    };
    f.stop.value = u.home_stop || ""; f.women.checked = !!u.women_only; f.disc.checked = u.discoverable !== false;
    const chips = h("div", { class: "chips" });
    const drawChips = () => chips.replaceChildren(...state.cfg.interests.map((i) => h("button", { type: "button", class: "chip", "aria-pressed": String(picked.has(i)),
      onclick: () => { if (picked.has(i)) picked.delete(i); else if (picked.size < 6) picked.add(i); else toast("Pick up to 6"); drawChips(); } }, i)));
    drawChips();
    const err = h("p", { class: "err", role: "alert", hidden: true });
    const save = h("button", { class: "btn primary block", onclick: async () => {
      save.disabled = true; err.hidden = true;
      try {
        const r = await put("/api/me", { name: f.name.value, bio: f.bio.value, course: f.course.value, home_stop: f.stop.value, phone: f.phone.value,
          gender: u.gender, women_only: f.women.checked, discoverable: f.disc.checked, interests: [...picked] });
        state.me = r.user; toast("Profile saved"); close(); onSaved();
      } catch (x) { err.textContent = x.message; err.hidden = false; save.disabled = false; }
    } }, "Save");
    body.append(h("h2", null, "Edit profile"),
      h("div", { class: "field" }, h("label", { for: "e_name" }, "Name"), f.name),
      h("div", { class: "field" }, h("label", { for: "e_bio" }, "About you"), f.bio),
      h("div", { class: "field" }, h("label", { for: "e_course" }, u.role === "faculty" ? "Department" : "Course and year"), f.course),
      h("div", { class: "field" }, h("label", { for: "e_stop" }, "Usual starting point"), f.stop),
      h("div", { class: "field" }, h("span", { class: "lbl" }, "Interests"), chips),
      h("div", { class: "field" }, h("label", { for: "e_phone" }, "Phone (shared only with confirmed co-travellers)"), f.phone),
      h("label", { class: "check", for: "e_women" }, f.women, h("span", null, "Women-only: only show me to women and only show me women")),
      h("label", { class: "check", for: "e_disc" }, f.disc, h("span", null, "Show my card in Find Travel Buddies")),
      err, save);
  });
}
