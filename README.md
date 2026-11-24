# LabLoop

**Lab tests, looped to your doorstep.** · **जाँच, आपके द्वार**

LabLoop connects village patients in Siwan district (Bihar) with nearby pathology labs and doctors, so they don't have to travel to the market town.

- Patients book blood/urine tests. The partner lab's collector takes the sample at home (patient gives a 4-digit OTP) and uploads the report.
- Patients see nearby doctors (days, timing, fee) and take a token number.
- Doctors refer lab tests to a partner lab from inside the app, or send a walk-in patient's sample for **clinic pickup** (the lab collects all waiting samples at a clinic with one OTP).
- The lab sees the distance and travel time to each patient on a map, with a **Navigate** button (Google Maps directions). When the collector taps *I'm leaving now*, the patient sees an arrival time.
- The LabLoop team (super admin + field agents) onboards labs and doctors.

The whole app (all five roles, server error messages and emails) runs in Hindi or English from one switch in the header. `npm run i18n:check` checks the two dictionaries match and flags hard-coded text.

> Internal names (repo, packages, database `nidaansetu`, cookie `ns_refresh`, env vars, booking codes `NS…`) are unchanged from the earlier name, NidaanSetu.

**Stack:** MongoDB · Express 5 · React 19 (Vite) · Node 20+, with zod, JWT + rotating refresh cookies, TanStack Query, Jest + Supertest, Playwright.

---

## Repository layout

```
server/            API (npm workspace "nidaansetu-server")
  src/app.js         Express app (helmet, CORS, rate limits, routes)
  src/server.js      Boot: MongoDB, cron job, listen
  src/config/env.js  All configuration, validated with zod
  src/models/        Mongoose models (User, Lab, LabTest, Doctor, Booking, Appointment, Settlement, AuditLog, ...)
  src/routes/        auth, public, patient, lab, doctor, agent, admin, files
  src/services/      pricing, bookings (status machine, OTP), geo, appointments (tokens), settlements, users
  src/lib/           tokens, crypto, audit, mailer, storage drivers (local | s3 | cloudinary), dates, pagination
  src/jobs/          weekly settlement (node-cron)
  src/scripts/       create-admin, seed:dev, e2e-server
  tests/             Jest + Supertest (auth, RBAC, business rules)
client/            Web app (npm workspace "nidaansetu-client")
  src/api/client.js  Axios + automatic token refresh
  src/auth/          Session context and role guards
  src/i18n/          hi.json / en.json (Hindi-first, Roman script)
  src/pages/         public, patient, lab, doctor, agent, admin
e2e/               Playwright smoke flows
archive/           The old SehatDwaar prototype and expo demo files (not built, not linted)
```

## Local setup

Requirements: Node 20+, and MongoDB 6+ (local or Atlas).

```bash
npm install                         # installs both workspaces
cp server/.env.example server/.env  # edit MONGO_URI if using Atlas
npm run seed:dev                    # demo data (wipes the DB); refuses when NODE_ENV=production
npm run dev                         # API on :5050, web on http://localhost:5173
```

MongoDB options:
- Mac: `brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community`
- Atlas: create a free M0 cluster and put its connection string in `MONGO_URI`. (`seed:dev` refuses to wipe an Atlas DB unless `SEED_ALLOW_REMOTE=true`.)

In development Vite proxies `/api` to the API, so the refresh cookie is same-origin. Without SMTP configured, emails (temporary passwords, reset links) are printed in the API console.

### Create the owner account

The only way to create a `super_admin`:

```bash
npm run create-admin -- --email you@example.com --name "Your Name"   # prompts for a password (min 12 chars)
```

### Dev logins after `seed:dev`

All use the password `Nidaan@2026`. These exist only in dev seed data.

| Role | Login |
|---|---|
| super_admin | admin@nidaansetu.test |
| agent | agent@nidaansetu.test |
| lab_staff | lab.shree@nidaansetu.test, lab.jeevan@nidaansetu.test |
| doctor | dr.kumar@nidaansetu.test, dr.devi@nidaansetu.test, dr.singh@nidaansetu.test |
| patient | 9876500001, 9876500002 (mobile) |

Seed: 7 Maharajganj-block villages, 2 labs ("Shree" uses the real Siwan rate list), 3 doctors with schedules, 2 patients. All names are fictional.

### Docker Compose

```bash
docker compose up --build            # web on http://localhost:8080 (nginx proxies /api to the API)
docker compose exec api npm run create-admin -- --email you@example.com --name "Your Name"
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (watch mode) + Vite dev server |
| `npm run lint` | ESLint for server, client and e2e |
| `npm test` | API tests (Jest + Supertest, in-memory MongoDB) |
| `npm run e2e` | Playwright smoke flows (starts its own seeded API and web server) |
| `npm run build` | Production build of the web app (`client/dist`) |
| `npm run create-admin -- --email --name` | Create the super admin |
| `npm run seed:dev` | Wipe and load demo data (dev only) |
| `npm run migrate:labloop` | Upgrade an existing database to the LabLoop features without wiping it (safe to re-run; back up first) |
| `npm run i18n:check` | Check `hi.json` and `en.json` have the same keys and flag hard-coded text |

The first test run downloads a MongoDB binary for `mongodb-memory-server`. To use a local `mongod` instead: `MONGOMS_SYSTEM_BINARY=$(which mongod) npm test`. For e2e, also run once: `npx playwright install chromium chromium-headless-shell`.

## Environment variables (server)

See `server/.env.example` for the full list.

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` turns on secure cookies and requires the secrets below |
| `MONGO_URI` | MongoDB connection string |
| `CLIENT_ORIGIN` | Allowed web origin(s) for CORS, comma-separated |
| `PUBLIC_API_URL` | Base URL used in signed report links (local storage driver) |
| `JWT_ACCESS_SECRET`, `FILE_URL_SECRET`, `OTP_SECRET` | Required in production, min 32 chars each |
| `ACCESS_TOKEN_TTL_MIN` / `REFRESH_TOKEN_TTL_DAYS` | Default 15 min / 7 days |
| `BCRYPT_COST` | Default 12; must be ≥ 12 in production |
| `COOKIE_SAMESITE` | `lax` if web and API share a site; `none` if they're on different domains (needs HTTPS) |
| `STORAGE_DRIVER` | `local` (dev only), `s3`, or `cloudinary` |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | S3 settings; credentials via standard AWS env or IAM role |
| `CLOUDINARY_URL` | `cloudinary://key:secret@cloud` |
| `SIGNED_URL_TTL_SEC` | Report link lifetime, default 600 (10 min) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email for credentials and password reset |
| `SETTLEMENT_CRON`, `CRON_ENABLED`, `TZ_NAME` | Weekly settlement, default Monday 06:00 Asia/Kolkata |
| `ORS_API_KEY` | Optional free OpenRouteService key for routes/ETA. Blank = public OSRM demo, then a straight-line estimate |
| `ROUTING_OFFLINE` | `true` skips routing network calls (no-internet demos): ETAs show as approximate and the map hides |

Client: `VITE_API_URL`. Leave it empty when the web app and API share an origin (dev proxy, Docker). Otherwise set the API origin, e.g. `https://api.nidaansetu.in`.

## Roles

| Role | Created by | Can do |
|---|---|---|
| `super_admin` | `npm run create-admin` only | Everything: all users, labs, doctors, villages, bookings, appointments, finance, settlements, audit log. Also uses the agent onboarding screens. |
| `agent` | super_admin | Add villages; onboard labs (+ bulk tests) and create lab staff logins; onboard doctors and create their logins; edit/deactivate **only** what they onboarded; see bookings of their labs (no money fields). No finance, no agent management. |
| `lab_staff` | agent / super_admin | Own lab only: requests, confirm/reject, OTP collection, report upload, price list, weekly settlement |
| `doctor` | agent / super_admin (never self-registered) | Own profile, schedule and fee, own appointments, mark seen / no-show, refer lab tests |
| `patient` | Self sign-up | Own profile, family, test bookings, doctor tokens, own reports |

- `POST /auth/signup` always creates a `patient`. A `role` field in the body is stripped.
- Accounts made by an agent/admin get a temporary password (emailed and shown once on screen) and `mustChangePassword: true`. Until it is changed, every route except `/auth/me`, `/auth/change-password` and `/auth/logout` returns `403 PASSWORD_CHANGE_REQUIRED`.
- Disabling a user bumps their token version and revokes refresh tokens, so existing sessions stop working at once.
- Other people's records return **404**, not 403.
- Every data-changing action is written to `AuditLog` (actor, action, entity, before/after, IP).

## Business rules (enforced on the server)

1. Prices come only from `LabTest` in the DB. The booking API accepts test IDs; any price fields are stripped.
2. Collection fee is 0 if test total ≥ `freeCollectionAbove`, else `collectionFee`. Orders below `minOrderValue` are rejected: *"Kam se kam ₹199 ki jaanch book karein"*.
3. `b2bPrice` = walk-in price × (1 − commission%) unless overridden. `labPayout` = Σ b2bPrice and `platformMargin` = total − labPayout, both stored on the booking.
4. Labs are listed only if their `serviceRadiusKm` covers the patient's village (`$geoNear`), nearest first, with km.
5. Status machine: `requested → confirmed → collected → report_ready`, plus `cancelled` from requested/confirmed only.
6. Collection OTP: 4 digits, shown only to the patient. It is derived from the booking code with `OTP_SECRET` (HMAC); the DB stores only a verification hash. Lab staff must enter it to mark *collected*. 5 wrong tries lock the booking.
7. Reports: only when *collected*; PDF/JPG/PNG checked by content (magic bytes), max 5 MB; stored privately. `GET /bookings/:id/report` checks access and returns a signed URL valid for 10 minutes. Allowed viewers: the patient, the booking's lab, the referring doctor (with consent) and super admin.
8. Doctor tokens only on schedule days and within `maxTokens`; token = next number for that doctor/date (a unique index guards races). One active token per person (account holder or family member) per doctor per day.
9. Doctor referrals create a `source: doctor` booking linked to the appointment. The patient sees it in "Meri booking".
10. Weekly settlement (Monday 06:00 IST): per lab, bookings collected in the previous Mon–Mon week. `netPayable = Σ labPayout − cash kept by the collector`. A negative value means the lab owes the platform. Re-running is idempotent; paid settlements are never changed.

## API (`/api/v1`)

Errors are always `{ "error": { "code", "message" } }`. Messages are simple Hinglish. List endpoints accept `page`, `limit`, `sort` (e.g. `-createdAt`) and filters, and return `{ data, meta: { page, limit, total, pages } }`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/signup` · `POST /auth/login` (mobile or email) · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/change-password` · `POST /auth/forgot-password` · `POST /auth/reset-password` · `GET /auth/me` |
| Public | `GET /villages` · `GET /labs?villageId=` · `GET /labs/:id/tests` · `GET /doctors?villageId=&specialty=` · `GET /specialties` · `GET /doctors/:id/availability?from=&to=` |
| Patient | `PATCH /me` · `GET/POST /me/family` · `PATCH/DELETE /me/family/:id` · `POST /bookings` · `GET /me/bookings` · `POST /bookings/:id/cancel` · `GET /bookings/:id/report` · `POST /appointments` · `GET /me/appointments` · `POST /appointments/:id/cancel` |
| Lab staff | `GET /lab/bookings?status=` · `PATCH /lab/bookings/:id/confirm` · `PATCH /lab/bookings/:id/reject` · `PATCH /lab/bookings/:id/collect` · `POST /lab/bookings/:id/report` · `GET /lab/settlements` · `GET /lab/tests` · `PATCH /lab/tests/:id` |
| Doctor | `GET /doctor/profile` · `GET /doctor/appointments?date=&when=` · `PATCH /doctor/appointments/:id/seen` · `PATCH /doctor/appointments/:id/no-show` · `POST /doctor/referrals` · `GET /doctor/referrals` · `GET/PATCH /doctor/schedule` |
| Agent | `POST /agent/villages` · `POST /agent/labs` · `GET/PATCH /agent/labs/:id` · `POST /agent/labs/:id/tests` (`text`: "Name = Price" lines or CSV) · `POST /agent/labs/:id/staff` · `POST /agent/doctors` · `PATCH /agent/doctors/:id` · `GET /agent/my-onboarded?type=lab\|doctor` · `GET /agent/bookings` |
| Super admin | `GET/POST /admin/users` · `PATCH /admin/users/:id/status` · `POST /admin/users/:id/reset-password` · `GET /admin/labs` · `GET /admin/doctors` · `GET /admin/villages` · `GET /admin/bookings` · `GET /admin/appointments` · `GET /admin/settlements` · `GET /admin/settlements/:id` · `POST /admin/settlements/generate` · `PATCH /admin/settlements/:id/paid` · `GET /admin/stats?days=` · `GET /admin/audit` |
| Files | `GET /files/:key?exp&sig` (local driver only; HMAC-signed, expiring) |

## Security notes

- bcrypt cost 12; password hashes, OTP hashes and refresh/reset tokens never appear in responses (stripped by `toJSON`).
- Access token: 15-minute JWT, kept in memory by the web app. Refresh token: opaque random value in an httpOnly cookie scoped to `/api/v1/auth`, stored hashed, rotated on every use. Reusing a rotated token revokes the whole session family.
- Rate limits on login, signup, forgot/reset password and OTP verify. All input validated with zod (unknown keys stripped), and `$`/dotted keys removed from bodies.
- helmet, strict CORS from `CLIENT_ORIGIN`, secure cookies in production. Secrets only from env; `.env` is git-ignored.
- Booking requires the consent checkbox *"Meri report lab aur mere doctor dekh sakte hain"*. Doctor referrals are recorded with consent, because the referring doctor is the "mere doctor" in that text.

## Deploy

1. **Database:** MongoDB Atlas cluster (region close to India, e.g. Mumbai). Create a DB user, allow the API's egress IPs, and copy the connection string.
2. **API** (Render / Railway / AWS): build from the repo root with `server/Dockerfile`, or run `npm ci -w server && npm start -w server`. Set `NODE_ENV=production`, `MONGO_URI`, the three secrets, `CLIENT_ORIGIN=https://<web domain>`, `PUBLIC_API_URL=https://<api domain>`, `STORAGE_DRIVER=s3` (or `cloudinary`) with its settings, and SMTP. If web and API are on different domains, set `COOKIE_SAMESITE=none`. Health check: `GET /api/health`.
3. **Web** (Netlify / Vercel / Cloudflare Pages / S3+CloudFront): `npm ci && npm run build -w client` with `VITE_API_URL=https://<api domain>`, publish `client/dist`, and add an SPA fallback to `index.html`. Hosting the web and API under one domain (e.g. `/api` reverse-proxied) avoids third-party cookie problems on some phones; `client/nginx.conf` shows that setup.
4. Run `npm run create-admin` once against production, log in, and create your field agents.
5. Settlement runs in the API process every Monday 06:00 IST. Run a **single** API instance, or set `CRON_ENABLED=false` on all but one.

## Not in this version

Online payment gateway, WhatsApp/SMS, video consult, ambulance, pharmacy, native apps, AI report explainer. Payments (Razorpay) can go in `server/src/services/payments/` and set `payment.mode = "online"` on bookings. WhatsApp Cloud API notifications can subscribe to the booking/appointment actions already written to the audit log (or a small event emitter in `services/bookings.js`), with no changes to the route code.

Thank You