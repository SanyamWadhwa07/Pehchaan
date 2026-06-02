# Supabase Dashboard — sample secrets (Pehchaan / hackathon)

Use **Project → Edge Functions → Secrets** (or CLI `supabase secrets set`). Never commit real values to git.

## Auto-injected (hosted Supabase)

These are usually present without manual entry:

| Name | Purpose |
|------|---------|
| `SUPABASE_URL` | Project API URL |
| `SUPABASE_ANON_KEY` | Anon JWT for `createClient` user path |

## You must add (encrypted site packages — v2)

| Secret | Example shape | Purpose |
|--------|----------------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (JWT) | Edge only — fetch `workers.embedding_encrypted`, write idempotency rows, upload Storage with bypass RLS. **Never** ship in the mobile app. |
| `SITE_PACKAGE_MASTER_KEY` | Base64 of **32 raw bytes** | AES-256 key used to **wrap** the per-package random data key (`key_envelope.wrap_blob_b64` in `manifest.json`). |

### Generate `SITE_PACKAGE_MASTER_KEY` (PowerShell / OpenSSL)

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Or (32 random bytes, then base64):

```bash
openssl rand -base64 32
```

Copy the **single-line** base64 string into Dashboard **and** into the app `.env` as `SITE_PACKAGE_MASTER_KEY` for **dev parity only** (see [`POLICY_KEY_ROTATION.md`](./POLICY_KEY_ROTATION.md) — production should not reuse the Edge secret in the app bundle).

## Optional (integration / future)

| Secret | Notes |
|--------|--------|
| `INTEGRATION_*` | Leave unset until DataLink 3.0 credentials exist (see `.env.example`). |

## Verify after setting secrets

1. `npx supabase functions deploy create-site-package`
2. Call Edge with a **supervisor** access token and `{ "site_id": "<uuid>" }`.
3. Expect `package_kind: "v2_encrypted"` when `SITE_PACKAGE_MASTER_KEY` is set; otherwise `v1_plain` (legacy dev).

---

*Hackathon sample only — adjust naming and access for production NHAI operations.*
