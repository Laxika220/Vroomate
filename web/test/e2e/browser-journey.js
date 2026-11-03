// Browser end-to-end journey (not part of `npm test`). Needs playwright-core and a Chrome install.
//   1. start the app with a throwaway, seeded DB:
//        export VROOMATE_DB=/tmp/vm-e2e.db; rm -f $VROOMATE_DB*; npm run seed; PORT=3115 npm start
//   2. npm i -g playwright-core && NODE_PATH=$(npm root -g) node test/e2e/browser-journey.js
// Set CHROME to your Chrome binary if it isn't at the macOS default. Screenshots go to /tmp/shots/.
const { chromium } = require("playwright-core");
const B = "http://localhost:3115";
const OUT = "/tmp/shots/"; require("fs").mkdirSync(OUT, { recursive: true });
async function api(method, url, body, cookie) {
  const r = await fetch(B + url, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: method === "GET" ? undefined : JSON.stringify(body || {}) });
  const sc = r.headers.get("set-cookie"); const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url} ${r.status} ${JSON.stringify(d)}`);
  return { d, cookie: sc ? sc.split(";")[0] : cookie };
}
const ok = (c, m) => { if (!c) throw new Error("FAILED: " + m); console.log("ok:", m); };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` });

  // Sign up: terms must be ticked.
  await page.goto(B);
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.fill("#s_name", "Riya Desai"); await page.fill("#s_email", "riya@example.com"); await page.fill("#s_phone", "9811122233"); await page.fill("#s_pw", "password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Please accept the terms").waitFor();
  ok(true, "signup refuses without the terms");
  await page.check("#s_terms");
  await shot("01-signup");
  await page.getByRole("button", { name: "Create account" }).click();

  // Home deck from the seeded rides; ratings label on the card.
  await page.locator(".scard.top").waitFor();
  ok(await page.locator(".scard.top").getByText("New").count() >= 1, "card shows the driver's rating label");
  await shot("02-home");

  // Request a seat: phone verification sheet appears first, then the request goes through.
  await page.getByRole("button", { name: "Request seat" }).click();
  await page.getByRole("heading", { name: "Request a seat" }).waitFor();
  await page.getByRole("button", { name: "Send request" }).click();
  await page.getByRole("heading", { name: "Verify your phone" }).waitFor();
  await shot("03-verify-phone");
  await page.getByRole("button", { name: "Text me a code" }).click();
  await page.locator("#v_code").waitFor({ state: "visible" });
  ok((await page.inputValue("#v_code")).length === 6, "dev code filled in");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await page.getByText(/Request sent to/).waitFor();
  ok(true, "seat requested after verifying phone");

  // The driver accepts; the rider's Trips shows Share trip.
  const me = (await api("POST", "/api/auth/login", { email: "riya@example.com", password: "password123" })).cookie;
  const mine = (await api("GET", "/api/bookings/mine", null, me)).d.bookings[0];
  const drvEmail = mine.driver.name.split(" ")[0].toLowerCase() + "@demo.vroomate";
  const drv = (await api("POST", "/api/auth/login", { email: drvEmail, password: "password123" })).cookie;
  await api("POST", `/api/bookings/${mine.id}/respond`, { decision: "accept" }, drv);
  await page.getByRole("link", { name: "Trips" }).click();
  await page.getByRole("button", { name: "Share trip" }).waitFor();
  await shot("04-trips-confirmed");
  ok(true, "confirmed seat offers Share trip");

  // Shared link opens for someone with no account.
  const { url } = (await api("POST", `/api/bookings/${mine.id}/share`, {}, me)).d;
  const anon = await browser.newPage({ viewport: { width: 390, height: 844 } });
  anon.on("pageerror", (e) => errors.push("share: " + e.message));
  await anon.goto(url.replace(/^https?:\/\/[^/]+/, B));
  await anon.getByText("Riya's trip").waitFor();
  ok(await anon.getByText(/MH12DM/).count() === 1, "share page shows the plate to someone logged out");
  await anon.screenshot({ path: `${OUT}05-share.png` });
  await anon.close();

  // Account: new rows, terms page.
  await page.getByRole("link", { name: "Account" }).click();
  await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
  ok(await page.getByText("Verified").count() === 1, "phone shows as verified");
  await shot("06-account");
  await page.getByRole("button", { name: "Delete account" }).scrollIntoViewIfNeeded();
  await shot("07-account-bottom");
  await page.getByRole("button", { name: "Emergency contact" }).click();
  await page.fill("#em_name", "Mum"); await page.fill("#em_phone", "9800011111");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Terms of use" }).click();
  await page.getByRole("heading", { name: "Terms of use" }).waitFor();
  await shot("08-terms");

  // Forgot password from a logged-out browser.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => errors.push("forgot: " + e.message));
  await p2.goto(B + "/#/");
  await p2.getByRole("button", { name: "Log in" }).click();
  await p2.getByRole("button", { name: "Forgot password?" }).click();
  await p2.fill("#f_email", "riya@example.com");
  await p2.getByRole("button", { name: "Email me a reset link" }).click();
  await p2.getByText(/reset link is on its way/).waitFor();
  await p2.screenshot({ path: `${OUT}09-forgot-dark.png` });
  ok(true, "forgot password flow");
  await ctx2.close();

  ok(await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!r)), "service worker registered");
  await browser.close();
  // 400/401/403 are the journey's deliberate refusals (no terms, logged out, phone not yet verified).
  const real = errors.filter((e) => !/status of 40[013]/.test(e)); ok(real.length === 0, "no browser errors" + (real.length ? ": " + real.join(" | ") : ""));
})().catch((e) => { console.error(e); process.exit(1); });
