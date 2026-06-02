import type { IntegrationPushStatus, SyncStatus } from '@/types';

/** Postgres `sync_status_enum` and WMDB `outbox_sync_status` share the same string values. */
export const SYNC_STATUS_VALUES: readonly SyncStatus[] = [
  'pending',
  'uploading',
  'verified',
  'purged',
  'failed',
] as const;

export function isSyncStatus(value: string): value is SyncStatus {
  return (SYNC_STATUS_VALUES as readonly string[]).includes(value);
}

/** Map server `sync_status` onto local outbox column (same enum strings). */
export function postgresSyncStatusToOutbox(status: string): SyncStatus {
  if (isSyncStatus(status)) {
    return status;
  }
  return 'failed';
}

export function isOutboxEligibleForUpload(outboxStatus: string): boolean {
  return outboxStatus === 'pending' || outboxStatus === 'failed';
}

export function integrationPushFromRemote(
  value: string | null | undefined,
): IntegrationPushStatus {
  const v = value ?? 'queued';
  if (v === 'queued' || v === 'pushed' || v === 'failed' || v === 'not_applicable') {
    return v;
  }
  return 'queued';
}
