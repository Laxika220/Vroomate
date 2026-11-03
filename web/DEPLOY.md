# Putting Vroomate online

The app is one Node process and one SQLite file, so any host that runs a Docker container with a persistent disk will do.
These steps use **Render**. Railway, Fly.io or a small VPS work the same way.

## 1. Host the app (about 15 minutes)

1. Push this repository to GitHub (already done if you're reading this there).
2. On [render.com](https://render.com), choose **New → Blueprint** and pick the repository. Render reads `render.yaml`, which sets up:
   - a Docker web service built from `web/Dockerfile`;
   - a 1 GB disk at `/data` for the database, photos and backups (a disk needs a paid instance);
   - a health check on `/healthz`.
3. When asked for environment values, set `APP_URL` to the address Render gives you (for example `https://vroomate.onrender.com`).
   Fill in the rest as you set each service up below.
4. Optional: add your own domain under **Settings → Custom Domains**. Render issues the HTTPS certificate.

Make yourself an admin from the Render **Shell** tab:

```bash
npm run make-admin -- you@example.com
```

## 2. Email: password resets and ride alerts

1. Create a [Resend](https://resend.com) account and verify a domain you own. This needs DNS records at your domain registrar.
2. Create an API key. Set `MAIL_API_KEY`, `MAIL_FROM` (for example `Vroomate <rides@yourdomain.in>`) and `SUPPORT_EMAIL`.

Without these, nobody can reset a forgotten password.

## 3. SMS: phone verification codes

1. Create a [Twilio](https://twilio.com) account and buy a number or set up a sender ID.
2. **India:** commercial SMS to Indian numbers must be registered on the DLT platform (sender ID plus message template), which
   can take a few days. The message template the app sends is:
   `{#var#} is your Vroomate code. It expires in 10 minutes.`
3. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM`.

In production without these, codes can't be delivered, so nobody can verify a phone, offer a ride or request a seat.
The app never shows the code on screen when `NODE_ENV=production`.

## 4. Push notifications

Run `npm run vapid` once, either locally or in the Render shell, and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`.
Keep the same keys from then on: changing them cancels everyone's existing subscriptions.

## 5. Backups

With `VROOMATE_BACKUP=1` (set in the Dockerfile) the server copies the database and photos to `/data/backups` once a day
and keeps 14 copies. That protects against mistakes, **not** against losing the disk. Download a copy somewhere else
now and then (Render Shell → `ls /data/backups`), or add a job that uploads `/data/backups` to cloud storage.

To restore, stop the service, replace `/data/vroomate.db` (and `/data/uploads`) with a backup's files, and start it again.

## 6. Before you invite students

- [ ] Have the **terms** and **privacy policy** (`public/js/views/legal.js`) reviewed. In particular, check the cost-sharing wording
      against Maharashtra's rules on carrying paying passengers in private cars, and say who runs the service.
- [ ] Set `SUPPORT_EMAIL` and make sure someone reads it.
- [ ] Make at least two admins and agree who checks the reports queue every day.
- [ ] Check the stop distances and times in `config/routes.json` against real drives.
- [ ] Try the full flow on one Android phone and one iPhone: sign up, verify phone, offer, request, accept, chat, share trip, rate.
- [ ] Run a one-week pilot with 20–30 people before announcing it widely.

## Running without Docker

```bash
cd web
NODE_ENV=production PORT=3000 VROOMATE_DB=/srv/vroomate/vroomate.db VROOMATE_UPLOADS=/srv/vroomate/uploads \
  VROOMATE_SECURE_COOKIE=1 TRUST_PROXY=1 node --env-file=.env server/index.js
```

Put Caddy or nginx in front for HTTPS, and keep the process running with systemd or pm2.
