# Invitation aquarium routing

Invites store selected aquarium IDs, not display names. Acceptance grants only
those IDs still in the invited organization. Existing caretaker assignments are
additive; an invitation does not revoke earlier legitimate grants. Owners see all
organization tanks by design. Firestore/RTDB authorization remains unchanged.

The web acceptance screen previously ignored returned aquarium IDs, opening the
first available tank or an older notification focus. It now replaces that focus
with the first accepted aquarium before opening Dashboard. Mobile opens that
aquarium directly. Both refresh membership and activate the invited organization
first, and retain the successful result in screen state so a failed membership
refresh can retry without accepting the same single-use invite again.

Web organization-scoped pages are keyed by signed-in user, organization and role,
disposing old page state/subscriptions on context changes. The invite screen has
a stable per-user key to survive its own membership refresh. Mobile Team also
resets form/link state when the active organization changes. Newly created web
links label the recipient and tank names; starting a new creation clears the old
link on both clients to avoid copying an older link after a failed request.

No database migrations, rule changes, new permissions or production data repairs.
Tests cover routing, order of operations, empty accepted IDs and retry handling.
An actual two-account invite/accept check after deployment is still required;
source inspection cannot confirm which assignments are currently saved for a
particular production user. No physical hardware changes or testing required.
