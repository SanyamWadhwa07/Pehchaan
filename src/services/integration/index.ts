// Sync Layer — Backend Interface
//
// This is the pluggable backend interface for Pehchaan's sync layer.
// The sync layer is architected for NHAI DataLink 3.0 as the production target.
// During hackathon development the Supabase edge functions act as a mock backend
// behind the same interface — swapping to DataLink 3.0 is a config-only change
// (set INTEGRATION_API_KEY + INTEGRATION_ENDPOINT in .env).
//
// All payloads are REST-compatible JSON — no proprietary binary formats.

import type { AttendanceRecord, Worker, UUID, ISOTimestamp } from '@/types';

const INTEGRATION_API_KEY = process.env.INTEGRATION_API_KEY ?? '';
const INTEGRATION_ENDPOINT = process.env.INTEGRATION_ENDPOINT ?? '';

const isIntegrationEnabled = Boolean(INTEGRATION_API_KEY && INTEGRATION_ENDPOINT);

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
  if (!isIntegrationEnabled) return;
  await fetch(`${INTEGRATION_ENDPOINT}/attendance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${INTEGRATION_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function pushWorker(payload: WorkerPayload): Promise<void> {
  if (!isIntegrationEnabled) return;
  await fetch(`${INTEGRATION_ENDPOINT}/workers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${INTEGRATION_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function syncRevocations(payload: RevocationPayload): Promise<void> {
  if (!isIntegrationEnabled) return;
  await fetch(`${INTEGRATION_ENDPOINT}/revocations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${INTEGRATION_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
}
