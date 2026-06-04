import {database} from '@/db';
import type {AttendanceRecordModel} from '@/db/models/AttendanceRecordModel';
import type {PendingAuthSession} from '@/types';

export type QueueAttendanceInput = {
  session: PendingAuthSession;
  supervisorId: string;
  supervisorConfirmed: boolean;
};

/**
 * Write supervisor-confirmed attendance to the local outbox (`outbox_sync_status: pending`).
 */
export async function queueAttendanceRecord(
  input: QueueAttendanceInput,
): Promise<AttendanceRecordModel> {
  const {session, supervisorId, supervisorConfirmed} = input;
  const lastChallenge = session.livenessSession.challenges.at(-1);

  const collection =
    database.collections.get<AttendanceRecordModel>('attendance_records');

  let created: AttendanceRecordModel;
  await database.write(async () => {
    created = await collection.create(rec => {
      rec.workerId = session.workerId;
      rec.siteId = session.siteId;
      rec.deviceId = session.deviceId;
      rec.supervisorId = supervisorId;
      rec.supervisorConfirmed = supervisorConfirmed;
      rec.authTimestamp = Date.parse(session.createdAt);
      rec.confidenceScore = session.confidence;
      rec.authTier = session.authTier;
      rec.livenessScore = session.livenessSession.score;
      rec.livenessPassed = session.livenessSession.passed;
      rec.challengeType = lastChallenge?.challenge ?? null;
      rec.challengeResult = lastChallenge?.passed ?? null;
      rec.outboxSyncStatus = 'pending';
      rec.serverRecordId = null;
      rec.syncedAt = null;
      rec.purgedAt = null;
      rec.failReason = null;
      rec.integrationPushStatus = 'queued';
      rec.retryCount = 0;
      rec.lastErrorAt = null;
    });
  });

  return created!;
}
