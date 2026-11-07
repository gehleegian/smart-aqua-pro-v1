# SmartAqua Pro: Team Quickstart

- **Website:** https://smartaqua-pro.vercel.app
- **Android app:** `smartaqua-pro-production.apk` (ask Jay for the file). Install it, and allow "install unknown apps" if your phone asks.

The website and the app use the same accounts and data.

## 1. Log in

1. Open the website or the app and sign in with your email and password, or tap **Sign up** to make an account.
2. **Verify your email.** Open the link in the verification email first. You can't add a device or accept an invite until your email is verified.
3. A new account with no tanks sees two choices: **Add your first device** or **Waiting for an invite**.

## 2. Register a device (Add Device)

You need the device's label. It shows a QR code, a **Device ID** (`SAQ-XXXX-XXXX`) and an 8-character **claim code**.

1. Plug in the device and connect it to Wi-Fi. See Gian if it isn't online yet.
2. Tap **Add Device**.
3. **Scan the QR code** on the label (phone camera), or **type the Device ID and claim code**.
4. Name the tank. On your first device you can also name your organization, for example "Davao Pet Shop".
5. **Setup wizard:** fill in the tank size (L×W×H), filter, fish species and fish count, review the thresholds, then tap **Finish**.

The person who registers a device becomes its **Owner**. Each code works only once.

Common errors:
- **"Invalid code"** means a wrong ID or code.
- **"Already registered"** means someone already claimed the device; ask its owner.
- **"Too many attempts"**: wait one hour and try again.

## 3. Invite a caretaker

1. As an Owner, open **Team**.
2. Enter the caretaker's email and tick the tanks they may see.
3. **Copy the invite link** and send it yourself (Messenger, SMS). The app does **not** send an email. The link works for 48 hours.
4. The caretaker opens the link and signs up or logs in with **that same email**, verifies it, and accepts.
5. To cancel an invite that hasn't been used yet, tap **Revoke** on the Team page. To take someone's access away, tap **Remove**.

## 4. What each role can do

| | Owner | Caretaker | Platform Admin |
|---|---|---|---|
| See live readings, history, alerts, recommendations, reports | All tanks in the org | Assigned tanks only | All (read-only) |
| Feed now, light and filter on/off | ✅ | ✅ assigned tanks | ❌ |
| Log maintenance, apply or dismiss recommendations | ✅ | ✅ assigned tanks | ❌ |
| Generate reports (PDF/CSV) | ✅ | ✅ assigned tanks | Read only |
| Edit tank profile, thresholds, schedules | ✅ | ❌ | ❌ |
| Add devices, invite or remove caretakers, make co-owners | ✅ | ❌ | ❌ |
| Suspend organizations; edit and approve rules | ❌ | ❌ | ✅ |

## 5. Known limitations (current version)

- **Device commands show "No response."** Feed, light and filter commands are sent, but the current firmware doesn't confirm them yet. The command log shows **No response** (grey) until Gian's firmware update adds acknowledgements. Check the tank itself to see whether the command worked.
- **"Draft thresholds" badge.** The goldfish thresholds and rules are drafts until our adviser signs them off. Alerts and recommendations work, but they use these draft values.
- **TDS and turbidity.** Aquarium 1's TDS sensor currently reports invalid readings, so you'll see a "Sensor fault" instead of a TDS value. No numeric turbidity reading is sent yet (it shows "Not monitored"). Both need Gian's firmware update.
- **Power interruption alerts** need the firmware update (mains sensing). Until then, a device that goes silent shows as **offline** after about 60 s.
- **Two-step verification (MFA)** is not switched on yet.
- **Web push alerts** aren't configured on the website yet. In-app alerts work.

## 6. Who to contact

| Topic | Contact |
|---|---|
| Accounts, website, Android app, invites | Jay Salamanes |
| Devices, firmware, Wi-Fi setup, labels, sensor problems | Gian Carlo R. Marin |
| Wendyl Ziv S. Arellano, Dennis Mark L. Jamero | Team members, for testing and feedback |
