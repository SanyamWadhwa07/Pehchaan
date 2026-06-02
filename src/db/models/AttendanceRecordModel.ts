import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/** Offline attendance queue row — maps to Postgres `attendance_records` on sync. */
export class AttendanceRecordModel extends Model {
  static table = 'attendance_records';

  @field('worker_id') workerId!: string;
  @field('site_id') siteId!: string;
  @field('device_id') deviceId!: string;
  @field('supervisor_id') supervisorId!: string | null;
  @field('supervisor_confirmed') supervisorConfirmed!: boolean;
  @field('auth_timestamp') authTimestamp!: number;
  @field('confidence_score') confidenceScore!: number | null;
  @field('auth_tier') authTier!: string | null;
  @field('liveness_score') livenessScore!: number | null;
  @field('liveness_passed') livenessPassed!: boolean;
  @field('challenge_type') challengeType!: string | null;
  @field('challenge_result') challengeResult!: boolean | null;
  @field('outbox_sync_status') outboxSyncStatus!: string;
  @field('server_record_id') serverRecordId!: string | null;
  @field('synced_at') syncedAt!: number | null;
  @field('purged_at') purgedAt!: number | null;
  @field('fail_reason') failReason!: string | null;
  @field('integration_push_status') integrationPushStatus!: string;
}
