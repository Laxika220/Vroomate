import { h, icon, toast, avatar } from "../ui.js";
import { post, put, get } from "../api.js";
import { state, registerView, refreshMe } from "../core.js";

const ROLES = [
  ["student", "Student", "CHRIST Lavasa student", "users"],
  ["faculty", "Faculty", "CHRIST Lavasa faculty or staff", "shield"],
  ["driver", "Driver", "Offer seats on your trips", "car"],
  ["community", "Community", "Lavasa resident or visitor", "pin"],
];
let devCode = null;                      // only set when the server runs with email delivery off (local/dev)

function brand() {
  const l = h("div", { class: "logo" });
  l.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#8E78FF"/><circle cx="9" cy="23" r="3.5" fill="#140C3A"/><rect x="19" y="7" width="7" height="7" rx="2" fill="#fff"/><path d="M9 23v-6q0-3 3-3h7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>';
  l.append("Vroomate");
  return l;
}

function routeArt() {
  const w = h("div", { "aria-hidden": "true", style: { margin: "6px 0 2px" } });
  w.innerHTML = `<svg viewBox="0 0 360 120" width="100%" style="display:block"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#BBA7FF"/><stop offset="1" stop-color="#8E78FF"/></linearGradient></defs>
  <path d="M30 80 C 90 20, 140 110, 200 60 S 300 20, 330 40" fill="none" stroke="url(#g)" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 11"/>
  <circle cx="30" cy="80" r="11" fill="#0A0F24" stroke="#BBA7FF" stroke-width="5"/><rect x="319" y="29" width="22" height="22" rx="6" fill="#0A0F24" stroke="#BBA7FF" stroke-width="5"/>
  <text x="30" y="108" fill="#9BA5D3" font-size="12" font-weight="700" text-anchor="middle" font-family="sans-serif">LAVASA</text>
  <text x="330" y="74" fill="#9BA5D3" font-size="12" font-weight="700" text-anchor="middle" font-family="sans-serif">PUNE</text></svg>`;
  return w;
}

registerView("welcome", async (mode) => {
  const wrap = h("div", { class: "stack", style: { gap: "18px" } });
  const draw = (m) => wrap.replaceChildren(...(m === "signup" ? signupForm(draw) : m === "login" ? loginForm(draw) : intro(draw)));
  draw(mode === "login" ? "login" : mode === "signup" ? "signup" : "intro");
  return { node: wrap, bare: true };
});

function intro(draw) {
  return [
    h("div", { style: { paddingTop: "28px" } }, brand()),
    routeArt(),
    h("h1", null, "Share the ride. Find your people."),
    h("p", { class: "muted", style: { fontSize: "17px" } }, "Lavasa ↔ Pune rides for CHRIST University. Swipe on drivers, match with travel buddies, book seats together."),
    h("div", { class: "stack", style: { marginTop: "10px" } },
      h("button", { class: "btn primary block", onclick: () => draw("signup") }, "Create account"),
      h("button", { class: "btn block", onclick: () => draw("login") }, "I already have an account")),
    h("p", { class: "hint" }, "A match is only a hello. Seats are booked and confirmed by the driver."),
  ];
}

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
    h("div", { class: "field" }, h("label", { for: "l_pw" }, "Password"), pw), err, btn);
  return [h("button", { class: "iconbtn", "aria-label": "Back", onclick: () => draw("intro") }, icon("back")), h("h2", null, "Welcome back"), form];
}

function signupForm(draw) {
  let role = "student";
  const err = h("p", { class: "err", role: "alert", hidden: true });
  const f = {
    name: h("input", { id: "s_name", autocomplete: "name", maxlength: 60, required: true }),
    email: h("input", { id: "s_email", type: "email", autocomplete: "email", inputmode: "email", required: true }),
    pw: h("input", { id: "s_pw", type: "password", autocomplete: "new-password", minlength: 8, required: true }),
    gender: h("select", { id: "s_gender" }, h("option", { value: "x" }, "Prefer not to say"), h("option", { value: "f" }, "Woman"), h("option", { value: "m" }, "Man")),
  };
  const emailHint = h("p", { class: "hint" });
  const tiles = h("div", { class: "two" });
  const drawRole = () => {
    tiles.replaceChildren(...ROLES.map(([id, t, d, ic]) => h("button", { type: "button", class: "panel", "aria-pressed": String(role === id),
      style: { textAlign: "left", display: "flex", flexDirection: "column", gap: "4px", padding: "14px", borderColor: role === id ? "var(--lav)" : "var(--line)", background: role === id ? "var(--card2)" : "var(--card)" },
      onclick: () => { role = id; drawRole(); } }, h("span", { style: { color: "var(--lav)", width: "26px", height: "26px", display: "block" } }, icon(ic)), h("b", null, t), h("span", { class: "hint" }, d))));
    emailHint.textContent = role === "student" || role === "faculty" ? `Use your CHRIST email (ends in ${state.cfg ? state.cfg.allowedEmailDomains[0] : "christuniversity.in"}). We verify it with a code.` : "Drivers are approved by the Vroomate team before they can publish trips.";
  };
  drawRole();
  const btn = h("button", { class: "btn primary block", type: "submit" }, "Continue");
  const form = h("form", { class: "stack", novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.hidden = true; btn.disabled = true;
    try {
      const r = await post("/api/auth/signup", { role, name: f.name.value, email: f.email.value, password: f.pw.value, gender: f.gender.value });
      devCode = r.dev_code || null;
      window.dispatchEvent(new Event("vm:session"));
    } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  } },
    h("div", { class: "field" }, h("span", { class: "lbl" }, "I am a"), tiles),
    h("div", { class: "field" }, h("label", { for: "s_name" }, "Name"), f.name),
    h("div", { class: "field" }, h("label", { for: "s_email" }, "Email"), f.email, emailHint),
    h("div", { class: "field" }, h("label", { for: "s_pw" }, "Password"), f.pw, h("p", { class: "hint" }, "At least 8 characters.")),
    h("div", { class: "field" }, h("label", { for: "s_gender" }, "Gender (optional)"), f.gender, h("p", { class: "hint" }, "Only used for women-only rides. Never shown on your card.")),
    err, btn);
  return [h("button", { class: "iconbtn", "aria-label": "Back", onclick: () => draw("intro") }, icon("back")), h("h2", null, "Join Vroomate"), form];
}

registerView("verify", async () => {
  const err = h("p", { class: "err", role: "alert", hidden: true });
  const code = h("input", { id: "v_code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 6, placeholder: "000000", style: { fontSize: "26px", letterSpacing: ".35em", textAlign: "center" } });
  const dev = h("div", { class: "panel", hidden: !devCode, style: { borderStyle: "dashed" } },
    h("p", { class: "hint" }, "Email delivery isn't set up on this server, so your code is shown here:"),
    h("b", { class: "mono", style: { fontSize: "22px", letterSpacing: ".2em" } }, devCode || ""));
  const verify = async () => {
    err.hidden = true;
    try { await post("/api/auth/verify", { code: code.value }); toast("Email verified"); window.dispatchEvent(new Event("vm:session")); }
    catch (x) { err.textContent = x.message; err.hidden = false; }
  };
  code.addEventListener("input", () => { code.value = code.value.replace(/\D/g, ""); if (code.value.length === 6) verify(); });
  const node = h("div", { class: "stack", style: { gap: "18px", paddingTop: "28px" } }, brand(),
    h("h2", null, "Check your CHRIST email"),
    h("p", { class: "muted" }, `We sent a 6-digit code to ${state.me.email}. It confirms you are part of CHRIST and earns the verified badge.`),
    dev,
    h("div", { class: "field" }, h("label", { for: "v_code" }, "Code"), code), err,
    h("button", { class: "btn primary block", onclick: verify }, "Verify"),
    h("button", { class: "btn ghost block", onclick: async () => {
      try { const r = await post("/api/auth/resend"); devCode = r.dev_code || null; toast("New code sent"); window.dispatchEvent(new Event("vm:session")); } catch (x) { toast(x.message); } } }, "Send a new code"),
    h("button", { class: "btn ghost block", onclick: async () => { await post("/api/auth/logout"); window.dispatchEvent(new Event("vm:session")); } }, "Use a different account"));
  return { node, bare: true };
});

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

registerView("setup", async () => {
  const me = state.me;
  let picked = new Set(me.interests || []);
  const avSlot = h("div", { class: "row", style: { justifyContent: "center" } });
  const drawAv = () => avSlot.replaceChildren(h("button", { "aria-label": "Add a photo", onclick: () => pickPhoto((u) => { state.me = u; drawAv(); }) }, avatar(state.me, "lg")));
  drawAv();
  const stop = h("select", { id: "u_stop" }, h("option", { value: "" }, "Choose where you start from"), state.cfg.stops.map((s) => h("option", { value: s.id }, s.name)));
  stop.value = me.home_stop || "";
  const course = h("input", { id: "u_course", maxlength: 40, placeholder: me.role === "faculty" ? "Department" : "e.g. BBA 2nd year", value: me.course || "" });
  const chips = h("div", { class: "chips" });
  const drawChips = () => chips.replaceChildren(...state.cfg.interests.map((i) => h("button", { type: "button", class: "chip", "aria-pressed": String(picked.has(i)),
    onclick: () => { if (picked.has(i)) picked.delete(i); else if (picked.size < 6) picked.add(i); else toast("Pick up to 6"); drawChips(); } }, i)));
  drawChips();
  const err = h("p", { class: "err", role: "alert", hidden: true });
  const save = h("button", { class: "btn primary block", onclick: async () => {
    if (!stop.value) { err.textContent = "Choose your usual starting stop so we can find rides on your route."; err.hidden = false; return; }
    save.disabled = true;
    try { await put("/api/me", { ...state.me, home_stop: stop.value, course: course.value, interests: [...picked] }); window.dispatchEvent(new Event("vm:session")); }
    catch (x) { err.textContent = x.message; err.hidden = false; save.disabled = false; }
  } }, "Start exploring");
  const node = h("div", { class: "stack", style: { gap: "18px", paddingTop: "20px" } },
    h("h2", null, `Hi ${me.name.split(" ")[0]}, make it yours`),
    h("p", { class: "muted" }, "A real photo gets far more matches. You can change all of this later."),
    avSlot,
    h("div", { class: "field" }, h("label", { for: "u_stop" }, "Usual starting point"), stop),
    h("div", { class: "field" }, h("label", { for: "u_course" }, me.role === "faculty" ? "Department" : "Course and year"), course),
    h("div", { class: "field" }, h("span", { class: "lbl" }, "Interests (up to 6)"), chips),
    err, save,
    h("button", { class: "btn ghost block", onclick: () => { sessionStorage.setItem("vm_skip_setup", "1"); window.dispatchEvent(new Event("vm:session")); } }, "Skip for now"));
  return { node, bare: true };
});
