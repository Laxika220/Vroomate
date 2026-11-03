import { h, toast } from "./ui.js";
import { post } from "./api.js";
import { state } from "./core.js";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const keyBytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function current() {
  const reg = await navigator.serviceWorker.ready;
  return { reg, sub: await reg.pushManager.getSubscription() };
}

export async function enablePush() {
  if (await Notification.requestPermission() !== "granted") throw new Error("Notifications are blocked. Allow them in your browser's site settings.");
  const { reg, sub } = await current();
  const s = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.cfg.vapidPublicKey) });
  await post("/api/push/subscribe", s.toJSON());
}
export async function disablePush() {
  const { sub } = await current();
  if (sub) { await post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
}

/** Fills `box` with a phone-notification switch, or a note saying why it isn't available here. */
export async function pushToggle(box) {
  if (!state.cfg.vapidPublicKey) return;
  if (!supported()) {
    box.replaceChildren(h("p", { class: "hint" }, isIos() && !standalone()
      ? "For phone notifications on iPhone, tap Share then Add to Home Screen, and open Vroomate from there."
      : "This browser can't show phone notifications."));
    return;
  }
  const cb = h("input", { id: "n_push", type: "checkbox" });
  cb.checked = Notification.permission === "granted" && !!(await current()).sub;
  cb.addEventListener("change", async () => {
    cb.disabled = true;
    try { if (cb.checked) { await enablePush(); toast("Phone notifications on"); } else { await disablePush(); toast("Phone notifications off"); } }
    catch (x) { cb.checked = !cb.checked; toast(x.message); }
    cb.disabled = false;
  });
  box.replaceChildren(h("label", { class: "check", for: "n_push" }, cb, h("span", null, "Phone notifications on this device")));
}
