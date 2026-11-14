# Web appearance: sky blue on white (light) and black (dark)

The web app has two themes, switched with the sun/moon button in the header.

- **Light:** white cards on a very light page (`#eef7fd`), dark slate text,
  sky-tinted borders and secondary surfaces.
- **Dark (default):** true black page (`#000000`), near-black panels
  (`#121215`), neutral grey text.
- **Accent (both themes):** sky blue `#54b6f2`. Filled sky-blue surfaces
  (primary buttons, the active menu item, avatar) use dark navy text
  (`#082f49`, 6:1 contrast) because white text on this blue is only about
  2.3:1. Sky-blue text on white uses the deeper `#0369a1` (5.9:1).

All colours are defined once in `src/app/globals.css`. Components keep using
the existing `slate-*` and `teal-*` utilities; the tokens map them to the
neutral and sky-blue palettes above, so no page needs its own colours.

The layout is intentionally flat: no blur, glow, gradient washes or animated
underwater background on app and sign-in screens. Cards have one thin border
and a light shadow. The header holds only the page title, organization,
theme, notifications, the account avatar (name and role on wide screens) and
an icon-only log out.

`tests/unit/soft-light-theme.test.mjs` checks WCAG contrast (at least 4.5:1)
for text on page, card and secondary surfaces in both themes and for navy
text on the sky-blue fills. It does not audit every transparent overlay or
chart colour. The mobile app has its own palette (`smart-aqua-mobile`) and was
not restyled in this change; the web/mobile palette comparison test fails
until the mobile palette file exists and matches.
