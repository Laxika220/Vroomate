# Vroomate web app

A mobile-first carpool app for anyone in **Lavasa**, built around the **Lavasa ↔ Pune** corridor. It works like a ride-hailing app
without maps or navigation, plus swipe cards: every ride someone offers becomes a card that others swipe through.
It installs to a phone's home screen and sends push notifications.

## Run it

Requires **Node 22.5 or newer**. There are **no npm dependencies**: the server uses Node's built-in HTTP, crypto and SQLite.

```bash
cd web
npm start            # http://localhost:3000
npm test             # 29 backend tests
npm run seed         # demo people, rides and requests (password123 for every *@demo.vroomate account)
```

Without email, SMS or push keys the app still works locally. Emails and texts are printed in the server log, and the phone
verification code is filled in for you. To put it online, see **[DEPLOY.md](DEPLOY.md)**. Every setting is listed in
[.env.example](.env.example).

| Command | What it does |
|---|---|
| `npm run make-admin -- you@example.com` | Lets that account review reports and suspend people (Account → Reports) |
| `npm run backup` | Copies the database and photos to `data/backups`, keeping the newest 14 |
| `npm run vapid` | Prints a key pair for push notifications |

## How it works

| Area | What it does |
|---|---|
| **Accounts** | Name, email, mobile number and password, plus accepting the terms. Forgot-password links by email. Change password, download your data, delete your account. |
| **Phone verification** | A 6-digit text code, needed once before you can offer a ride or request a seat, so drivers and passengers can reach each other. Changing the number means verifying again. |
| **Offer a ride** | Route, time, empty seats, price per seat, and your car (model, colour, plate). It goes live straight away. |
| **Home** | Tinder-style swipe cards of every upcoming ride: swipe right (or tap ✓) to request a seat, left (✕) to skip. Prefer not to swipe? Switch to List view or use the search bar (places, drivers, cars). Filters narrow by from/to stop and day. Cards show the driver's rating. |
| **Co-riders** | Swipe through people who posted a ride request on an overlapping route and time. Two right swipes open a chat, for example to share a cab. Once a driver confirms someone, their request leaves everyone's deck. It comes back if that seat is cancelled. |
| **Bookings** | A request reserves nothing. Seats come off the ride only when the driver accepts, inside one `BEGIN IMMEDIATE` transaction with a guarded `UPDATE` and a database `CHECK`, so overbooking can't happen. |
| **Ratings** | After a completed trip, riders and drivers rate each other (1–5 stars, optional comment) for two weeks. |
| **Safety** | Share a private trip link (driver, car, plate, times) with someone you trust. An Emergency button around departure time calls 112 or your emergency contact. Report, block, women-only rides. Phone and plate stay hidden until a booking is confirmed. Admins can suspend accounts. |
| **Notifications** | In-app, plus email for seat requests, confirmations and cancellations (can be turned off), plus push notifications on phones that allow them. |
| **Installable** | Web app manifest, icons and a service worker. "Add to Home Screen" gives a full-screen app, and the app shell still loads offline. |
| **Housekeeping** | Every 10 minutes: completes trips still open 6 hours after departure (so riders can rate), expires old requests, clears stale sessions and codes, and takes a daily backup when `VROOMATE_BACKUP=1`. |

### Ride feasibility, not just "both going to Pune"
A trip is offered to a rider only if **all** of these hold (`server/matching.js`, `feasible()`):
- it runs in the same direction as the rider's leg;
- the rider's pickup **and** drop-off lie on the driver's path (no detours are invented);
- the driver reaches the pickup stop inside the rider's time window, using minutes-from-Lavasa for each stop;
- it is open, in the future, and has enough free seats.

Fares use the distance actually travelled, so someone joining at Paud pays less than someone riding from the campus.

### Changing the route
Edit `config/routes.json`. Stops are ordered along one line from Lavasa with approximate `km` and `min` values. Add a stop by
inserting it in order. The values are reasonable estimates, **not surveyed distances**, so check them for your real pickup points.

## Security

- Passwords use scrypt; sessions are random tokens stored hashed, in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` behind HTTPS).
- A strict Content-Security-Policy (no inline scripts), `X-Frame-Options: DENY`, and HSTS when served over HTTPS.
- Cross-site POSTs are refused, the API is rate limited per IP, and login, password reset and SMS codes have their own limits.
- Reset links and phone codes are single-use, expire, and are stored hashed. "Forgot password" gives the same answer whether or not the email exists.
- Uploaded photos are checked by their file signature, size-limited, and given random names.

## Tests

- `npm test`: 29 tests against the real server and a throwaway database. They cover the concurrent-accept race, route feasibility,
  group booking, contact-detail privacy, women-only rules, blocking, reports, suspension, Ride Radar, password reset, phone
  verification, email alerts, data export and deletion, ratings, trip sharing, housekeeping, and Web Push. The push test decrypts the
  payload the way a browser would and verifies the VAPID signature.
- `test/e2e/browser-journey.js`: drives Chrome through signup, the swipe deck, phone verification, a confirmed seat, the public
  share page, the Account screen and forgot-password. It is not part of `npm test`; the file header explains how to run it.

## Limits

- **Payments are not handled.** Riders pay drivers directly (cash or UPI).
- **Route model is one straight corridor** with approximate times. No maps, live location or branches such as Hinjewadi unless you add stops.
- **Single server with SQLite.** Rate limits live in memory, so run one instance. That's plenty for a campus. Moving to Postgres is the step before running several servers.
- **Photos are not moderated** automatically; rely on reports.
- **Identity is a verified phone and email**, not a licence or ID check. Drivers aren't vetted.
- Date and time inputs are treated as **IST** for everyone.
- Push notifications on iPhone need iOS 16.4+ and the app added to the Home Screen.
- Tested with headless Chrome at phone size and by API tests. **Not yet tested** on real phones, Safari or with a screen reader.
