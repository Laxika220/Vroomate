import { h, icon, toast, avatar, empty, fmtDay, fmtTime, inr } from "../ui.js";
import { get, post } from "../api.js";
import { registerView, nav, stopName, routeView } from "../core.js";

const ST = { pending: ["", "Waiting for driver"], confirmed: ["good", "Confirmed"], rejected: ["bad", "Declined"], cancelled: ["bad", "Cancelled"], completed: ["", "Completed"] };
const tag = (s, label) => h("span", { class: "tag " + (ST[s] ? ST[s][0] : "") }, label || ST[s][1]);
const reload = () => window.dispatchEvent(new Event("hashchange"));
const act = (fn, msg) => async () => { try { await fn(); if (msg) toast(msg); reload(); } catch (e) { toast(e.message); } };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const head = (when, right) => h("div", { class: "row between" }, h("b", null, when), right);

registerView("rides", async (tab) => {
  tab = ["upcoming", "requests", "past"].includes(tab) ? tab : "upcoming";
  const [bk, tr, rq] = await Promise.all([get("/api/bookings/mine"), get("/api/trips/mine"), get("/api/requests/mine")]);
  const myBookings = bk.bookings, myTrips = tr.trips;
  const incoming = myTrips.filter((t) => t.status === "open").flatMap((t) => t.bookings.filter((b) => b.status === "pending").map((b) => ({ ...b, trip: t })));

  const sections = {
    upcoming: [
      ...myBookings.filter((b) => b.status === "confirmed" && b.trip.status === "open").map(bookingCard),
      ...myTrips.filter((t) => t.status === "open").map(tripCard),
    ],
    requests: [
      ...incoming.map(incomingCard),
      ...myBookings.filter((b) => b.status === "pending").map(bookingCard),
      ...rq.requests.map(requestCard),
    ],
    past: [
      ...myBookings.filter((b) => ["completed", "cancelled", "rejected"].includes(b.status) || (b.status === "confirmed" && b.trip.status !== "open")).map(bookingCard),
      ...myTrips.filter((t) => t.status !== "open").map(tripCard),
    ],
  };
  const tabs = h("div", { class: "tabs" }, ...[["upcoming", "Upcoming"], ["requests", "Requests"], ["past", "Past"]].map(([id, l]) =>
    h("button", { "aria-pressed": String(tab === id), onclick: () => nav("/rides/" + id) }, l + (id !== "past" && sections[id].length ? ` ${sections[id].length}` : ""))));
  const none = {
    upcoming: empty("No upcoming trips", "Rides you're booked on and rides you're driving show up here.", h("a", { class: "btn primary", href: "#/home" }, "Find a ride"), h("a", { class: "btn", href: "#/offer" }, "Offer a ride")),
    requests: empty("No requests", "Seat requests you've sent or received, and your ride requests, show up here."),
    past: empty("No past trips", "Finished and cancelled trips are kept here."),
  };
  return h("div", { class: "stack", style: { gap: "8px" } }, h("h1", null, "Trips"), tabs,
    h("div", null, ...(sections[tab].length ? sections[tab] : [none[tab]])));
});

/** A seat I requested or hold on someone else's ride. */
function bookingCard(b) {
  const t = b.trip, live = t.status === "open" && ["pending", "confirmed"].includes(b.status);
  return h("div", { class: "trip" },
    head(fmtDay(b.pickup_eta), tag(b.status)),
    routeView(b.pickup_stop, b.drop_stop, fmtTime(b.pickup_eta)),
    h("div", { class: "row" }, avatar(b.driver, "sm"), h("div", { class: "grow" }, h("b", null, b.driver.name),
      h("p", { class: "hint" }, [b.vehicle && `${b.vehicle.colour} ${b.vehicle.model}`, b.vehicle && b.vehicle.plate, plural(b.seats, "seat"), inr(b.fare_total)].filter(Boolean).join(" · ")))),
    b.status === "confirmed" && b.driver_phone && h("p", { class: "hint" }, `Phone: ${b.driver_phone}`),
    h("div", { class: "row" },
      b.conversation_id && h("button", { class: "btn small", onclick: () => nav("/chat/" + b.conversation_id) }, "Message"),
      live && h("button", { class: "btn small danger", onclick: act(() => post(`/api/bookings/${b.id}/cancel`), "Cancelled") }, b.status === "pending" ? "Withdraw" : "Cancel"),
      b.status === "completed" && h("button", { class: "btn small", onclick: () => nav("/report/" + b.driver.id) }, "Report")));
}

/** Someone wants a seat on a ride I'm driving. */
function incomingCard(b) {
  const t = b.trip;
  return h("div", { class: "trip" },
    head(`${b.rider.name.split(" ")[0]} wants ${plural(b.seats, "seat")}`, tag("pending", "Needs reply")),
    h("div", { class: "row" }, avatar(b.rider, "sm"), h("div", { class: "grow" }, h("b", null, b.rider.name),
      h("p", { class: "hint" }, `${stopName(b.pickup_stop)} to ${stopName(b.drop_stop)} · ${inr(b.fare_total)} · ${fmtDay(t.depart_at)}`))),
    h("div", { class: "row" },
      h("button", { class: "btn small primary", onclick: act(() => post(`/api/bookings/${b.id}/respond`, { decision: "accept" }), "Seat confirmed") }, "Accept"),
      h("button", { class: "btn small", onclick: act(() => post(`/api/bookings/${b.id}/respond`, { decision: "reject" })) }, "Decline"),
      h("button", { class: "iconbtn", "aria-label": "Report", style: { marginLeft: "auto" }, onclick: () => nav("/report/" + b.rider.id) }, icon("flag"))));
}

/** A ride I'm driving. */
function tripCard(t) {
  const live = t.status === "open", riders = t.bookings.filter((b) => b.status === "confirmed");
  return h("div", { class: "trip" },
    head(fmtDay(t.depart_at), live ? tag("", "You're driving") : tag(t.status, t.status[0].toUpperCase() + t.status.slice(1))),
    routeView(t.origin_stop, t.dest_stop, fmtTime(t.depart_at)),
    h("p", { class: "hint" }, `${t.seats_available} of ${plural(t.seats_total, "seat")} free · ${t.vehicle.colour} ${t.vehicle.model}${t.women_only ? " · Women only" : ""}`),
    riders.map((b) => h("div", { class: "row" }, avatar(b.rider, "sm"),
      h("div", { class: "grow" }, h("b", null, b.rider.name), h("p", { class: "hint" }, `${stopName(b.pickup_stop)} to ${stopName(b.drop_stop)} · ${plural(b.seats, "seat")}`)),
      live && h("button", { class: "btn small danger", onclick: act(() => post(`/api/bookings/${b.id}/cancel`), "Passenger removed") }, "Remove"))),
    live && h("div", { class: "row" },
      t.depart_at <= Date.now() + 15 * 60000 && h("button", { class: "btn small primary", onclick: act(() => post(`/api/trips/${t.id}/complete`), "Trip completed") }, "Mark complete"),
      h("button", { class: "btn small danger", onclick: act(() => post(`/api/trips/${t.id}/cancel`), "Ride cancelled") }, "Cancel ride")));
}

function requestCard(r) {
  return h("div", { class: "trip" },
    head(fmtDay(r.earliest_at), tag("", "Looking for a ride")),
    routeView(r.origin_stop, r.dest_stop, `${fmtTime(r.earliest_at)} to ${fmtTime(r.latest_at)}`),
    h("p", { class: "hint" }, `${plural(r.seats, "seat")}. Drivers going this way are notified.`),
    h("div", { class: "row" }, h("button", { class: "btn small danger", onclick: act(() => post(`/api/requests/${r.id}/cancel`), "Request cancelled") }, "Cancel request")));
}
