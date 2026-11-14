# Admin device inventory

The web admin menu contains **Device Inventory**. It provides read-only
registration, ownership, sensor inventory and live connectivity information.
It does not add equipment controls or claim to measure physical power state.

## Sources and permissions

- Firestore `device_registry`: all provisioned devices, including unclaimed
  stock. Both `status`/`claimedBy` and `state`/`ownerUid` formats are supported.
- `aquarium_directory`: current primary owner overrides the original claimant
  after an ownership transfer.
- `users`: current owner name/email. Caretakers are not labelled as owners.
- RTDB `devices/{aquariumId}/telemetry`: only for claimed, bound devices.

Admin role/email access are checked before subscriptions; existing Firebase
rules remain authoritative. The admin inventory is read-only. No security rules,
collections, firmware or deployment configuration are changed. Navigation is restricted to Admin.
Claim hashes and credentials are excluded from retained/displayed records.
No history, controls, commands or sensor reading values are displayed.

## Connection semantics

The existing shared helper defines the 60-second heartbeat freshness window.
The page reevaluates every five seconds even if a device stops reporting.
RTDB server clock offset is applied locally to this page.

- Online: a fresh timestamped heartbeat explicitly reports `online: true`.
- Offline: stale heartbeat or an explicit offline report.
- Not reporting: missing/malformed timestamp, heartbeat or online flag.
- Unavailable: browser disconnected from RTDB, or read failed.
- Unassigned: registration is not claimed or has no aquarium binding.

Offline cannot distinguish power loss, Wi-Fi loss, device failure or stopped
firmware. Sensor errors are independent of connectivity. Physical behavior
still requires hardware testing. No artificial telemetry is generated.

## Sensor quantities

Existing registry records do not consistently record physical quantities.
One averaged temperature field cannot reveal how many probes are installed.
The owner confirmed on 14 November 2026 that Aquarium 1 and Aquarium 2 each
have one pH, one TDS, one ultrasonic water-level, one turbidity and two
temperature sensors: six sensors per enclosure. Lighting and filtration are
listed separately as equipment. `src/config/deviceHardware.ts` associates
this installation only with the two enclosure IDs in current firmware. It
does not assume future devices have the same hardware or prove sensor health.

The UI supports optional trusted `sensorInventory` metadata on the existing
registry document: an array of `{type, count}` with positive integer quantities.
Types: `temperature`, `ph`, `tds`, `turbidity`, `waterLevel`, `ammonia`.
Invalid/duplicate/incomplete metadata is not counted. New-device owners record
hardware through setup confirmation, not through admin-side editing.

Without registry metadata or a confirmed installation, the page says
**Physical count not recorded**, and lists
**reported types** from the latest payload. A validity flag counts as a reported
type even if the reading is invalid. Types are not physical sensor quantities
or proof of sensor health; missing types do not prove sensors were removed.

## Per-sensor reporting and navigation

The inventory uses responsive device cards instead of a wide table. Each card
shows the owner, device connection, last heartbeat and sensor-status tiles.
Native keyboard-accessible Device details disclosures contain equipment,
ownership and inventory-source records. Search, connection/sensor filters,
Clear filters, continuous row numbering and pagination remain client-side.

Each configured sensor channel is Reporting, Fault or Unknown. The inventory
parser uses the existing shared validity checks but retains only a diagnostic
status/reason, never measured reading values. Reporting requires an explicit
true validity flag plus a valid sample; Fault requires an explicit false flag.
Malformed, missing or unsupported diagnostics are Unknown. A fresh Online
device connection is required for any current Reporting/Fault badge. Stale,
offline, disconnected or denied subscriptions make sensor statuses Unknown.
These labels do not report electrical power, verify accuracy, classify water
conditions or generate maintenance recommendations.

Current firmware sends one combined temperature value and validity flag for
the two temperature probes. The UI therefore labels Temperature x 2 as a shared
channel and explicitly says individual probe status is unknown. It never
invents two independent live probe states. Separate probe diagnostics would
require a future firmware/telemetry change. No such firmware changes, new
subscriptions, backend writes or security-rule changes are made for this UI.

## New-device confirmation (web and mobile)

Newly claimed devices in `status: setup` have a Hardware step after Tank.
Owners select sensors, probe quantities, and lighting/filter/feeder equipment,
then acknowledge that the checklist matches the installed hardware. Nothing
is selected by default without recorded metadata. Quantities must be whole
numbers from 1 to 100 (administrative form bounds, not water thresholds).
Filtration presence follows this checklist to avoid conflicting answers.

The new `deviceHardwareSetup` callable reads a whitelisted inventory for an
owner and transactionally saves to the existing `device_registry`:
`sensorInventory`, `equipmentInventory`, `hardwareConfirmedAt`, and
`hardwareConfirmedBy`. It writes one `device.hardware.confirm` audit log.
It checks verified human identity, User profile, active organization, owner
membership, and exact aquarium/device UID binding. Admins and caretakers
cannot change it. Rules still deny direct client registry writes.
Identical retries are safe; confirmed hardware cannot be silently overwritten.
Hardware saves before the existing profile finish operation; hardware-save
failure never activates the aquarium. If only profile saving fails, the
confirmation stays saved and the profile operation can be retried.

Aquarium 1/2's exact enclosure IDs are exempt with no migration, profile
change, repeat wizard or prompt. Already-active legacy aquariums are not forced
back into setup. A resumed new setup with saved confirmation skips the step.
All three runtimes use parity-tested definitions.

Deploy the callable using the established safe Functions upload configuration
before publishing the updated web/mobile clients. No production deployment or
record migration is performed here. Existing clients are not forcibly blocked;
this is a setup workflow, not a new sensor-health gate.

## Pagination and cost

Search, connection filters, numbering and pagination reuse client pagination.
They paginate loaded records, not backend reads. Metadata subscriptions load
the inventory; one telemetry listener per distinct claimed aquarium supports
fleet-wide live totals. No historical reads or composite indexes are needed.
For a much larger fleet, use a trusted paginated status projection instead of
claiming client slicing reduces Firebase reads. Listeners are released on
unmount, failure and session change.

## Verification

Unit/UI/service tests cover metadata sanitization, both registry formats,
current ownership, sensor counts, missing/invalid/stale heartbeat, disconnects,
authorization, cleanup, search, pagination and numbering. Hardware accuracy,
real device transitions and deployed security rules require separate checks.
