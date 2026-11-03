"use strict";
const fs = require("fs");
const path = require("path");

const file = process.env.VROOMATE_ROUTES || path.join(__dirname, "..", "config", "routes.json");
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
const stops = cfg.stops.slice().sort((a, b) => a.km - b.km);
const byId = Object.fromEntries(stops.map((s) => [s.id, s]));

function stop(id) {
  return byId[id] || null;
}

/** +1 heading toward Pune, -1 heading toward Lavasa, 0 if same/unknown. */
function direction(fromId, toId) {
  const a = byId[fromId], b = byId[toId];
  if (!a || !b) return 0;
  return Math.sign(b.km - a.km);
}

/** True if `id` lies on the driver's path from origin to dest (inclusive). */
function onSegment(originId, destId, id) {
  const o = byId[originId], d = byId[destId], x = byId[id];
  if (!o || !d || !x) return false;
  const lo = Math.min(o.km, d.km), hi = Math.max(o.km, d.km);
  return x.km >= lo && x.km <= hi;
}

function distanceKm(a, b) {
  return byId[a] && byId[b] ? Math.abs(byId[a].km - byId[b].km) : 0;
}

/** Minutes a vehicle needs between two stops along the corridor. */
function travelMinutes(a, b) {
  return byId[a] && byId[b] ? Math.abs(byId[a].min - byId[b].min) : 0;
}

module.exports = {
  cfg, stops, stop, direction, onSegment, distanceKm, travelMinutes,
  slackMs: (cfg.timeSlackMinutes || 20) * 60000,
  publicConfig: () => ({
    corridorName: cfg.corridorName,
    stops,
    suggestedFarePerKmInr: cfg.suggestedFarePerKmInr,
    maxFarePerKmInr: cfg.maxFarePerKmInr,
    supportEmail: process.env.SUPPORT_EMAIL || "",
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
  }),
};
