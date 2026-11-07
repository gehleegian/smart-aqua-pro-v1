# SmartAqua Pro: Testing Plan (Chapter 3)

This plan covers how SmartAqua Pro is tested for the defense. It has six parts: sensor accuracy (§1), functional tests mapped to FR1–FR22 (§2), simulated abnormal conditions (§3), performance (§4), the data-isolation test (§5) and the ISO/IEC 25010 evaluation (§6). Automated software tests already in the repository are listed beside each item. **Physical results (§1, §3, §4.3) are recorded on the day; nothing here is pre-filled.**

Thresholds quoted below are the **DRAFT** goldfish values in `scripts/seed/goldfish-draft.json`. They await adviser approval, and the expected results change if the approved values differ.

| Parameter | Normal range (draft) | WARNING when | CRITICAL when |
|---|---|---|---|
| Temperature | 20–24 °C | > 24 or < 20 | > 26.4 or < 18 |
| pH | 6.5–7.5 | > 7.5 or < 6.5 | > 8.25 or < 5.85 |
| TDS | 100–400 ppm | > 400 or < 100 | > 500 |
| Turbidity | ≤ 5 NTU | > 5 | > 10 |
| Water level | ≥ 70 % | < 70 % | < 59.5 % |

---

## 1. Sensor accuracy (against reference instruments)

**Requires the physical device. Not yet done.**

### 1.1 Reference instruments

| SmartAqua sensor | Reference instrument | Note |
|---|---|---|
| pH probe | Calibrated handheld pH meter (2-point calibration with pH 4.01 and 6.86/7.00 buffers on the day) | Rinse both probes with distilled water between samples |
| DS18B20 temperature probe(s) | Digital thermometer (±0.1 °C), or a glass lab thermometer | Same depth, same spot, wait 2 minutes |
| TDS sensor | TDS pen (factory-calibrated, or checked with a 342 ppm NaCl solution) | Same water temperature |
| Ultrasonic water level | Steel ruler or measuring tape, mm marks, read at eye level | Convert to % with the tank's configured empty and full heights |
| Turbidity | Turbidity reference tubes (if available), or report as "Clear/Cloudy agreement" | The firmware reports a category; no NTU value is claimed without a reference |

### 1.2 Procedure

1. Let the system run for 10 minutes so readings settle.
2. For each parameter, take **n ≥ 10** paired readings over at least 3 different conditions. For pH, use buffer 4, buffer 7, and tank water. For temperature, use cool, room and warm water. For TDS, use tap, tank and salt solution. For level, use 5 levels.
3. Record the SmartAqua value shown on the dashboard (or from `devices/{id}/telemetry`) and the reference value **at the same moment**. Write down the timestamp.
4. Report every pair; do not discard outliers without a stated reason.

### 1.3 Results table (template)

| # | Time | Condition | SmartAqua reading (x̂) | Reference (x) | Error (x̂ − x) | Abs. error | % error |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| … | | | | | | | |
| | | | | | **MAE =** | | **Mean % error =** |

### 1.4 Formulas

- Error: eᵢ = x̂ᵢ − xᵢ
- **Mean Absolute Error:** MAE = (1/n) Σ |x̂ᵢ − xᵢ|  (in the parameter's unit)
- **Percent error** per pair: %Eᵢ = |x̂ᵢ − xᵢ| / |xᵢ| × 100 %. Report the mean and the maximum.
- Optional: RMSE = √((1/n) Σ (x̂ᵢ − xᵢ)²), and the mean error (bias) = (1/n) Σ eᵢ to show a systematic offset.
- **Acceptance** (proposal for adviser sign-off): temperature MAE ≤ 0.5 °C; pH MAE ≤ 0.2; TDS mean % error ≤ 10 %; level MAE ≤ 1 cm.

---

## 2. Functional test cases (FR1–FR22)

**Auto** = covered by an automated test in the repository (emulator); the manual step is still performed on the defense build. **HW** = needs the physical device.

| ID | FR | Steps | Expected result | Auto / HW |
|---|---|---|---|---|
| FT-01 | FR1 Login and roles | 1. Sign up with email and password. 2. Verify the email. 3. Sign in. 4. Sign in as the platform admin. | An unverified account cannot enter. An owner sees owner pages; the admin sees admin pages only. | `test:email-verification`, smoke "sign up" |
| FT-02 | FR2 Admin manages users and orgs | As admin: open Organizations, suspend an org, reactivate it. Open the User Directory. | The suspended org's owner sees "suspended". The change appears in the admin audit log. | smoke "admin suspends" |
| FT-03 | FR3 Users see only assigned aquariums | See §5. | No cross-org or unassigned access, enforced by the rules. | `test:firestore-org-rules`, `test:rtdb-org-rules`, `test:storage-rules` |
| FT-04 | FR4 Aquarium profile | Claim a device; complete the setup wizard (dimensions, filter, fish); edit the profile. | The profile is saved; the volume is computed from the dimensions. | smoke "claim a device → wizard" |
| FT-05 | FR5 Bioload | Enter 2 fish of 40 g and 55 g in a 55 L tank. | The bioload preview shows the level and the density (g/L) from `docs/bioload.md`. | `test:aquarium-profile` |
| FT-06 | FR6 Per-aquarium thresholds | "Apply species defaults"; override the max temperature for one tank. | That tank's classification uses the override; other tanks keep the defaults. | `test:rule-engine` |
| FT-07 | FR7 Tagged readings at a fixed interval | Watch `devices/{id}/telemetry/updatedAt` for 2 minutes. | It advances every ~15 s, under the tank's own ID. | HW |
| FT-08 | FR8 Validation | Unplug the pH probe; send a reading with a missing field (emulator). | "Sensor error" is shown; no water-quality recommendation is made; a sensor-fault alert opens. | `test:telemetry-ingest`, HW |
| FT-09 | FR9 Live dashboard | Open the Dashboard during telemetry. | Readings, the NORMAL/WARNING/CRITICAL badge (word plus icon) and device states update without a reload. | HW for live values |
| FT-10 | FR10 History with a date range | Data Logs → choose a 7-day range. | The chart and table show only that range. | — |
| FT-11 | FR11 Classification | Run §3 cases. | Each parameter is classified as in the threshold table. | `test:rule-engine`, `test:monitoring-assessment` |
| FT-12 | FR12 IF-THEN recommendation | Trigger temp > 24 °C. | The recommendation shows the parameter, condition, severity, action, basis and rule ID `temp_high_warning`. | `test:rule-engine` |
| FT-13 | FR13 Rules editable without redeploying | As admin: Rules Editor → change an action text → save → approve. | New recommendations use the new text; no deploy happens. | `test:sprint4-functions` |
| FT-14 | FR14 Alerts | Run §3 (warning, critical, power loss, offline, sensor fault). | One alert per condition, with the tank, parameter, severity and time. | `test:telemetry-ingest`, `test:device-heartbeat` |
| FT-15 | FR15 Push to assigned users only | Turn on alerts for the owner and a caretaker of another tank; trigger an alert. | Only the owner (and the tank's caretakers) receive the push; the in-app list shows it; Acknowledge works. | `test:sprint4-functions`, HW for the phone |
| FT-16 | FR16 Dedup and cooldown | Keep temp > 24 °C for 20 minutes. | One alert whose occurrence count grows, not 80 alerts; no repeat push inside 15 minutes. | `test:rule-engine` |
| FT-17 | FR17 Manual control | Feed Now; Light On/Off; Filter On/Off. | The command shows Waiting → Done; the relay or servo acts. | `test:sprint4-e2e`, HW |
| FT-18 | FR18 Schedules | Save feeding at 2 minutes from now; light on/off times. | The device feeds at that time (even with Wi-Fi off); "Next scheduled" is correct. A tank with no saved schedule shows "No schedule set". | `test:schedule`, smoke, HW |
| FT-19 | FR19 Command log | After FT-17, open Command history. | Who, when, type, and the device result (done/failed/no response). | `test:sprint4-e2e` |
| FT-20 | FR20 Maintenance against a recommendation | Mark a recommendation Applied → log a 30 % water change. | The recommendation becomes applied; the log entry links to it; a new cleaning cycle starts. | smoke "Applied → maintenance" |
| FT-21 | FR21 Reports with PDF | Reports → Weekly → Generate → open the PDF and the CSV. | The summary covers readings (valid only), completeness, time in condition, alerts, recommendations vs action, maintenance, device activity and thresholds (with the draft note). The PDF has charts and page numbers. A caretaker sees only assigned tanks. | `test:reports`, `test:report-summary`, smoke "Sprint 5" |
| FT-22 | FR22 Audit log | Claim, invite, remove a member, change a rule. | Each shows in the owner's or admin's audit log with the actor and time. | `test:sprint3-e2e`, `test:sprint4-e2e` |
| FT-23 | MFA (security plan) | Settings → Two-step verification → enroll → sign out → sign in. | The code is required at sign-in; an admin cannot use the app until enrolled. | `test:mfa`, smoke (mock); real TOTP after deploy (`docs/access-model.md` §10) |
| FT-24 | Power interruption | §3 case 6. | A Power Interruption alert within ~15 s; the ESP32 stays on (battery/UPS). | HW |

---

## 3. Simulated abnormal conditions (fish-free Tank B only)

**Safety rules:**
- Do these only in **Tank B with no fish in it**.
- Keep a bucket of conditioned water ready to restore the tank.
- Unplug mains equipment before putting hands in the water.
- Never add chemicals to a tank with fish (AGENTS.md §19: the system never adjusts pH automatically, and neither do testers in a live tank).

For each case, record: the time the condition was created, the time the dashboard changed, the time the push arrived, the alert and the recommendation shown, and the time back to NORMAL.

| # | Condition | How to create it safely | Expected classification and rule | Expected alert and recommendation | Restore |
|---|---|---|---|---|---|
| 1 | High temperature | A heater set to 28 °C, or add warm (≤ 35 °C) water slowly; stir | > 24 °C WARNING (`temp_high_warning`), then > 26.4 °C CRITICAL (`temp_high_critical`) | One alert, escalating to CRITICAL with a second push; the recommendation's action and basis come from the rule | Heater off, add cool conditioned water |
| 2 | Low/high pH | Add a small amount of pH buffer (or a pH-down/up product) to a **separate container** of tank water, then lower the probe into it | < 6.5 WARNING (`ph_low_warning`); < 5.85 CRITICAL | pH alert and recommendation ("check with a test kit first" pre-check) | Return the probe to the tank and rinse it |
| 3 | Cloudy water | Stir the gravel/sediment with the filter running, then with the filter off | Turbidity WARNING `turbidity_warning_filter_on`, or `turbidity_warning_filter_off` when the filter is off | Turbidity alert; the recommendation differs by filter state; repeated warnings can bring the cleaning date forward (`cleaning_due_early`) | Let it settle; run the filter |
| 4 | High TDS | Dissolve a pinch of aquarium salt in a cup of tank water and add it, or move the probe to a 600 ppm solution | > 400 WARNING (`tds_high_warning`), > 500 CRITICAL | TDS alert; water-change recommendation | Partial water change, or return the probe |
| 5 | Low water level | Siphon water out to below 70 %, then below 59.5 % | WARNING `water_level_low_warning`, then CRITICAL | Water-level alert | Top up |
| 6 | Power interruption | Unplug the **mains** adapter of the equipment (the ESP32 stays on battery/UPS) | Power CRITICAL (`power_interruption`) | Power Interruption alert and push within ~15 s; the report counts it under Device activity | Plug back in: the alert auto-resolves |
| 7 | Filter stopped | Unplug the filter, or turn it off from the app | Filter WARNING (`filter_inactive`) | Filter alert; combined with turbidity, the filter-off recommendation | Turn the filter on |
| 8 | Device offline | Unplug the ESP32 (or turn off Wi-Fi) for 2 minutes | `device_offline` after 60 s without data | Offline alert; resolves on the next reading | Power it on |
| 9 | Sensor fault | Unplug one temperature probe | "Sensor error" for that sensor; **no** water-quality recommendation (`sensor_fault`) | Sensor-fault alert only | Reconnect |

Expected: every alert is traceable to a rule ID in the recommendation (FR12), and invalid data never yields a water-quality recommendation (case 9).

---

## 4. Performance

Targets (non-functional): **a reading reaches the dashboard in ≤ 5 s**, and **a push notification arrives in ≤ 10 s**. The p95 of the samples must meet the target.

### 4.1 Emulator (software path)

```bash
npm run demo                                   # terminal 1
npm run measure:latency -- --samples 20        # terminal 2
```

The script writes probe readings, measures the time until a subscribed client receives each one, writes one abnormal reading, and measures the time until the server hands the notification to FCM (`alert_records.notifiedAt`). It prints n / min / median / p95 / max and PASS/FAIL against the targets.

### 4.2 Live (read-only)

```bash
node --experimental-strip-types scripts/measure-latency.ts --project practice-smartaqua --database-url <RTDB URL> --aquarium <Tank B id> --observe 15
```

It observes real readings (`receive time − updatedAt`, which needs firmware stage 3a's server timestamp for a fair number) and any alerts raised during §3 (`notifiedAt − reading time`). It writes nothing. `--write-telemetry` writes probe readings to a **demo device only**, after you type both the project ID and the aquarium ID. It is not needed when §3 is run physically.

### 4.3 Phone delivery (manual)

The script stops at the hand-off to FCM. For the full alert → phone time:
1. Start a stopwatch when the condition crosses the threshold (§3: the dashboard turns WARNING).
2. Stop it when the phone shows the notification.
3. Repeat 5 times per case; record each time in the table below.

| Run | Case | Reading → dashboard (s) | Alert → phone (s) | Network (Wi-Fi/4G) |
|---|---|---|---|---|
| 1 | | | | |

---

## 5. Isolation test (2 users, caretakers, organizations)

**Automated (emulator):** `npm run test:security`, `test:firestore-org-rules` (ORG-01..15), `test:rtdb-org-rules`, `test:storage-rules` (STORAGE-01..06), `test:sprint3-e2e`, and the smoke test "caretaker sees only tank 1".

**Manual on the defense build:**

| Account | Org | Can see |
|---|---|---|
| Owner A | Org A (Tank 1, Tank 2) | Tank 1, Tank 2 |
| Caretaker X | Org A, assigned Tank 1 only | Tank 1 |
| Owner B | Org B (Tank 3) | Tank 3 |
| Platform admin | — | All orgs, read-only |

| # | Step | Expected |
|---|---|---|
| I-1 | Owner B opens the app | Sees only Tank 3: no readings, alerts, reports or controls of Org A |
| I-2 | Caretaker X opens Monitoring, Alerts, Data Logs, Reports | Only Tank 1; Tank 2 is absent from every list and selector |
| I-3 | Caretaker X calls Feed Now on Tank 1 | Works (caretaker controls are allowed per `docs/access-model.md` §2) |
| I-4 | In the browser console as Owner B: read `aquariums/<Tank 1>` and `devices/<Tank 1>/telemetry` | Permission denied (rules, not just the UI) |
| I-5 | Owner B opens a Tank 1 report PDF link copied from Owner A | "You do not have access" (Storage rules) |
| I-6 | Owner A removes Caretaker X | X loses Tank 1 immediately (next query or listener is denied) |
| I-7 | Admin suspends Org A | Owner A and Caretaker X see the suspended state; their report files are denied |
| I-8 | Tank 1's ESP32 tries to write Tank 3's telemetry | Denied (device bound to its own tank) |

---

## 6. ISO/IEC 25010 evaluation (questionnaire)

**Respondents:** aquarium owners/caretakers (target n ≥ 10) and IT evaluators (target n ≥ 5), after a guided use of the system (the demo script).

**Scale:** 5 = Strongly agree, 4 = Agree, 3 = Neutral, 2 = Disagree, 1 = Strongly disagree.

### 6.1 Items

**Functional suitability**
1. The system shows all the water parameters I need to monitor (pH, TDS, turbidity, temperature, water level).
2. The NORMAL / WARNING / CRITICAL classification matches the actual tank condition.
3. The maintenance recommendations are appropriate for the condition detected.
4. The reports contain the information I need about my aquarium.

**Performance efficiency**
5. Readings on the dashboard update quickly.
6. Alerts and notifications arrive promptly.
7. Pages and reports load in an acceptable time.

**Compatibility**
8. The system works on my phone and on a computer.
9. The web and mobile apps show the same information.

**Usability (interaction capability)**
10. The system is easy to learn.
11. Adding a device and setting up an aquarium is easy.
12. The screens are clear, and the meaning of each status is easy to understand.
13. I can control the feeder, light and filter easily.

**Reliability**
14. The system works without errors during use.
15. The system tells me clearly when the device is offline or a sensor has a problem.

**Security**
16. I can only see the aquariums I own or am assigned to.
17. Sign-in (including two-step verification) protects my account.

**Maintainability** (IT evaluators)
18. The system is organized in clear modules (devices, rules, alerts, reports).
19. Thresholds and rules can be changed without changing the program.

**Portability / flexibility** (IT evaluators)
20. The system can be installed or deployed on common platforms (web hosting, Android).

### 6.2 Scoring

- Item mean: x̄ = Σ responses / n.
- Characteristic mean: the average of its item means. Overall mean: the average of the characteristic means.
- Also report the standard deviation per characteristic.
- Interpretation (equal intervals of 0.8):

| Mean | Verbal interpretation |
|---|---|
| 4.21 – 5.00 | Strongly agree / Excellent |
| 3.41 – 4.20 | Agree / Very good |
| 2.61 – 3.40 | Neutral / Good |
| 1.81 – 2.60 | Disagree / Fair |
| 1.00 – 1.80 | Strongly disagree / Poor |

- Report the end users and the IT evaluators separately, then combined.

---

## 7. What still needs the hardware or a deploy

- §1 accuracy, §3 physical conditions and §4.3 phone delivery: the device and a deployed build.
- Real TOTP MFA: after Identity Platform is enabled (`docs/migration-live.md` §8).
- FCM delivery to a phone (`docs/notifications.md` §6).
- Ammonia: it is in the scope list of AGENTS.md, but no ammonia sensor is installed. It is not tested and is reported as **not monitored**. This is a scope mismatch for the team to resolve with the adviser.
