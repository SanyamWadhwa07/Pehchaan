import {database} from '@/db';
import type {RegistrationRequestModel} from '@/db/models/RegistrationRequestModel';
import {DEV_TEST_SITE_ID} from '@/constants/dev';
import {persistFrontalCaptureToFile} from '@/services/registration/persistFieldCaptureLocal';

/**
 * JSON in `registration_requests.captured_angles_json` — keep small for SQLite.
 * `frontal_local_path` is read at sync by `prepareRegistrationCapturesPayload`.
 */
export type FieldRegistrationCapturesJson = {
  frontal_local_path: string;
  embedding_base64?: string;
};

export type FieldRegistrationInput = {
  workerName: string;
  role: string;
  aadhaarRefHash: string;
  contactNumber?: string;
  languagePreference: 'en' | 'hi';
  frontalCaptureBase64: string;
  frontalEmbeddingBase64?: string;
  localWorkerId: string;
  submittedBySupervisorId?: string | null;
  siteId?: string;
};

/**
 * Write a field registration to the local WatermelonDB queue (`pending_registration`).
 * Face JPEG is stored on disk; only path + embedding go in SQLite.
 */
export async function queueFieldRegistration(
  input: FieldRegistrationInput,
): Promise<RegistrationRequestModel> {
  const siteId = input.siteId ?? DEV_TEST_SITE_ID;
  const frontalPath = await persistFrontalCaptureToFile(
    siteId,
    input.localWorkerId,
    input.frontalCaptureBase64,
  );

  const captures: FieldRegistrationCapturesJson = {
    frontal_local_path: frontalPath,
    ...(input.frontalEmbeddingBase64
      ? {embedding_base64: input.frontalEmbeddingBase64}
      : {}),
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
      rec.siteId = siteId;
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
