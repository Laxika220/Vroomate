import { h } from "../ui.js";
import { state, registerView } from "../core.js";

// Plain-language terms and privacy policy. Have them reviewed before a public launch; see README "Before launch".
const UPDATED = "3 November 2026";
const contact = () => (state.cfg && state.cfg.supportEmail
  ? h("span", null, "Write to ", h("a", { href: "mailto:" + state.cfg.supportEmail }, state.cfg.supportEmail), ".")
  : "Use Report on any profile or trip, and the team will get back to you.");

function page(title, ...sections) {
  const back = state.me ? h("a", { class: "btn small", href: "#/profile" }, "Back") : h("a", { class: "btn small", href: "#/" }, "Back");
  return { node: h("article", { class: "prose" }, back, h("h1", null, title), h("p", { class: "hint" }, "Last updated " + UPDATED), ...sections), bare: !state.me };
}
const sec = (title, ...body) => [h("h2", null, title), ...body];
const ul = (...items) => h("ul", null, items.map((i) => h("li", null, i)));

registerView("terms", async () => page("Terms of use",
  h("p", null, "Vroomate helps people travelling between Lavasa and Pune find each other to share a car. By creating an account you agree to these terms."),
  ...sec("What Vroomate is",
    h("p", null, "Vroomate is a noticeboard, not a transport company. We don't employ drivers, own vehicles, or check anyone's driving. Each trip is an arrangement between the people in the car."),
    h("p", null, "Prices are a share of fuel and tolls, agreed before the trip and paid directly to the driver. Drivers must not run rides for profit or use Vroomate as a taxi service.")),
  ...sec("Who can use it",
    ul("You must be 18 or older.", "Use your real name, a real photo, and a mobile number you can be reached on.", "One account per person.")),
  ...sec("Drivers agree to",
    ul("Hold a valid driving licence for the vehicle.", "Drive a vehicle that is registered, insured and roadworthy, with the number plate you entered.",
      "Follow traffic law, and never drive after drinking or while tired.", "Turn up on time, or cancel in the app as early as possible.")),
  ...sec("Passengers agree to",
    ul("Be at the pickup point on time, or cancel in the app as early as possible.", "Pay the agreed share.", "Wear a seat belt and respect the driver's car.")),
  ...sec("Everyone agrees to",
    ul("Treat people with respect. No harassment, discrimination or threats.", "Not use Vroomate to send spam, sell things, or move anything illegal.",
      "Report unsafe behaviour using Report on the person's profile or trip.")),
  ...sec("Safety",
    h("p", null, "Check the driver's name, photo, car and plate before you get in. Share your trip with someone you trust from the Trips screen. In an emergency, call 112.")),
  ...sec("Our responsibility",
    h("p", null, "We do our best to keep Vroomate working and to act on reports, but we can't guarantee that a ride happens, or how anyone behaves. As far as the law allows, we aren't liable for losses arising from trips arranged through the app."),
    h("p", null, "We can suspend or remove accounts that break these terms.")),
  ...sec("Changes and contact",
    h("p", null, "If these terms change in an important way, we'll tell you in the app. ", contact()))));

registerView("privacy", async () => page("Privacy policy",
  h("p", null, "This explains what Vroomate stores about you, who can see it, and how to get it deleted."),
  ...sec("What we store",
    ul("Account: name, email, mobile number, password (stored only as a one-way hash), gender if you give it, photo and bio.",
      "Trips: rides you offer or request, seats you book, your car's model, colour and plate.",
      "Messages you send in Vroomate chats, reports you make, people you block.",
      "Ratings you give and receive, and an optional emergency contact.",
      "Technical data needed to keep you logged in and to stop abuse, such as a session cookie and your IP address in server logs.")),
  ...sec("Who sees what",
    ul("Everyone signed in: your first name, photo, bio, average rating, and the rides or requests you post.",
      "People on a confirmed ride with you: your phone number, and your plate if you're driving.",
      "Someone you share a trip link with: the trip's route, time, driver, car and plate, until the trip ends.",
      "Vroomate admins: reports, and the account details needed to act on them.")),
  h("p", null, "We don't sell your data or show ads. Emails and text messages are sent through delivery providers that only receive the address or number and the message."),
  ...sec("How long we keep it",
    h("p", null, "We keep your data while you have an account. Database backups are kept for 14 days.")),
  ...sec("Your choices",
    ul("Download everything we hold about you from Account > Download my data.", "Delete your account from Account > Delete account. Your profile, photo, phone and email are erased; trips other people took with you stay in their history as \"Deleted user\".",
      "Turn off email notifications in Account > Notification settings.")),
  ...sec("Contact", h("p", null, contact()))));
