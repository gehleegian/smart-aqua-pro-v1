# SmartAqua Pro Aquarium Profile Contract

Status: Phase 1 shared profile implementation contract
Scope: small-scale freshwater Goldfish aquariums
Authority: accepted project outline and manuscript, with the repository implementation used as the compatibility baseline

## Canonical Firestore representation

The canonical profile is stored on `aquariums/{aquariumId}`. These fields are Firestore profile data, not RTDB telemetry.

| Concept | Canonical field | Type and unit | New-record rule |
| --- | --- | --- | --- |
| Aquarium type | `tankType` | string | Exactly `Freshwater` |
| Tank dimensions | `tankLengthCm`, `tankWidthCm`, `tankHeightCm` | positive numbers, centimetres | Required |
| Operational water volume | `workingWaterVolumeLiters` | positive number, litres | Required |
| Filtration system installed | `hasFiltrationSystem` | boolean | Required; collected as Yes or No |
| Legacy filtration description | `filtrationSetup` | optional non-empty string | Preserved when already stored; not collected by the current Aquarium form |
| Fish species | `species` | one-element string array | Exactly `["Goldfish"]` |
| Fish quantity | `fishCount` | positive integer | Required |
| Individual fish weights | `fishWeightsG` | array of positive numbers, grams | Required; length equals `fishCount` |

`ownerId` remains the aquarium ownership authority. Existing monitoring thresholds, equipment status, automation settings, timestamps, and authorization metadata retain their current responsibilities.

The editable monitoring thresholds include `minPh` and `maxPh`. Both are required for new or completed profiles, must remain within the pH scale of 0–14, and must form an ordered range. These are profile thresholds rather than live readings; live pH telemetry remains stored through the existing monitoring path.

New profiles use an editable **Indoor Goldfish aquarium** preset: temperature `20-24 C`, pH `6.5-7.5`, system water-level default `70%`, and system TDS-purity default `80%`. This preset represents an ordinary indoor home aquarium, not breeding, aquaculture, commercial production, or outdoor pond conditions. The temperature and pH starting range is based on general companion-Goldfish care guidance from [PetMD](https://www.petmd.com/fish/goldfish-care-sheet) and is cross-checked against the [Aqueon Goldfish Care Guide](https://www.aqueon.com/resources/care-guides/goldfish). Water-level and TDS-purity values are application defaults requiring sensor calibration rather than biological Goldfish standards. Existing profiles retain their saved values and users may adjust every threshold.

## Derived values

The applications calculate these values from the canonical source fields:

```text
totalFishBiomassG = sum(fishWeightsG)
estimatedBioloadGL = totalFishBiomassG / workingWaterVolumeLiters
```

The derived values are not persisted. They are recomputed after loading a profile and while editing it. This prevents a client from writing a conflicting total or estimated bioload. Filtration configuration never changes the calculation. No LOW, MEDIUM, or HIGH bioload boundary is defined or inferred.

The web domain model exposes `totalFishBiomassG` and `estimatedBioloadGL` as read-only derived properties for display. The mobile mapper performs the same calculation. A legacy stored `bioload` category remains readable internally for compatibility but is not used or shown as the current calculated value.

`hasFiltrationSystem` records only whether a filtration system is installed. The profile does not collect filter type, rated capacity, or flow. When an older record has a non-empty `filtrationSetup` but no canonical boolean, readers infer `hasFiltrationSystem = true`; if neither field exists, the filtration choice remains incomplete until the owner edits the profile. Existing `filtrationSetup` text is preserved but is not exposed as a current form field.

## Legacy compatibility

Existing aquarium records may omit `fishWeightsG` or other canonical profile fields. Readers do not invent values. The UI displays `Not Configured`, and live telemetry, historical records, controls, classifications, and recommendations continue using their existing paths and logic. An owner must complete the missing canonical fields before saving an edited profile.

The following older fields remain readable and are not destructively renamed or removed:

- `tankSizeLiters`
- `tankSizeCategory`
- `filterCapacity`
- `filtrationSetup`
- `fishProfiles`
- `bioload`

## Authorization and validation

- Only the authenticated, protected, non-Admin owner can create or update their aquarium profile under the existing Firestore rules.
- `ownerId`, ownership transitions, authorization blocks, and trusted lifecycle mutations remain protected.
- New aquarium records require the canonical source fields, including an explicit filtration-system Yes/No choice.
- Profile changes still use the existing atomic aquarium/directory batch.
- Client writes of `totalFishBiomassG` and `estimatedBioloadGL` are denied because those fields are outside the allowlist.
- Firestore Rules validate a positive integer count, a list with matching length, and a positive numeric first weight. Firestore Rules cannot iterate over an arbitrary-length list, so the web client validates every weight. Full server-side validation of every array item remains a trusted-backend hardening item if profile mutations later move behind a callable API.

## Admin directory projection

`aquarium_directory/{aquariumId}` remains an Admin-safe descriptive projection. Directory schema version 3 includes `hasFiltrationSystem` while preserving optional legacy `filtrationSetup` data. It does not contain individual weights, derived bioload, live readings, RTDB control data, or commands. Admin access therefore remains directory-only and does not gain aquarium monitoring or equipment-control permissions.

## Monitoring and reporting boundary

Monitoring displays estimated bioload as `Profile derived`, separate from live readings. It does not create an RTDB listener, historical sensor field, alert threshold, condition category, or prescriptive rule. Existing reports and sensor schemas are unchanged.
