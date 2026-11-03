import { h, toast, sheet, mount } from "../ui.js";
import { post, put } from "../api.js";
import { state } from "../core.js";

/** Phone verification sheet. Resolves true once the number is verified, false if closed. */
export function verifyPhone() {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet((body, close) => {
      const err = h("p", { class: "err", role: "alert", hidden: true });
      const fail = (x) => { err.textContent = x.message; err.hidden = false; };
      const phone = h("input", { id: "v_phone", type: "tel", inputmode: "tel", autocomplete: "tel", value: state.me.phone || "", placeholder: "98765 43210" });
      const code = h("input", { id: "v_code", inputmode: "numeric", autocomplete: "one-time-code", maxlength: 6, placeholder: "6-digit code" });
      const step2 = h("div", { class: "stack", hidden: true });
      const sendBtn = h("button", { class: "btn primary block", onclick: async () => {
        err.hidden = true; sendBtn.disabled = true;
        try {
          if (phone.value.trim() !== (state.me.phone || "")) state.me = (await put("/api/me", { ...state.me, phone: phone.value.trim() })).user;
          const r = await post("/api/me/phone/send");
          step2.hidden = false; sendBtn.textContent = "Send again";
          if (r.dev_code) { code.value = r.dev_code; toast("Test mode: code filled in for you"); }
          code.focus();
        } catch (x) { fail(x); }
        sendBtn.disabled = false;
      } }, "Text me a code");
      const verifyBtn = h("button", { class: "btn primary block", onclick: async () => {
        err.hidden = true; verifyBtn.disabled = true;
        try { state.me = (await post("/api/me/phone/verify", { code: code.value })).user; done = true; toast("Phone verified"); close(); }
        catch (x) { fail(x); verifyBtn.disabled = false; }
      } }, "Verify");
      mount(step2, h("div", { class: "field" }, h("label", { for: "v_code" }, "Code"), code), verifyBtn);
      mount(body, h("h2", null, "Verify your phone"),
        h("p", { class: "muted" }, "Drivers and passengers call each other at pickup, so everyone who rides or drives confirms their number once."),
        h("div", { class: "field" }, h("label", { for: "v_phone" }, "Mobile number"), phone, h("p", { class: "hint" }, "Only shared with people on a confirmed ride.")),
        sendBtn, step2, err);
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(s.body)) { obs.disconnect(); resolve(done); } });
    obs.observe(document.body, { childList: true });
  });
}

/** Run `fn`; if the server says the phone isn't verified, verify it and try once more. */
export async function withVerifiedPhone(fn) {
  try { return await fn(); }
  catch (x) {
    if (x.code !== "phone_unverified") throw x;
    if (!(await verifyPhone())) throw Object.assign(new Error("Verify your phone to continue."), { quiet: true });
    return fn();
  }
}
