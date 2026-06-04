import {Q} from '@nozbe/watermelondb';

import {database} from '@/db';
import type {Worker} from '@/db/models/Worker';
import type {UUID, WorkerEmbeddingEntry} from '@/types';

/**
 * Strip `data:image/...;base64,` prefix when thumbnails are stored inline from site package.
 */
function thumbnailToBase64(urlOrData: string | null | undefined): string {
  if (!urlOrData?.trim()) {
    return '';
  }
  const trimmed = urlOrData.trim();
  const comma = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && comma >= 0) {
    return trimmed.slice(comma + 1);
  }
  return trimmed;
}

/**
 * Load enrolled workers with embeddings from WatermelonDB for native cosine matching.
 *
 * Assumes `embedding_encrypted_base64` from the decrypted site-package inner payload
 * is raw 512-d Float32 LE (base64) — the v2 `payload.bin` AES-GCM layer is transport only.
 * When no embeddings are hydrated yet, returns [] and recognition falls back to stub.
 */
export async function buildRecognitionCandidates(
  siteId: UUID,
): Promise<WorkerEmbeddingEntry[]> {
  const collection = database.collections.get<Worker>('workers');
  const rows = await collection
    .query(Q.where('site_id', siteId), Q.where('is_revoked', false))
    .fetch();

  const candidates: WorkerEmbeddingEntry[] = [];

  for (const w of rows) {
    const embedding = w.embeddingEncryptedBase64?.trim();
    if (!embedding) {
      continue;
    }
    candidates.push({
      workerId: w.id,
      name: w.name,
      role: w.role,
      thumbnailBase64: thumbnailToBase64(w.referenceThumbnailUrl),
      embeddingBase64: embedding,
      isRevoked: false,
    });
  }

  return candidates;
}
