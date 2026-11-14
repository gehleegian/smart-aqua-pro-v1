# Soft light appearance (web and mobile)

Web light-mode slate tokens now use muted gray-green surfaces rather than white
or near-white cards/backgrounds. Primary text remains dark; secondary text,
status text, filled actions, input surfaces/placeholders and focus indicators
use contrast-tested colors. Dark-mode tokens remain unchanged. White is retained
where appropriate for text on filled actions, QR-code backgrounds and switches.

Mobile uses matching primary palette values and now supports a real Soft light /
Dark preference in Settings > Appearance. The previous mobile light tokens were
copies of dark mode and useTheme always returned dark. The new preference is
saved only in device AsyncStorage, defaults to the existing dark appearance,
updates subscribers immediately and cannot be overwritten by a late initial
storage read. Root navigation, native tabs, status bar, loading screens, profile
sections, schedule inputs, links and shared components honor the chosen palette.

Files: web globals.css; mobile light-palette/theme constants, appearance store,
use-theme, root/tabs/settings, and affected shared form components. No Firebase,
database, access-control, thresholds or equipment behavior changes. No new native
dependencies. Standalone APKs must be rebuilt to include the JavaScript changes.

Tests calculate WCAG contrast for primary/secondary/status text and filled
buttons (at least 4.5:1 on tested opaque palette surfaces), and focus/control
colors (at least 3:1 on tested pairs). These checks do not assert that every
possible transparent background, image or chart combination has been audited.
Unit tests also cover saved preferences and reactive switching. Visual comfort
is subjective; a signed-in browser and physical-phone review remains required.
