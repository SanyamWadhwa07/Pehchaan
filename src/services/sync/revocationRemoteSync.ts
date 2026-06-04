import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';

import type { Worker } from '@/db/models/Worker';
import { fetchDeviceById } from '@/repositories/devicesRepository';
import { supabase } from '@/lib/supabase';

export type RevocationSyncOptions = {
  siteId: string;
  /** When set, Edge may default `since` from `devices.last_sync_at` and bump `last_sync_at` after success. */
  deviceId?: string;
  /** ISO lower bound; overrides device `last_sync_at` default when set. */
  since?: string;
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

  let since = options.since?.trim();
  const deviceId = options.deviceId?.trim();

  if (!since && deviceId) {
    try {
      const dev = await fetchDeviceById(deviceId);
      since = dev?.last_sync_at?.trim() ?? undefined;
    } catch (e: unknown) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (!since) {
    since = '1970-01-01T00:00:00.000Z';
  }

  const body: Record<string, string> = {
    site_id: siteId,
    since,
  };
  if (deviceId) {
    body.device_id = deviceId;
  }

  const { data, error } = await supabase.functions.invoke<EdgePayload>('sync-revocations', {
    body,
  });

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
      const list = await workers.query(Q.where('id', wid)).fetch();
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
