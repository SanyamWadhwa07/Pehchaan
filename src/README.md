# `src/` — Application Code

Full conventions: [docs/CODE_CONVENTIONS.md](../docs/CODE_CONVENTIONS.md)

## Layout

```
constants/     Shared numeric thresholds and timeouts
i18n/          i18next setup — import from @/i18n in App root
lib/           Pure helpers (auth tier, i18n key maps, DB mappers)
locales/       en.json + hi.json (user-visible strings only)
screens/       One folder per flow — see ownership in CODE_CONVENTIONS
services/      API / sync clients (not UI)
types.ts       Shared TypeScript contracts (types only)
```

## Start here by role

| You are | Start with |
|---------|------------|
| Aahil | `screens/auth/`, `screens/registration/`, `lib/qualityI18n.ts`, `locales/` |
| Maulik | `screens/supervisor/`, `services/integration/` |
| Anoushka | `lib/db/`, then `db/` + `sync/` when models land |
| Sanyam | `types.ts` (Native* interfaces), `native/FaceRecognition/` |
