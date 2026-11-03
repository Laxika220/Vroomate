import { h, icon, toast } from "../ui.js";
import { post } from "../api.js";
import { state, registerView } from "../core.js";

registerView("welcome", async (mode) => {
  const wrap = h("div", { class: "stack", style: { gap: "20px", paddingTop: "8px", flex: "1" } });
  const forms = { signup: signupForm, login: loginForm, forgot: forgotForm, intro };
  const draw = (m) => wrap.replaceChildren(...(forms[m] || intro)(draw));
  draw(forms[mode] ? mode : "intro");
  return { node: wrap, bare: true };
});

function intro(draw) {
  return [
    h("span", { class: "wordmark" }, "Vroomate"),
    h("div", { class: "stack", style: { gap: "8px", marginTop: "18vh" } },
      h("h1", { style: { fontSize: "32px" } }, "Rides between Lavasa and Pune"),
      h("p", { class: "muted" }, "Find a seat in someone's car, offer your empty seats, or find people to share a cab with.")),
    h("div", { class: "stack", style: { marginTop: "auto" } },
      h("button", { class: "btn primary block", onclick: () => draw("signup") }, "Sign up"),
      h("button", { class: "btn block", onclick: () => draw("login") }, "Log in")),
  ];
}

const backBtn = (draw) => h("button", { class: "iconbtn", "aria-label": "Back", onclick: () => draw("intro") }, icon("back"));

function loginForm(draw) {
  const err = h("p", { class: "err", role: "alert", hidden: true });
  const email = h("input", { id: "l_email", type: "email", autocomplete: "email", inputmode: "email", required: true });
  const pw = h("input", { id: "l_pw", type: "password", autocomplete: "current-password", required: true });
  const btn = h("button", { class: "btn primary block", type: "submit" }, "Log in");
  const form = h("form", { class: "stack", novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; btn.disabled = true;
    try { await post("/api/auth/login", { email: email.value, password: pw.value }); window.dispatchEvent(new Event("vm:session")); }
    catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  } },
    h("div", { class: "field" }, h("label", { for: "l_email" }, "Email"), email),
    h("div", { class: "field" }, h("label", { for: "l_pw" }, "Password"), pw), err, btn,
    h("button", { type: "button", class: "btn ghost block", onclick: () => draw("forgot") }, "Forgot password?"));
  return [backBtn(draw), h("h1", null, "Log in"), form];
}

function forgotForm(draw) {
  const err = h("p", { class: "err", role: "alert", hidden: true });
  const email = h("input", { id: "f_email", type: "email", autocomplete: "email", inputmode: "email", required: true });
  const btn = h("button", { class: "btn primary block", type: "submit" }, "Email me a reset link");
  const form = h("form", { class: "stack", novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; btn.disabled = true;
    try {
      await post("/api/auth/forgot", { email: email.value });
      form.replaceChildren(h("p", null, `If ${email.value} has an account, a reset link is on its way. It works for one hour.`),
        h("button", { type: "button", class: "btn block", onclick: () => draw("login") }, "Back to log in"));
    } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  } },
    h("div", { class: "field" }, h("label", { for: "f_email" }, "Email"), email), err, btn);
  return [h("button", { class: "iconbtn", "aria-label": "Back", onclick: () => draw("login") }, icon("back")), h("h1", null, "Reset password"), form];
}

registerView("reset", async (token) => {
  const err = h("p", { class: "err", role: "alert", hidden: true });
  const pw = h("input", { id: "r_pw", type: "password", autocomplete: "new-password", minlength: 8, required: true });
  const btn = h("button", { class: "btn primary block", type: "submit" }, "Save new password");
  const form = h("form", { class: "stack", novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; btn.disabled = true;
    try { await post("/api/auth/reset", { token, password: pw.value }); toast("Password changed"); location.hash = "#/home"; window.dispatchEvent(new Event("vm:session")); }
    catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  } },
    h("div", { class: "field" }, h("label", { for: "r_pw" }, "New password"), pw, h("p", { class: "hint" }, "At least 8 characters.")), err, btn);
  return { node: h("div", { class: "stack", style: { gap: "20px", paddingTop: "8px" } }, h("span", { class: "wordmark" }, "Vroomate"), h("h1", null, "Choose a new password"), form), bare: true };
});

function signupForm(draw) {
  const err = h("p", { class: "err", role: "alert", hidden: true });
  const f = {
    name: h("input", { id: "s_name", autocomplete: "name", maxlength: 60, required: true }),
    email: h("input", { id: "s_email", type: "email", autocomplete: "email", inputmode: "email", required: true }),
    phone: h("input", { id: "s_phone", type: "tel", autocomplete: "tel", inputmode: "tel", maxlength: 20 }),
    pw: h("input", { id: "s_pw", type: "password", autocomplete: "new-password", minlength: 8, required: true }),
    terms: h("input", { id: "s_terms", type: "checkbox" }),
    gender: h("select", { id: "s_gender" }, h("option", { value: "x" }, "Prefer not to say"), h("option", { value: "f" }, "Woman"), h("option", { value: "m" }, "Man")),
  };
  const btn = h("button", { class: "btn primary block", type: "submit" }, "Create account");
  const form = h("form", { class: "stack", novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; btn.disabled = true;
    try {
      await post("/api/auth/signup", { name: f.name.value, email: f.email.value, phone: f.phone.value, password: f.pw.value, gender: f.gender.value, accept_terms: f.terms.checked });
      window.dispatchEvent(new Event("vm:session"));
    } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  } },
    h("div", { class: "field" }, h("label", { for: "s_name" }, "Full name"), f.name),
    h("div", { class: "field" }, h("label", { for: "s_email" }, "Email"), f.email),
    h("div", { class: "field" }, h("label", { for: "s_phone" }, "Mobile number"), f.phone, h("p", { class: "hint" }, "Needed to ride or drive. Only shared once a ride is confirmed.")),
    h("div", { class: "field" }, h("label", { for: "s_pw" }, "Password"), f.pw, h("p", { class: "hint" }, "At least 8 characters.")),
    h("div", { class: "field" }, h("label", { for: "s_gender" }, "Gender (optional)"), f.gender, h("p", { class: "hint" }, "Used only for women-only rides.")),
    h("label", { class: "check", for: "s_terms" }, f.terms, h("span", null, "I agree to the ", h("a", { href: "#/terms", target: "_blank" }, "terms"), " and ", h("a", { href: "#/privacy", target: "_blank" }, "privacy policy"), ".")),
    err, btn);
  return [backBtn(draw), h("h1", null, "Create account"), form];
}

/** Downscale to <=800px JPEG so uploads stay small. */
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file could not be read as an image.")); };
    img.src = url;
  });
}
export async function pickPhoto(onDone) {
  const inp = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", hidden: true });
  inp.addEventListener("change", async () => {
    if (!inp.files[0]) return;
    try { const data = await shrink(inp.files[0]); const r = await post("/api/me/photo", { data }); state.me = r.user; onDone(r.user); toast("Photo updated"); }
    catch (x) { toast(x.message); }
  });
  document.body.append(inp); inp.click(); setTimeout(() => inp.remove(), 60000);
}
