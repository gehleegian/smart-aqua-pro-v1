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

## Focused Firestore rollout — 2026-11-12

The live `practice-smartaqua` Firestore rules were missing the two ppm fields
in the aquarium-update allowlist. This caused the updated form's entire save
to be rejected. The deployed source was backed up, extended only with those
fields and their range validation, tested in the Firestore emulator, and
released with exact source read-back verification.

- Implementation: `scripts/lib/tdsRulesPatch.mjs` and
  `scripts/deploy-tds-profile-rules.mjs` (prepare first; apply only the reviewed
  backup candidate). The broader repository rules were not deployed.
- Regression command: `firebase emulators:exec --only firestore --project demo-smartaqua-tds-rollout "node --test tests/firestore/tds-profile-rollout.rules.test.mjs"`.
  Set `TDS_RULES_BACKUP` to the reviewed backup folder to test the exact live
  candidate; otherwise the test uses repository rules and needs no credentials.
- Validation: both bounds must be numeric, finite, nonnegative and strictly
  ordered. Existing profiles without either ppm field remain compatible.
- Authorization: owner checks, organization checks, security blocks and all
  other live rule text are unchanged. No aquarium data or approval metadata
  was modified. Functions, indexes, RTDB and firmware were not deployed.
- Verification: eight exact-candidate security tests and seven form/profile
  tests passed. Tests reproduce rejection under the old live rules and
  acceptance under the candidate. Changed JavaScript files pass lint.
- Rollback: the previous source, ruleset ID, candidate hashes and deployment
  receipt are retained in the ignored local backup folder
  `backups/tds-profile-rules-1794456735847/`. A rollback must first check for
  any subsequent release; never overwrite newer rules blindly.
- Remaining: the owner must retry the actual UI save. That account's data was
  deliberately not edited for testing. Server assessment deployment and
  hardware accuracy verification are separate from this permissions fix.
