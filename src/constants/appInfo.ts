/**
 * Semver reported to Supabase `devices.app_version` on each successful device sync (N5).
 * Bump together with root `package.json` `"version"` when cutting releases.
 */
export const APP_SEMVER = '0.0.1';

/**
 * Tier 0 placeholder until attestation / risk signals drive `devices.trust_score`.
 * Sent with `sync-revocations` when `device_id` is configured (N5 write path).
 */
export const DEVICE_TRUST_SCORE_TIER0 = 1;
