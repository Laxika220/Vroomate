"use strict";
// Email and SMS delivery. Each channel is off until its provider keys are set:
//   Email: MAIL_API_KEY (Resend, resend.com) and MAIL_FROM, e.g. "Vroomate <rides@yourdomain.in>"
//   SMS:   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (Indian numbers also need DLT registration)
// Without keys, messages are printed to the server log in development and kept in `sent` for tests.
const PROD = process.env.NODE_ENV === "production";
const sent = [];

const mailReady = () => !!(process.env.MAIL_API_KEY && process.env.MAIL_FROM);
const smsReady = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

function devLog(kind, to, text) {
  sent.push({ kind, to, text });
  if (sent.length > 200) sent.shift();
  if (process.env.NODE_ENV !== "test") console.log(`[${kind} not sent: no provider configured] to ${to}: ${text}`);
}

/** Fire and forget: delivery problems are logged, never shown to the person who triggered them. */
function sendEmail(to, subject, text) {
  if (!mailReady()) return devLog("email", to, `${subject}\n${text}`);
  fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MAIL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
  }).then((r) => { if (!r.ok) r.text().then((t) => console.error("Email failed", r.status, t)); }).catch((e) => console.error("Email failed", e.message));
}

/** Indian 10-digit numbers get +91; anything already starting with + is kept. */
const e164 = (phone) => { const d = String(phone).replace(/[^\d+]/g, ""); return d.startsWith("+") ? d : d.length === 10 ? "+91" + d : "+" + d; };

async function sendSms(to, text) {
  if (!smsReady()) return devLog("sms", to, text);
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: e164(to), From: process.env.TWILIO_FROM, Body: text }),
  });
  if (!r.ok) { console.error("SMS failed", r.status, await r.text()); throw new Error("sms_failed"); }
}

/** Codes may be returned to the browser only when nothing could deliver them and this isn't production. */
const showDevCodes = () => !PROD && !smsReady();

module.exports = { sendEmail, sendSms, sent, mailReady, smsReady, showDevCodes, PROD };
