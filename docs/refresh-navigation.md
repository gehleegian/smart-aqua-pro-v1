# Browser refresh navigation

Preserve the existing page-name navigation and restore tank selections within the
same browser tab using sessionStorage. Selection keys include authenticated UID,
active organization, membership role, page, and field. No telemetry, tokens,
commands, form drafts or credentials are saved by this feature.

Dashboard, Monitoring, Assessment, Recommendations, Maintenance, Data Logs and
Reports remember their selected aquarium. Reports also remembers the selected
saved report. Explicit tank links override saved selection. Monitoring's Back
action stores an empty selection, preserving the aquarium list instead of
reopening an old tank. Controllers still reload fresh authorized lists and
validate restored IDs against those lists; deleted/revoked tanks fall back to an
available tank or list/empty state. Reports waits for the scoped tank list before
fetching report content.

Reports mounts a separate view keyed by the authorized aquarium ID. Switching
tanks immediately clears the previous tank's list, summary, messages and form
draft. Each refresh has a request version: only the latest response may update
the list or saved report selection. Leaving the view invalidates pending list,
generation and download completions, including failures. Generation already
submitted to Firebase may still finish for its original aquarium, but cannot
refresh or select a report in the newly opened tank. No server cancellation or
new Firebase permissions are introduced.

`tests/unit/reports-request-isolation.test.mjs` runs the actual component with
isolated hooks and deferred services to check out-of-order requests, A/B/A
switching, switching during generation/refresh, returned-report selection, and
pending downloads. It does not connect to Firebase or create monitoring data.

Layout must not treat unresolved authentication as logout: doing so removed the
saved active organization before membership loading. It also must not persist an
initial unauthenticated page over the user's saved page. Explicit logout still
clears page and organization selection. Existing role-based navigation guards
and Firebase authorization remain authoritative and unchanged.

This does not restore unsaved edits, open action dialogs, pagination, scroll
position or every filter. It is not a data cache and does not execute actions on
refresh. No Firebase deployment/migration or hardware changes are required.
Browser acceptance check: select Monitoring/tank B, reload, confirm same view with
fresh readings; repeat for organization B and Reports; revoke assignment and
confirm the restored tank is not shown. Live authenticated browser verification
is separate from isolated software tests.
