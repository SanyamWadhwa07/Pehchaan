# Screens

One screen component per file. Screen-specific hooks live next to the screen (`useQualityGate.ts`).

| Folder | Flow | Owner |
|--------|------|--------|
| `auth/` | Quality → liveness → recognition result | Aahil |
| `registration/` | Field worker enrollment form + capture | Aahil |
| `settings/` | Language toggle | Aahil |
| `supervisor/` | Dashboard + confirmation | Maulik |
| `enrollment/` | Admin portal (if in-app) | Maulik |

Use `t()` for all copy. Import domain logic from `@/lib`, not inline thresholds.
