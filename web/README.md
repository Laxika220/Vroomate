# Vroomate web app

A mobile-first carpool and travel-buddy marketplace for **CHRIST University Lavasa**, built around the **Lavasa ↔ Pune** corridor.
Dark navy and lavender, swipeable cards, and a real backend: accounts, driver and vehicle approval, trips, seat requests, groups,
matching, chat, notifications, Ride Radar, reporting and blocking.

It lives in `web/`. The original Android app in `app/` is untouched.

## Run it

Requires **Node 22.5 or newer**. There are **no npm dependencies**: the server uses Node's built-in HTTP and SQLite.

```bash
cd web
npm start            # http://localhost:3000
npm test             # 17 backend journey tests
```

Optional environment variables: `PORT`, `VROOMATE_DB` (database file, default `web/data/vroomate.db`), `VROOMATE_UPLOADS`,
`NODE_ENV=production`, `VROOMATE_SECURE_COOKIE=1` (set behind HTTPS), `RADAR_THRESHOLD` (default 3).

### First run: make yourself an admin
Drivers and vehicles are approved by hand. Sign up in the app, then:

```bash
npm run make-admin -- you@christuniversity.in
```

Profile → *Admin: approvals and reports* is now available.

### Email verification
Students and faculty verify their CHRIST email with a 6-digit code. **No email provider is wired up.** In development the code is
shown on screen and printed in the server log. With `NODE_ENV=production` it is only printed in the server log, so a real
deployment needs a mail sender added in `server/users.js` (search for `[verify]`).

## How it works

| Area | What it does |
|---|---|
| **Accounts** | Student, faculty, driver and community. Students and faculty must use a `christuniversity.in` address and verify it. Short sign-up; trip and vehicle details are collected later. |
| **Drivers** | Submit licence number, add vehicles. An admin approves the driver and each vehicle before a trip can be published. |
| **Trips** | Origin, destination, departure, seats, fare per km. Fares are capped by config. Women-only trips are limited to women drivers. |
| **Find a Ride** | Swipe through driver cards. Swipe right sends a **seat request**; swipe left hides the trip. |
| **Find Travel Buddies** | Swipe through travellers whose open ride request overlaps your route and time. Two likes create a match and a chat. A match is **not** a booking. |
| **Bookings** | A request reserves nothing. Seats come off the trip only when the driver accepts, inside one `BEGIN IMMEDIATE` transaction with a guarded `UPDATE` and a database `CHECK` constraint, so overbooking cannot happen. Cancelling a confirmed seat returns it. |
| **Groups** | Invite people you have matched with. When they join, the owner requests one seat per member on a single trip. |
| **Ride Radar** | Groups unserved ride requests by route and time and shows drivers counts only (never names). When 3 or more riders need the same trip, approved drivers are notified once. When a matching trip is published, those riders are notified. |
| **Messaging** | Match chats, group chats and driver-passenger chats per booking. |
| **Safety** | Verified badges, driver and vehicle approval, report with reasons, block (hides both ways, stops messages, ends pending requests), women-only options, email/phone/plate hidden until a booking is confirmed. |

### Ride feasibility, not just "both going to Pune"
A trip is offered to a rider only if **all** of these hold (`server/matching.js`, `feasible()`):
- it runs in the same direction as the rider's leg;
- the rider's pickup **and** drop-off lie on the driver's path (no detours are invented);
- the driver reaches the pickup stop inside the rider's time window, using minutes-from-Lavasa for each stop;
- it is open, in the future, and has enough free seats.

Fares use the distance actually travelled, so someone joining at Paud pays less than someone riding from the campus.

### Changing the route
Edit `config/routes.json`. Stops are ordered along one line from Lavasa with approximate `km` and `min` values. Add a stop by
inserting it in order. The `km` and `min` values are reasonable estimates, **not surveyed distances**, so check them for your real pickup points.

## Tests

- `npm test`: 17 tests against the real server and a throwaway database, including a concurrent accept race, route feasibility,
  group booking, privacy of contact details, women-only rules, blocking, reports and Ride Radar.
- `test/e2e/browser-journey.js`: a Playwright script for the full UI journey (driver publishes, student requests, driver accepts,
  buddies match and chat). It is not part of `npm test`; the file header explains how to run it.

## Not done, or not production-ready

- **No real email delivery** (see above) and **no push notifications**. Chat polls every 3.5 s; badges every 20 s.
- **Driver verification is a licence number reviewed by a person.** No document upload, no automatic checks. There is no payment handling: riders pay drivers directly.
- **Route model is one straight corridor** with approximate times. No maps, live traffic or branches such as Hinjewadi unless you add stops.
- **Single-node SQLite**, in-memory login throttling and rate limits, no schema migrations, no backups. Fine for a campus pilot; plan changes before wide launch.
- **Photos** are stored on disk and are not moderated.
- Date and time inputs are treated as **IST** for everyone.
- Fonts load from Google Fonts, so the first load needs internet access. Dark theme only.
- Tested in headless Chromium at phone size and by API tests. **Not yet tested** on real phones, Safari or with a screen reader.
