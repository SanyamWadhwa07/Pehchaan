# Pehchaan — Code Conventions

Keep the codebase obvious to read six months from now. When in doubt, prefer **explicit names** and **one obvious place** for each concern.

---

## Layering

```
Screens (UI only)
    ↓ calls
lib/ + constants/   (pure logic, mappers, i18n keys)
    ↓ uses
types.ts            (shapes only — no functions)
    ↓ mapped at sync boundary
lib/db/             (snake_case Postgres rows ↔ camelCase app types)
```

| Layer | Location | Rules |
|-------|----------|--------|
| Types | `src/types.ts` | Interfaces and type aliases only. No runtime code. |
| Constants | `src/constants/` | Thresholds, timeouts, enum-like values used in multiple files. |
| Mappers | `src/lib/db/` | **Only** place that converts `snake_case` DB ↔ `camelCase` app. |
| UI strings | `src/locales/*.json` | All user-visible text. Never hardcode copy in components. |
| i18n keys | `src/lib/*I18n.ts` | Maps domain values (e.g. `failReason`) → locale key paths. |
| Screens | `src/screens/<area>/` | One screen per file. Hooks for screen logic live alongside (`useX.ts`). |

---

## Naming

| Context | Convention | Example |
|---------|------------|---------|
| TypeScript | `camelCase` | `workerId`, `syncStatus` |
| Postgres / OpenAPI body | `snake_case` | `worker_id`, `sync_status` |
| React components | `PascalCase` + `Screen` suffix | `QualityCheckScreen.tsx` |
| Hooks | `use` prefix | `useLivenessSession.ts` |
| Files | Match default export | `AuthResultScreen.tsx` exports `AuthResultScreen` |

**Worker ID in UI:** show shortened ID; never log embeddings or raw Aadhaar.

---

## Imports

Use the `@/` path alias (see `tsconfig.json`):

```ts
import type { AttendanceRecord } from '@/types';
import { CONFIDENCE_THRESHOLD_HIGH } from '@/constants/auth';
import { attendanceFromRow } from '@/lib/db/mappers';
import { qualityCheckTranslationKey } from '@/lib/qualityI18n';
```

Order: external packages → `@/` imports → relative imports.

---

## Types vs database

- **`src/types.ts`** = what the app works with (camelCase).
- **`src/lib/db/rows.ts`** = what Supabase/Postgres returns (snake_case).
- **`src/lib/db/mappers.ts`** = conversions between them.

Do not sprinkle `worker_id` in screen code. Map once at the sync/API boundary.

Field renames must update: `types.ts` → `rows.ts` → `mappers.ts` → `supabase/migrations/` → `openapi.yaml`.

---

## i18n

1. Add strings to **both** `src/locales/en.json` and `src/locales/hi.json`.
2. Add a mapper in `src/lib/*I18n.ts` when the UI key depends on a typed enum (quality, liveness).
3. In components: `t(qualityCheckTranslationKey(result.failReason))`.

Registration form label `idNumber` is UI copy; the stored field is always `aadhaarHash` (hashed before persist).

---

## Comments

- Explain **why**, not what the code already says.
- Put ownership on modules that cross team boundaries: `// Owner: Aahil — auth screens`.
- No commented-out dead code in `main`; delete or open a tracked issue.

---

## Ownership (where to add code)

| Area | Path | Owner |
|------|------|--------|
| Worker auth flow | `src/screens/auth/` | Aahil |
| Field registration | `src/screens/registration/` | Aahil |
| Locales + i18n wiring | `src/locales/`, `src/i18n/`, `src/lib/*I18n.ts` | Aahil |
| Supervisor UI | `src/screens/supervisor/` | Maulik |
| Integration API client | `src/services/integration/` | Maulik |
| WatermelonDB + sync | `src/db/`, `src/sync/` | Anoushka |
| Migrations | `supabase/migrations/` | Anoushka |
| Native ML bridge | `src/native/FaceRecognition/` | Sanyam |

---

## PR checklist (quick)

- [ ] No magic numbers — use `src/constants/`
- [ ] No UI strings in `.tsx` — use locales
- [ ] DB/API boundary uses mappers
- [ ] New types documented in `types.ts`
- [ ] Hindi + English strings added together
