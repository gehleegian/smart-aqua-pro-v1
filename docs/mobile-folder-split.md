# Mobile Folder Split

Target repo shape:

```txt
apps/
  mobile/   React Native + Expo app
packages/
  shared/   Firebase, auth, roles, types, validation, business rules
src/        Current web app until it is migrated later
```

Shared first:

- Firebase bootstrap
- auth/session helpers
- role normalization
- user types and common data models

Web only for now:

- layout shell
- sidebar/header
- dashboard and feature page composition
- DOM-specific UI components

Mobile next:

- app shell
- navigation
- responsive screen layout
- shared Firebase reads and control writes
