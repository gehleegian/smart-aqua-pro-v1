# Aquarium TDS limits in ppm

Web and mobile aquarium profiles accept **Minimum TDS (ppm)** and **Maximum TDS
(ppm)** instead of the legacy minimum purity percentage. The existing aquarium
document and assessment engine are reused; no recommendation rules are added.

## Storage and validation

- `aquariums/{id}.minTdsPpm` and `maxTdsPpm` are a pair of finite numbers.
- Minimum must be nonnegative and strictly lower than maximum.
- Existing `minQuality` percentages are preserved, never converted to ppm.
- Legacy profiles need explicit ppm entry (or web defaults from stored species
  configuration) when next saved. Without ppm limits, approved species TDS
  defaults remain in effect; inactive draft defaults are not silently activated.
- Administrator `thresholdOverrides.tdsPpm` retains priority over owner limits.
- Only authorized owners may update these fields under existing aquarium access
  checks. Role, assignment, organization, and RTDB permissions are unchanged.

## Assessment behavior

Web, mobile, server ingestion, and report threshold resolution read the same ppm
fields. Valid saved temperature, pH, minimum water level and TDS ppm limits drive
this aquarium's live classification independently of recommendation-rule
approval. Existing approved recommendation rules consume those same limits.
No recommendation approval metadata is changed. See user-threshold-policy.md.

The 80–314 ppm meter-comparison span describes calibration coverage, not a
sensor-failure boundary. Positive finite ppm is compared with user limits.
Explicitly invalid, zero, negative or malformed readings remain unavailable.
Measurement accuracy outside the checked span still needs meter verification.
No ESP32 calibration or compensation code changes are required.

## Release requirements

Deploy updated Firestore rules before releasing the profile forms. Redeploy the
existing telemetry-ingestion function so server classifications, alerts, and
historical threshold snapshots use the saved limits. Deploy web and rebuild/install
mobile for the new controls. No data migration is required.

Local unit, form, parity, and emulator checks exercise configuration and existing
assessment paths, not physical sensor accuracy. Production deployment and a
post-deployment save/telemetry smoke test remain separate steps.
