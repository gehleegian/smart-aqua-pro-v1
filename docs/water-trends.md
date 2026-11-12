# Descriptive water trends

Newly generated monitoring reports store an optional `trend` on each water
parameter's existing `readings.perParameter` statistics. Web and mobile Reports
show the same description using identical copies of `waterTrends.ts`.

The calculation uses only explicitly valid, finite observations within the
report's elapsed period, ordered by timestamp. Identical duplicate observations
count once; conflicting values at a timestamp are excluded. There are no extra
queries, collections, sensors, thresholds, forecasts, or maintenance rules.

The summary shows first/last values and net change, whether the available
samples rose, fell, varied, or were equal, and intermediate highs/lows. Sample
counts, excluded observations, observed times, and the largest valid-sample gap
are shown. This describes sampled history, not continuous conditions. Sampling
is event-sensitive, so the pattern is not a time-weighted rate or a significance
test. Equal endpoints do not establish stability or sustained recovery.

Invalid or unvalidated observations never become normal water readings. A
high followed by a lower reading is not diagnosed as an equipment fault or
confirmed water-quality recovery. Cleaning schedules, alert classifications,
recommendation lifecycles, authorizations, and rule approvals are unchanged.
The separately discussed cleaning-latch change remains paused.

Older reports without a stored trend show a generate-new-report notice; there
is no destructive backfill or live-data rewrite. The new prose is shown in the
in-app Reports views; existing PDF/CSV formats are unchanged. Deploy the report
generation Functions and update web/mobile clients before generating a report
to see the new section populated. No deployment is performed by this change.

Verification: web unit tests `tests/unit/water-trends.test.mjs` and
`tests/unit/water-trends-ui.test.mjs` (including
cross-repository parity), Functions `test/waterTrendReport.test.ts`, and mobile
`__tests__/water-trends.test.ts`. These are offline arithmetic fixtures, not
generated device telemetry. Physical sensor accuracy still needs hardware
verification.
