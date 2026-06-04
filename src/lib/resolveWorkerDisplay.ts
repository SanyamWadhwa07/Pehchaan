import { Q } from '@nozbe/watermelondb';

import { database } from '@/db';
import type { Worker } from '@/db/models/Worker';
import type { UUID } from '@/types';

export type WorkerDisplay = {
  name: string;
  thumbnailBase64?: string;
};

/** Local WMDB lookup; falls back to worker id string when not hydrated. */
export async function resolveWorkerDisplay(workerId: UUID): Promise<WorkerDisplay> {
  try {
    const collection = database.collections.get<Worker>('workers');
    const row = await collection.query(Q.where('id', workerId)).fetch();
    const w = row[0];
    if (w) {
      return {
        name: w.name,
        thumbnailBase64: w.referenceThumbnailUrl ?? undefined,
      };
    }
  } catch {
    // WMDB empty in dev — use fallback below
  }
  return { name: workerId };
}
