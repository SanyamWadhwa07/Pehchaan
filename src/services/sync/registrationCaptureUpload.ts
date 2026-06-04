import RNFS from 'react-native-fs';

import {requireSupabase} from '@/lib/supabase';
import {base64ToBytes} from '@/services/sitePackage/decryptSitePackage';

export const REGISTRATION_CAPTURES_BUCKET = 'registration-captures';

/**
 * When the whole `captured_angles_json` string exceeds this, large string values are
 * uploaded to `registration-captures` and replaced with `{ ref, bucket, path }`.
 */
export const CAPTURES_INLINE_MAX_CHARS = 120_000;

/**
 * Any single angle string longer than this is uploaded to storage even if total JSON is small.
 */
export const CAPTURE_SINGLE_MAX_CHARS = 72_000;

export type RegistrationCaptureStorageRef = {
  ref: 'storage';
  bucket: string;
  path: string;
};

export type RegistrationCapturesPayload = Record<
  string,
  string | RegistrationCaptureStorageRef
>;

function stripDataUrlBase64(s: string): string {
  const trimmed = s.trim();
  const comma = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && comma >= 0) {
    return trimmed.slice(comma + 1).replace(/\s/g, '');
  }
  return trimmed.replace(/\s/g, '');
}

function sanitizePathSegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Build the JSON body for `registration_requests.captured_angles_json`:
 * keeps small base64 strings inline; uploads large blobs under
 * `{siteId}/registration-captures/{localRowId}/{angle}.bin`.
 */
export async function prepareRegistrationCapturesPayload(
  siteId: string,
  localRowId: string,
  capturedAnglesJson: string,
): Promise<RegistrationCapturesPayload> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(capturedAnglesJson) as Record<string, unknown>;
  } catch {
    return {};
  }

  const keys = Object.keys(parsed);
  if (keys.length === 0) {
    return {};
  }

  const totalLen = capturedAnglesJson.length;
  const supabase = requireSupabase();
  const safeLocal = sanitizePathSegment(localRowId);
  const out: RegistrationCapturesPayload = {};

  for (const angle of keys) {
    if (angle === 'embedding_base64' && typeof parsed[angle] === 'string') {
      out.embedding_base64 = parsed[angle] as string;
      continue;
    }

    const raw = parsed[angle];
    if (typeof raw !== 'string') {
      continue;
    }
    const val = raw;

    const storageAngle = angle === 'frontal_local_path' ? 'frontal' : angle;
    const b64 =
      angle === 'frontal_local_path'
        ? await RNFS.readFile(val, 'base64')
        : stripDataUrlBase64(val);

    const uploadThis =
      angle === 'frontal_local_path' ||
      totalLen > CAPTURES_INLINE_MAX_CHARS ||
      val.length > CAPTURE_SINGLE_MAX_CHARS;

    if (!uploadThis) {
      out[storageAngle] = b64;
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(b64);
    } catch {
      throw new Error(`registration_capture_base64_invalid:${angle}`);
    }

    const path = `${siteId}/registration-captures/${safeLocal}/${storageAngle}.bin`;
    const {error} = await supabase.storage
      .from(REGISTRATION_CAPTURES_BUCKET)
      .upload(path, bytes, {
        contentType: 'application/octet-stream',
        upsert: true,
      });

    if (error) {
      throw new Error(
        `registration_capture_storage_failed:${angle}:${error.message}`,
      );
    }

    out[storageAngle] = {
      ref: 'storage',
      bucket: REGISTRATION_CAPTURES_BUCKET,
      path,
    };
  }

  return out;
}
