// Browser end-to-end journey (not part of `npm test`). Needs playwright-core and a Chrome install.
//   1. start the app with a throwaway DB:  VROOMATE_DB=/tmp/vm-e2e.db PORT=3115 node --disable-warning=ExperimentalWarning server/index.js
//   2. npm i -g playwright-core && NODE_PATH=$(npm root -g) node test/e2e/browser-journey.js
// Set CHROME to your Chrome binary if it isn't at the macOS default. Screenshots go to /tmp/shots/.
const { chromium } = require("playwright-core");
const B = "http://localhost:3115";
const OUT = "/tmp/shots/"; require("fs").mkdirSync(OUT, { recursive: true });
const hours = (h) => Date.now() + h * 3600000;
async function api(method, url, body, cookie) {
  const r = await fetch(B + url, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: method === "GET" ? undefined : JSON.stringify(body || {}) });
  const sc = r.headers.get("set-cookie"); const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url} ${r.status} ${JSON.stringify(d)}`);
  return { d, cookie: sc ? sc.split(";")[0] : cookie };
}
const ok = (c, m) => { if (!c) throw new Error("FAILED: " + m); console.log("ok:", m); };

(async () => {
  const drv = await api("POST", "/api/auth/signup", { email: "dev@example.com", password: "password123", name: "Dev Kulkarni", gender: "m", phone: "9876543210" });
  await api("POST", "/api/trips", { origin_stop: "lavasa-campus", dest_stop: "pune-station", depart_at: hours(5), seats: 3, price_per_seat: 165, notes: "Leaving from the main gate. Room for one bag each.", vehicle: { model: "Maruti Swift", colour: "White", plate: "MH12AB1234" } }, drv.cookie);
  const drv2 = await api("POST", "/api/auth/signup", { email: "sana@example.com", password: "password123", name: "Sana Shaikh", gender: "f" });
  await api("POST", "/api/trips", { origin_stop: "lavasa-campus", dest_stop: "kothrud", depart_at: hours(28), seats: 2, price_per_seat: 140, vehicle: { model: "Hyundai Creta", colour: "Grey", plate: "MH14CD5678" } }, drv2.cookie);
  const bud = await api("POST", "/api/auth/signup", { email: "kabir@example.com", password: "password123", name: "Kabir Shetty" });
  await api("PUT", "/api/me", { name: "Kabir Shetty", bio: "Goes home to Pune most weekends." }, bud.cookie);
  await api("POST", "/api/requests", { origin_stop: "lavasa-campus", dest_stop: "pune-station", earliest_at: hours(4), latest_at: hours(7), seats: 1, note: "Happy to split a cab." }, bud.cookie);

  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const errors = [];
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, hasTouch: true });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    const shot = (n) => page.screenshot({ path: `${OUT}${scheme}-${n}.png` });
    await page.goto(B);
    await page.getByText("Rides between Lavasa and Pune").waitFor();
    await shot("1-welcome");
    if (scheme === "light") {
      await page.getByRole("button", { name: "Sign up" }).click();
      await page.fill("#s_name", "Riya Desai"); await page.fill("#s_email", "riya@gmail.com"); await page.fill("#s_pw", "password123");
      await shot("2-signup");
      await page.getByRole("button", { name: "Create account" }).click();
    } else {
      await page.getByRole("button", { name: "Log in" }).click();
      await page.fill("#l_email", "riya@gmail.com"); await page.fill("#l_pw", "password123");
      await page.locator("form").getByRole("button", { name: "Log in" }).click();
    }
    if (scheme === "light") {
      await page.locator(".scard.top").waitFor();
      ok(await page.locator(".scard.top").getByText("Dev").count() === 1, "new ride shows as a swipe card with no search");
      ok(await page.getByRole("button", { name: "Request seat" }).evaluate((b) => b.getBoundingClientRect().bottom <= document.querySelector(".tabbar").getBoundingClientRect().top), "swipe buttons sit above the tab bar");
      // drag right a little to show the stamp
      const bx = await page.locator(".scard.top").boundingBox();
      await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.mouse.down();
      await page.mouse.move(bx.x + bx.width / 2 + 70, bx.y + bx.height / 2 + 10, { steps: 5 });
      await shot("3a-dragging");
      await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2, { steps: 3 }); await page.mouse.up();
      await page.waitForTimeout(300);
    } else await page.getByText("You've seen every ride").or(page.getByText("No rides yet")).waitFor();
    await shot("3-home");
    if (scheme === "light") {
      await page.getByRole("button", { name: "List" }).click();
      await page.locator(".ritem").first().waitFor();
      ok(await page.locator(".ritem").count() === 2, "list view shows both rides");
      await shot("3b-list");
      await page.getByRole("searchbox").fill("creta");
      await page.waitForTimeout(400);
      ok(await page.locator(".ritem").count() === 1 && await page.locator(".ritem").getByText("Sana Shaikh").count() === 1, "search by car narrows the list");
      await page.getByRole("searchbox").fill("kothrud");
      await page.waitForTimeout(400);
      ok(await page.locator(".ritem").count() === 1, "search by place finds the Kothrud ride");
      await shot("3c-search");
      await page.getByRole("searchbox").fill("");
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: "Swipe" }).click();
      await page.locator(".scard.top").waitFor();
      await page.getByRole("button", { name: "Request seat" }).click();
      await page.getByRole("heading", { name: "Request a seat" }).waitFor();
      await shot("4-request-sheet");
      await page.getByRole("button", { name: "Send request" }).click();
      await page.locator(".scard.top").getByText("Sana").waitFor();
      ok(true, "request sent, next card shown");
      // swipe gesture on the next card
      const box = await page.locator(".scard.top").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
      await page.getByText("You've seen every ride").waitFor();
      ok(true, "swipe left skips");
      await shot("5-home-empty");
    }
    await page.locator(".tabs").getByRole("button", { name: "Co-riders" }).click();
    await page.locator(".scard.top").getByText("Kabir").waitFor();
    await shot("6-coriders");
    await page.getByRole("link", { name: "Offer" }).click();
    await page.getByRole("button", { name: "Post ride" }).waitFor();
    await shot("7-offer");
    await page.getByRole("link", { name: "Trips" }).click();
    await page.getByRole("heading", { name: "Trips", exact: true }).waitFor();
    await page.locator(".tabs").getByRole("button", { name: /Requests/ }).click();
    await page.waitForTimeout(300);
    await shot("8-trips-requests");
    await page.getByRole("link", { name: "Inbox" }).click();
    await page.getByRole("heading", { name: "Inbox", exact: true }).waitFor();
    await shot("9-inbox");
    await page.getByRole("link", { name: "Account" }).click();
    await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
    await shot("10-account");
    await ctx.close();
  }
  // the driver accepts; rider sees confirmation and the plate
  const trips = (await api("GET", "/api/trips/mine", null, drv.cookie)).d.trips;
  const pending = trips[0].bookings.find((b) => b.status === "pending");
  await api("POST", `/api/bookings/${pending.id}/respond`, { decision: "accept" }, drv.cookie);
  await browser.close();
  const real = errors.filter((e) => !/status of 401/.test(e)); ok(real.length === 0, "no browser errors" + (real.length ? ": " + real.join(" | ") : ""));
})().catch((e) => { console.error(e); process.exit(1); });
