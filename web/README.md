# Vroomate web app

A mobile-first carpool app for anyone in **Lavasa**, built around the **Lavasa ↔ Pune** corridor. It works like a ride-hailing app
without maps or navigation, plus swipe cards: every ride someone offers becomes a card that others swipe through.

## Run it

Requires **Node 22.5 or newer**. There are **no npm dependencies**: the server uses Node's built-in HTTP and SQLite.

```bash
cd web
npm start            # http://localhost:3000
npm test             # 18 backend journey tests
npm run seed         # demo people, rides and requests (password123 for all *@demo.vroomate accounts)
```

Optional environment variables: `PORT`, `VROOMATE_DB` (database file, default `web/data/vroomate.db`), `VROOMATE_UPLOADS`,
`NODE_ENV=production`, `VROOMATE_SECURE_COOKIE=1` (set behind HTTPS), `RADAR_THRESHOLD` (default 3).

### Admin
Anyone can sign up and offer a ride; there is no approval step. Admins only review reports:

```bash
npm run make-admin -- you@example.com
```

Account → *Reports* is then available.

## How it works

| Area | What it does |
|---|---|
| **Accounts** | Name, any email, password. Phone and gender are optional (phone is shared only once a ride is confirmed; gender is used only for women-only rides). |
| **Offer a ride** | Route, time, empty seats, price per seat, and your car (model, colour, plate). It goes live straight away. |
| **Home** | Tinder-style swipe cards of every upcoming ride: swipe right (or tap ✓) to request a seat, left (✕) to skip. Prefer not to swipe? Switch to List view or type in the search bar (places, drivers, cars). Filters narrow by from/to stop and day. |
| **Co-riders** | Swipe through people who posted a ride request on an overlapping route and time. Two right swipes open a chat, for example to share a cab. |
| **Bookings** | A request reserves nothing. Seats come off the ride only when the driver accepts, inside one `BEGIN IMMEDIATE` transaction with a guarded `UPDATE` and a database `CHECK` constraint, so overbooking cannot happen. |
| **Ride requests** | Riders can post when they need to travel. Drivers who have offered rides recently are told when 3 or more riders need the same trip, and riders are told when a matching ride is posted. |
| **Inbox** | One list of every chat: ride chats with drivers or passengers, and co-rider chats. |
| **Safety** | Report and block (hides both ways, stops messages, ends pending requests), women-only rides, phone and plate hidden until a booking is confirmed. |

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

- `npm test`: 18 tests against the real server and a throwaway database, including a concurrent accept race, route feasibility,
  group booking, privacy of contact details, women-only rules, blocking, reports and Ride Radar.
- `test/e2e/browser-journey.js`: a browser script for the UI journey (sign up, new rides appear as swipe cards, request a seat,
  swipe to skip, co-riders, every tab in light and dark). It is not part of `npm test`; the file header explains how to run it.

## Not done, or not production-ready

- **No push notifications** and no email. Chat polls every 3.5 s; badges every 20 s.
- **Nobody is verified.** Anyone can sign up with any email and offer a ride. Rely on reports, blocking and confirmed-booking contact details. There is no payment handling: riders pay drivers directly.
- **Route model is one straight corridor** with approximate times. No maps, live traffic or branches such as Hinjewadi unless you add stops.
- **Single-node SQLite**, in-memory login throttling and rate limits, no schema migrations, no backups. Fine for a campus pilot; plan changes before wide launch.
- **Photos** are stored on disk and are not moderated.
- Date and time inputs are treated as **IST** for everyone.
- Uses the phone's system font and follows its light or dark setting.
- Tested in headless Chromium at phone size and by API tests. **Not yet tested** on real phones, Safari or with a screen reader.
