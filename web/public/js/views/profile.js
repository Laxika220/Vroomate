import { h, icon, toast, avatar, sheet, mount } from "../ui.js";
import { post, put } from "../api.js";
import { state, registerView, nav } from "../core.js";
import { pickPhoto } from "./auth.js";
import { verifyPhone } from "./verify.js";

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
  const phoneTag = () => h("span", { class: "tag " + (state.me.phone_verified ? "good" : "") }, state.me.phone_verified ? "Verified" : "Verify");
  return [
    h("h1", null, "Account"),
    head,
    h("div", { class: "list" },
      row("Edit profile", "user", () => editSheet(drawHead)),
      row("Phone number", "shield", async () => { if (!state.me.phone_verified && await verifyPhone()) nav("/profile"); else if (state.me.phone_verified) editSheet(drawHead); }, phoneTag()),
      row("Emergency contact", "flag", () => emergencySheet(), state.me.emergency_phone ? h("span", { class: "hint" }, state.me.emergency_name || "Set") : null),
      row("Notification settings", "bell", () => notifySheet()),
      installRow(row),
      row("Notifications", "bell", () => nav("/notifications"), me.unread_notifications > 0 && h("span", { class: "count" }, me.unread_notifications)),
      row("Blocked people", "block", () => nav("/blocked")),
      me.is_admin && row("Reports", "shield", () => nav("/admin"))),
    h("h3", { style: { marginTop: "8px" } }, "Security and data"),
    h("div", { class: "list" },
      row("Change password", "shield", () => passwordSheet()),
      row("Download my data", "list", () => { location.href = "/api/me/export"; }),
      row("Terms of use", "list", () => nav("/terms")),
      row("Privacy policy", "list", () => nav("/privacy")),
      row("Log out", "logout", async () => { await import("../push.js").then((m) => m.disablePush()).catch(() => {}); await post("/api/auth/logout"); location.hash = ""; window.dispatchEvent(new Event("vm:session")); }),
      Object.assign(row("Delete account", "x", () => deleteSheet()), { className: "item danger" })),
  ];
});

/** "Install app": the browser's own prompt where there is one, instructions on iPhone, nothing once installed. */
function installRow(row) {
  if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) return null;
  if (state.installPrompt) return row("Install app", "plus", async () => { state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; nav("/profile"); });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return row("Install app", "plus", () => sheet((body) => mount(body, h("h2", null, "Add Vroomate to your Home Screen"),
    h("p", null, "In Safari, tap the Share button, then Add to Home Screen. Vroomate then opens full screen and can send you notifications."))));
  return null;
}

const field = (id, label, input, hint) => h("div", { class: "field" }, h("label", { for: id }, label), input, hint && h("p", { class: "hint" }, hint));
/** A sheet with a form: `submit` gets the inputs; errors show inline. */
function formSheet(title, intro, fields, label, submit) {
  sheet((body, close) => {
    const err = h("p", { class: "err", role: "alert", hidden: true });
    const btn = h("button", { class: "btn primary block", onclick: async () => {
      btn.disabled = true; err.hidden = true;
      try { await submit(close); } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
    } }, label);
    mount(body, h("h2", null, title), intro && h("p", { class: "muted" }, intro), ...fields, err, btn);
  });
}

function emergencySheet() {
  const name = h("input", { id: "em_name", maxlength: 60, value: state.me.emergency_name, placeholder: "e.g. Mum" });
  const phone = h("input", { id: "em_phone", type: "tel", inputmode: "tel", value: state.me.emergency_phone });
  formSheet("Emergency contact", "Shown on your trip screen with a one-tap call, and used when you share a trip.",
    [field("em_name", "Name", name), field("em_phone", "Phone", phone)], "Save", async (close) => {
      state.me = (await put("/api/me/settings", { emergency_name: name.value, emergency_phone: phone.value })).user; toast("Saved"); close(); nav("/profile");
    });
}

function notifySheet() {
  const email = h("input", { id: "n_email", type: "checkbox" }); email.checked = state.me.email_notifications;
  const pushBox = h("div");
  import("../push.js").then((m) => m.pushToggle(pushBox)).catch(() => {});
  formSheet("Notification settings", null, [
    h("label", { class: "check", for: "n_email" }, email, h("span", null, "Email me about seat requests, confirmations and cancellations")), pushBox,
  ], "Save", async (close) => {
    state.me = (await put("/api/me/settings", { email_notifications: email.checked })).user; toast("Saved"); close();
  });
}

function passwordSheet() {
  const cur = h("input", { id: "p_cur", type: "password", autocomplete: "current-password" });
  const pw = h("input", { id: "p_new", type: "password", autocomplete: "new-password" });
  formSheet("Change password", "You'll stay logged in here and be logged out everywhere else.",
    [field("p_cur", "Current password", cur), field("p_new", "New password", pw, "At least 8 characters.")], "Change password", async (close) => {
      await post("/api/me/password", { current: cur.value, password: pw.value }); toast("Password changed"); close();
    });
}

function deleteSheet() {
  const pw = h("input", { id: "d_pw", type: "password", autocomplete: "current-password" });
  formSheet("Delete account", "This erases your profile, photo, phone and email, and cancels your seat requests. It can't be undone. Download your data first if you want a copy.",
    [field("d_pw", "Password", pw)], "Delete my account", async () => {
      await post("/api/me/delete", { password: pw.value }); state.me = null; location.hash = ""; toast("Account deleted"); window.dispatchEvent(new Event("vm:session"));
    });
}

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
      field("e_phone", "Phone", f.phone, "Only shared once a ride is confirmed. A new number needs verifying again."),
      field("e_bio", "About you (optional)", f.bio),
      field("e_gender", "Gender", f.gender, "Used only for women-only rides."),
      h("label", { class: "check", for: "e_women" }, f.women, h("span", null, "Only ride with women")),
      h("label", { class: "check", for: "e_disc" }, f.disc, h("span", null, "Show me under Co-riders when I post a request")),
      err, save);
  });
}
