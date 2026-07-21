# Firebase Security Rules

This repo now keeps Firebase rules under version control so the intended security model is visible in code review and deployable from the project root.

## Files

- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`

## Firestore policy

The Firestore rules are written for the data model already used by the website:

- `users/{uid}`
  - a user can create their own profile at signup
  - a user can read their own profile
  - admins can read every profile
  - admins can change roles or delete other users
- `aquariums/{aquariumId}`
  - owners can read, update, and delete their own aquariums
  - admins can manage all aquariums
  - non-admin owners cannot change `ownerId` or `ownerName`
- `sensor_readings/{readingId}`
  - owners and admins can read the readings for their aquariums
  - owners and admins can create readings for their aquariums
  - readings are immutable after creation for non-admin users
- `alert_records/{alertId}`
  - owners and admins can read alert records for their aquariums
  - owners and admins can create and update alert records for their aquariums
  - only admins can delete alert records
- `monitoring_reports/{reportId}`
  - owners and admins can read monitoring reports for their aquariums
  - owners and admins can create reports for their aquariums
  - each created report must record the signed-in user in `generated_by`
  - only admins can delete monitoring reports
- `deviceControls/{aquariumId}`
  - owners and admins can read and write the current device control state
- `feederLogs/{logId}` and `filtrationLogs/{logId}`
  - owners and admins can create and read their own log entries
  - only admins can delete or modify log entries after creation

## Realtime Database policy

The RTDB rules are written for a production model where each device node stores its owner:

```text
devices/
  {aquariumId}/
    ownerId
    control/
    commands/
    telemetry/
    history/
```

The rules assume:

1. `devices/{aquariumId}/ownerId` is present
2. admin users have the Firebase Auth custom claim:

```json
{ "admin": true }
```

3. device clients authenticate with a Firebase Auth token that carries:

```json
{ "device_id": "{aquariumId}" }
```

This lets the rules enforce:

- owners and admins can read their device shadow and history
- owners and admins can write `control` and `commands/latest`
- only the device token (or an admin) can write `telemetry` and `history`

## Important deployment note

The repo currently uses the simpler Arduino setup again, so the website no longer exposes device-credential provisioning.

If you later decide to fully enforce device-identity writes for RTDB telemetry/history, you will need an additional provisioning flow outside the current website setup.

## Deploy

From the project root:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## One-time history migration

To copy old RTDB history into Firestore `sensor_readings`, set:

- `GOOGLE_APPLICATION_CREDENTIALS`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_PROJECT_ID`

Then run:

```bash
npm run backfill:sensor-readings -- alM2myUEMcNgWj9CkZ6T
```
