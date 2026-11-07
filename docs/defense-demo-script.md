# Defense demo: 10-minute live walkthrough

**Goal:** show the whole prescriptive loop on real hardware: device → validated reading → NORMAL/WARNING/CRITICAL → IF-THEN recommendation → alert and push → the action taken → the report that proves it.

**Cast:**
- **Presenter** (laptop, projected): the owner account.
- **Assistant** (phone 1): the caretaker account.
- **Phone 2**: the owner's phone, for the push notification.
- **Gian**: at Tank B.

## Before the panel arrives (T−30 min)

- [ ] Tank B is **fish-free**. Tank A has the fish and stays NORMAL.
- [ ] A spare provisioned device for the claim step: its **label (QR + 8-character code)** printed, the device powered and on Wi-Fi. If no spare exists, use Tank B's label from `scripts/convert-pr8-registry.ts` / `provision-device.ts` before it is claimed.
- [ ] Accounts signed out:
  - Owner: `demo-owner@…` (personal email domain, verified).
  - Caretaker: `demo-caretaker@…` (verified, **not yet invited**).
  - Second owner (org B) for the isolation check, signed in on phone 1 in a second browser profile.
- [ ] Phone 2: the site added to the Home Screen (iPhone) or Chrome (Android). Sign in as the owner. Settings → **Turn on alerts**. Send one test alert.
- [ ] Laptop: browser zoom 110 %, dark theme, notifications muted except the app. Second tab: Firebase console (read-only) to show `devices/<Tank B>/telemetry` if asked.
- [ ] The heater for Tank B is plugged in but **off**. Warm water (≤ 35 °C) is ready in a jug, conditioned water in a bucket.
- [ ] Fallback laptop has run `npm run demo` once today (see the end).

## The script (≈ 10 min)

| Time | Who | Do | Say (short) | Expect on screen |
|---|---|---|---|---|
| 0:00 | Presenter | Landing page → Login (owner) | "Each user sees only their own tanks. Platform admins must use two-step verification once it is switched on at go-live." | Dashboard with Tank A NORMAL |
| 0:45 | Presenter | **Add device** → Scan QR (camera) on the spare's label → name it "Panel Tank" → Add | "Claiming needs the device ID **and** the 8-character code printed on the box. The ID alone is not enough." | "Set up your aquarium" |
| 1:45 | Presenter | Setup wizard: 60×30×35 cm → filter "Hang-on-back" → 2 fish, 40 g and 55 g → thresholds (draft badge) → Finish | "Bioload comes from fish weight per litre. The thresholds are the goldfish draft values awaiting adviser approval." | The new tank on the dashboard |
| 3:00 | Presenter | **Team** → Invite caretaker (email) → assign **Tank B only** | "A caretaker is limited to the tanks the owner assigns." | Invite link |
| 3:30 | Assistant | Phone 1: open the invite link, sign in as the caretaker, Accept | | Caretaker dashboard: Tank B only |
| 4:00 | Assistant | **Isolation check:** show Monitoring and Reports. Only Tank B is listed. Then the org-B owner (second profile) shows they see none of these tanks | "This is enforced by the database rules, not only hidden in the app. It is tested in the emulator on every change." | Tank A absent for the caretaker; nothing from org A for owner B |
| 5:00 | Gian | Pour warm water into Tank B / turn the heater on | "We now push Tank B out of range. There are no fish in it." | |
| 5:15 | Presenter | Dashboard → Tank B | "The ESP32 sends a reading every ~15 s. The server validates it, then classifies it with the IF-THEN rules." | Temperature **WARNING** (> 24 °C), badge with a triangle icon |
| 5:30 | Phone 2 | Show the push notification | "The push goes only to this tank's owners and assigned caretaker. Our target is under 10 seconds." | "Tank B · WARNING · Water temperature above range" |
| 6:00 | Presenter | Alerts → open the alert | "Each recommendation names the rule that produced it: `temp_high_warning`. It has the condition, the action, the reason and a check to do first. No AI and no prediction: predefined rules only." | Recommendation card with the rule ID |
| 6:45 | Assistant | Phone 1: Recommendation → **Applied** → Log maintenance: water change 30 % | "The caretaker records what was actually done." | "Maintenance logged and the recommendation marked applied" |
| 7:30 | Gian | Add conditioned cool water / heater off | | Back to **NORMAL** after 3 normal readings; the alert auto-resolves |
| 8:00 | Presenter | **Reports** → Tank B → Daily → Generate | "The report shows how many recommendations were generated against how many were acted on. This is the evidence that the prescriptive part works. Invalid readings are counted, never averaged." | The summary: Recommendations 1 / Applied 1, time in WARNING, the alert, the maintenance entry |
| 9:00 | Presenter | Download **PDF**; scroll to the chart | "The PDF is generated on the server and stored per organization. A user outside the org gets 'access denied'." | Branded PDF, chart with the normal band, page numbers |
| 9:45 | Presenter | Back to the dashboard | Wrap up: "Validated → classified → recommended → acted on → reported." | |

**If the push is slow:** show the in-app alert bell (same alert) and say that the push target is measured separately (`docs/testing-plan.md` §4).

**If the temperature rises slowly:** use the jug again. Water level is a quicker backup: siphon below 70 % for `water_level_low_warning`.

## Fallback: venue Wi-Fi fails (`npm run demo`, fully offline)

Everything runs on the laptop: Firebase emulators, the seeded demo org, two demo devices and the web app. No internet and no real hardware are needed.

**Prepare at home (internet needed once):**
```bash
npm ci && npm --prefix functions ci     # dependencies
firebase --version && java -version     # emulators need Java
npm run demo                            # run it once: builds, downloads the emulator jars, seeds
```

**At the venue:**
1. `npm run demo` (about 1 minute). Open the printed URL.
2. Accounts (password `SmartAqua-Demo-2026!`, emulator only):

   | Account | Use as |
   |---|---|
   | `owner-a@demo.smartaqua.test` | Presenter |
   | `caretaker-x@demo.smartaqua.test` | Caretaker |
   | `owner-b@demo.smartaqua.test` | Isolation check |
   | `admin@demo.smartaqua.test` | Admin view, if asked |

3. **Claim:** the terminal prints two unclaimed demo devices with their codes. Type them into Add device (the camera may not be useful offline, but typing works).
4. **Abnormal reading:** *Display Tank B* is already drifting to CRITICAL temperature and WARNING turbidity, with open alerts and recommendations. To trigger a fresh one, run `npm run measure:latency -- --samples 3` in a second terminal. It writes an abnormal temperature reading through the same pipeline and prints the latency.
5. **Push:** FCM cannot run offline. Show the alert bell and the Alerts page instead, and say so plainly.
6. Reports, PDF, CSV, maintenance logging, team and invites all work offline exactly as live.

**Say it plainly:** "This is the emulator with demo data, because the venue network is down. The hardware run is in our test results (`docs/testing-plan.md`)."
