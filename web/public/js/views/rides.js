import { h, icon, toast, avatar, empty, fmtWhen, fmtTime, inr } from "../ui.js";
import { get, post } from "../api.js";
import { state, registerView, nav, stopName } from "../core.js";

const ST = { pending: ["warn", "Waiting for driver"], confirmed: ["good", "Confirmed"], rejected: ["bad", "Declined"], cancelled: ["bad", "Cancelled"], completed: ["", "Completed"] };
const tag = (s, label) => h("span", { class: "tag " + (ST[s] ? ST[s][0] : "") }, label || ST[s][1]);
const reload = () => window.dispatchEvent(new Event("hashchange"));
const act = (fn, msg) => async () => { try { await fn(); if (msg) toast(msg); reload(); } catch (e) { toast(e.message); } };
const leg = (a, b) => h("b", null, `${stopName(a)} to ${stopName(b)}`);

registerView("rides", async (tab) => {
  tab = ["upcoming", "pending", "past"].includes(tab) ? tab : "upcoming";
  const [bk, tr, rq] = await Promise.all([get("/api/bookings/mine"), get("/api/trips/mine"), get("/api/requests/mine")]);
  const now = Date.now();
  const myBookings = bk.bookings, myTrips = tr.trips;
  const incoming = myTrips.filter((t) => t.status === "open").flatMap((t) => t.bookings.filter((b) => b.status === "pending").map((b) => ({ ...b, trip: t })));

  const sections = {
    upcoming: [
      ...myBookings.filter((b) => b.status === "confirmed" && b.trip.status === "open").map(bookingCard),
      ...myTrips.filter((t) => t.status === "open").map(tripCard),
    ],
    pending: [
      ...incoming.map(incomingCard),
      ...myBookings.filter((b) => b.status === "pending").map(bookingCard),
      ...rq.requests.map(requestCard),
    ],
    past: [
      ...myBookings.filter((b) => ["completed", "cancelled", "rejected"].includes(b.status) || (b.status === "confirmed" && b.trip.status !== "open")).map(bookingCard),
      ...myTrips.filter((t) => t.status !== "open").map(tripCard),
    ],
  };
  const counts = { upcoming: sections.upcoming.length, pending: sections.pending.length, past: sections.past.length };
  const tabs = h("div", { class: "seg2", style: { gridTemplateColumns: "repeat(3,1fr)" }, role: "tablist" },
    ...[["upcoming", "Upcoming"], ["pending", "Pending"], ["past", "Past"]].map(([id, l]) => h("button", { role: "tab", "aria-pressed": String(tab === id), onclick: () => nav("/rides/" + id) }, l + (counts[id] ? ` (${counts[id]})` : ""))));
  const emptyMsg = {
    upcoming: empty("route", "No upcoming journeys", "Find a driver in Discover, or publish a trip if you drive.", h("div", { class: "row" }, h("button", { class: "btn primary", onclick: () => nav("/discover") }, "Find a ride"), h("button", { class: "btn", onclick: () => nav("/post") }, "Post"))),
    pending: empty("clock", "Nothing waiting", "Seat requests, requests from riders and your open ride requests show up here."),
    past: empty("check", "No past journeys yet", "Completed, cancelled and declined journeys are kept here."),
  };
  return h("div", { class: "stack", style: { gap: "14px" } }, h("h1", { style: { fontSize: "28px" } }, "My Rides"), tabs, ...(sections[tab].length ? sections[tab] : [emptyMsg[tab]]));
});

/** A seat I requested or hold on someone else's trip. */
function bookingCard(b) {
  const t = b.trip, upcoming = t.status === "open" && ["pending", "confirmed"].includes(b.status);
  return h("div", { class: "panel ride" },
    h("div", { class: "head" }, h("div", null, leg(b.pickup_stop, b.drop_stop), h("p", { class: "hint" }, `${fmtWhen(b.pickup_eta)} pickup · ${b.seats} seat${b.seats > 1 ? "s" : ""} · ${inr(b.fare_total)}${b.group_id ? " · group" : ""}`)), tag(b.status)),
    h("div", { class: "row" }, avatar(b.driver, "sm"), h("div", { class: "grow" }, h("b", null, b.driver.name), h("p", { class: "hint" }, b.vehicle ? `${b.vehicle.colour} ${b.vehicle.model}${b.vehicle.plate ? " · " + b.vehicle.plate : ""}` : "")), b.driver.driver_approved && h("span", { class: "tag good" }, "Approved")),
    b.status === "confirmed" && b.driver_phone && h("p", { class: "hint" }, `Driver's number: ${b.driver_phone}`),
    b.status === "confirmed" && !b.driver_phone && h("p", { class: "hint" }, "Chat with your driver to agree the exact pickup spot."),
    b.companions.length > 0 && h("div", { class: "row" }, ...b.companions.map((c) => avatar(c, "sm")), h("span", { class: "hint" }, `Travelling with ${b.companions.map((c) => c.name.split(" ")[0]).join(", ")}`)),
    h("div", { class: "row" },
      b.conversation_id && h("button", { class: "btn small grow", onclick: () => nav("/chat/" + b.conversation_id) }, icon("chat"), "Chat"),
      upcoming && h("button", { class: "btn small danger", onclick: act(() => post(`/api/bookings/${b.id}/cancel`), "Cancelled") }, b.status === "pending" ? "Withdraw" : "Cancel seat"),
      ["completed"].includes(b.status) && h("button", { class: "btn small", onclick: () => nav("/report/" + b.driver.id) }, icon("flag"), "Report")));
}

/** A request waiting for me, as a driver. */
function incomingCard(b) {
  const t = b.trip;
  return h("div", { class: "panel ride", style: { borderColor: "var(--lav)" } },
    h("div", { class: "head" }, h("div", null, h("b", null, `${b.group_id ? "Group of " + b.seats : b.rider.name} wants ${b.seats} seat${b.seats > 1 ? "s" : ""}`), h("p", { class: "hint" }, `${stopName(b.pickup_stop)} to ${stopName(b.drop_stop)} on your ${stopName(t.origin_stop)} to ${stopName(t.dest_stop)} trip`)), tag("pending", "Needs you")),
    h("div", { class: "row" }, avatar(b.rider, "sm"), h("div", { class: "grow" }, h("b", null, b.rider.name), h("p", { class: "hint" }, `${b.rider.course || b.rider.role} · ${inr(b.fare_total)} · ${t.seats_available} of ${t.seats_total} seats free`)), b.rider.verified && h("span", { class: "tag good" }, "Verified")),
    h("div", { class: "row" },
      h("button", { class: "btn primary small grow", onclick: act(() => post(`/api/bookings/${b.id}/respond`, { decision: "accept" }), "Seat confirmed") }, "Accept"),
      h("button", { class: "btn small grow", onclick: act(() => post(`/api/bookings/${b.id}/respond`, { decision: "reject" })) }, "Decline"),
      h("button", { class: "iconbtn", "aria-label": "Report rider", onclick: () => nav("/report/" + b.rider.id) }, icon("flag"))));
}

/** A trip I'm driving. */
function tripCard(t) {
  const live = t.status === "open", confirmed = t.bookings.filter((b) => b.status === "confirmed");
  return h("div", { class: "panel ride" },
    h("div", { class: "head" }, h("div", null, leg(t.origin_stop, t.dest_stop), h("p", { class: "hint" }, `${fmtWhen(t.depart_at)} · ${t.vehicle.model}`)), live ? tag("confirmed", "You're driving") : tag(t.status, t.status[0].toUpperCase() + t.status.slice(1))),
    h("div", { class: "facts", style: { gap: "8px", display: "flex", flexWrap: "wrap" } }, h("span", { class: "tag" }, `${t.seats_available} of ${t.seats_total} seats free`), h("span", { class: "tag" }, `${inr(t.fare_per_km_seat)}/km`), t.women_only && h("span", { class: "tag" }, "Women-only")),
    confirmed.length ? h("div", { class: "stack", style: { gap: "8px" } }, h("span", { class: "lbl hint" }, "Passengers"), ...confirmed.map((b) => h("div", { class: "row" }, avatar(b.rider, "sm"), h("div", { class: "grow" }, h("b", null, b.group_id ? `${b.rider.name} + group` : b.rider.name), h("p", { class: "hint" }, `${stopName(b.pickup_stop)} to ${stopName(b.drop_stop)} · ${b.seats} seat${b.seats > 1 ? "s" : ""}`)),
      h("button", { class: "btn small danger", onclick: act(() => post(`/api/bookings/${b.id}/cancel`), "Passenger removed") }, "Remove")))) : (live && h("p", { class: "hint" }, "No passengers yet. Riders find you in Discover.")),
    live && h("div", { class: "row" },
      t.depart_at <= Date.now() + 15 * 60000 && h("button", { class: "btn primary small grow", onclick: act(() => post(`/api/trips/${t.id}/complete`), "Trip completed") }, "Mark complete"),
      h("button", { class: "btn small danger grow", onclick: act(() => post(`/api/trips/${t.id}/cancel`), "Trip cancelled") }, "Cancel trip")));
}

function requestCard(r) {
  return h("div", { class: "panel ride" },
    h("div", { class: "head" }, h("div", null, leg(r.origin_stop, r.dest_stop), h("p", { class: "hint" }, `${fmtWhen(r.earliest_at)} to ${fmtTime(r.latest_at)} · ${r.seats} seat${r.seats > 1 ? "s" : ""}${r.max_fare ? " · up to " + inr(r.max_fare) : ""}`)), h("span", { class: "tag" }, "Looking for a ride")),
    h("p", { class: "hint" }, "Drivers on this route are notified, and travel buddies can find you in Discover."),
    h("button", { class: "btn small danger", onclick: act(() => post(`/api/requests/${r.id}/cancel`), "Request cancelled") }, "Cancel request"));
}
