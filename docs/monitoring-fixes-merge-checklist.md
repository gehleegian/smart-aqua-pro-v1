# Monitoring fixes: source merge checklist

## Included scope

- Saved owner TDS ppm min/max fields, profile validation and Firestore validation.
- Saved threshold resolution, configuration-versioned server summaries and reports.
- TDS calibration coverage separated from sensor validity and water-quality bounds.
- Category-only Clear/Cloudy/Unknown presentation and shared categorical analytics.
- Independent approved-rule selection and accurate approval-metadata wording.
- Fresh recommendation replacement for legacy approval state, preserving history.
- Turbidity episode continuity across missing/Unknown/invalid data and legacy state.
- Pure, fail-closed preparation helper for the three Cloudy warning conditions.
- Aquarium 1 network/temporary-cloud-failure relay hold and diagnostics.
- Matching web, server and mobile definitions plus regression tests.

Aquarium 2 compensation remains unimplemented. Its experimental dashboard readings
have not been converted into offsets. No Aquarium 2 firmware edits are included.
The owner's upload sketches remain local; the tracked repository Aquarium 1
sketch contains the corresponding network fixes.

## Release checks

The merge preparation ran web/unit/parity tests, mobile Jest tests, TypeScript
checks, production web build, Firestore/RTDB security and backend emulator tests,
changed-source lint, and Aquarium 1 compilation. The PR records exact results.
The production build used an ignored separate output directory; its generated
tsconfig additions were removed, not committed.

Whole-tree mobile lint has a pre-existing no-undef error for jest in
__tests__/stubs/firebase.js. That file is unchanged. Web security/parity test
fixtures also contain existing unused-variable/import warnings. Changed
application sources pass zero-warning lint. Do not conceal baseline issues
or fix unrelated files just to alter the release result.

## Not part of merging

- No fabricated citations, bulk approval, or live analytics activation.
- No synthetic production telemetry, equipment commands or firmware upload.
- No Firebase deployment or live security-rule mutation.
- Local manuscript/appendix worksheets outside the repositories are not published.
- Sensor accuracy and electrical/load compensation are not physically certified.

GitHub merges may invoke existing connected hosting automation. They do not
constitute a Firebase Functions/security-rule deployment or firmware upload.

## Database deployment guard

The voltage-only RTDB field was deployed earlier while preserving live command
validation differences. The repository retains its stricter, emulator-tested
command-ID/ACK validators; those three existing live differences must not be
silently overwritten or blindly copied during a later full rules deployment.
The source merge does not deploy database.rules.json.

Before any later Firebase release, fetch and compare the current live rules,
explicitly review those differences against real command/ACK compatibility,
and preserve aquarium/device authorization. Do not weaken source validation
merely to match a relaxed live snapshot. See aquarium1-turbidity-voltage-test.md.

Firestore TDS-field rules must be released before relying on owner profile
updates in production. Ingestion/report/heartbeat/cleaning consumers and mobile
need their coordinated release. The new private lastValidTurbidityStatus field
uses the existing engine/state document; no new client permission is needed.

Actual supporting references and audited application approval records remain
separate from the owner's confirmation that review already occurred. Merging
these code fixes alone does not create approved pending recommendations.
