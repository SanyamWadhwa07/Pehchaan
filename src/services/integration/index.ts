/**
 * Sync layer — pluggable backend interface (DataLink 3.0 in prod, Supabase in dev).
 * Owner: Maulik. Payloads use camelCase (@/types); map at HTTP boundary if API uses snake_case.
 *
 * @see openapi.yaml
 * @see docs/CODE_CONVENTIONS.md
 */

import { integrationEnv, isIntegrationConfigured } from '@/config/env';
import type { AttendanceRecord, Worker, UUID, ISOTimestamp } from '@/types';

// Payload shapes are subsets of the shared types — only what the backend needs
export type AttendancePayload = Pick<
  AttendanceRecord,
  'workerId' | 'siteId' | 'deviceId' | 'supervisorId' | 'supervisorConfirmed' |
  'authTimestamp' | 'confidence' | 'livenessScore'
>;

export type WorkerPayload = Pick<Worker, 'id' | 'name' | 'role' | 'siteId' | 'enrolledAt'>;

export interface RevocationPayload {
  workerIds: UUID[];
  revokedAt: ISOTimestamp;
}

// TODO (Maulik — Day 3): Wire these to the live DataLink 3.0 endpoint once
// NHAI provides credentials. Until then they are no-ops that log the payload.

export async function pushAttendance(payload: AttendancePayload): Promise<void> {
  if (!isIntegrationConfigured()) return;
  await fetch(`${integrationEnv.endpoint}/attendance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${integrationEnv.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function pushWorker(payload: WorkerPayload): Promise<void> {
  if (!isIntegrationConfigured()) return;
  await fetch(`${integrationEnv.endpoint}/workers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${integrationEnv.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function syncRevocations(payload: RevocationPayload): Promise<void> {
  if (!isIntegrationConfigured()) return;
  await fetch(`${integrationEnv.endpoint}/revocations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${integrationEnv.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}
