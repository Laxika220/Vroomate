"use strict";
// Usage: npm run seed
// Fills the app with demo people, rides and ride requests so the swipe deck has cards.
// Safe to run again: demo accounts are reused, and their old rides and requests are replaced with fresh ones dated from now.
// Every demo account uses the password "password123" and an @demo.vroomate email.
const { db, tx } = require("./db");
const cfg = require("./config");
const { hashPassword } = require("./auth");
const { ensureConversation } = require("./conv");

const PASSWORD = "password123";
const HOUR = 3600000, IST = 5.5 * HOUR;

/** A time `days` from today at hh:mm India time, pushed a day later if it's less than an hour away. */
function at(days, hh, mm = 0) {
  const midnightIst = Math.floor((Date.now() + IST) / 86400000) * 86400000 - IST;
  let t = midnightIst + days * 86400000 + (hh * 60 + mm) * 60000;
  while (t < Date.now() + HOUR) t += 86400000;
  return t;
}

const people = [
  { key: "aarav", name: "Aarav Mehta", gender: "m", phone: "9822011001", bio: "Final year BBA. Drive home to Kothrud most Fridays." },
  { key: "ishita", name: "Ishita Rao", gender: "f", phone: "9822011002", bio: "Psychology, 3rd year. Quiet driver, good playlist." },
  { key: "rohan", name: "Rohan Kulkarni", gender: "m", phone: "9822011003", bio: "Faculty, Commerce. Commute from Bavdhan." },
  { key: "meera", name: "Meera Joshi", gender: "f", phone: "9822011004", bio: "Works at the Lavasa clinic. Goes to Pune on weekends." },
  { key: "kabir", name: "Kabir Shetty", gender: "m", bio: "Goes home to Pune most weekends." },
  { key: "ananya", name: "Ananya Iyer", gender: "f", bio: "Law, 2nd year. Usually have one small bag." },
  { key: "vikram", name: "Vikram Patil", gender: "m", phone: "9822011007", bio: "Run a cafe in Dasve. Pune runs for supplies." },
  { key: "sara", name: "Sara Thomas", gender: "f", bio: "Media studies. Catching trains from Pune Station." },
  { key: "nikhil", name: "Nikhil Deshmukh", gender: "m", bio: "Engineering, 1st year." },
  { key: "pooja", name: "Pooja Nair", gender: "f", bio: "Hostel warden. Weekly trip to Deccan." },
];

const cars = {
  aarav: { kind: "car", model: "Maruti Swift", colour: "White", plate: "MH12DM1001", seats: 4 },
  ishita: { kind: "car", model: "Hyundai i20", colour: "Red", plate: "MH12DM1002", seats: 4 },
  rohan: { kind: "suv", model: "Mahindra XUV300", colour: "Grey", plate: "MH12DM1003", seats: 4 },
  meera: { kind: "car", model: "Tata Nexon", colour: "Blue", plate: "MH12DM1004", seats: 4 },
  vikram: { kind: "suv", model: "Toyota Innova", colour: "Silver", plate: "MH12DM1007", seats: 6 },
};

// [driver, from, to, when, seats, price per seat, note, women only]
const rides = [
  ["aarav", "lavasa-campus", "kothrud", at(0, 17, 30), 3, 150, "Leaving from the main gate. Room for one bag each.", false],
  ["ishita", "lavasa-campus", "pune-station", at(0, 19, 0), 2, 170, "Can drop near the station entrance.", true],
  ["rohan", "lavasa-campus", "bavdhan", at(1, 8, 0), 3, 120, "Early start, back by 9:30.", false],
  ["vikram", "dasve", "deccan", at(1, 11, 0), 5, 140, "Big car, lots of boot space.", false],
  ["meera", "lavasa-campus", "shivajinagar", at(1, 16, 30), 3, 160, "", false],
  ["aarav", "kothrud", "lavasa-campus", at(2, 18, 0), 3, 150, "Coming back Sunday evening.", false],
  ["ishita", "pune-station", "lavasa-campus", at(2, 20, 30), 2, 170, "Picking up from the 8 pm train.", false],
  ["rohan", "bavdhan", "lavasa-campus", at(3, 7, 30), 3, 120, "Daily commute, can do this most weekdays.", false],
  ["vikram", "deccan", "dasve", at(3, 15, 0), 4, 140, "", false],
  ["meera", "pirangut", "lavasa-campus", at(4, 9, 0), 2, 60, "Short hop up the ghat.", false],
  ["aarav", "lavasa-campus", "pune-station", at(5, 14, 0), 3, 165, "Friday run. Can stop at Chandni Chowk.", false],
];

// [rider, from, to, earliest, latest window in hours, seats, note]
const requests = [
  ["kabir", "lavasa-campus", "pune-station", at(0, 17, 0), 3, 1, "Happy to split a cab too."],
  ["ananya", "lavasa-campus", "kothrud", at(1, 15, 0), 4, 1, "Flexible on time."],
  ["sara", "lavasa-campus", "pune-station", at(1, 6, 0), 3, 1, "Need to make the 10 am train."],
  ["nikhil", "lavasa-campus", "deccan", at(2, 10, 0), 5, 2, "Two of us."],
  ["pooja", "deccan", "lavasa-campus", at(2, 16, 0), 4, 1, "Weekly shopping, coming back."],
  ["kabir", "pune-station", "lavasa-campus", at(3, 17, 0), 3, 1, ""],
];

const now = Date.now();
const out = tx(() => {
  const ids = {};
  for (const p of people) {
    const email = `${p.key}@demo.vroomate`;
    const found = db.prepare("SELECT id FROM users WHERE email=?").get(email);
    if (found) { ids[p.key] = found.id; continue; }
    const info = db.prepare("INSERT INTO users (email,password_hash,name,role,gender,phone,bio,created_at) VALUES (?,?,?,'community',?,?,?,?)")
      .run(email, hashPassword(PASSWORD), p.name, p.gender, p.phone || null, p.bio, now);
    ids[p.key] = Number(info.lastInsertRowid);
  }
  const demo = Object.values(ids), list = demo.join(",");

  // Clear the previous run's demo activity so the deck only holds fresh rides.
  db.exec(`UPDATE bookings SET status='cancelled', updated_at=${now} WHERE status IN ('pending','confirmed') AND (rider_id IN (${list}) OR trip_id IN (SELECT id FROM trips WHERE driver_id IN (${list})))`);
  db.exec(`UPDATE trips SET status='cancelled' WHERE status='open' AND driver_id IN (${list})`);
  db.exec(`UPDATE ride_requests SET status='cancelled' WHERE status IN ('open','fulfilled') AND rider_id IN (${list})`);

  const vehicle = {};
  for (const [key, c] of Object.entries(cars)) {
    const v = db.prepare("SELECT id FROM vehicles WHERE plate=?").get(c.plate);
    vehicle[key] = v ? v.id : Number(db.prepare("INSERT INTO vehicles (owner_id,kind,model,colour,plate,seats,status,created_at) VALUES (?,?,?,?,?,?,'approved',?)")
      .run(ids[key], c.kind, c.model, c.colour, c.plate, c.seats, now).lastInsertRowid);
  }

  const trips = [];
  for (const [who, o, d, when, seats, price, note, womenOnly] of rides) {
    const perKm = price / cfg.distanceKm(o, d);
    const info = db.prepare(`INSERT INTO trips (driver_id,vehicle_id,origin_stop,dest_stop,depart_at,seats_total,seats_available,fare_per_km_seat,notes,women_only,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(ids[who], vehicle[who], o, d, when, seats, seats, perKm, note, womenOnly ? 1 : 0, now);
    trips.push({ id: Number(info.lastInsertRowid), driver: who, o, d, perKm });
  }
  for (const [who, o, d, e, hours, seats, note] of requests) {
    db.prepare("INSERT INTO ride_requests (rider_id,origin_stop,dest_stop,earliest_at,latest_at,seats,note,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(ids[who], o, d, e, e + hours * HOUR, seats, note, now);
  }

  // Kabir has asked Aarav for a seat. Log in as Aarav and accept it to watch Kabir's card leave the Co-riders deck.
  const t = trips[0];
  const fare = Math.round(t.perKm * cfg.distanceKm(t.o, t.d));
  const b = Number(db.prepare("INSERT INTO bookings (trip_id,rider_id,seats,pickup_stop,drop_stop,fare_total,status,created_at,updated_at) VALUES (?,?,1,?,?,?,'pending',?,?)")
    .run(t.id, ids.kabir, t.o, t.d, fare, now, now).lastInsertRowid);
  const conv = ensureConversation("booking", b, [ids.aarav, ids.kabir]);
  db.prepare("INSERT INTO messages (conversation_id,sender_id,body,created_at) VALUES (?,?,?,?)").run(conv, ids.kabir, "Hi, can I join? I'll be at the main gate.", now);

  return { people: demo.length, rides: trips.length, requests: requests.length };
});

console.log(`Demo data ready: ${out.people} people, ${out.rides} rides, ${out.requests} ride requests.`);
console.log(`Log in as any of them with <name>@demo.vroomate / ${PASSWORD}, e.g. aarav@demo.vroomate (has a seat request from Kabir waiting).`);
