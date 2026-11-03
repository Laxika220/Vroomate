import { h, icon, toast, sheet, mount, avatar, fmtDay, fmtTime } from "../ui.js";
import { get, post } from "../api.js";
import { state, registerView } from "../core.js";

/** Star picker plus optional comment. Resolves true once saved. */
export function rateSheet(bookingId, person, role) {
  return new Promise((resolve) => {
    let saved = false;
    const s = sheet((body, close) => {
      let n = 0;
      const btns = [1, 2, 3, 4, 5].map((k) => h("button", { class: "starbtn", "aria-label": `${k} star${k > 1 ? "s" : ""}`, "aria-pressed": "false", onclick: () => { n = k; paint(); } }, icon("star")));
      const paint = () => btns.forEach((b, i) => b.setAttribute("aria-pressed", String(i < n)));
      const comment = h("input", { id: "rt_c", maxlength: 300, placeholder: role === "driver" ? "e.g. On time, drove carefully" : "e.g. Was ready at pickup" });
      const err = h("p", { class: "err", role: "alert", hidden: true });
      const go = h("button", { class: "btn primary block", onclick: async () => {
        if (!n) { err.textContent = "Pick 1 to 5 stars."; err.hidden = false; return; }
        go.disabled = true;
        try { await post("/api/ratings", { booking_id: bookingId, ratee_id: person.id, stars: n, comment: comment.value }); saved = true; toast("Thanks for rating"); close(); }
        catch (x) { err.textContent = x.message; err.hidden = false; go.disabled = false; }
      } }, "Submit");
      mount(body, h("div", { class: "row" }, avatar(person), h("h2", { class: "grow" }, `Rate ${person.name.split(" ")[0]}`)),
        h("div", { class: "stars-pick" }, btns),
        h("div", { class: "field" }, h("label", { for: "rt_c" }, "Comment (optional)"), comment, h("p", { class: "hint" }, "Comments appear on their profile with your first name.")),
        err, go);
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(s.body)) { obs.disconnect(); resolve(saved); } });
    obs.observe(document.body, { childList: true });
  });
}

/** Make (or reuse) a private link to a confirmed seat and hand it to the phone's share sheet. */
export async function shareTrip(bookingId) {
  try {
    const { url } = await post(`/api/bookings/${bookingId}/share`);
    const text = `I'm travelling with Vroomate. Follow my trip here:`;
    if (navigator.share) { try { await navigator.share({ title: "My Vroomate trip", text, url }); return; } catch (e) { if (e.name === "AbortError") return; } }
    await navigator.clipboard.writeText(url); toast("Trip link copied. Paste it to someone you trust.");
  } catch (x) { toast(x.message); }
}

/** Emergency actions for a trip that's about to start or under way. */
export function emergencySheet(bookingId) {
  sheet((body, close) => {
    const me = state.me;
    mount(body, h("h2", null, "Emergency"),
      h("a", { class: "btn danger-fill block", href: "tel:112" }, icon("phone"), "Call 112"),
      me.emergency_phone
        ? h("a", { class: "btn block", href: "tel:" + me.emergency_phone.replace(/\s/g, "") }, icon("phone"), `Call ${me.emergency_name || "emergency contact"}`)
        : h("a", { class: "btn block", href: "#/profile", onclick: close }, "Add an emergency contact"),
      bookingId && h("button", { class: "btn block", onclick: () => shareTrip(bookingId) }, icon("share"), "Share live trip details"),
      h("p", { class: "hint" }, "112 reaches police, fire and ambulance anywhere in India. After you're safe, report the person from their profile."));
  });
}

/* Public page for a shared trip link. */
registerView("share", async (token) => {
  let t;
  try { t = await get("/api/share/" + encodeURIComponent(token || "")); }
  catch (x) { return { node: h("div", { class: "empty" }, h("h3", null, "Link not available"), h("p", null, x.message)), bare: !state.me }; }
  const status = { confirmed: ["", "Booked"], completed: ["good", "Trip finished"], cancelled: ["bad", "Cancelled"] }[t.status];
  return {
    node: h("div", { class: "stack", style: { gap: "16px" } },
      h("span", { class: "wordmark" }, "Vroomate"),
      h("h1", null, `${t.rider}'s trip`),
      h("span", { class: "tag " + status[0], style: { alignSelf: "flex-start" } }, status[1]),
      h("div", { class: "box stack" },
        h("div", { class: "row between" }, h("b", null, t.pickup), h("span", { class: "mono" }, fmtTime(t.pickup_at))),
        h("div", { class: "row between" }, h("b", null, t.drop), h("span", { class: "mono" }, `about ${fmtTime(t.drop_at)}`)),
        h("p", { class: "hint" }, fmtDay(t.pickup_at))),
      h("div", { class: "row" }, avatar(t.driver, "lg"), h("div", { class: "grow" }, h("p", { class: "hint" }, "Driver"), h("h2", null, t.driver.name))),
      t.vehicle && h("div", { class: "box" }, h("p", { class: "hint" }, "Car"), h("b", null, `${t.vehicle.colour} ${t.vehicle.model}`), h("p", { class: "mono", style: { fontSize: "20px", marginTop: "4px" } }, t.vehicle.plate)),
      t.driver.phone && h("a", { class: "btn block", href: "tel:" + t.driver.phone.replace(/\s/g, "") }, icon("phone"), "Call the driver"),
      h("a", { class: "btn danger-fill block", href: "tel:112" }, icon("phone"), "Emergency: call 112"),
      h("p", { class: "hint" }, "This page stops working 12 hours after departure.")),
    bare: !state.me,
  };
});
