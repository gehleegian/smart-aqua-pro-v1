# Monitoring organization context

The organization switcher does not change the authenticated account. A caretaker
signed in as User 2 can view User 1's organization while remaining User 2.
Monitoring previously printed the authenticated profile name beneath its title,
which made that switch look unsuccessful.

UserAquariumList now shows the active organization name explicitly and a separate
signed-in account/membership-role label. Monitoring passes these from useOrg,
not from a tank's ownerName or the authenticated profile's name. The selected
aquarium view also identifies the active organization above its selector.

No database, assignment, authorization, query or hardware changes. This implements
clear user/organization association without impersonation or widening access.
Isolated UI tests cover caretakers, owners, missing context, prop wiring and
organization changes. Verify the signed-in production browser after deployment;
software tests do not inspect a specific user's production memberships.
