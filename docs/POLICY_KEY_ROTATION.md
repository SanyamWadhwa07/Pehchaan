# Policy — Site package key rotation (Pehchaan / hackathon)

**Status:** Operational policy (no automatic rotation code in-repo).

## Principles

1. **Rotation mechanism** — Keys are **Edge Function secrets** (`SITE_PACKAGE_MASTER_KEY`, and optionally separate material later). Rotating a key means **replacing the secret** in Supabase Dashboard (or `supabase secrets set`) and redeploying if needed.
2. **Existing packages** — Older `site-packages/{site_id}/site-package.zip` objects **remain valid** until a supervisor (or automated job) **regenerates** a package with the Edge function. Clients that already downloaded a package can still decrypt it with the **old** master key until you overwrite local storage or ship an app update that clears packages.
3. **New packages** — After rotation, the next successful **`create-site-package`** run uses the **new** `SITE_PACKAGE_MASTER_KEY`. Inner payload uses a fresh random data key wrapped by that new master key.
4. **No dual-read in app (hackathon)** — The React Native app reads **`SITE_PACKAGE_MASTER_KEY`** from `react-native-config` (`.env`). After rotation, **rebuild** the app with the new value **or** use a secure channel to distribute keys per environment. Production should move to **per-device / per-site envelope** (see `DAY2_TASKS.md`) instead of bundling the site master key.

## What you do when rotating

1. Generate a new 32-byte base64 key (see [`SUPABASE_DASHBOARD_SECRETS_SAMPLE.md`](./SUPABASE_DASHBOARD_SECRETS_SAMPLE.md)).
2. Update **Edge** secret `SITE_PACKAGE_MASTER_KEY`.
3. Update **dev** `.env` for supervisors’ build if they must open v2 packages on device.
4. Optionally re-run **`create-site-package`** for each active site so field devices pick up ciphertext wrapped with the new key on next download.
5. **Do not** revoke old Storage objects unless you intend to invalidate old packages immediately.

## Audit trail

- `public.site_packages.version` and `sites.package_version` record publish history.
- Optional: log publish events in an application log outside this repo.

---

*No rotation cron or HSM integration in this hackathon repo — policy + manual secret replacement only.*
