import {Q} from '@nozbe/watermelondb';
import type {Database} from '@nozbe/watermelondb';

import type {RegistrationRequestModel} from '@/db/models/RegistrationRequestModel';
import {insertRegistrationRequest} from '@/repositories/registrationRepository';
import {prepareRegistrationCapturesPayload} from '@/services/sync/registrationCaptureUpload';

/**
 * Maximum upload attempts for a registration request before it is dead-lettered.
 * Lower than attendance because registrations are infrequent; each failure is more meaningful.
 */
export const REGISTRATION_MAX_RETRIES = 4;

const BASE_BACKOFF_MS = 60_000; // 1 min after first failure
const MAX_BACKOFF_MS = 4 * 60 * 60 * 1000; // 4 h ceiling

/**
 * Backoff schedule (approximate):
 *   attempt 1 → 1 min
 *   attempt 2 → 2 min
 *   attempt 3 → 4 min
 *   attempt 4 → dead-lettered
 */
function isBackoffExpired(
  retryCount: number,
  lastErrorAt: number | null,
): boolean {
  if (retryCount <= 0) {
    return true;
  }
  if (retryCount >= REGISTRATION_MAX_RETRIES) {
    return false;
  }
  if (lastErrorAt == null) {
    return true;
  }
  const backoffMs = Math.min(
    BASE_BACKOFF_MS * Math.pow(2, retryCount - 1),
    MAX_BACKOFF_MS,
  );
  return Date.now() - lastErrorAt >= backoffMs;
}

function isEligibleForUpload(m: RegistrationRequestModel): boolean {
  if (m.status !== 'pending_registration') {
    return false;
  }
  if (m.serverRecordId != null) {
    return false;
  } // already uploaded; status update pending
  return isBackoffExpired(m.retryCount, m.lastErrorAt);
}

export type RegistrationOutboxSyncResult = {
  uploaded: number;
  errors: string[];
  deadLettered: number;
};

/**
 * Push locally queued registration requests to Postgres.
 *
 * Only rows with `status = 'pending_registration'` and no `server_record_id` are eligible.
 * Sends `captured_angles_json` to Postgres; when the local JSON is very large, face blobs are
 * uploaded to the private `registration-captures` bucket first and the row stores `{ref,path}` refs.
 * On success the local row is updated to the server-returned status (e.g. `'pending'` = under review).
 * On repeated failure the row is dead-lettered (status remains `'pending_registration'` so the
 * user or supervisor can identify and retry manually; `retry_count` reflects the state).
 *
 * **Requires device or supervisor JWT** (RLS: `registration_insert_supervisor_or_device`).
 */
export async function pushPendingRegistrationOutbox(
  database: Database,
): Promise<RegistrationOutboxSyncResult> {
  const errors: string[] = [];
  let uploaded = 0;
  let deadLettered = 0;

  const collection = database.collections.get<RegistrationRequestModel>(
    'registration_requests',
  );

  const candidates = await collection
    .query(Q.where('status', 'pending_registration'))
    .fetch();

  const toDeadLetter: RegistrationRequestModel[] = [];
  const eligible: RegistrationRequestModel[] = [];

  for (const m of candidates) {
    if (m.retryCount >= REGISTRATION_MAX_RETRIES) {
      toDeadLetter.push(m);
    } else if (isEligibleForUpload(m)) {
      eligible.push(m);
    }
  }

  if (toDeadLetter.length > 0) {
    deadLettered = toDeadLetter.length;
    await database.write(async () => {
      for (const m of toDeadLetter) {
        await m.update(rec => {
          rec.reviewNote =
            `[sync_dead_lettered after ${m.retryCount} attempts] ` +
            (m.reviewNote ?? '');
        });
      }
    });
  }

  for (const m of eligible) {
    try {
      const capturesPayload = await prepareRegistrationCapturesPayload(
        m.siteId,
        m.id,
        m.capturedAnglesJson ?? '{}',
      );

      const serverRow = await insertRegistrationRequest({
        worker_name: m.workerName,
        role: m.role,
        aadhaar_ref_hash: m.aadhaarRefHash ?? null,
        site_id: m.siteId,
        submitted_by: m.submittedBySupervisorId ?? null,
        status: 'pending_registration',
        captured_angles_json:
          Object.keys(capturesPayload).length > 0 ? capturesPayload : null,
      });

      await database.write(async () => {
        await m.update(rec => {
          rec.serverRecordId = serverRow.id;
          rec.status = serverRow.status;
          rec.retryCount = 0;
          rec.lastErrorAt = null;
          if (serverRow.approved_at) {
            rec.approvedAt = Date.parse(serverRow.approved_at);
          }
        });
      });
      uploaded++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`[reg:${m.id}] ${msg}`);
      await database.write(async () => {
        await m.update(rec => {
          rec.retryCount = m.retryCount + 1;
          rec.lastErrorAt = Date.now();
        });
      });
    }
  }

  return {uploaded, errors, deadLettered};
}
