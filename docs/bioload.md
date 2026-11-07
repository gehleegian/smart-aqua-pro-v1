# Bioload level (DRAFT — citation needed)

**Status: DRAFT.** The formula is a project working definition; the band limits and cleaning intervals are draft values from common aquarium-keeping practice. **None has a citation or adviser approval yet.** They are stored as data in `species/goldfish` (`bioloadBandsGPerL`, `cleaningIntervalDays`, `earlyCleaning`), so approved values replace them without a code change.

This is a rule-based schedule, not a prediction. SmartAqua Pro does not model fish health or growth.

## 1. Inputs (aquarium profile)

| Field | Meaning |
|---|---|
| `fishCount` | Number of fish |
| `fishWeightsG` | Weight of each fish in grams; one entry per fish |
| `workingWaterVolumeLiters` | Operational water volume in litres |

## 2. Formula

```
totalBiomassG   = sum(fishWeightsG)
stockingDensity = totalBiomassG / workingWaterVolumeLiters      (g per L)

bioloadLevel = light     if stockingDensity <= lightMax
             = moderate  if stockingDensity <= moderateMax
             = heavy     otherwise
```

Draft bands: `lightMax = 1 g/L`, `moderateMax = 3 g/L`. A tank with no fish (`fishCount = 0`) is `light`.

If the profile is incomplete (no volume, or `fishWeightsG` does not have exactly `fishCount` positive entries), the bioload is **unknown** and no cleaning schedule is produced. The system does not guess.

Code: `computeBioload()` in `src/utils/monitoringAssessmentCore.ts`. The result is stored on the aquarium doc as `bioloadLevel` by the functions.

Note: the existing `bioload` field (`low | medium | high`) and the profile's `estimatedBioloadGL` are left unchanged. `bioloadLevel` is the engine's value.

## 3. Next-cleaning schedule

| Step | Rule (draft values) |
|---|---|
| Last cleaned | Newest `maintenance_actions` record with `actionType: "cleaning"` (`performedAt`, epoch ms). If none, the aquarium's `createdAt`. |
| Interval | By bioload: light **14** days, moderate **10**, heavy **7** |
| Due date | `nextCleaningDue = lastCleanedAt + interval` |
| Early: TDS | If TDS has risen **≥ 30 %** over the first valid TDS reading after the last cleaning, the due date moves to **now** |
| Early: turbidity | If turbidity entered WARNING (or worse) **twice within 24 h**, the due date moves to **now** |
| Latching | An early trigger is kept for the rest of the cleaning cycle, even if the reading recovers |
| Recommendations | `cleaning_due_early` when an early trigger fires; `cleaning_due` (daily check) once the date passes. Each at most once per cleaning cycle. A logged cleaning starts a new cycle and closes pending cleaning recommendations. |

Early triggers apply only before the interval date. Once that date has passed, the reason stays `interval`.

The summary is stored on the aquarium doc as `cleaning`:
`{ status, nextCleaningDue, reason (interval | tds_rise | turbidity_repeat | bioload_unknown | no_species_config), lastCleanedAt, lastCleanedSource, intervalDays, bioloadLevel, evaluatedAt }`.

Code: `computeCleaningSchedule()` (shared core) and `advanceCleaning()` (`functions/src/ruleEngine.ts`). Tests: `tests/unit/rule-engine.test.mjs` (bioload, cleaning) and CLEAN-01..05 in `functions/test/telemetryIngest.test.ts`.

## 4. Needs a decision / citation

- [ ] A cited source for using stocking density (g/L) as the bioload measure for goldfish.
- [ ] Approved band limits (`lightMax`, `moderateMax`).
- [ ] Approved cleaning intervals per band.
- [ ] Approved early-cleaning triggers (TDS rise %, turbidity count and window).
