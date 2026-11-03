import { h, icon, toast, avatar, sheet, mount } from "../ui.js";
import { post, put } from "../api.js";
import { state, registerView, nav } from "../core.js";
import { pickPhoto } from "./auth.js";

registerView("profile", async () => {
  const me = state.me;
  const head = h("div", { class: "row wrap", style: { gap: "16px" } });
  const drawHead = () => {
    const u = state.me;
    head.replaceChildren(
      h("button", { "aria-label": "Change photo", onclick: () => pickPhoto(drawHead) }, avatar(u, "lg")),
      h("div", { class: "grow" }, h("h2", null, u.name), h("p", { class: "hint" }, u.email), u.phone && h("p", { class: "hint" }, u.phone),
        !u.photo && h("button", { class: "btn small", style: { marginTop: "8px" }, onclick: () => pickPhoto(drawHead) }, "Add a photo")),
      !u.photo && h("p", { class: "hint", style: { flexBasis: "100%" } }, "Your photo fills your swipe card, so people recognise you at pickup."));
  };
  drawHead();
  const row = (label, ic, onclick, extra) => h("button", { class: "item", onclick }, icon(ic), h("div", { class: "t" }, h("b", null, label)), extra, h("span", { class: "chev" }, icon("back")));
  return [
    h("h1", null, "Account"),
    head,
    h("div", { class: "list" },
      row("Edit profile", "user", () => editSheet(drawHead)),
      row("Notifications", "bell", () => nav("/notifications"), me.unread_notifications > 0 && h("span", { class: "count" }, me.unread_notifications)),
      row("Blocked people", "block", () => nav("/blocked")),
      me.is_admin && row("Reports", "shield", () => nav("/admin")),
      row("Log out", "logout", async () => { await post("/api/auth/logout"); location.hash = ""; window.dispatchEvent(new Event("vm:session")); })),
  ];
});

function editSheet(onSaved) {
  sheet((body, close) => {
    const u = state.me;
    const f = {
      name: h("input", { id: "e_name", value: u.name, maxlength: 60 }),
      phone: h("input", { id: "e_phone", type: "tel", value: u.phone || "", inputmode: "tel" }),
      bio: h("input", { id: "e_bio", maxlength: 160, value: u.bio || "", placeholder: "e.g. Works at Lavasa, goes to Pune on weekends" }),
      gender: h("select", { id: "e_gender" }, h("option", { value: "x" }, "Prefer not to say"), h("option", { value: "f" }, "Woman"), h("option", { value: "m" }, "Man")),
      women: h("input", { id: "e_women", type: "checkbox" }),
      disc: h("input", { id: "e_disc", type: "checkbox" }),
    };
    f.gender.value = u.gender || "x"; f.women.checked = !!u.women_only; f.disc.checked = u.discoverable !== false;
    const err = h("p", { class: "err", role: "alert", hidden: true });
    const save = h("button", { class: "btn primary block", onclick: async () => {
      save.disabled = true; err.hidden = true;
      try {
        const r = await put("/api/me", { name: f.name.value, phone: f.phone.value, bio: f.bio.value, gender: f.gender.value, home_stop: u.home_stop, women_only: f.women.checked, discoverable: f.disc.checked });
        state.me = r.user; toast("Saved"); close(); onSaved();
      } catch (x) { err.textContent = x.message; err.hidden = false; save.disabled = false; }
    } }, "Save");
    const field = (id, label, input, hint) => h("div", { class: "field" }, h("label", { for: id }, label), input, hint && h("p", { class: "hint" }, hint));
    mount(body, h("h2", null, "Edit profile"),
      field("e_name", "Full name", f.name),
      field("e_phone", "Phone", f.phone, "Only shared once a ride is confirmed."),
      field("e_bio", "About you (optional)", f.bio),
      field("e_gender", "Gender", f.gender, "Used only for women-only rides."),
      h("label", { class: "check", for: "e_women" }, f.women, h("span", null, "Only ride with women")),
      h("label", { class: "check", for: "e_disc" }, f.disc, h("span", null, "Show me under Co-riders when I post a request")),
      err, save);
  });
}
