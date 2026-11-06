# Rule matrix (DRAFT, for adviser sign-off)

Generated from `scripts/seed/goldfish-draft.json` by `node scripts/rule-matrix.mjs > docs/rule-matrix.md`. Do not edit by hand; edit the JSON and regenerate.

**Every value below is a DRAFT** taken from common aquarium-keeping ranges. None is cited or approved yet (`status: draft`, `source: TBD`). How to approve: `docs/rule-engine.md` §6.

## Goldfish thresholds (`species/goldfish`)

| Parameter | Draft range | Status | Source |
|---|---|---|---|
| Temperature (°C) | min 20, max 24 | draft | TBD |
| pH | min 6.5, max 7.5 | draft | TBD |
| TDS (ppm) | min 100, max 400 | draft | TBD |
| Turbidity (NTU) | max 5 | draft | TBD |
| Water level (%) | min 70 | draft | TBD |
| Bioload bands (g/L) | light ≤ 1, moderate ≤ 3, heavy above | draft | TBD |
| Cleaning interval (days) | light 14, moderate 10, heavy 7 | draft | TBD |
| Early cleaning | TDS +30% over the post-cleaning baseline, or turbidity WARNING 2× in 24 h | draft | TBD |

`min`/`max` in a condition mean the aquarium's **effective** threshold: the species value above, unless the aquarium overrides it. `+10%` means 10 % of the threshold beyond it (e.g. `gt max +10%` with max 24 °C triggers above 26.4 °C).

## Rules (27)

| # | Rule ID | Parameter | Condition | Extra checks | Severity | Priority | Action | Basis | Check first | Status | Source |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `temp_high_critical` | temperatureC | `gt max +10%` | — | critical | 10 | Act now: move the tank away from heat sources and direct sunlight, increase aeration and room ventilation, and lower the temperature gradually. If you change water, use conditioned water only slightly cooler than the tank; avoid sudden changes. | Water much warmer than the configured maximum holds noticeably less dissolved oxygen; the range is for indoor goldfish keeping. | Confirm the reading with a separate aquarium thermometer. | draft | TBD |
| 2 | `temp_low_critical` | temperatureC | `lt min −10%` | — | critical | 10 | Act now: check the room temperature and any heater, and warm the water gradually; avoid sudden changes. | The temperature is well below the configured minimum for indoor goldfish. | Confirm the reading with a separate aquarium thermometer. | draft | TBD |
| 3 | `temp_high_warning` | temperatureC | `gt max` | — | warning | 20 | Check for heat sources (sunlight, lights, room heating) and improve ventilation; let the temperature come down gradually. | The temperature is above the configured maximum for indoor goldfish. | Confirm the reading with a separate aquarium thermometer. | draft | TBD |
| 4 | `temp_low_warning` | temperatureC | `lt min` | — | warning | 20 | Check the room temperature and any heater; bring the temperature up gradually. | The temperature is below the configured minimum for indoor goldfish. | Confirm the reading with a separate aquarium thermometer. | draft | TBD |
| 5 | `ph_high_critical` | ph | `gt max +10%` | — | critical | 10 | Test pH with a calibrated kit. Check the source water and decorations or substrate that raise pH. Plan a partial water change with conditioned water of normal pH. Do not dose chemicals automatically. | pH well above the configured maximum. SmartAqua Pro never adjusts pH automatically. | Confirm with a calibrated pH test kit or a freshly calibrated probe. | draft | TBD |
| 6 | `ph_low_critical` | ph | `lt min −10%` | — | critical | 10 | Test pH with a calibrated kit. Do a partial water change with conditioned water, remove decaying food or debris, and check filter maintenance. Do not dose chemicals automatically. | pH well below the configured minimum; falling pH often accompanies accumulated waste. | Confirm with a calibrated pH test kit or a freshly calibrated probe. | draft | TBD |
| 7 | `ph_high_warning` | ph | `gt max` | — | warning | 20 | Test pH with a calibrated kit and check the source water; if confirmed, plan a partial water change with conditioned water. Avoid rapid pH changes. | pH is above the configured maximum. | Confirm with a calibrated pH test kit or a freshly calibrated probe. | draft | TBD |
| 8 | `ph_low_warning` | ph | `lt min` | — | warning | 20 | Test pH with a calibrated kit; remove uneaten food and debris and plan a partial water change with conditioned water. | pH is below the configured minimum. | Confirm with a calibrated pH test kit or a freshly calibrated probe. | draft | TBD |
| 9 | `tds_high_critical` | tdsPpm | `gt max +25%` | — | critical | 10 | Do a partial water change with conditioned water soon, remove debris, reduce feeding, and check the cleaning history. | Dissolved solids well above the configured maximum indicate accumulated waste or minerals. | Check the TDS probe calibration and that it is fully submerged. | draft | TBD |
| 10 | `tds_high_warning_heavy_bioload` | tdsPpm | `gt max` | `bioloadLevel eq heavy` | warning | 15 | Heavy bioload: schedule a partial water change soon and reduce feeding; review whether the tank is overstocked for its working volume. | TDS is above the configured maximum and the computed bioload is heavy, so waste builds up faster. | Check the TDS probe calibration and the fish weights in the aquarium profile. | draft | TBD |
| 11 | `tds_high_warning` | tdsPpm | `gt max` | — | warning | 20 | Plan a partial water change with conditioned water and review feeding amounts. | TDS is above the configured maximum. | Check the TDS probe calibration and that it is fully submerged. | draft | TBD |
| 12 | `tds_low_warning` | tdsPpm | `lt min` | — | warning | 20 | Check the source water and the TDS probe calibration before changing anything. | TDS is below the configured minimum; very low readings are often a probe or source-water issue. | Check the TDS probe calibration and that it is fully submerged. | draft | TBD |
| 13 | `turbidity_critical` | turbidity | `gt max +100%` | — | critical | 10 | Check that the filter is running, remove uneaten food and debris, and do a partial water change with conditioned water. | Turbidity is far above the configured maximum. | Confirm visually and check that the turbidity sensor is clean and calibrated. | draft | TBD |
| 14 | `turbidity_warning_filter_off` | turbidity | `gt max` | `filterState eq Inactive` | warning | 10 | The filter reports inactive: turn it back on (or find out why it stopped), then recheck turbidity after it has run for a while. | Turbidity is above the configured maximum while filtration is not running. | Confirm visually and check that the turbidity sensor is clean. | draft | TBD |
| 15 | `turbidity_warning_filter_on` | turbidity | `gt max` | `filterState eq Active` | warning | 20 | The filter is running but the water is cloudy: rinse the filter media in tank water, remove uneaten food, and reduce feeding. | Turbidity is above the configured maximum even though filtration is active, which points to clogged media or excess waste. | Confirm visually and check that the turbidity sensor is clean. | draft | TBD |
| 16 | `turbidity_warning` | turbidity | `gt max` | — | warning | 30 | Remove uneaten food and debris and check the filter. | Turbidity is above the configured maximum (filter status unknown). | Confirm visually and check that the turbidity sensor is clean. | draft | TBD |
| 17 | `water_level_low_critical` | waterLevelPercent | `lt min −15%` | — | critical | 10 | Check for leaks now, make sure the filter and any heater are not running dry, and top up with conditioned water. | The water level is well below the configured minimum. | Look at the tank and confirm the level sensor is not obstructed. | draft | TBD |
| 18 | `water_level_low_warning` | waterLevelPercent | `lt min` | — | warning | 20 | Top up with conditioned water and check for evaporation or leaks. | The water level is below the configured minimum. | Look at the tank and confirm the level sensor is not obstructed. | draft | TBD |
| 19 | `power_interruption` | power | `eq "Power Interruption"` | — | critical | 10 | Mains power is off. Check the outlet and breaker. The device is on backup power; the filter, light and feeder may be off until mains returns. | The device reports that mains power is missing (mainsPresent = false) while it is still online. | Check whether other appliances on the same circuit have power. | draft | TBD |
| 20 | `power_offline` | power | `eq "Offline"` | — | critical | 10 | Check the power supply to the aquarium equipment. | The device reports its power status as Offline. | Check the outlet and the adapter. | draft | TBD |
| 21 | `equipment_fault` | equipment | `eq "Fault"` | — | critical | 10 | Inspect the affected equipment and keep automation off until it is verified to work. | The device reports an equipment fault. | Check the device status details and the equipment by eye. | draft | TBD |
| 22 | `equipment_warning` | equipment | `eq "Warning"` | — | warning | 20 | Inspect the equipment the device flags and recheck after correcting it. | The device reports an equipment warning. | Check the device status details. | draft | TBD |
| 23 | `filter_inactive` | filter | `eq "Inactive"` | — | warning | 20 | Check the filter power, flow and blockage, and the filtration schedule. | An installed filtration system reports inactive operation. | Check whether the filter is intentionally off (manual mode or schedule). | draft | TBD |
| 24 | `device_offline` | device | `eq "offline"` | — | warning | 10 | Check the device power and Wi-Fi. Readings and alerts are paused until it reconnects. | No telemetry for longer than the 60 s offline window (3 missed sends). | Check the router and whether the device LED shows it is powered. | draft | TBD |
| 25 | `sensor_fault` | device | `eq "sensor_fault"` | — | warning | 10 | Check the {sensor} probe connection or calibration. | The reading is missing, flagged invalid, or physically impossible, so it is treated as a sensor problem and not as a water condition (AGENTS.md §5). | Confirm the probe is connected and submerged. | draft | TBD |
| 26 | `cleaning_due_early` | maintenance | `eq "cleaning_due_early"` | — | warning | 10 | Clean the tank now rather than waiting for the scheduled date: partial water change with conditioned water, rinse the filter media, and log the cleaning. | TDS rose by the configured percentage since the first reading after the last cleaning, or turbidity reached WARNING repeatedly within 24 hours. | Check the TDS and turbidity probes before cleaning. | draft | TBD |
| 27 | `cleaning_due` | maintenance | `eq "cleaning_due"` | — | warning | 20 | Clean the tank: do a partial water change with conditioned water, rinse the filter media in tank water, and log the cleaning. | The cleaning interval for this aquarium bioload has passed since the last logged cleaning. | Check when the tank was last cleaned. | draft | TBD |

## Sign-off

| Item | Approved value (if changed) | Citation | Approved by | Date |
|---|---|---|---|---|
| Goldfish thresholds | | | | |
| Bioload bands and cleaning intervals | | | | |
| `temp_high_critical` | | | | |
| `temp_low_critical` | | | | |
| `temp_high_warning` | | | | |
| `temp_low_warning` | | | | |
| `ph_high_critical` | | | | |
| `ph_low_critical` | | | | |
| `ph_high_warning` | | | | |
| `ph_low_warning` | | | | |
| `tds_high_critical` | | | | |
| `tds_high_warning_heavy_bioload` | | | | |
| `tds_high_warning` | | | | |
| `tds_low_warning` | | | | |
| `turbidity_critical` | | | | |
| `turbidity_warning_filter_off` | | | | |
| `turbidity_warning_filter_on` | | | | |
| `turbidity_warning` | | | | |
| `water_level_low_critical` | | | | |
| `water_level_low_warning` | | | | |
| `power_interruption` | | | | |
| `power_offline` | | | | |
| `equipment_fault` | | | | |
| `equipment_warning` | | | | |
| `filter_inactive` | | | | |
| `device_offline` | | | | |
| `sensor_fault` | | | | |
| `cleaning_due_early` | | | | |
| `cleaning_due` | | | | |
