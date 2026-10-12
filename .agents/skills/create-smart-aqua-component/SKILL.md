---
name: create-smart-aqua-component
description: Create or update reusable React and TypeScript UI components for the Smart Aqua Pro web application while preserving its existing design system, accessibility, and project scope.
---

# Create a Smart Aqua Pro Component

Use this skill when a request adds or revises a reusable UI component in the Smart Aqua Pro web application.

## Workflow

1. Read the repository `AGENTS.md` and inspect the page, layout, and existing components related to the request.
2. Reuse components from `src/components/ui/` before creating a new primitive.
3. Place feature-specific components in the matching `src/components/<feature>/` folder. Keep generic primitives in `src/components/ui/`.
4. Define explicit TypeScript props. Prefer extending the relevant native HTML attributes for reusable controls.
5. Match the existing Tailwind CSS visual language: slate surfaces, teal primary actions, rose danger states, rounded corners, and visible focus/disabled states.
6. Preserve role-based and aquarium-specific access behavior. A UI component must not bypass service-layer authorization or invent new business rules.
7. Do not display fabricated sensor telemetry, hardware verification, numerical thresholds, or maintenance recommendations.
8. Check keyboard access, labels, semantic elements, loading states, empty states, and error states as applicable.
9. Run `npm run lint` and `npm run build`. Report pre-existing failures separately from failures introduced by the component.

## Completion Notes

Report the files changed, where the component is used, its main props or variants, the checks performed, and any behavior that still requires physical hardware verification.
