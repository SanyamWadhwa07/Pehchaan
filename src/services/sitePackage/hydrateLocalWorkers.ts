import {Q} from '@nozbe/watermelondb';
import type {Database} from '@nozbe/watermelondb';

import type {Worker} from '@/db/models/Worker';
import {database} from '@/db';
import {sitePackageEnv} from '@/config/env';
import {
  decodeSitePackageMasterKey,
  decryptSitePackageBuffer,
  decryptSitePackageV2Payload,
  type SitePackageKeyMaterial,
} from '@/services/sitePackage/decryptSitePackage';
import {downloadSitePackageObject} from '@/services/sitePackage/sitePackageStorage';
import {parseSitePackageFromZipBuffer} from '@/services/sitePackage/unpackSitePackage';

export type HydrateLocalWorkersOptions = {
  siteId: string;
  fileName?: string;
  /** Overrides `SITE_PACKAGE_MASTER_KEY` from env (base64, 32 raw bytes). Required for v2 site_master packages if env unset. */
  masterKeyBase64?: string;
  /**
   * For `per_device_v1` packages: the current device's UUID as stored in `devices.id`.
   * Must accompany `deviceKeyBase64` — both are required for per-device decryption.
   */
  deviceId?: string;
  /**
   * For `per_device_v1` packages: base64 of the device's 32-byte secret key,
   * loaded from secure storage (e.g. Keychain) at call-time. Never store in `.env`.
   */
  deviceKeyBase64?: string;
};

function enrolledAtMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
}

/**
 * Download site package → optional outer decrypt (reserved) → unzip →
 * v1 plaintext workers **or** v2 AES-GCM `payload.bin` + hydrate WMDB (Postgres UUID as record id).
 */
export async function hydrateLocalWorkersFromSitePackage(
  options: HydrateLocalWorkersOptions,
  db: Database = database,
): Promise<{workerCount: number; packageKind: 'v1_plain' | 'v2_encrypted'}> {
  const fileName = options.fileName ?? 'site-package.zip';
  const raw = await downloadSitePackageObject(options.siteId, fileName);
  const plain = await decryptSitePackageBuffer(raw);
  const parsed = parseSitePackageFromZipBuffer(plain);

  if (parsed.kind === 'v1_plain') {
    const manifest = parsed.manifest;
    if (manifest.site_id !== options.siteId) {
      throw new Error(
        `site package site_id mismatch (manifest=${manifest.site_id})`,
      );
    }
    if (manifest.cipher === 'aes-256-gcm') {
      throw new Error('v1 manifest cannot declare aes-256-gcm');
    }

    const workers = db.collections.get<Worker>('workers');
    const existing = await workers
      .query(Q.where('site_id', options.siteId))
      .fetch();
    const destroys = existing.map(w => w.prepareDestroyPermanently());
    const creates = manifest.workers.map(w =>
      workers.prepareCreateFromDirtyRaw({
        id: w.id,
        name: w.name,
        role: w.role,
        site_id: w.site_id,
        language_preference: w.language_preference,
        enrolled_at: enrolledAtMs(w.enrolled_at),
        revoked_at: w.revoked_at,
        reference_thumbnail_url: w.reference_thumbnail_url,
        is_revoked: w.revoked_at != null && w.revoked_at.length > 0,
        embedding_encrypted_base64: null,
      }),
    );
    await db.write(async () => {
      await db.batch(...destroys, ...creates);
    });
    return {workerCount: manifest.workers.length, packageKind: 'v1_plain'};
  }

  const {outer, files} = parsed;
  if (outer.site_id !== options.siteId) {
    throw new Error(
      `site package site_id mismatch (manifest=${outer.site_id})`,
    );
  }

  const payload = files['payload.bin'];
  if (!payload) {
    throw new Error('v2 site package missing payload.bin');
  }

  let keyMaterial: SitePackageKeyMaterial;

  if (outer.key_envelope.kind === 'per_device_v1') {
    if (!options.deviceId || !options.deviceKeyBase64) {
      throw new Error(
        'per_device_v1 site package requires both deviceId and deviceKeyBase64 options',
      );
    }
    keyMaterial = {
      kind: 'per_device',
      deviceId: options.deviceId,
      key32: decodeSitePackageMasterKey(options.deviceKeyBase64),
    };
  } else {
    const masterB64 =
      options.masterKeyBase64?.trim() || sitePackageEnv.masterKeyBase64.trim();
    if (!masterB64) {
      throw new Error(
        'v2 site package requires SITE_PACKAGE_MASTER_KEY (or masterKeyBase64 option)',
      );
    }
    keyMaterial = {
      kind: 'site_master',
      key32: decodeSitePackageMasterKey(masterB64),
    };
  }

  const inner = decryptSitePackageV2Payload(outer, payload, keyMaterial);
  if (inner.site_id !== options.siteId) {
    throw new Error('inner payload site_id mismatch');
  }

  const workers = db.collections.get<Worker>('workers');
  const existing = await workers
    .query(Q.where('site_id', options.siteId))
    .fetch();
  const destroys = existing.map(w => w.prepareDestroyPermanently());

  const creates = inner.workers.map(w => {
    const lang = w.language_preference === 'hi' ? 'hi' : 'en';
    const thumb =
      w.reference_thumbnail_base64 != null &&
      w.reference_thumbnail_base64.length > 0
        ? `data:image/jpeg;base64,${w.reference_thumbnail_base64}`
        : w.reference_thumbnail_url;
    return workers.prepareCreateFromDirtyRaw({
      id: w.id,
      name: w.name,
      role: w.role,
      site_id: w.site_id,
      language_preference: lang,
      enrolled_at: enrolledAtMs(w.enrolled_at),
      revoked_at: w.revoked_at,
      reference_thumbnail_url: thumb,
      is_revoked: w.revoked_at != null && w.revoked_at.length > 0,
      embedding_encrypted_base64: w.embedding_encrypted_base64 ?? null,
    });
  });

  await db.write(async () => {
    await db.batch(...destroys, ...creates);
  });

  return {workerCount: inner.workers.length, packageKind: 'v2_encrypted'};
}
