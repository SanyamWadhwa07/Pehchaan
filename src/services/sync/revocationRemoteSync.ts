import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';

import type { Worker } from '@/db/models/Worker';
import { requireSupabase } from '@/lib/supabase';

export type RevocationSyncOptions = {
  siteId: string;
  /** When set without `since`, the request omits `since` so Edge reads `devices.last_sync_at` and bumps it after success. */
  deviceId?: string;
  /** ISO lower bound; overrides device `last_sync_at` default when set. */
  since?: string;
  /**
   * Optional 0–1 device-reported trust (N5). Sent only when `deviceId` is set; persisted by Edge with `last_sync_at`.
   */
  trustScore?: number;
  /**
   * Optional app semver for `devices.app_version` (N5). Sent only when `deviceId` is set.
   */
  appVersion?: string;
};

export type RevocationSyncResult = {
  applied: number;
  errors: string[];
};

type EdgePayload = {
  revocations?: Array<{ worker_id: string; revoked_at: string; reason?: string | null }>;
  error?: string;
};

/**
 * Pull revocations from Edge (`sync-revocations`) and mirror onto WMDB workers:
 * `is_revoked`, `revoked_at`, clear `embedding_encrypted_base64` (offline auth unusable).
 * When `deviceId` is set, the Edge function also patches **`devices.last_sync_at`** and optional
 * **`trust_score`** / **`app_version`** (N5 device metadata).
 *
 * **Requires device JWT** with `app_metadata.site_id` matching `options.siteId`.
 */
export async function syncRevocationsFromServer(
  database: Database,
  options: RevocationSyncOptions,
): Promise<RevocationSyncResult> {
  const errors: string[] = [];
  const siteId = options.siteId.trim();
  if (!siteId) {
    return { applied: 0, errors: ['siteId required'] };
  }

  const deviceId = options.deviceId?.trim();
  const explicitSince = options.since?.trim();

  /**
   * When `device_id` is sent without `since`, the Edge function loads `devices.last_sync_at`
   * (service role) — single source of truth and one fewer client round-trip.
   */
  const body: Record<string, string | number> = {site_id: siteId};
  if (explicitSince) {
    body.since = explicitSince;
  }
  if (deviceId) {
    body.device_id = deviceId;
    if (
      options.trustScore !== undefined &&
      typeof options.trustScore === 'number' &&
      Number.isFinite(options.trustScore)
    ) {
      body.trust_score = options.trustScore;
    }
    const ver = options.appVersion?.trim();
    if (ver) {
      body.app_version = ver.slice(0, 64);
    }
  }

  const { data, error } = await requireSupabase().functions.invoke<EdgePayload>(
    'sync-revocations',
    {
      body,
    },
  );

  if (error) {
    errors.push(error.message);
    return { applied: 0, errors };
  }

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    errors.push(String(data.error));
    return { applied: 0, errors };
  }

  const revocations = Array.isArray(data?.revocations) ? data!.revocations! : [];
  if (revocations.length === 0) {
    return { applied: 0, errors };
  }

  const workers = database.collections.get<Worker>('workers');
  let applied = 0;

  await database.write(async () => {
    for (const r of revocations) {
      const wid = r.worker_id?.trim();
      if (!wid) continue;
      const list = await workers
        .query(Q.and(Q.where('id', wid), Q.where('site_id', siteId)))
        .fetch();
      const w = list[0];
      if (!w) continue;
      await w.update((rec) => {
        rec.isRevoked = true;
        rec.revokedAt = r.revoked_at;
        rec.embeddingEncryptedBase64 = null;
      });
      applied += 1;
    }
  });

  return { applied, errors };
}
