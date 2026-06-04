import {database} from '@/db';
import type {RegistrationRequestModel} from '@/db/models/RegistrationRequestModel';
import {DEV_TEST_SITE_ID} from '@/constants/dev';
import type {CaptureAngle} from '@/types';

export type FieldRegistrationInput = {
  workerName: string;
  role: string;
  aadhaarRefHash: string;
  contactNumber?: string;
  languagePreference: 'en' | 'hi';
  frontalCaptureBase64: string;
  submittedBySupervisorId?: string | null;
  siteId?: string;
};

/**
 * Write a field registration to the local WatermelonDB queue (`pending_registration`).
 * Synced later by `pushPendingRegistrationOutbox`.
 */
export async function queueFieldRegistration(
  input: FieldRegistrationInput,
): Promise<RegistrationRequestModel> {
  const captures: Partial<Record<CaptureAngle, string>> = {
    frontal: input.frontalCaptureBase64,
  };

  const collection = database.collections.get<RegistrationRequestModel>(
    'registration_requests',
  );

  let created: RegistrationRequestModel;
  await database.write(async () => {
    created = await collection.create(rec => {
      rec.workerName = input.workerName;
      rec.role = input.role;
      rec.aadhaarRefHash = input.aadhaarRefHash;
      rec.siteId = input.siteId ?? DEV_TEST_SITE_ID;
      rec.status = 'pending_registration';
      rec.reviewNote = null;
      rec.createdAt = Date.now();
      rec.approvedAt = null;
      rec.contactNumber = input.contactNumber?.trim() || null;
      rec.capturedAnglesJson = JSON.stringify(captures);
      rec.submittedBySupervisorId = input.submittedBySupervisorId ?? null;
      rec.retryCount = 0;
      rec.lastErrorAt = null;
      rec.serverRecordId = null;
    });
  });

  return created!;
}
