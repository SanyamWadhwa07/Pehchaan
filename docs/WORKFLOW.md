# Pehchaan — Team Git Workflow

How we integrate code during the hackathon. Read this with [CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md).

**Deadline:** 05 June 2026 · **Team:** 4 people · **Base branch:** `main` only

---

## Principle

**`main` is our only integration branch.** It should pass `npm run typecheck` (and lint) before merge.

We do **not** use a long-lived `checkpoint` branch for day-to-day work. Short-lived feature branches merge into `main` often (same day or next morning).

Use a **demo tag** (`demo-2026-06-04`) only when we need a frozen build for APK submission while `main` keeps moving.

---

## Daily rhythm

| When | Action |
|------|--------|
| **Start of day** | `git fetch origin && git checkout main && git pull` |
| **Before branching** | Post in team chat: *"Today I'm touching: …"* (see conflict zones below) |
| **During the day** | Push your branch; open a PR when a slice works (even small) |
| **End of day** | Merge green PRs; if blocked, leave a one-line note in chat |
| **Before demo / APK** | Tag `main`: `git tag demo-YYYY-MM-DD && git push origin demo-YYYY-MM-DD` |

---

## Branching

### Create a branch

```bash
git fetch origin
git checkout main
git pull origin main
git checkout -b <name>/<short-description>
```

### Naming

```
aahil/auth-quality-screen
maulik/supervisor-confirmation
anoushka/watermelon-attendance
sanyam/native-liveness-bridge
```

Use your name + what the PR does. Keep branches **short-lived** (1–2 days max).

### Update your branch with latest `main`

Prefer rebase for a clean history:

```bash
git fetch origin
git rebase origin/main
```

If you've already pushed the branch and rebased:

```bash
git push --force-with-lease
```

Use merge instead of rebase if you're unsure — either is fine; **don't let the branch sit stale for days**.

---

## Pull requests

1. Open a PR into **`main`** (not `checkpoint`).
2. Fill in: what changed, how to test, who should review.
3. **Do not merge** if `typecheck` / CI is red.
4. Prefer **small PRs** (one screen, one service, one migration) over week-long branches.
5. Delete the branch after merge.

### Reviewers by area

| If the PR touches… | Ask for review from… |
|--------------------|----------------------|
| `supabase/migrations/` | **Anoushka** (she merges migration PRs) |
| `src/types.ts`, `src/lib/db/` | Whoever changed it + **one other teammate** |
| `openapi.yaml`, `src/services/integration/` | **Maulik** |
| `ml/`, `src/native/` | **Sanyam** |
| `src/screens/auth/`, `registration/`, `locales/`, `src/i18n/` | **Aahil** |
| `src/screens/supervisor/`, `enrollment/` | **Maulik** |
| `package.json`, `tsconfig.json` | **Whoever opened the PR** + quick team ping |

---

## Conflict zones (coordinate before editing)

These files affect everyone. Post in chat **before** you start:

- `src/types.ts`
- `supabase/migrations/*.sql`
- `openapi.yaml`
- `package.json` / `package-lock.json`

**Rule:** If two people need `types.ts` the same day → **one PR merges first**, the other rebases onto `main`. Never edit migrations on parallel branches without Anoushka syncing.

---

## Folder ownership (where to work)

| Owner | Paths | Don't edit without asking |
|-------|--------|---------------------------|
| **Aahil** | `src/screens/auth/`, `registration/`, `settings/`, `src/locales/`, `src/i18n/` | — |
| **Maulik** | `src/screens/supervisor/`, `enrollment/`, `src/services/integration/`, `openapi.yaml` | — |
| **Anoushka** | `src/db/`, `src/sync/`, `src/services/sitePackage/`, `supabase/` | Migrations |
| **Sanyam** | `ml/`, `src/native/FaceRecognition/` | — |
| **Shared** | `src/types.ts`, `src/lib/`, `src/config/`, `docs/` | Chat first |

Stay in your folders when possible. Shared modules go through PR + review.

---

## What we stopped doing

| Old habit | New habit |
|-----------|-----------|
| Everyone branches off `checkpoint` | Everyone branches off **`main`** |
| One person merges all branches into checkpoint weekly | **Each owner merges own PRs**; shared files reviewed |
| Unclear whether `main` or `checkpoint` is truth | **`main` is always truth** |
| Large merge sessions before demo | **Daily small merges**; tag `main` for demo only |

---

## If you branched before a big `main` update

1. `git fetch origin`
2. `git rebase origin/main` (or merge `origin/main`)
3. Fix conflicts in shared files (`types.ts`, migrations) with the area owner
4. Run `npm run typecheck` before pushing

Only **Sanyam** (or whoever has an active old branch) needs this when `main` moves — not a problem if everyone else works from current `main`.

---

## Demo / submission freeze

When we need a stable APK:

```bash
git checkout main
git pull origin main
git tag demo-2026-06-04   # use the actual date
git push origin demo-2026-06-04
```

Build the APK from that tag. Development continues on `main` unless we explicitly agree to freeze merges (last 12 hours before submission).

---

## Quick commands

```bash
# Start work
git checkout main && git pull origin main
git checkout -b aahil/my-feature

# Before PR
npm run typecheck
npm run lint

# After PR merged locally
git checkout main && git pull origin main
git branch -d aahil/my-feature
```

---

## Questions?

Ping in the team channel. When in doubt: **pull `main`, small PR, merge today.**
