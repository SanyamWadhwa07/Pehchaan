/**
 * Postgres snake_case ↔ app camelCase.
 * Single boundary — do not duplicate field mapping elsewhere.
 */

import type {
  AttendanceRecord,
  DeviceInfo,
  RegistrationRequest,
  Worker,
} from '@/types';
import type {
  AttendanceRecordRow,
  DeviceRow,
  RegistrationRequestRow,
  WorkerRow,
} from '@/lib/db/rows';

export function workerFromRow(row: WorkerRow): Worker {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    siteId: row.site_id,
    thumbnailBase64: undefined,
    enrolledAt: row.enrolled_at,
    isRevoked: row.revoked_at != null,
  };
}

export function attendanceFromRow(row: AttendanceRecordRow): AttendanceRecord {
  return {
    id: row.id,
    workerId: row.worker_id,
    siteId: row.site_id,
    deviceId: row.device_id,
    supervisorId: row.supervisor_id ?? '',
    supervisorConfirmed: row.supervisor_confirmed,
    authTimestamp: row.auth_timestamp,
    confidence: row.confidence_score ?? 0,
    authTier: row.auth_tier ?? 'low',
    livenessScore: row.liveness_score ?? 0,
    livenessPassed: row.liveness_passed,
    challengeType: row.challenge_type as AttendanceRecord['challengeType'],
    challengeResult: row.challenge_result ?? undefined,
    syncStatus: row.sync_status,
    serverRecordId: row.server_record_id ?? undefined,
    integrationPushStatus: row.integration_push_status,
    syncedAt: row.synced_at ?? undefined,
    purgedAt: row.purged_at ?? undefined,
    failReason: row.fail_reason ?? undefined,
  };
}

export function attendanceToRow(
  record: AttendanceRecord,
): AttendanceRecordRow {
  return {
    id: record.id,
    worker_id: record.workerId,
    site_id: record.siteId,
    device_id: record.deviceId,
    auth_timestamp: record.authTimestamp,
    confidence_score: record.confidence,
    auth_tier: record.authTier,
    liveness_score: record.livenessScore,
    liveness_passed: record.livenessPassed,
    challenge_type: record.challengeType ?? null,
    challenge_result: record.challengeResult ?? null,
    supervisor_id: record.supervisorId,
    supervisor_confirmed: record.supervisorConfirmed,
    sync_status: record.syncStatus,
    server_record_id: record.serverRecordId ?? null,
    synced_at: record.syncedAt ?? null,
    purged_at: record.purgedAt ?? null,
    fail_reason: record.failReason ?? null,
    integration_push_status: record.integrationPushStatus,
  };
}

export function registrationFromRow(
  row: RegistrationRequestRow,
): RegistrationRequest {
  return {
    id: row.id,
    name: row.worker_name,
    role: row.role,
    aadhaarHash: row.aadhaar_ref_hash ?? '',
    siteId: row.site_id,
    capturedAngles: [],
    status: row.status,
    submittedAt: row.created_at,
    reviewedAt: row.approved_at ?? undefined,
    reviewNote: row.review_note ?? undefined,
  };
}

export function registrationToRow(
  request: RegistrationRequest,
): RegistrationRequestRow {
  return {
    id: request.id,
    worker_name: request.name,
    role: request.role,
    aadhaar_ref_hash: request.aadhaarHash || null,
    site_id: request.siteId,
    status: request.status,
    review_note: request.reviewNote ?? null,
    created_at: request.submittedAt,
    approved_at: request.reviewedAt ?? null,
  };
}

export function deviceFromRow(row: DeviceRow): DeviceInfo {
  return {
    id: row.id,
    supervisorId: row.supervisor_id ?? '',
    siteId: row.site_id,
    platform: row.platform,
    appVersion: row.app_version ?? undefined,
    lastSyncAt: row.last_sync_at ?? undefined,
    trustScore: row.trust_score ?? undefined,
    isRevoked: row.revoked,
  };
}
