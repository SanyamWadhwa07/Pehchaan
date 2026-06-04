import {Q} from '@nozbe/watermelondb';

import {database} from '@/db';
import type {Worker} from '@/db/models/Worker';

export type UpsertLocalFieldWorkerInput = {
  localWorkerId: string;
  workerName: string;
  role: string;
  languagePreference: 'en' | 'hi';
  frontalCaptureBase64: string;
  frontalEmbeddingBase64: string;
  siteId: string;
};

function thumbnailDataUrl(captureBase64: string): string {
  return captureBase64.startsWith('data:')
    ? captureBase64
    : `data:image/jpeg;base64,${captureBase64}`;
}

/**
 * Upsert one worker row for same-device auth demo after field registration.
 * Does not replace other site workers (unlike site-package hydrate).
 */
export async function upsertLocalWorkerFromFieldRegistration(
  input: UpsertLocalFieldWorkerInput,
): Promise<Worker> {
  const workers = database.collections.get<Worker>('workers');
  const existing = await workers
    .query(Q.where('id', input.localWorkerId))
    .fetch();
  const thumbnail = thumbnailDataUrl(input.frontalCaptureBase64);
  const enrolledAt = Date.now();

  await database.write(async () => {
    const row = existing[0];
    if (row) {
      await row.update(w => {
        w.name = input.workerName;
        w.role = input.role;
        w.siteId = input.siteId;
        w.languagePreference = input.languagePreference;
        w.embeddingEncryptedBase64 = input.frontalEmbeddingBase64;
        w.referenceThumbnailUrl = thumbnail;
        w.enrolledAt = enrolledAt;
        w.isRevoked = false;
        w.revokedAt = null;
      });
      return;
    }
    await database.batch(
      workers.prepareCreateFromDirtyRaw({
        id: input.localWorkerId,
        name: input.workerName,
        role: input.role,
        site_id: input.siteId,
        language_preference: input.languagePreference,
        enrolled_at: enrolledAt,
        revoked_at: null,
        reference_thumbnail_url: thumbnail,
        is_revoked: false,
        embedding_encrypted_base64: input.frontalEmbeddingBase64,
      }),
    );
  });

  const created = await workers
    .query(Q.where('id', input.localWorkerId))
    .fetch();
  const worker = created[0];
  if (!worker) {
    throw new Error('upsertLocalWorkerFromFieldRegistration: worker missing');
  }
  if (__DEV__) {
    console.log(
      '[registration] local worker upserted for recognition',
      input.localWorkerId.slice(0, 8),
    );
  }
  return worker;
}
