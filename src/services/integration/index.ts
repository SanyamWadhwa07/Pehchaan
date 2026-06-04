/**
 * Sync layer — pluggable backend interface (DataLink 3.0 in prod, Supabase in dev).
 * Owner: Maulik (scaffold); OpenAPI paths for auth/registration flows: Aahil Day 2.
 *
 * | Client function    | OpenAPI / transport                                      |
 * | ------------------ | -------------------------------------------------------- |
 * | pushAttendance     | POST /push-to-integration (stub) · prod DataLink         |
 * | pushWorker         | POST /register-worker (Supabase Edge)                    |
 * | syncRevocations    | POST /sync-revocations                                   |
 * | (field reg sync)   | POST /registration-requests (PostgREST via outbox)       |
 * | (attendance sync)  | POST /attendance/batch (PostgREST via outbox)            |
 *
 * @see openapi.yaml
 * @see docs/CODE_CONVENTIONS.md
 */

import {integrationEnv, isIntegrationConfigured} from '@/config/env';
import type {AttendanceRecord, Worker, UUID, ISOTimestamp} from '@/types';

export type AttendancePayload = Pick<
  AttendanceRecord,
  | 'workerId'
  | 'siteId'
  | 'deviceId'
  | 'supervisorId'
  | 'supervisorConfirmed'
  | 'authTimestamp'
  | 'confidence'
  | 'livenessScore'
>;

export type WorkerPayload = Pick<
  Worker,
  'id' | 'name' | 'role' | 'siteId' | 'enrolledAt'
>;

export interface RevocationPayload {
  workerIds: UUID[];
  revokedAt: ISOTimestamp;
}

/**
 * POST /push-to-integration — no-op until `INTEGRATION_API_KEY` is set.
 */
export async function pushAttendance(
  payload: AttendancePayload,
): Promise<void> {
  if (!isIntegrationConfigured()) {
    return;
  }
  await fetch(`${integrationEnv.endpoint}/attendance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${integrationEnv.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

/** POST /workers — DataLink worker upsert (stub). */
export async function pushWorker(payload: WorkerPayload): Promise<void> {
  if (!isIntegrationConfigured()) {
    return;
  }
  await fetch(`${integrationEnv.endpoint}/workers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${integrationEnv.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

/** POST /sync-revocations */
export async function syncRevocations(
  payload: RevocationPayload,
): Promise<void> {
  if (!isIntegrationConfigured()) {
    return;
  }
  await fetch(`${integrationEnv.endpoint}/revocations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${integrationEnv.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}
