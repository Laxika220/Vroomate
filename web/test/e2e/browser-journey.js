// Browser end-to-end journey (needs Playwright installed globally: npm i -g playwright).
// Not part of `npm test`. Usage:
//   1. start the app on port 3114 with a throwaway DB:  VROOMATE_DB=/tmp/vm-e2e.db PORT=3114 node --disable-warning=ExperimentalWarning server/index.js
//      (use a fresh DB each run; seed users are created by this script)
//   2. NODE_PATH=$(npm root -g) node --disable-warning=ExperimentalWarning test/e2e/browser-journey.js
// The script writes screenshots to /tmp/shots/. The sqlite path below must match VROOMATE_DB.
const { chromium } = require("playwright");
const { DatabaseSync } = require("node:sqlite");
const B = "http://localhost:3114", J = { "Content-Type": "application/json" };
const shots = "/tmp/shots/"; require("fs").mkdirSync(shots, { recursive: true });
const errors = [];
const ok = (c, m) => { if (!c) throw new Error("ASSERT FAILED: " + m); console.log("  ok:", m); };

async function api(method, url, body, cookie) {
  const r = await fetch(B + url, { method, headers: { ...J, ...(cookie ? { Cookie: cookie } : {}) }, body: method === "GET" ? undefined : JSON.stringify(body || {}) });
  const sc = r.headers.get("set-cookie"); const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url} ${r.status} ${JSON.stringify(d)}`);
  return { d, cookie: sc ? sc.split(";")[0] : cookie };
}
const hours = (h) => Date.now() + h * 3600000;

(async () => {
  // ---- seed accounts through the real API ----
  const adm = await api("POST", "/api/auth/signup", { email: "admin@christuniversity.in", password: "password123", name: "Admin Rao", role: "faculty" });
  await api("POST", "/api/auth/verify", { code: adm.d.dev_code }, adm.cookie);
  new DatabaseSync("/tmp/vm-e2e.db").exec("UPDATE users SET is_admin=1 WHERE email='admin@christuniversity.in'");
  const drv = await api("POST", "/api/auth/signup", { email: "dev.driver@example.com", password: "password123", name: "Dev Kulkarni", role: "driver", gender: "m" });
  await api("POST", "/api/driver", { licence_no: "MH1420190001234" }, drv.cookie);
  await api("POST", `/api/admin/drivers/${drv.d.user.id}`, { decision: "approve" }, adm.cookie);
  const veh = await api("POST", "/api/vehicles", { kind: "suv", model: "Toyota Innova", colour: "Silver", plate: "MH12CD4567", seats: 5 }, drv.cookie);
  await api("POST", `/api/admin/vehicles/${veh.d.id}`, { decision: "approve" }, adm.cookie);
  const buddies = [];
  for (const [n, e, interests] of [["Kabir Shetty", "kabir@bba.christuniversity.in", ["Music", "Cricket"]], ["Meera Iyer", "meera@mba.christuniversity.in", ["Podcasts", "Hiking"]]]) {
    const s = await api("POST", "/api/auth/signup", { email: e, password: "password123", name: n, role: "student", gender: n.startsWith("Meera") ? "f" : "m" });
    await api("POST", "/api/auth/verify", { code: s.d.dev_code }, s.cookie);
    await api("PUT", "/api/me", { name: n, bio: "Heads to Pune most weekends.", home_stop: "lavasa-campus", interests, gender: n.startsWith("Meera") ? "f" : "m" }, s.cookie);
    await api("POST", "/api/requests", { origin_stop: "lavasa-campus", dest_stop: "pune-station", earliest_at: hours(2.5), latest_at: hours(5), seats: 1 }, s.cookie);
    buddies.push(s);
  }

  const browser = await chromium.launch();
  const mk = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${name} PAGEERR ${e.message}`));
    p.on("console", (m) => { if (m.type() === "error" && !/fonts|ERR_|Failed to load resource/.test(m.text())) errors.push(`${name} CONSOLE ${m.text()}`); });
    return p;
  };
  const shot = async (p, n) => { await p.waitForTimeout(650); await p.screenshot({ path: shots + n + ".png" }); };

  // ---- A. driver publishes a trip in the UI ----
  console.log("A. driver publishes a trip");
  const d = await mk("driver");
  await d.goto(B + "/"); await d.click("text=I already have an account");
  await d.fill("#l_email", "dev.driver@example.com"); await d.fill("#l_pw", "password123"); await d.click("button[type=submit]");
  await d.waitForSelector("text=Skip for now"); await d.click("text=Skip for now"); await d.waitForSelector("text=Discover");
  await d.goto(B + "/#/post/offer"); await d.waitForSelector("#o_veh");
  await d.fill("#o_notes", "AC, boot space for 2 bags. Pickup outside main gate.");
  await shot(d, "10-driver-post");
  await d.click("text=Publish trip"); await d.waitForSelector("text=You're driving");
  ok(true, "trip published and shown under My Rides");

  // ---- B. student signs up, finds the trip, requests a seat ----
  console.log("B. student requests a seat");
  const s = await mk("student");
  await s.goto(B + "/"); await s.click("text=Create account");
  await s.fill("#s_name", "Asha Rao"); await s.fill("#s_email", "asha@btech.christuniversity.in"); await s.fill("#s_pw", "password123");
  await s.click("button[type=submit]"); await s.waitForSelector("#v_code");
  await s.fill("#v_code", await s.locator("b.mono").first().innerText());
  await s.waitForSelector("#u_stop"); await s.selectOption("#u_stop", "lavasa-campus"); await s.click("text=Music"); await s.click("text=Hiking");
  await s.click("text=Start exploring"); await s.waitForSelector("text=Find a Ride");
  await s.waitForSelector(".scard.top", { timeout: 8000 });
  ok(await s.locator(".scard.top h2").innerText() === "Dev Kulkarni", "Discover shows the published driver for Lavasa to Pune");
  await shot(s, "11-discover-ride");
  await s.click("button[aria-label='Request a seat']"); await s.waitForSelector("#q_msg");
  ok(!/\b(false|null|undefined)\b/.test(await s.locator(".sheet").innerText()), "request sheet has no stray false/null/undefined text");
  await s.fill("#q_msg", "Hi! I'll be at the main gate.");
  await shot(s, "12-request-sheet");
  await s.click("text=Send seat request"); await s.waitForSelector("text=Request sent");
  const before = (await api("GET", "/api/trips/mine", null, drv.cookie)).d.trips[0];
  ok(before.seats_available === before.seats_total, "request alone did not take a seat");

  // ---- C. driver accepts ----
  console.log("C. driver accepts");
  await d.goto(B + "/#/rides/pending"); await d.waitForSelector("text=Needs you");
  await shot(d, "13-driver-incoming");
  await d.click("text=Accept"); await d.waitForSelector("text=Seat confirmed");
  const after = (await api("GET", "/api/trips/mine", null, drv.cookie)).d.trips[0];
  ok(after.seats_available === after.seats_total - 1, "seat count dropped by one only after the driver accepted");

  // ---- D. student sees confirmed ride ----
  await s.goto(B + "/#/rides/upcoming"); await s.waitForSelector("text=Confirmed");
  ok(await s.locator("text=MH12CD4567").count() > 0, "confirmed ride reveals the vehicle plate");
  await shot(s, "14-student-upcoming");

  // ---- E. travel buddies: mutual like creates a match and a chat ----
  console.log("E. buddy match and chat");
  const asha = await api("POST", "/api/auth/login", { email: "asha@btech.christuniversity.in", password: "password123" });
  await api("POST", "/api/swipes", { target_id: asha.d.user.id, direction: "like" }, buddies[0].cookie);   // Kabir likes Asha first
  await s.goto(B + "/#/discover"); await s.waitForSelector("text=Travel Buddies"); await s.click("text=Travel Buddies");
  await s.waitForSelector(".scard.top");
  await shot(s, "15-discover-buddy");
  const first = await s.locator(".scard.top h2").innerText();
  ok(["Kabir Shetty", "Meera Iyer"].includes(first), "buddy deck shows travellers going the same way: " + first);
  if (first === "Kabir Shetty") { await s.click("button[aria-label='Like']"); await s.waitForSelector("text=It's a match"); await shot(s, "16-match"); await s.click("text=Say hello"); }
  else { await s.click("button[aria-label='Like']"); await s.waitForTimeout(900); await s.click("button[aria-label='Like']"); await s.waitForSelector("text=It's a match"); await shot(s, "16-match"); await s.click("text=Say hello"); }
  await s.waitForSelector("#c_in"); await s.fill("#c_in", "Hey Kabir! I'm on the 7:30 Innova too."); await s.press("#c_in", "Enter");
  await s.waitForSelector("text=Innova too"); await shot(s, "17-chat");
  ok(true, "match opened a chat and the message was delivered");

  // ---- F. radar + profile screens ----
  await d.goto(B + "/#/radar"); await d.waitForSelector("text=Ride Radar"); await shot(d, "18-radar");
  await s.goto(B + "/#/matches"); await s.waitForSelector("text=Travel buddies"); await shot(s, "19-matches");

  console.log(errors.length ? "BROWSER ERRORS:\n" + errors.join("\n") : "no browser errors");
  await browser.close();
})().catch((e) => { console.error("FAILED:", e.message); console.error(errors.join("\n")); process.exit(1); });
