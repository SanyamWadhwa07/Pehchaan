# Policy — Biometric data retention (Pehchaan / NHAI Hackathon)

**Status:** Written decision for demo / hackathon scope. Legal review is out-of-band.

## Scope

This policy covers data handled by Pehchaan for **workforce authentication** at construction sites: **face embeddings**, **reference thumbnails**, and related metadata. It does **not** replace NHAI or employer statutory privacy obligations.

## Stored artefacts

| Artefact | Stored? | Form |
|----------|---------|------|
| **Raw face images** (full camera frames, enrollment video) | **No** — not retained after enrollment processing completes. Frames are used only in-memory / on-device to produce embeddings and optional thumbnails. |
| **Face embeddings** | **Yes** — **encrypted at rest** in Postgres (`workers.embedding_encrypted`) and included in the **encrypted site package inner payload** for offline supervisor devices. |
| **Reference thumbnails** | **Yes** — small still(s) for supervisor visual confirmation; may be a URL, inline base64 in the encrypted inner JSON when the pipeline adds it, or a derived crop. **Not** full-resolution raw streams. |
| **Aadhaar / PII** | Hashes / references only where the schema already uses `aadhaar_ref_hash`; raw numbers are not stored (see schema comments). |

## Revocation

- **Revoked workers** are flagged in Postgres (`workers.revoked_at`, local `is_revoked` after sync).
- **Removal from device** — During **revocation sync** (Day 3 plan), revoked workers’ embeddings and thumbnails **must be purged** from local WatermelonDB after the device acknowledges server state. That sync job is not fully implemented in this repo slice; this policy states the **required behaviour** for production.

## Retention & deletion

- **Site packages** in Storage are replaced on publish (`upsert` on canonical object name) or versioned per your ops choice; old blobs may remain until explicitly deleted (see key rotation doc).
- **No indefinite retention of raw biometrics** — only encrypted embeddings + reference thumbnails as above.

## Responsibilities

- **Product / NHAI** — Final retention schedule, consent copy, and DPIA.
- **Engineering** — Implement purge on revocation sync; avoid logging embedding or thumbnail bytes (see Edge logging rules).

---

*Last updated with repo — align with `Pehchaan_Implementation_Plan_v2.md` before submission.*
