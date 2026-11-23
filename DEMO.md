# LabLoop: 5-minute expo demo

**Before:** `npm run seed:dev` (wipes the dev DB and loads demo data), then `npm run dev`. Open http://localhost:5173.
No internet? Set `ROUTING_OFFLINE=true` in `server/.env`: ETAs show as "approx." and the map hides itself; everything else works.
Password for every account: **`Nidaan@2026`**. Use three browser windows (or one normal + two private): **Patient**, **Lab**, **Doctor**.

| Who | Login page | ID |
|---|---|---|
| Patient (Ram) | `/login` | `9876500001` |
| Lab (Shree) | `/login/lab` | `lab.shree@nidaansetu.test` |
| Doctor (Kumar) | `/login/doctor` | `dr.kumar@nidaansetu.test` |

**1. Language (30 s).** On the landing page tap **English** in the top bar, then **हिंदी**. Every screen, date, status and server error follows. Leave it in the language of your audience.

**2. Patient books with location (1 min).** Patient window: log in as Ram → **Book a test** → Shree Pathology Lab → pick HbA1c + Thyroid → **Continue** → address → **Use my current location** → tick consent → **Confirm booking**. Show the receipt: booking code and the OTP in the highlighted box (only the patient sees it).

**3. Lab: route, Navigate, leaving (1 min).** Lab window → **To collect**. On Ram's seeded booking ("Ward 4, near the temple") show distance · ~minutes, the map, and **Navigate** (opens free Google Maps directions). Tap **I'm leaving now**. Patient window → **Booking**: the banner says *"Collector will reach in about X min (by …)"*.

**4. Collect with OTP (30 s).** Lab: type a wrong OTP first (*"Wrong OTP. 4 tries left."*), then the patient's OTP → **Sample collected**. The OTP never appears anywhere in the lab panel.

**5. Report (30 s).** Lab → **Report to upload** → choose any PDF → **Send report**. Patient → **Booking** → **View report** (a signed link that expires in 10 minutes). The seeded KFT booking already has a report if you are short of time.

**6. Clinic pickup (1.5 min).** Doctor window → **Walk-in patient** → name and age, collection point **At my clinic**, Shree Lab, pick a test → **Send to lab**. The doctor sees the **pickup OTP**. Lab window → **Clinic pickups**: samples are grouped by clinic with a waiting count (two seeded requests are already there) → **Confirm** → **Collect all at this clinic** → enter the doctor-shown OTP. Upload the report as in step 5. Doctor → **Lab requests**: the status shows *Report ready* → **View report**. Another doctor gets "not found".

**Talking points:** no paid services (OSM tiles, OSRM demo or optional free OpenRouteService key, Google Maps links); OTP-verified collection; prices only from the database; one switch for Hindi and English.
